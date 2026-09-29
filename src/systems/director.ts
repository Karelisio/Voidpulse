/**
 * Director de spawn : densité visée au fil du temps, répartition des types, montée des PV,
 * vagues scénarisées (anneau, ligne, essaim), déclenchement du boss.
 */
import { ENEMIES, PROGRESSION, bossIndex, enemyIndex, type StageDef } from '../content/data';
import { Body, Foe, Life, Look, Pos } from '../engine/components';
import { DT } from '../engine/constants';
import { spawnBoss } from './boss';
import { BEHAVIOR, BEHAVIOR_OF, spawnEnemy } from './enemies';
import { EV } from './events';
import type { RunSim } from './sim';

/** Répartitions pré-calculées d'un stage (poids par type d'ennemi), sans allocation en jeu. */
export interface StagePlan {
  mixTimes: Float32Array;
  mixWeights: Float32Array[];
  eventEnemy: Int32Array;
  boss: number;
}

export function planStage(stage: StageDef): StagePlan {
  return {
    mixTimes: Float32Array.from(stage.mix.map(([t]) => t)),
    mixWeights: stage.mix.map(([, weights]) => {
      const w = new Float32Array(ENEMIES.length);
      for (const [id, v] of Object.entries(weights)) w[enemyIndex(id)] = v;
      return w;
    }),
    eventEnemy: Int32Array.from(stage.events.map((e) => enemyIndex(e.enemy))),
    boss: bossIndex(stage.boss),
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
  while (dir.eventIndex < stage.events.length && stage.events[dir.eventIndex].at <= t) {
    runEvent(sim, dir.eventIndex, hpScale);
    dir.eventIndex++;
  }

  // Élite périodique (porteuse d'un coffre).
  dir.eliteT -= DT;
  if (dir.eliteT <= 0 && dir.densityMult > 0) {
    dir.eliteT = PROGRESSION.elite.every;
    spawnElite(sim, t, hpScale);
  }

  const target = curve(stage.density, t) * dir.densityMult;
  let deficit = target - sim.world.enemies.count;
  let budget = SPAWNS_PER_TICK;
  while (deficit >= 1 && budget-- > 0) {
    sim.spawnPoint(50, 150);
    if (spawnEnemy(sim, pickType(sim, t), sim.point.x, sim.point.y, hpScale) < 0) break;
    deficit--;
  }
}

/** Élite : type courant du stage (hors kamikazes), plus grosse, plus solide, porteuse d'un coffre. */
export function spawnElite(sim: RunSim, t: number, hpScale: number): number {
  let type = pickType(sim, t);
  for (let tries = 0; tries < 6 && BEHAVIOR_OF[type] === BEHAVIOR.kamikaze; tries++)
    type = pickType(sim, t);
  if (BEHAVIOR_OF[type] === BEHAVIOR.kamikaze) type = 0;
  sim.spawnPoint(60, 120);
  const e = spawnEnemy(sim, type, sim.point.x, sim.point.y, hpScale);
  if (e < 0) return -1;
  const el = PROGRESSION.elite;
  Foe.elite[e] = 1;
  Life.hp[e] *= el.hp;
  Life.max[e] = Life.hp[e];
  Body.r[e] *= el.scale;
  Body.mass[e] *= 3;
  Look.scale[e] = el.scale;
  Foe.dmg[e] *= el.damage;
  Foe.speed[e] *= el.speed;
  Foe.kbRes[e] = Math.max(Foe.kbRes[e], 0.8);
  Foe.xp[e] *= el.xp;
  sim.events.push(EV.ELITE_SPAWN, e, type, Pos.x[e], Pos.y[e], 0);
  return e;
}

function runEvent(sim: RunSim, index: number, hpScale: number): void {
  const ev = sim.state.stage.events[index];
  const type = sim.plan.eventEnemy[index];
  const p = sim.state.player.eid;
  const px = Pos.x[p];
  const py = Pos.y[p];
  const rng = sim.rng.spawn;
  switch (ev.kind) {
    case 'ring':
      for (let i = 0; i < ev.count; i++) {
        const a = (i / ev.count) * Math.PI * 2;
        spawnEnemy(sim, type, px + Math.cos(a) * 560, py + Math.sin(a) * 560, hpScale);
      }
      break;
    case 'line': {
      const a = rng.range(0, Math.PI * 2);
      const cx = px + Math.cos(a) * 600;
      const cy = py + Math.sin(a) * 600;
      for (let i = 0; i < ev.count; i++) {
        const o = (i - (ev.count - 1) / 2) * 38;
        spawnEnemy(sim, type, cx - Math.sin(a) * o, cy + Math.cos(a) * o, hpScale);
      }
      break;
    }
    case 'swarm': {
      sim.spawnPoint(80, 120);
      const cx = sim.point.x;
      const cy = sim.point.y;
      for (let i = 0; i < ev.count; i++) {
        spawnEnemy(sim, type, cx + rng.range(-60, 60), cy + rng.range(-60, 60), hpScale);
      }
      break;
    }
  }
}
