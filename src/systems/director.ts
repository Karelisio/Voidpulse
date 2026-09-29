/**
 * Director de spawn : densité visée au fil du temps, répartition des types, montée des PV,
 * vagues scénarisées (anneau, ligne, essaim, tenaille, escorte, ruée), élites périodiques à
 * affixes, événements de run, déclenchement du boss.
 */
import {
  BEHAVIOR_OF,
  ENEMIES,
  PROGRESSION,
  bossIndex,
  enemyIndex,
  type StageDef,
} from '../content/data';
import { Foe, Pos } from '../engine/components';
import { DT } from '../engine/constants';
import { spawnBoss } from './boss';
import { affixesAt, makeElite } from './elites';
import { BEHAVIOR, spawnEnemy } from './enemies';
import { EV } from './events';
import { updateRunEvents } from './runevents';
import type { RunSim } from './sim';

/** Répartitions pré-calculées d'un stage (poids par type d'ennemi), sans allocation en jeu. */
export interface StagePlan {
  mixTimes: Float32Array;
  mixWeights: Float32Array[];
  waveEnemy: Int32Array;
  waveMinion: Int32Array;
  boss: number;
  /** Essaim de base du stage (renforts des élites « Invocateur »). */
  swarm: number;
}

export function planStage(stage: StageDef): StagePlan {
  const mixWeights = stage.mix.map(([, weights]) => {
    const w = new Float32Array(ENEMIES.length);
    for (const [id, v] of Object.entries(weights)) w[enemyIndex(id)] = v;
    return w;
  });
  let swarm = 0;
  const first = mixWeights[0];
  for (let i = 0; i < first.length; i++) {
    if (first[i] > 0 && BEHAVIOR_OF[i] === BEHAVIOR.swarm) {
      swarm = i;
      break;
    }
  }
  return {
    mixTimes: Float32Array.from(stage.mix.map(([t]) => t)),
    mixWeights,
    waveEnemy: Int32Array.from(stage.waves.map((w) => enemyIndex(w.enemy))),
    waveMinion: Int32Array.from(stage.waves.map((w) => (w.minion ? enemyIndex(w.minion) : -1))),
    boss: bossIndex(stage.boss),
    swarm,
  };
}

/** Interpolation linéaire d'une courbe [[t, v], …]. */
export function curve(points: readonly (readonly [number, number])[], t: number): number {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t1, v1] = points[i];
    if (t <= t1) {
      const [t0, v0] = points[i - 1];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return points[points.length - 1][1];
}

function pickType(sim: RunSim, t: number): number {
  const plan = sim.plan;
  let m = 0;
  for (let i = 0; i < plan.mixTimes.length; i++) if (plan.mixTimes[i] <= t) m = i;
  const w = plan.mixWeights[m];
  let total = 0;
  for (let i = 0; i < w.length; i++) total += w[i];
  let roll = sim.rng.spawn.next() * total;
  for (let i = 0; i < w.length; i++) {
    roll -= w[i];
    if (roll <= 0 && w[i] > 0) return i;
  }
  return 0;
}

/** Nombre maximal d'apparitions par tick (lisse les rattrapages de densité). */
const SPAWNS_PER_TICK = 4;
const TAU = Math.PI * 2;

export function updateDirector(sim: RunSim): void {
  const st = sim.state;
  const stage = st.stage;
  const dir = st.director;
  const t = st.time;

  if (!dir.bossSpawned && t >= stage.bossAt) {
    dir.bossSpawned = true;
    spawnBoss(sim, sim.plan.boss);
  }

  const hpScale = curve(stage.hpScale, t);
  dir.hpScale = hpScale;
  while (dir.waveIndex < stage.waves.length && stage.waves[dir.waveIndex].at <= t) {
    runWave(sim, dir.waveIndex, hpScale);
    dir.waveIndex++;
  }

  // Élite périodique (porteuse d'un coffre).
  dir.eliteT -= DT;
  if (dir.eliteT <= 0 && dir.densityMult > 0) {
    dir.eliteT = PROGRESSION.elite.every;
    spawnElite(sim, t, hpScale);
  }

  updateRunEvents(sim);

  const target = curve(stage.density, t) * dir.densityMult;
  dir.target = target;
  let deficit = target - sim.world.enemies.count;
  let budget = SPAWNS_PER_TICK;
  while (deficit >= 1 && budget-- > 0) {
    sim.spawnPoint(50, 150);
    if (spawnEnemy(sim, pickType(sim, t), sim.point.x, sim.point.y, hpScale) < 0) break;
    deficit--;
  }
}

