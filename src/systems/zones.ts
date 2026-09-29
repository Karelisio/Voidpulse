/**
 * Zones au sol et effets persistants : nuages de réaction, mines et télégraphes du boss,
 * marques de téléportation, mines du joueur, flaques, frappes (orage), rayons, orbes de
 * surtension, puits d'implosion ; dangers ennemis (flaques, obus de mortier, alertes,
 * explosions d'élite) et décors d'événements (marchand, autel, faille temporelle). Les zones
 * ennemies suivent le temps suspendu de la faille.
 */
import { ENEMY_PARAM, PLAYER, REACTIONS, RUN_EVENTS, reactionIndex } from '../content/data';
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
import { EV, RUN_EVENT_KIND, RUN_EVENT_PHASE, SLOT_REACTION } from './events';
import { damagePlayer, slowPlayer } from './player';
import { enterRift, openAltar, openMerchant } from './runevents';
import { voidWellPull } from './stagefx';
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
  /** Flaque ennemie (lave, poison) : blesse le joueur toutes les 0,5 s ; le givre ralentit. */
  HAZARD: 11,
  /** Obus de mortier en vol : Pos = cible, w/h = origine, param = type d'ennemi. */
  MORTAR: 12,
  /** Cercle d'alerte (surgissement d'un fouisseur) : purement visuel. */
  WARN: 13,
  /** Explosion différée d'une élite instable. */
  VOLATILE: 14,
  /** Décors d'événements : marchand, autel de sacrifice (param : progression), faille. */
  MERCHANT: 15,
  ALTAR: 16,
  RIFT: 17,
  /** Terrain du stage (param : TERRAIN), permanent, replacé par stagefx.ts. */
  TERRAIN: 18,
  /** Puits du vide : attire joueur et ennemis (param : force). */
  PULL: 19,
} as const;

/** Zones ennemies : leur temps s'écoule au ralenti dans une faille temporelle. */
const ENEMY_ZONE = new Uint8Array(32);
for (const k of [1, 2, 3, 4, 11, 12, 13, 14]) ENEMY_ZONE[k] = 1;
const HAZARD_TICK = 0.5;
const FROST = 1;

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
  [ZONE.HAZARD]: FRAME.ZONE_HAZARD,
  [ZONE.MORTAR]: FRAME.ZONE_TARGET,
  [ZONE.WARN]: FRAME.ZONE_WARN,
  [ZONE.VOLATILE]: FRAME.ZONE_WARN,
  [ZONE.MERCHANT]: FRAME.MERCHANT,
  [ZONE.ALTAR]: FRAME.ALTAR,
  [ZONE.RIFT]: FRAME.RIFT,
  [ZONE.TERRAIN]: FRAME.TERRAIN,
  [ZONE.PULL]: FRAME.ZONE_WELL,
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

/** Télégraphe rectangulaire (charge, visée) : origine, longueur, largeur, angle. */
export function spawnLineZone(
  sim: RunSim,
  x: number,
  y: number,
  length: number,
  width: number,
  rot: number,
  dur: number,
): number {
  const z = spawnZone(sim, ZONE.CHARGE_LINE, x, y, 0, dur, 0, 0);
  if (z < 0) return -1;
  Zone.w[z] = length;
  Zone.h[z] = width;
  Zone.rot[z] = rot;
  return z;
}

/**
 * Flaque ennemie : une flaque de même teinte déjà présente à proximité est ravivée (durée,
 * rayon) plutôt que d'en empiler une nouvelle — traînées lisibles, réserve de zones préservée.
 */
export function spawnHazard(
  sim: RunSim,
  x: number,
  y: number,
  r: number,
  dps: number,
  dur: number,
  element: number,
  tint: number,
): void {
  const pool = sim.world.zones;
  const reach = r * 0.6;
  for (let i = 0; i < pool.count; i++) {
    const z = pool.active[i];
    if (Zone.kind[z] !== ZONE.HAZARD || Look.tint[z] !== tint) continue;
    const dx = x - Pos.x[z];
    const dy = y - Pos.y[z];
    if (dx * dx + dy * dy >= reach * reach) continue;
    Zone.dur[z] = Math.max(Zone.dur[z], Zone.t[z] + dur);
    Zone.r[z] = Math.min(r * 1.3, Math.max(Zone.r[z], r));
    Zone.dmg[z] = Math.max(Zone.dmg[z], dps);
    return;
  }
  const z = spawnZone(sim, ZONE.HAZARD, x, y, r, dur, dps, 0);
  if (z < 0) return;
  Zone.element[z] = element;
  Zone.tickT[z] = HAZARD_TICK;
  Look.tint[z] = tint;
}

/** Cercle d'alerte teinté (visuel). */
export function spawnWarn(
  sim: RunSim,
  x: number,
  y: number,
  r: number,
  dur: number,
  tint: number,
): void {
  const z = spawnZone(sim, ZONE.WARN, x, y, r, dur, 0, 0);
  if (z >= 0) Look.tint[z] = tint;
}

/** Retire les zones d'un type (départ du marchand, autel consommé). */
export function despawnZones(sim: RunSim, kind: number): void {
  const pool = sim.world.zones;
  for (let i = pool.count - 1; i >= 0; i--) {
    const z = pool.active[i];
    if (Zone.kind[z] === kind) pool.despawn(z);
  }
}

