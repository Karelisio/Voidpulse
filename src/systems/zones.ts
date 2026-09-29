/** Zones au sol : nuages de réaction, mines et télégraphes du boss, marques de téléportation. */
import { PLAYER } from '../content/data';
import { FRAME } from '../content/frames';
import { Look, Pos, Status, Zone } from '../engine/components';
import { DT } from '../engine/constants';
import { aoe } from './combat';
import { EV, SLOT_REACTION } from './events';
import { damagePlayer } from './player';
import type { RunSim } from './sim';

export const ZONE = { VAPOR: 1, MINE: 2, CHARGE_LINE: 3, BLINK_MARK: 4 } as const;

export function spawnZone(
  sim: RunSim,
  kind: number,
  x: number,
  y: number,
  r: number,
  dur: number,
  dmg: number,
  param: number,
): number {
  const z = sim.spawnIn(sim.world.zones);
  if (z < 0) return -1;
  Pos.x[z] = x;
  Pos.y[z] = y;
  Pos.px[z] = x;
  Pos.py[z] = y;
  Zone.kind[z] = kind;
  Zone.r[z] = r;
  Zone.dur[z] = dur;
  Zone.dmg[z] = dmg;
  Zone.param[z] = param;
  Look.frame[z] =
    kind === ZONE.VAPOR
      ? FRAME.ZONE_VAPOR
      : kind === ZONE.MINE
        ? FRAME.ZONE_MINE
        : kind === ZONE.CHARGE_LINE
          ? FRAME.ZONE_RECT
          : FRAME.ZONE_RING;
  return z;
}

/**
 * Nuage de vapeur : une réaction au cœur d'un nuage existant le ravive (durée, dégâts, léger
 * grossissement) au lieu d'empiler un nouveau brouillard — l'écran reste lisible.
 */
export function spawnVapor(
  sim: RunSim,
  x: number,
  y: number,
  r: number,
  dur: number,
  dmg: number,
  param: number,
): void {
  const pool = sim.world.zones;
  for (let i = 0; i < pool.count; i++) {
    const z = pool.active[i];
    if (Zone.kind[z] !== ZONE.VAPOR) continue;
    const dx = x - Pos.x[z];
    const dy = y - Pos.y[z];
    const reach = Zone.r[z] * 0.9;
    if (dx * dx + dy * dy >= reach * reach) continue;
    if (Zone.t[z] < dur * 3) Zone.dur[z] = Math.max(Zone.dur[z], Zone.t[z] + dur);
    Zone.dmg[z] = Math.max(Zone.dmg[z], dmg);
    Zone.r[z] = Math.min(r * 1.35, Math.max(Zone.r[z], r) + 4);
    return;
  }
  spawnZone(sim, ZONE.VAPOR, x, y, r, dur, dmg, param);
}

/** Télégraphe rectangulaire (charge) : origine, longueur, largeur, angle. */
export function spawnLineZone(
  sim: RunSim,
  x: number,
  y: number,
  length: number,
  width: number,
  rot: number,
  dur: number,
): void {
  const z = spawnZone(sim, ZONE.CHARGE_LINE, x, y, 0, dur, 0, 0);
  if (z < 0) return;
  Zone.w[z] = length;
  Zone.h[z] = width;
  Zone.rot[z] = rot;
}

const VAPOR_TICK = 0.25;

export function updateZones(sim: RunSim): void {
  const pool = sim.world.zones;
  const player = sim.state.player.eid;
  for (let i = pool.count - 1; i >= 0; i--) {
    const z = pool.active[i];
    Zone.t[z] += DT;
    const t = Zone.t[z];
    const dur = Zone.dur[z];
    const kind = Zone.kind[z];
    const life = t / dur;
    if (kind === ZONE.VAPOR) {
      Look.alpha[z] = Math.min(1, t * 4, (dur - t) * 2);
      Zone.w[z] += DT;
      if (Zone.w[z] >= VAPOR_TICK) {
        Zone.w[z] -= VAPOR_TICK;
        aoe(
          sim,
          Pos.x[z],
          Pos.y[z],
          Zone.r[z],
          Zone.dmg[z] * VAPOR_TICK,
          SLOT_REACTION,
          0,
          0,
          0,
          VAPOR_TICK + 0.15,
        );
      }
    } else if (kind === ZONE.MINE) {
      Look.alpha[z] = 0.35 + 0.65 * life;
      if (t >= dur) {
        const dx = Pos.x[player] - Pos.x[z];
        const dy = Pos.y[player] - Pos.y[z];
        if (dx * dx + dy * dy < (Zone.r[z] + PLAYER.radius) ** 2) damagePlayer(sim, Zone.dmg[z]);
        sim.events.push(EV.EXPLOSION, 1, 0, Pos.x[z], Pos.y[z], Zone.r[z]);
      }
    } else {
      Look.alpha[z] = 0.25 + 0.75 * life;
    }
    if (t >= dur) sim.world.zones.despawn(z);
  }
}

/** Aveuglement appliqué par la vapeur (appelé par aoe via le paramètre `blind`). */
export function blind(e: number, seconds: number): void {
  if (Status.blindT[e] < seconds) Status.blindT[e] = seconds;
}
