/**
 * Combat : dégâts aux ennemis et au boss (critiques, fragilité, recul, statuts élémentaires,
 * marques de Résonance), zones d'effet, projectiles du joueur et ennemis, morts.
 */
import { ELEMENTS, NO_ELEMENT, PLAYER, elementIndex } from '../content/data';
import {
  Body,
  Bullet,
  Foe,
  Life,
  Look,
  MARK_SLOTS,
  Pos,
  SHOT_HIT_MEMORY,
  Shot,
  Status,
  Vel,
  WEAPON_SLOTS,
  WeaponHit,
} from '../engine/components';
import { DT, MAX_ENTITIES } from '../engine/constants';
import { MAX_ENEMY_RADIUS } from './enemies';
import { EV } from './events';
import { dropGem } from './pickups';
import { damagePlayer } from './player';
import { applyMark } from './resonance';
import type { RunSim } from './sim';
import type { WeaponInstance } from './state';
import { blind } from './zones';

export const FIRE = elementIndex('fire');
export const FROST = elementIndex('frost');
export const LIGHTNING = elementIndex('lightning');

const BURN_DURATION = 2.5;
const FREEZE_DURATION = 1.2;
const DOT_INTERVAL = 0.5;
/** Emplacement d'arme à créditer des dégâts de brûlure, par ennemi. */
const burnSlot = new Uint8Array(MAX_ENTITIES);

/**
 * Inflige des dégâts à un ennemi ou au boss. `power` : intensité du statut de l'élément
 * (dps de brûlure, froid par coup, durée d'électrisation). `knock` : recul (0 = aucun).
 */
export function hitFoe(
  sim: RunSim,
  e: number,
  amount: number,
  element: number,
  slot: number,
  power: number,
  fromX: number,
  fromY: number,
  knock: number,
): void {
  if (Life.hp[e] <= 0) return;
  const isBoss = e === sim.state.boss.eid;
  if (isBoss && sim.state.boss.invulnT > 0) return;
  let dmg = amount;
  const crit = sim.rng.combat.next() < PLAYER.critChance;
  if (crit) dmg *= PLAYER.critMult;
  if (Status.brittleT[e] > 0) dmg *= 1.3;
  if (element === LIGHTNING && Status.shockT[e] > 0) dmg *= 1.15;
  Life.hp[e] -= dmg;
  Look.flash[e] = 0.08;
  sim.state.stats.damageBySlot[slot] += dmg;

  if (knock > 0 && !isBoss) {
    let dx = Pos.x[e] - fromX;
    let dy = Pos.y[e] - fromY;
    const d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
    dx /= d;
    dy /= d;
    const k = knock * (1 - Foe.kbRes[e]);
    Status.kx[e] += dx * k;
    Status.ky[e] += dy * k;
  }

  if (element !== NO_ELEMENT) {
    if (element === FIRE) {
      if (power > Status.burnDps[e]) Status.burnDps[e] = power;
      Status.burnT[e] = BURN_DURATION;
      burnSlot[e] = slot;
    } else if (element === FROST) {
      Status.chill[e] += isBoss ? power * 0.25 : power;
      if (isBoss) {
        if (Status.chill[e] > 0.5) Status.chill[e] = 0.5;
      } else if (Status.chill[e] >= 1) {
        Status.chill[e] = 0;
        Status.freezeT[e] = FREEZE_DURATION;
        sim.events.push(EV.FREEZE, e, 0, Pos.x[e], Pos.y[e], 0, 0, true);
      }
    } else if (element === LIGHTNING) {
      if (power > Status.shockT[e]) Status.shockT[e] = power;
    }
    applyMark(sim, e, element);
  }
  sim.events.push(
    EV.HIT,
    e,
    slot | (element << 8) | (crit ? 1 << 16 : 0),
    Pos.x[e],
    Pos.y[e],
    dmg,
    0,
    true,
  );
}

/**
 * Zone d'effet : dégâts, recul, étourdissement, fragilité et aveuglement sur ennemis et boss.
 */