/** Le joueur est-il dans le disque de la zone (bord du joueur compris) ? */
function touches(z: number, px: number, py: number, r: number): boolean {
  const dx = px - Pos.x[z];
  const dy = py - Pos.y[z];
  const rr = r + PLAYER.radius;
  return dx * dx + dy * dy < rr * rr;
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
  const edt = sim.state.events.riftT > 0 ? DT * RUN_EVENTS.rift.slow : DT;
  for (let i = pool.count - 1; i >= 0; i--) {
    const z = pool.active[i];
    const kind = Zone.kind[z];
    const zdt = ENEMY_ZONE[kind] !== 0 ? edt : DT;
    Zone.t[z] += zdt;
    const t = Zone.t[z];
    const dur = Zone.dur[z];
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
      case ZONE.HAZARD:
        Look.alpha[z] = Math.min(1, t * 5, (dur - t) * 1.5);
        Zone.tickT[z] -= zdt;
        if (Zone.tickT[z] <= 0) {
          Zone.tickT[z] = HAZARD_TICK;
          if (touches(z, px, py, Zone.r[z] * 0.85)) {
            if (Zone.element[z] === FROST) slowPlayer(sim, 0.35, 0.8);
            else damagePlayer(sim, Zone.dmg[z] * HAZARD_TICK);
          }
        }
        break;
      case ZONE.MORTAR:
        Look.alpha[z] = 0.35 + 0.65 * life;
        if (t >= dur) {
          const type = Zone.param[z];
          const r = Zone.r[z];
          if (touches(z, px, py, r)) {
            damagePlayer(sim, Zone.dmg[z]);
            if (ENEMY_PARAM.slow[type] > 0) {
              slowPlayer(sim, ENEMY_PARAM.slow[type], ENEMY_PARAM.slowTime[type]);
            }
          }
          sim.events.push(EV.EXPLOSION, 5, 0, Pos.x[z], Pos.y[z], r, Zone.element[z]);
          if (ENEMY_PARAM.poolTime[type] > 0) {
            spawnHazard(
              sim,
              Pos.x[z],
              Pos.y[z],
              ENEMY_PARAM.poolRadius[type],
              ENEMY_PARAM.poolDps[type],
              ENEMY_PARAM.poolTime[type],
              Zone.element[z],
              Look.tint[z],
            );
          }
        }
        break;
      case ZONE.VOLATILE:
        Look.alpha[z] = 0.4 + 0.6 * life;
        if (t >= dur) {
          if (touches(z, px, py, Zone.r[z])) damagePlayer(sim, Zone.dmg[z]);
          sim.events.push(EV.EXPLOSION, 6, 0, Pos.x[z], Pos.y[z], Zone.r[z], 255);
        }
        break;
      case ZONE.MERCHANT:
        Look.alpha[z] = Math.min(1, t * 2, (dur - t) * 2);
        if (t >= dur) {
          sim.events.push(
            EV.RUN_EVENT,
            RUN_EVENT_KIND.MERCHANT,
            RUN_EVENT_PHASE.END,
            Pos.x[z],
            Pos.y[z],
            0,
          );
        } else if (touches(z, px, py, Zone.r[z]) && sim.state.status === 'running') {
          openMerchant(sim);
        }
        break;
      case ZONE.ALTAR: {
        Look.alpha[z] = Math.min(1, t * 2, (dur - t) * 2);
        const ev = sim.state.events;
        const channel = RUN_EVENTS.altar.channel;
        if (t >= dur) {
          ev.altarProgress = 0;
          sim.events.push(
            EV.RUN_EVENT,
            RUN_EVENT_KIND.ALTAR,
            RUN_EVENT_PHASE.END,
            Pos.x[z],
            Pos.y[z],
            0,
          );
        } else if (touches(z, px, py, Zone.r[z] * 0.6)) {
          ev.altarProgress += DT;
          if (ev.altarProgress >= channel && sim.state.status === 'running') {
            ev.altarProgress = 0;
            openAltar(sim);
          }
        } else ev.altarProgress = Math.max(0, ev.altarProgress - DT * 2);
        Zone.param[z] = ev.altarProgress / channel;
        break;
      }
      case ZONE.RIFT:
        Look.alpha[z] = Math.min(1, t * 2, (dur - t) * 2);
        Look.rot[z] += 1.5 * DT;
        if (t >= dur) {
          sim.events.push(
            EV.RUN_EVENT,
            RUN_EVENT_KIND.RIFT,
            RUN_EVENT_PHASE.END,
            Pos.x[z],
            Pos.y[z],
            0,
          );
        } else if (touches(z, px, py, Zone.r[z] * 0.7)) {
          enterRift(sim, Pos.x[z], Pos.y[z]);
          pool.despawn(z);
          continue;
        }
        break;
      case ZONE.TERRAIN:
        Look.alpha[z] = Math.min(1, t * 2);
        break;
      case ZONE.PULL:
        // Le puits s'ouvre (0,6 s), attire, puis se referme.
        Look.alpha[z] = Math.min(1, t * 1.6, (dur - t) * 2);
        Look.rot[z] -= 2.5 * DT;
        if (t > 0.6) voidWellPull(sim, z, Zone.param[z]);
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
