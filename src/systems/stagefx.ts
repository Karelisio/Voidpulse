/**
 * Mécaniques propres aux stages : brume (vagues de vision réduite, rendue par le décor),
 * tempête de verre (impacts annoncés), eaux lentes, glace et bourbiers (terrain qui suit le
 * joueur : les plaques trop lointaines sont replacées hors champ), coulées de lave (bandes
 * annoncées puis brûlantes), apesanteur (inertie), blizzard, puits du vide (attraction).
 */
import { colorOf, type StageDef } from '../content/data';
import { Foe, Life, Look, Pos, Zone } from '../engine/components';
import { DT } from '../engine/constants';
import { pullFoes, releaseBuffer, takeBuffer } from './combat';
import { MAX_ENEMY_RADIUS } from './enemies';
import { damagePlayer, slowPlayer } from './player';
import type { RunSim } from './sim';
import type { MechanicState } from './state';
import { spawnHazard, spawnLineZone, spawnZone, ZONE } from './zones';

export const TERRAIN = { WATER: 0, ICE: 1, BOG: 2 } as const;
const TERRAIN_TINT = [0x3dc8ff, 0xcff4ff, 0x7bd13a];
/** Au-delà, une plaque de terrain est replacée devant le joueur. */
const TERRAIN_FAR = 900;
const GLASS_TINT = 0x9fe7ff;
const LAVA_TINT = 0xff5a1f;
const FLOW_LENGTH = 1100;
const FLOW_WARN = 1.6;
const FIRE = 0;

export function createMechanic(stage: StageDef): MechanicState {
  return {
    cycleT: stage.mechanic.every,
    activeT: 0,
    subT: 0,
    flowX: 0,
    flowY: 0,
    flowA: 0,
    flowT: 0,
    dotT: 0,
  };
}

function terrainOf(kind: StageDef['mechanic']['kind']): number {
  return kind === 'water'
    ? TERRAIN.WATER
    : kind === 'ice'
      ? TERRAIN.ICE
      : kind === 'bog'
        ? TERRAIN.BOG
        : -1;
}

export function updateStageMechanic(sim: RunSim): void {
  const st = sim.state;
  const mech = st.stage.mechanic;
  const m = st.mechanic;
  const p = st.player;
  p.terrainSlow = 0;
  p.terrainInertia = mech.kind === 'zeroG' ? mech.power : 0;
  p.terrainDps = 0;
  if (mech.kind === 'none') return;

  // Cycle des vagues (brume, tempête, blizzard, coulées, puits).
  if (mech.every > 0) {
    if (m.activeT > 0) m.activeT -= DT;
    m.cycleT -= DT;
    if (m.cycleT <= 0) {
      m.cycleT = mech.every;
      m.activeT = mech.length;
      startWave(sim);
    }
  }

  const terrain = terrainOf(mech.kind);
  if (terrain >= 0) updateTerrain(sim, terrain);

  switch (mech.kind) {
    case 'glassStorm':
      if (m.activeT > 0) {
        m.subT -= DT;
        if (m.subT <= 0) {
          m.subT = 0.7;
          strikesNearPlayer(sim, mech.count, mech.radius, mech.power);
        }
      }
      break;
    case 'lavaFlow':
      if (m.flowT > 0) {
        m.flowT -= DT;
        if (m.flowT <= 0) lavaFlow(sim, mech.radius, mech.power, mech.length);
      }
      break;
    case 'ice':
      // Blizzard : léger ralentissement tant que la vague dure.
      if (m.activeT > 0) slowPlayer(sim, 0.25, 0.2);
      break;
    default:
  }
}

function startWave(sim: RunSim): void {
  const st = sim.state;
  const mech = st.stage.mechanic;
  const m = st.mechanic;
  const pe = st.player.eid;
  const rng = sim.rng.spawn;
  switch (mech.kind) {
    case 'lavaFlow': {
      // Une coulée traverse le champ près du joueur : bande annoncée puis brûlante.
      const a = rng.range(0, Math.PI * 2);
      const off = rng.range(-120, 120);
      m.flowA = a;
      m.flowX = Pos.x[pe] - Math.cos(a) * (FLOW_LENGTH / 2) - Math.sin(a) * off;
      m.flowY = Pos.y[pe] - Math.sin(a) * (FLOW_LENGTH / 2) + Math.cos(a) * off;
      m.flowT = FLOW_WARN;
      const z = spawnLineZone(sim, m.flowX, m.flowY, FLOW_LENGTH, mech.radius * 2, a, FLOW_WARN);
      if (z >= 0) Look.tint[z] = LAVA_TINT;
      break;
    }
    case 'voidWell': {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(120, 220);
      const z = spawnZone(
        sim,
        ZONE.PULL,
        Pos.x[pe] + Math.cos(a) * d,
        Pos.y[pe] + Math.sin(a) * d,
        mech.radius,
        mech.length,
        0,
        mech.power,
      );
      if (z >= 0) Look.tint[z] = colorOf('#9d5cff');
      break;
    }
    default:
  }
}

