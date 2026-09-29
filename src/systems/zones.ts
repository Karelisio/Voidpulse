/**
 * Zones au sol et effets persistants : nuages de réaction, mines et télégraphes du boss,
 * marques de téléportation, mines du joueur, flaques, frappes (orage), rayons, orbes de
 * surtension, puits d'implosion.
 */
import { PLAYER, REACTIONS, reactionIndex } from '../content/data';
import { FRAME } from '../content/frames';
import { Body, Life, Look, Pos, Status, Zone } from '../engine/components';
import { DT } from '../engine/constants';
import {
  HIT,
  LIGHTNING,
  STATUS_ONLY,
  aoe,
  hitFoe,
  liveBoss,
  nearestFoeInto,
  pullFoes,
  releaseBuffer,
  takeBuffer,
} from './combat';
import { MAX_ENEMY_RADIUS } from './enemies';
import { EV, SLOT_REACTION } from './events';
import { damagePlayer } from './player';
import type { RunSim } from './sim';

export const ZONE = {
  VAPOR: 1,
  MINE: 2,
  CHARGE_LINE: 3,
  BLINK_MARK: 4,
  /** Mine du joueur : armement, déclenchement, (aspiration), explosion. */
  PMINE: 5,
  /** Flaque persistante : dégâts et statut par tick, attraction éventuelle. */
  POOL: 6,
  /** Frappe différée (éclair) : télégraphe puis impact unique. */
  STRIKE: 7,
  /** Rayon attaché au joueur : ticks le long d'un segment, balayage ou suivi. */
  BEAM: 8,
  /** Orbe de surtension en orbite : foudroie les ennemis proches. */
  SURGE: 9,
  /** Puits d'implosion : aspire puis détone. */
  WELL: 10,
} as const;

const FRAME_OF: Record<number, number> = {
  [ZONE.VAPOR]: FRAME.ZONE_VAPOR,
  [ZONE.MINE]: FRAME.ZONE_MINE,
  [ZONE.CHARGE_LINE]: FRAME.ZONE_RECT,
  [ZONE.BLINK_MARK]: FRAME.ZONE_RING,
  [ZONE.PMINE]: FRAME.ZONE_PMINE,
  [ZONE.POOL]: FRAME.ZONE_POOL,
  [ZONE.STRIKE]: FRAME.ZONE_STRIKE,
  [ZONE.BEAM]: FRAME.ZONE_BEAM,
  [ZONE.SURGE]: FRAME.ZONE_SURGE,
  [ZONE.WELL]: FRAME.ZONE_WELL,
};

const SURGE = REACTIONS[reactionIndex('surge')];
const IMPLOSION = REACTIONS[reactionIndex('implosion')];
/** Mine : durée d'aspiration avant détonation (singularité). */
const SUCK_TIME = 0.8;
const SURGE_MAX = 3;

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
  Zone.slot[z] = SLOT_REACTION;
  Zone.element[z] = 255;
  Look.frame[z] = FRAME_OF[kind] ?? FRAME.ZONE_RING;
  return z;
}