/** Les kamikazes et les ruées ne font pas de bonnes élites (ils disparaissent d'eux-mêmes). */
function eliteWorthy(type: number): boolean {
  const b = BEHAVIOR_OF[type];
  return b !== BEHAVIOR.kamikaze && b !== BEHAVIOR.stampede;
}

/**
 * Élite : type courant du stage (ou imposé), plus grosse, plus solide, avec 1 à 3 affixes
 * selon le temps ; porteuse d'un coffre.
 */
export function spawnElite(sim: RunSim, t: number, hpScale: number, forced = -1): number {
  let type = forced;
  if (type < 0) {
    type = pickType(sim, t);
    for (let tries = 0; tries < 6 && !eliteWorthy(type); tries++) type = pickType(sim, t);
    if (!eliteWorthy(type)) type = sim.plan.swarm;
  }
  sim.spawnPoint(60, 120);
  const e = spawnEnemy(sim, type, sim.point.x, sim.point.y, hpScale);
  if (e < 0) return -1;
  makeElite(sim, e, affixesAt(t));
  sim.events.push(EV.ELITE_SPAWN, e, type, Pos.x[e], Pos.y[e], 0);
  return e;
}

function runWave(sim: RunSim, index: number, hpScale: number): void {
  const w = sim.state.stage.waves[index];
  const type = sim.plan.waveEnemy[index];
  const p = sim.state.player.eid;
  const px = Pos.x[p];
  const py = Pos.y[p];
  const rng = sim.rng.spawn;
  switch (w.kind) {
    case 'ring':
      for (let i = 0; i < w.count; i++) {
        const a = (i / w.count) * TAU;
        spawnEnemy(sim, type, px + Math.cos(a) * 560, py + Math.sin(a) * 560, hpScale);
      }
      break;
    case 'line': {
      const a = rng.range(0, TAU);
      const cx = px + Math.cos(a) * 600;
      const cy = py + Math.sin(a) * 600;
      for (let i = 0; i < w.count; i++) {
        const o = (i - (w.count - 1) / 2) * 38;
        spawnEnemy(sim, type, cx - Math.sin(a) * o, cy + Math.cos(a) * o, hpScale);
      }
      break;
    }
    case 'swarm': {
      sim.spawnPoint(80, 120);
      const cx = sim.point.x;
      const cy = sim.point.y;
      for (let i = 0; i < w.count; i++) {
        spawnEnemy(sim, type, cx + rng.range(-60, 60), cy + rng.range(-60, 60), hpScale);
      }
      break;
    }
    case 'pincer': {
      // Deux essaims opposés : pris en tenaille.
      const a = rng.range(0, TAU);
      for (let side = 0; side < 2; side++) {
        const b = a + side * Math.PI;
        const cx = px + Math.cos(b) * 560;
        const cy = py + Math.sin(b) * 560;
        const n = side === 0 ? Math.ceil(w.count / 2) : Math.floor(w.count / 2);
        for (let i = 0; i < n; i++) {
          spawnEnemy(sim, type, cx + rng.range(-50, 50), cy + rng.range(-50, 50), hpScale);
        }
      }
      break;
    }
    case 'escort': {
      // Un meneur (élite si demandé) entouré de sa garde.
      sim.spawnPoint(90, 130);
      const cx = sim.point.x;
      const cy = sim.point.y;
      const leader = spawnEnemy(sim, type, cx, cy, hpScale);
      if (leader >= 0 && w.elite) {
        makeElite(sim, leader, affixesAt(sim.state.time));
        sim.events.push(EV.ELITE_SPAWN, leader, type, cx, cy, 0);
      }
      const minion = sim.plan.waveMinion[index];
      if (minion < 0) break;
      for (let i = 0; i < w.count; i++) {
        const a = (i / w.count) * TAU;
        spawnEnemy(sim, minion, cx + Math.cos(a) * 70, cy + Math.sin(a) * 70, hpScale);
      }
      break;
    }
    case 'stampede': {
      // Ligne qui traverse le champ en passant près du joueur.
      const a = rng.range(0, TAU);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const cx = px + ca * 620;
      const cy = py + sa * 620;
      for (let i = 0; i < w.count; i++) {
        const o = (i - (w.count - 1) / 2) * 32;
        const e = spawnEnemy(sim, type, cx - sa * o, cy + ca * o, hpScale);
        if (e < 0) break;
        Foe.tx[e] = -ca;
        Foe.ty[e] = -sa;
      }
      break;
    }
  }
}