export function aoe(
  sim: RunSim,
  x: number,
  y: number,
  r: number,
  dmg: number,
  slot: number,
  knock: number,
  stun: number,
  brittle: number,
  blindFor: number,
  element = NO_ELEMENT,
  power = 0,
): number {
  // Les zones peuvent s'imbriquer (nova d'Éveil → réaction → explosion) : un tampon par niveau.
  if (sim.aoeDepth >= sim.aoeBuffers.length) return 0;
  const out = sim.aoeBuffers[sim.aoeDepth++];
  const count = sim.grid.query(x, y, r + MAX_ENEMY_RADIUS, out);
  let hits = 0;
  for (let i = 0; i < count; i++) {
    const e = out[i];
    if (Life.hp[e] <= 0) continue;
    const dx = Pos.x[e] - x;
    const dy = Pos.y[e] - y;
    const rr = r + Body.r[e];
    if (dx * dx + dy * dy > rr * rr) continue;
    if (dmg > 0) hitFoe(sim, e, dmg, element, slot, power, x, y, knock);
    if (stun > 0 && Status.stunT[e] < stun) Status.stunT[e] = stun;
    if (brittle > 0 && Status.brittleT[e] < brittle) Status.brittleT[e] = brittle;
    if (blindFor > 0) blind(e, blindFor);
    hits++;
  }
  const boss = sim.state.boss.eid;
  if (boss >= 0 && sim.world.boss.isActive(boss) && Life.hp[boss] > 0) {
    const dx = Pos.x[boss] - x;
    const dy = Pos.y[boss] - y;
    const rr = r + Body.r[boss];
    if (dx * dx + dy * dy <= rr * rr) {
      if (dmg > 0) hitFoe(sim, boss, dmg, element, slot, power, x, y, 0);
      if (brittle > 0 && Status.brittleT[boss] < brittle) Status.brittleT[boss] = brittle;
      hits++;
    }
  }
  sim.aoeDepth--;
  return hits;
}

function alreadyHit(s: number, e: number): boolean {
  const base = s * SHOT_HIT_MEMORY;
  for (let k = 0; k < SHOT_HIT_MEMORY; k++) if (Shot.hits[base + k] === e) return true;
  return false;
}

function rememberHit(s: number, e: number): void {
  const n = Shot.hitN[s];
  Shot.hits[s * SHOT_HIT_MEMORY + (n % SHOT_HIT_MEMORY)] = e;
  Shot.hitN[s] = n + 1;
}

/** Projectiles du joueur : déplacement, durée de vie, collisions (grille + boss). */
export function updateShots(sim: RunSim): void {
  const pool = sim.world.shots;
  const out = sim.scratch;
  const boss = sim.state.boss.eid;
  const bossAlive = boss >= 0 && sim.world.boss.isActive(boss) && Life.hp[boss] > 0;
  for (let i = pool.count - 1; i >= 0; i--) {
    const s = pool.active[i];
    Shot.ttl[s] -= DT;
    if (Shot.ttl[s] <= 0) {
      pool.despawn(s);
      continue;
    }
    const x = Pos.x[s] + Vel.x[s] * DT;
    const y = Pos.y[s] + Vel.y[s] * DT;
    Pos.x[s] = x;
    Pos.y[s] = y;
    const r = Shot.r[s];
    let spent = false;
    const count = sim.grid.query(x, y, r + MAX_ENEMY_RADIUS, out);
    for (let j = 0; j < count; j++) {
      const e = out[j];
      if (Life.hp[e] <= 0 || alreadyHit(s, e)) continue;
      const dx = Pos.x[e] - x;
      const dy = Pos.y[e] - y;
      const rr = r + Body.r[e];
      if (dx * dx + dy * dy > rr * rr) continue;
      hitFoe(
        sim,
        e,
        Shot.dmg[s],
        Shot.element[s],
        Shot.weapon[s],
        shotPower(sim, s),
        x - Vel.x[s] * 0.05,
        y - Vel.y[s] * 0.05,
        45,
      );
      rememberHit(s, e);
      if (--Shot.pierce[s] < 0) {
        spent = true;
        break;
      }
    }
    if (!spent && bossAlive && !alreadyHit(s, boss)) {
      const dx = Pos.x[boss] - x;
      const dy = Pos.y[boss] - y;
      const rr = r + Body.r[boss];
      if (dx * dx + dy * dy <= rr * rr) {
        hitFoe(sim, boss, Shot.dmg[s], Shot.element[s], Shot.weapon[s], shotPower(sim, s), x, y, 0);
        rememberHit(s, boss);
        if (--Shot.pierce[s] < 0) spent = true;
      }
    }
    if (spent) pool.despawn(s);
  }
}

function shotPower(sim: RunSim, s: number): number {
  const w = sim.state.weapons[Shot.weapon[s]] as WeaponInstance | undefined;
  return w ? w.stats.status : 0;
}