/** Complète une zone du joueur : élément, emplacement crédité, statut, ticks, teinte. */
export function armZone(
  z: number,
  element: number,
  slot: number,
  power: number,
  interval: number,
  pull: number,
  tint: number,
): void {
  Zone.element[z] = element;
  Zone.slot[z] = slot;
  Zone.power[z] = power;
  Zone.interval[z] = interval;
  Zone.tickT[z] = 0;
  Zone.pull[z] = pull;
  Look.tint[z] = tint;
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

/** Orbe de surtension : au-delà de SURGE_MAX, le plus ancien est ravivé. */
export function spawnSurge(sim: RunSim, dmg: number, scale: number, tint: number): void {
  const pool = sim.world.zones;
  let count = 0;
  let oldest = -1;
  for (let i = 0; i < pool.count; i++) {
    const z = pool.active[i];
    if (Zone.kind[z] !== ZONE.SURGE) continue;
    count++;
    if (oldest < 0 || Zone.t[z] > Zone.t[oldest]) oldest = z;
  }
  if (count >= SURGE_MAX && oldest >= 0) {
    Zone.t[oldest] = 0;
    Zone.dmg[oldest] = Math.max(Zone.dmg[oldest], dmg);
    return;
  }
  const p = sim.state.player.eid;
  const z = spawnZone(
    sim,
    ZONE.SURGE,
    Pos.x[p],
    Pos.y[p],
    SURGE.radius * scale,
    SURGE.duration,
    dmg,
    0,
  );
  if (z < 0) return;
  // Orbes répartis sur le cercle.
  Zone.rot[z] = (count / SURGE_MAX) * Math.PI * 2;
  Zone.w[z] = SURGE.power * scale;
  armZone(z, LIGHTNING | STATUS_ONLY, SLOT_REACTION, 1.5, 0.4, 0, tint);
}

/** Puits d'implosion : aspire pendant sa durée puis détone. */
export function spawnWell(
  sim: RunSim,
  x: number,
  y: number,
  scale: number,
  dmg: number,
  tint: number,
): void {
  const z = spawnZone(sim, ZONE.WELL, x, y, IMPLOSION.radius * scale, IMPLOSION.duration, dmg, 0);
  if (z < 0) return;
  armZone(z, 255, SLOT_REACTION, 0, 0, IMPLOSION.power, tint);
}

/** Distance² du point (px, py) au segment [(ax, ay), (bx, by)]. */
function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? (wx * vx + wy * vy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = wx - vx * t;
  const dy = wy - vy * t;
  return dx * dx + dy * dy;
}

/** Tick d'un rayon : touche tout ennemi à moins de largeur/2 du segment. */
function beamTick(sim: RunSim, z: number): void {
  const ax = Pos.x[z];
  const ay = Pos.y[z];
  const len = Zone.w[z];
  const half = Zone.h[z] * 0.5;
  const bx = ax + Math.cos(Zone.rot[z]) * len;
  const by = ay + Math.sin(Zone.rot[z]) * len;
  const buf = takeBuffer(sim);
  if (!buf) return;
  const n = sim.grid.query(
    (ax + bx) * 0.5,
    (ay + by) * 0.5,
    len * 0.5 + half + MAX_ENEMY_RADIUS,
    buf,
  );
  const el = Zone.element[z];
  const slot = Zone.slot[z];
  const power = Zone.power[z];
  const dmg = Zone.dmg[z];
  HIT.critBonus = Zone.crit[z];
  for (let i = 0; i < n; i++) {
    const e = buf[i];
    if (Life.hp[e] <= 0) continue;
    const rr = half + Body.r[e];
    if (segDist2(Pos.x[e], Pos.y[e], ax, ay, bx, by) <= rr * rr)
      hitFoe(sim, e, dmg, el, slot, power, ax, ay, 0);
  }
  const boss = liveBoss(sim);
  if (boss >= 0) {
    const rr = half + Body.r[boss];
    if (segDist2(Pos.x[boss], Pos.y[boss], ax, ay, bx, by) <= rr * rr)
      hitFoe(sim, boss, dmg, el, slot, power, ax, ay, 0);
  }
  HIT.critBonus = 0;
  releaseBuffer(sim);
}

/** Explosion d'une mine du joueur (et flaque éventuelle). */
function detonateMine(sim: RunSim, z: number): void {
  const x = Pos.x[z];
  const y = Pos.y[z];
  const r = Zone.r[z];
  const el = Zone.element[z];
  aoe(
    sim,
    x,
    y,
    r,
    Zone.dmg[z],
    Zone.slot[z],
    Zone.pull[z] > 0 ? 0 : 80,
    0,
    0,
    0,
    el,
    Zone.power[z],
  );
  sim.events.push(EV.EXPLOSION, 3, 0, x, y, r, el & 0x7f);
  const poolDur = Zone.param[z];
  if (poolDur > 0) {
    const p = spawnZone(sim, ZONE.POOL, x, y, r * 0.8, poolDur, Zone.dmg[z] * 0.15, 0);
    if (p >= 0) armZone(p, el | STATUS_ONLY, Zone.slot[z], Zone.power[z], 0.5, 0, Look.tint[z]);
  }
}

export function updateZones(sim: RunSim): void {
  const pool = sim.world.zones;
  const player = sim.state.player.eid;
  const px = Pos.x[player];
  const py = Pos.y[player];
  for (let i = pool.count - 1; i >= 0; i--) {
    const z = pool.active[i];
    Zone.t[z] += DT;
    const t = Zone.t[z];
    const dur = Zone.dur[z];
    const kind = Zone.kind[z];
    const life = dur > 0 ? t / dur : 1;
    switch (kind) {
      case ZONE.VAPOR: {
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
        break;
      }
      case ZONE.MINE:
        Look.alpha[z] = 0.35 + 0.65 * life;
        if (t >= dur) {
          const dx = px - Pos.x[z];
          const dy = py - Pos.y[z];
          if (dx * dx + dy * dy < (Zone.r[z] + PLAYER.radius) ** 2) damagePlayer(sim, Zone.dmg[z]);
          sim.events.push(EV.EXPLOSION, 1, 0, Pos.x[z], Pos.y[z], Zone.r[z]);
        }
        break;
      case ZONE.PMINE: {
        // w : rayon de déclenchement, h : délai d'armement, r : rayon d'explosion,
        // param : durée de la flaque laissée. state 0 : armement, 1 : armée, 2 : aspiration.
        const st = Zone.state[z];
        if (st === 0) {
          Look.alpha[z] = 0.4;
          if (t >= Zone.h[z]) Zone.state[z] = 1;
        } else if (st === 1) {
          Look.alpha[z] = 0.75 + 0.25 * Math.sin(t * 6);
          if (nearestFoeInto(sim, Pos.x[z], Pos.y[z], Zone.w[z], sim.zoneScratch) >= 0) {
            if (Zone.pull[z] > 0) {
              Zone.state[z] = 2;
              Zone.tickT[z] = SUCK_TIME;
            } else {
              detonateMine(sim, z);
              pool.despawn(z);
              continue;
            }
          }
        } else {
          Look.alpha[z] = 1;
          pullFoes(sim, Pos.x[z], Pos.y[z], Zone.r[z] * 1.6, Zone.pull[z]);
          Zone.tickT[z] -= DT;
          if (Zone.tickT[z] <= 0) {
            detonateMine(sim, z);
            pool.despawn(z);
            continue;
          }
        }
        break;
      }
      case ZONE.POOL: {
        Look.alpha[z] = Math.min(1, t * 5, (dur - t) * 2);
        if (Zone.pull[z] > 0) pullFoes(sim, Pos.x[z], Pos.y[z], Zone.r[z], Zone.pull[z]);
        Zone.tickT[z] -= DT;
        if (Zone.tickT[z] <= 0) {
          Zone.tickT[z] += Zone.interval[z];
          aoe(
            sim,
            Pos.x[z],
            Pos.y[z],
            Zone.r[z],
            Zone.dmg[z],
            Zone.slot[z],
            0,
            0,
            0,
            0,
            Zone.element[z],
            Zone.power[z],
          );
        }
        break;
      }
      case ZONE.STRIKE:
        Look.alpha[z] = 0.3 + 0.7 * life;
        if (t >= dur) {
          HIT.critBonus = Zone.crit[z];
          aoe(
            sim,
            Pos.x[z],
            Pos.y[z],
            Zone.r[z],
            Zone.dmg[z],
            Zone.slot[z],
            40,
            0,
            0,
            0,
            Zone.element[z],
            Zone.power[z],
          );
          HIT.critBonus = 0;
          sim.events.push(
            EV.STRIKE,
            Zone.slot[z],
            Zone.param[z],
            Pos.x[z],
            Pos.y[z],
            Zone.r[z],
            Zone.element[z] & 0x7f,
          );
        }
        break;
      case ZONE.BEAM: {
        Pos.x[z] = px;
        Pos.y[z] = py;
        if (Zone.state[z] === 1) {
          // Suivi : tourne vers la cible la plus proche (virage limité).
          const target = nearestFoeInto(sim, px, py, Zone.w[z], sim.zoneScratch);
          if (target >= 0) {
            const want = Math.atan2(Pos.y[target] - py, Pos.x[target] - px);
            let d = want - Zone.rot[z];
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            const max = 5 * DT;
            Zone.rot[z] += d > max ? max : d < -max ? -max : d;
          }
        } else Zone.rot[z] += Zone.param[z] * DT;
        Look.alpha[z] = Math.min(1, t * 12, (dur - t) * 8);
        Zone.tickT[z] -= DT;
        if (Zone.tickT[z] <= 0) {
          Zone.tickT[z] += Zone.interval[z];
          beamTick(sim, z);
        }
        break;
      }
      case ZONE.SURGE: {
        Zone.rot[z] += 2.4 * DT;
        Pos.x[z] = px + Math.cos(Zone.rot[z]) * Zone.w[z];
        Pos.y[z] = py + Math.sin(Zone.rot[z]) * Zone.w[z];
        Look.alpha[z] = Math.min(1, t * 6, (dur - t) * 3);
        Zone.tickT[z] -= DT;
        if (Zone.tickT[z] <= 0) {
          Zone.tickT[z] += Zone.interval[z];
          const target = nearestFoeInto(sim, Pos.x[z], Pos.y[z], Zone.r[z], sim.zoneScratch);
          if (target >= 0) {
            sim.events.push(
              EV.BEAM,
              SLOT_REACTION,
              LIGHTNING,
              Pos.x[z],
              Pos.y[z],
              Pos.x[target],
              Pos.y[target],
              true,
            );
            hitFoe(
              sim,
              target,
              Zone.dmg[z],
              Zone.element[z],
              SLOT_REACTION,
              Zone.power[z],
              Pos.x[z],
              Pos.y[z],
              30,
            );
          }
        }
        break;
      }
      case ZONE.WELL:
        Look.alpha[z] = 0.5 + 0.5 * life;
        Look.rot[z] -= 6 * DT;
        pullFoes(sim, Pos.x[z], Pos.y[z], Zone.r[z], Zone.pull[z]);
        if (t >= dur) {
          aoe(sim, Pos.x[z], Pos.y[z], Zone.r[z] * 0.7, Zone.dmg[z], SLOT_REACTION, 160, 0.3, 0, 0);
          sim.events.push(EV.EXPLOSION, 4, 0, Pos.x[z], Pos.y[z], Zone.r[z] * 0.7, 4);
        }
        break;
      default:
        Look.alpha[z] = 0.25 + 0.75 * life;
    }
    if (dur > 0 && t >= dur) sim.world.zones.despawn(z);
  }
}

const VAPOR_TICK = 0.25;

/** Aveuglement appliqué par la vapeur (appelé par aoe via le paramètre `blind`). */
export function blind(e: number, seconds: number): void {
  if (Status.blindT[e] < seconds) Status.blindT[e] = seconds;
}
