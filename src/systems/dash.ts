/**
 * Dashs des personnages : chacun a son effet, au départ (téléportation glacée, éclair le long
 * du trajet, nuée toxique, soin, mine) ou à l'arrivée (faille qui aspire, charge qui renverse,
 * stase qui fige). Déplacement et invulnérabilité dans player.ts.
 */
import { ELEMENTS, colorOf } from '../content/data';
import { Foe, Life, Pos, Status, Zone } from '../engine/components';
import { aoe, hitFoe, pullFoes, releaseBuffer, takeBuffer } from './combat';
import { MAX_ENEMY_RADIUS } from './enemies';
import { EV, SLOT_DASH } from './events';
import { healPlayer } from './player';
import type { RunSim } from './sim';
import { armZone, spawnZone, ZONE } from './zones';

const FIRE = ELEMENTS.indexOf('fire');
const FROST = ELEMENTS.indexOf('frost');
const LIGHTNING = ELEMENTS.indexOf('lightning');
const POISON = ELEMENTS.indexOf('poison');
const POISON_TINT = colorOf('#9cff3d');
const FIRE_TINT = colorOf('#ff7a2f');

/** Index des types (ordre de DASH_KINDS, config/keys.ts). */
export const DASH = {
  standard: 0,
  blink: 1,
  lightning: 2,
  cloud: 3,
  phase: 4,
  rift: 5,
  charge: 6,
  double: 7,
  heal: 8,
  mine: 9,
  glide: 10,
  stasis: 11,
} as const;

/**
 * Début du dash : (fx, fy) départ, (dx, dy) direction unitaire. Renvoie true si le
 * déplacement est instantané (téléportation : pas de trajet).
 */
export function dashStart(sim: RunSim, fx: number, fy: number, dx: number, dy: number): boolean {
  const p = sim.state.player;
  const d = p.dash;
  const stats = p.stats;
  const dmg = d.power * stats.damageMult;
  switch (p.dashKind) {
    case DASH.blink: {
      // Téléportation ; le point de départ gèle les ennemis proches.
      Pos.x[p.eid] = fx + dx * d.distance;
      Pos.y[p.eid] = fy + dy * d.distance;
      chillAround(sim, fx, fy, d.radius * stats.areaMult, d.power);
      return true;
    }
    case DASH.lightning:
      hitSegment(
        sim,
        fx,
        fy,
        fx + dx * d.distance,
        fy + dy * d.distance,
        d.radius,
        dmg * stats.elementMult[LIGHTNING],
        LIGHTNING,
      );
      break;
    case DASH.cloud: {
      const z = spawnZone(
        sim,
        ZONE.POOL,
        fx,
        fy,
        d.radius * stats.areaMult,
        3 * stats.durationMult,
        dmg * stats.elementMult[POISON],
        0,
      );
      if (z >= 0) armZone(z, POISON, SLOT_DASH, 2 * stats.statusMult, 0.5, 0, POISON_TINT);
      break;
    }
    case DASH.heal:
      healPlayer(sim, d.power);
      break;
    case DASH.mine: {
      const z = spawnZone(
        sim,
        ZONE.PMINE,
        fx,
        fy,
        d.radius * stats.areaMult,
        10,
        dmg * stats.elementMult[FIRE],
        0,
      );
      if (z >= 0) {
        Zone.w[z] = 44;
        Zone.h[z] = 0.3;
        armZone(z, FIRE, SLOT_DASH, 3 * stats.statusMult, 0, 0, FIRE_TINT);
      }
      break;
    }
    default:
  }
  return false;
}

/** Fin du dash, au point d'arrivée. */
export function dashEnd(sim: RunSim, x: number, y: number): void {
  const p = sim.state.player;
  const d = p.dash;
  const stats = p.stats;
  const r = d.radius * stats.areaMult;
  switch (p.dashKind) {
    case DASH.rift:
      pullFoes(sim, x, y, r, d.power);
      break;
    case DASH.charge:
      aoe(sim, x, y, r, d.power * stats.damageMult, SLOT_DASH, 260, 0.35, 0, 0);
      break;
    case DASH.stasis:
      freezeAround(sim, x, y, r, d.power);
      break;
    default:
      return;
  }
  sim.events.push(EV.DASH_END, p.dashKind, 0, x, y, r);
}

/** Ennemis refroidis (froid cumulatif du givre) dans un rayon. */
function chillAround(sim: RunSim, x: number, y: number, r: number, amount: number): void {
  const buf = takeBuffer(sim);
  if (!buf) return;
  const n = sim.grid.query(x, y, r + MAX_ENEMY_RADIUS, buf);
  for (let i = 0; i < n; i++) {
    const e = buf[i];
    if (Life.hp[e] <= 0) continue;
    const ex = Pos.x[e] - x;
    const ey = Pos.y[e] - y;
    if (ex * ex + ey * ey > r * r) continue;
    Status.chill[e] = Math.min(1, Status.chill[e] + amount);
    if (Status.chill[e] >= 1) Status.freezeT[e] = Math.max(Status.freezeT[e], 1);
  }
  releaseBuffer(sim);
  sim.events.push(EV.FREEZE, FROST, 0, x, y, r);
}

/** Stase : ennemis figés (hors boss, absent de la grille) pendant `seconds`. */
function freezeAround(sim: RunSim, x: number, y: number, r: number, seconds: number): void {
  const buf = takeBuffer(sim);
  if (!buf) return;
  const n = sim.grid.query(x, y, r + MAX_ENEMY_RADIUS, buf);
  for (let i = 0; i < n; i++) {
    const e = buf[i];
    if (Life.hp[e] <= 0) continue;
    const ex = Pos.x[e] - x;
    const ey = Pos.y[e] - y;
    if (ex * ex + ey * ey > r * r) continue;
    Status.stunT[e] = Math.max(Status.stunT[e], seconds);
  }
  releaseBuffer(sim);
}

/** Coup unique sur les ennemis proches d'un segment (éclair du dash). */
export function hitSegment(
  sim: RunSim,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  dmg: number,
  element: number,
): void {
  const buf = takeBuffer(sim);
  if (!buf) return;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const sx = x1 - x0;
  const sy = y1 - y0;
  const len2 = Math.max(1e-6, sx * sx + sy * sy);
  const n = sim.grid.query(mx, my, Math.sqrt(len2) / 2 + width + MAX_ENEMY_RADIUS, buf);
  for (let i = 0; i < n; i++) {
    const e = buf[i];
    if (Life.hp[e] <= 0 || Foe.hidden[e] !== 0) continue;
    const t = Math.max(0, Math.min(1, ((Pos.x[e] - x0) * sx + (Pos.y[e] - y0) * sy) / len2));
    const cx = x0 + sx * t - Pos.x[e];
    const cy = y0 + sy * t - Pos.y[e];
    const reach = width + 12;
    if (cx * cx + cy * cy > reach * reach) continue;
    hitFoe(sim, e, dmg, element, SLOT_DASH, 1, x0, y0, 60);
  }
  releaseBuffer(sim);
  sim.events.push(EV.BEAM, SLOT_DASH, element, x0, y0, x1, y1);
}