/** Projectiles ennemis : déplacement, collision avec le joueur, disparition au loin. */
export function updateBullets(sim: RunSim): void {
  const pool = sim.world.bullets;
  const player = sim.state.player.eid;
  const px = Pos.x[player];
  const py = Pos.y[player];
  for (let i = pool.count - 1; i >= 0; i--) {
    const b = pool.active[i];
    Bullet.ttl[b] -= DT;
    const x = Pos.x[b] + Vel.x[b] * DT;
    const y = Pos.y[b] + Vel.y[b] * DT;
    Pos.x[b] = x;
    Pos.y[b] = y;
    const dx = x - px;
    const dy = y - py;
    const d2 = dx * dx + dy * dy;
    const rr = Bullet.r[b] + PLAYER.radius;
    if (d2 < rr * rr) {
      if (damagePlayer(sim, Bullet.dmg[b]) || sim.state.player.dashT <= 0) {
        pool.despawn(b);
        continue;
      }
    }
    if (Bullet.ttl[b] <= 0 || d2 > 1600 * 1600) pool.despawn(b);
  }
}

/** Statuts : brûlure (dégâts toutes les 0,5 s), décroissance des minuteurs et des marques. */
export function updateStatuses(sim: RunSim): void {
  const tick = sim.state.tick;
  const dotPhase = Math.round(DOT_INTERVAL / DT);
  updateStatusPool(sim, sim.world.enemies.active, sim.world.enemies.count, tick, dotPhase);
  const boss = sim.state.boss.eid;
  if (boss >= 0 && sim.world.boss.isActive(boss)) {
    Status.freezeT[boss] = 0;
    Status.stunT[boss] = 0;
    Status.blindT[boss] = 0;
    const one = sim.bossList;
    one[0] = boss;
    updateStatusPool(sim, one, 1, tick, dotPhase);
  }
}

function updateStatusPool(
  sim: RunSim,
  list: Int32Array,
  n: number,
  tick: number,
  dotPhase: number,
): void {
  for (let i = 0; i < n; i++) {
    const e = list[i];
    if (Status.burnT[e] > 0) {
      Status.burnT[e] -= DT;
      if ((tick + e) % dotPhase === 0 && Life.hp[e] > 0) {
        hitFoe(sim, e, Status.burnDps[e] * DOT_INTERVAL, NO_ELEMENT, burnSlot[e], 0, 0, 0, 0);
      }
      if (Status.burnT[e] <= 0) Status.burnDps[e] = 0;
    }
    if (Status.chill[e] > 0) Status.chill[e] = Math.max(0, Status.chill[e] - 0.22 * DT);
    if (Status.freezeT[e] > 0) Status.freezeT[e] -= DT;
    if (Status.shockT[e] > 0) Status.shockT[e] -= DT;
    if (Status.stunT[e] > 0) Status.stunT[e] -= DT;
    if (Status.blindT[e] > 0) Status.blindT[e] -= DT;
    if (Status.brittleT[e] > 0) Status.brittleT[e] -= DT;
    if (Status.reactCd[e] > 0) Status.reactCd[e] -= DT;
    const marks = Status.marks[e];
    if (marks !== 0) {
      let m = marks;
      const base = e * MARK_SLOTS;
      for (let k = 0; k < ELEMENTS.length; k++) {
        if (!(m & (1 << k))) continue;
        Status.markT[base + k] -= DT;
        if (Status.markT[base + k] <= 0) m &= ~(1 << k);
      }
      Status.marks[e] = m;
    }
    const w = e * WEAPON_SLOTS;
    for (let k = 0; k < WEAPON_SLOTS; k++) if (WeaponHit.cd[w + k] > 0) WeaponHit.cd[w + k] -= DT;
  }
}

/** Morts d'ennemis : gemme, statistiques, événement, retour au pool. */
export function processDeaths(sim: RunSim): void {
  const pool = sim.world.enemies;
  const stats = sim.state.stats;
  for (let i = pool.count - 1; i >= 0; i--) {
    const e = pool.active[i];
    if (Life.hp[e] > 0) continue;
    // Les kamikazes qui explosent d'eux-mêmes ne comptent pas comme abattus.
    if (Foe.state[e] !== 2) {
      stats.kills++;
      stats.killsByType[Foe.type[e]]++;
      dropGem(sim, Pos.x[e], Pos.y[e], Foe.xp[e]);
      sim.events.push(EV.KILL, e, Foe.type[e], Pos.x[e], Pos.y[e], Foe.xp[e]);
    }
    pool.despawn(e);
  }
}