function strikesNearPlayer(sim: RunSim, count: number, r: number, dmg: number): void {
  const pe = sim.state.player.eid;
  const rng = sim.rng.spawn;
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = i === 0 ? rng.range(0, 60) : rng.range(60, 280);
    const z = spawnZone(
      sim,
      ZONE.VOLATILE,
      Pos.x[pe] + Math.cos(a) * d,
      Pos.y[pe] + Math.sin(a) * d,
      r,
      1.1,
      dmg,
      0,
    );
    if (z >= 0) Look.tint[z] = GLASS_TINT;
  }
}

function lavaFlow(sim: RunSim, r: number, dps: number, dur: number): void {
  const m = sim.state.mechanic;
  const step = r * 1.5;
  const n = Math.ceil(FLOW_LENGTH / step);
  const ca = Math.cos(m.flowA);
  const sa = Math.sin(m.flowA);
  for (let i = 0; i <= n; i++) {
    spawnHazard(
      sim,
      m.flowX + ca * i * step,
      m.flowY + sa * i * step,
      r,
      dps,
      dur,
      FIRE,
      LAVA_TINT,
    );
  }
}

/**
 * Plaques de terrain : `count` plaques autour du joueur, replacées hors champ quand elles
 * s'éloignent. Effets sur le joueur (ralenti, glissade, poison) et sur les ennemis (ralenti).
 */
function updateTerrain(sim: RunSim, terrain: number): void {
  const st = sim.state;
  const mech = st.stage.mechanic;
  const p = st.player;
  const px = Pos.x[p.eid];
  const py = Pos.y[p.eid];
  const pool = sim.world.zones;
  let n = 0;
  for (let i = pool.count - 1; i >= 0; i--) {
    const z = pool.active[i];
    if (Zone.kind[z] !== ZONE.TERRAIN) continue;
    n++;
    const dx = Pos.x[z] - px;
    const dy = Pos.y[z] - py;
    const d2 = dx * dx + dy * dy;
    if (d2 > TERRAIN_FAR * TERRAIN_FAR) {
      sim.spawnPoint(Zone.r[z], Zone.r[z] + 200);
      Pos.x[z] = Pos.px[z] = sim.point.x;
      Pos.y[z] = Pos.py[z] = sim.point.y;
      continue;
    }
    const r = Zone.r[z];
    if (d2 < r * r) {
      if (terrain === TERRAIN.ICE) p.terrainInertia = mech.power;
      else p.terrainSlow = Math.max(p.terrainSlow, terrain === TERRAIN.WATER ? mech.power : 0.25);
      if (terrain === TERRAIN.BOG) p.terrainDps = mech.power;
    }
    if (terrain !== TERRAIN.ICE && (sim.state.tick + z) % 6 === 0)
      slowFoesIn(sim, Pos.x[z], Pos.y[z], r);
  }
  // Complète le terrain (au départ, ou si la réserve de zones a manqué).
  for (; n < mech.count; n++) {
    const first = sim.state.time < 1;
    if (first) {
      const a = sim.rng.spawn.range(0, Math.PI * 2);
      const d = sim.rng.spawn.range(160, 700);
      sim.point.x = px + Math.cos(a) * d;
      sim.point.y = py + Math.sin(a) * d;
    } else sim.spawnPoint(mech.radius, mech.radius + 200);
    const r = mech.radius * sim.rng.spawn.range(0.75, 1.3);
    const z = spawnZone(sim, ZONE.TERRAIN, sim.point.x, sim.point.y, r, 0, 0, terrain);
    if (z < 0) break;
    Look.tint[z] = TERRAIN_TINT[terrain];
    Look.rot[z] = sim.rng.spawn.range(0, Math.PI * 2);
  }
  // Bourbier : poison toutes les 0,5 s.
  const m = st.mechanic;
  if (p.terrainDps > 0) {
    m.dotT -= DT;
    if (m.dotT <= 0) {
      m.dotT = 0.5;
      damagePlayer(sim, p.terrainDps * 0.5);
    }
  } else m.dotT = 0;
}

function slowFoesIn(sim: RunSim, x: number, y: number, r: number): void {
  const buf = takeBuffer(sim);
  if (!buf) return;
  const n = sim.grid.query(x, y, r + MAX_ENEMY_RADIUS, buf);
  for (let i = 0; i < n; i++) {
    const e = buf[i];
    if (Life.hp[e] <= 0) continue;
    const dx = Pos.x[e] - x;
    const dy = Pos.y[e] - y;
    if (dx * dx + dy * dy < r * r) Foe.envT[e] = 0.15;
  }
  releaseBuffer(sim);
}

/** Puits du vide : attire le joueur et les ennemis (appelé par zones.ts). */
export function voidWellPull(sim: RunSim, z: number, strength: number): void {
  const pe = sim.state.player.eid;
  const x = Pos.x[z];
  const y = Pos.y[z];
  const r = Zone.r[z];
  const dx = x - Pos.x[pe];
  const dy = y - Pos.y[pe];
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < r && d > 8) {
    const k = (strength * (1 - d / r) * DT) / d;
    Pos.x[pe] += dx * k;
    Pos.y[pe] += dy * k;
  }
  pullFoes(sim, x, y, r, strength * 0.5);
}
