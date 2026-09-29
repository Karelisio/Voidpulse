/**
 * Combat : formule de dégâts (critiques, exposition, fragilité, électrisation, entropie),
 * statuts des six éléments, marques de Résonance, zones d'effet, projectiles du joueur et
 * ennemis, dégâts sur la durée, morts (propagations de la flamme noire et du fléau, coffres).
 */
import {
  ELEMENTS,
  NO_ELEMENT,
  PLAYER,
  REACTIONS,
  STATUS,
  elementIndex,
  reactionIndex,
} from '../content/data';
import {
  Body,
  Bullet,
  Foe,
  Life,
  Look,
  MARK_SLOTS,
  Pos,
  SHOT_FLAG,
  SHOT_HIT_MEMORY,
  SHOT_KIND,
  Shot,
  Status,
  Vel,
  WEAPON_SLOTS,
  WeaponHit,
} from '../engine/components';
import { DT, MAX_ENTITIES } from '../engine/constants';
import { MAX_ENEMY_RADIUS } from './enemies';
import { EV, SLOT_REACTION } from './events';
import { dropChest, dropGem } from './pickups';
import { damagePlayer } from './player';
import { applyMark } from './resonance';
import type { RunSim } from './sim';
import { blind } from './zones';

export const FIRE = elementIndex('fire');
export const FROST = elementIndex('frost');
export const LIGHTNING = elementIndex('lightning');
export const POISON = elementIndex('poison');
export const ARCANE = elementIndex('arcane');
export const VOID = elementIndex('void');

/** Élément combiné à ce drapeau : applique le statut de l'élément sans poser de marque. */
export const STATUS_ONLY = 0x80;

const BLACKFLAME = REACTIONS[reactionIndex('blackflame')];
const CORROSION = REACTIONS[reactionIndex('corrosion')];
const PLAGUE = REACTIONS[reactionIndex('plague')];

/**
 * Contexte du coup en cours, réglé par l'appelant juste avant `hitFoe` puis remis à zéro :
 * évite d'allonger la signature pour des cas rares (critique forcé, chance de critique
 * ajoutée, arcs désactivés).
 */
export const HIT = { forceCrit: false, critBonus: 0, noArc: false };

/** Emplacement d'arme à créditer des dégâts sur la durée, par ennemi. */
const burnSlot = new Uint8Array(MAX_ENTITIES);
const toxSlot = new Uint8Array(MAX_ENTITIES);

/** Réserve un tampon de requête (imbrication : coup → réaction → zone → coup…). */
export function takeBuffer(sim: RunSim): Int32Array | null {
  if (sim.aoeDepth >= sim.aoeBuffers.length) return null;
  return sim.aoeBuffers[sim.aoeDepth++];
}

export function releaseBuffer(sim: RunSim): void {
  sim.aoeDepth--;
}

/** Boss actif et vivant, -1 sinon. */
export function liveBoss(sim: RunSim): number {
  const b = sim.state.boss.eid;
  return b >= 0 && sim.world.boss.isActive(b) && Life.hp[b] > 0 ? b : -1;
}

/**
 * Inflige des dégâts à un ennemi ou au boss. `element` : index d'élément (NO_ELEMENT pour
 * aucun), éventuellement combiné à STATUS_ONLY. `power` : intensité du statut (voir §8 :
 * dps de brûlure, froid par coup, durée d'électrisation, charges de toxine, exposition,
 * fraction des PV max pour le vide). `knock` : recul (0 = aucun).
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
  const el = element & 0x7f;
  const hasElement = el < ELEMENTS.length;
  const stats = sim.state.player.stats;

  let dmg = amount;
  const crit = HIT.forceCrit || sim.rng.combat.next() < stats.critChance + HIT.critBonus;
  if (crit) dmg *= stats.critMult;
  dmg *= damageTakenMult(e, el);
  // Entropie : fraction des PV max (réduite contre les boss), hors critique.
  if (el === VOID && power > 0)
    dmg += power * Life.max[e] * (isBoss ? STATUS.entropy.bossFactor : 1);
  Life.hp[e] -= dmg;
  Look.flash[e] = 0.08;
  sim.state.stats.damageBySlot[slot] += dmg;

  if (!isBoss) {
    let dx = Pos.x[e] - fromX;
    let dy = Pos.y[e] - fromY;
    const d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
    dx /= d;
    dy /= d;
    const res = 1 - Foe.kbRes[e];
    if (knock > 0) {
      Status.kx[e] += dx * knock * res;
      Status.ky[e] += dy * knock * res;
    }
    // Le vide attire légèrement vers l'origine du coup.
    if (el === VOID) {
      Status.kx[e] -= dx * STATUS.entropy.pull * res;
      Status.ky[e] -= dy * STATUS.entropy.pull * res;
    }
  }

  if (hasElement) {
    applyStatus(sim, e, el, power, slot, isBoss);
    if ((element & STATUS_ONLY) === 0) applyMark(sim, e, el);
  }
  sim.events.push(
    EV.HIT,
    e,
    slot | (el << 8) | (crit ? 1 << 16 : 0),
    Pos.x[e],
    Pos.y[e],
    dmg,
    0,
    true,
  );
  if (
    Status.shockT[e] > 0 &&
    !HIT.noArc &&
    Status.arcCd[e] <= 0 &&
    sim.rng.combat.chance(STATUS.shock.arcChance)
  ) {
    shockArc(sim, e, dmg, slot);
  }
}

/** Multiplicateur des dégâts subis par un ennemi (exposition, fragilité, électrisation). */
export function damageTakenMult(e: number, el: number): number {
  let mult = 1;
  if (Status.exposeT[e] > 0) mult += Status.exposeAmt[e];
  if (Status.brittleT[e] > 0) mult += STATUS.brittle;
  if (el === LIGHTNING && Status.shockT[e] > 0) mult += STATUS.shock.bonus;
  return mult;
}

/** Statut de l'élément `el` (sans marque). */
export function applyStatus(
  sim: RunSim,
  e: number,
  el: number,
  power: number,
  slot: number,
  isBoss: boolean,
): void {
  if (power <= 0) return;
  switch (el) {
    case FIRE:
      if (power > Status.burnDps[e]) Status.burnDps[e] = power;
      Status.burnT[e] = STATUS.burn.duration;
      burnSlot[e] = slot;
      break;
    case FROST: {
      const c = STATUS.chill;
      Status.chill[e] += isBoss ? power * c.bossFactor : power;
      if (isBoss) {
        if (Status.chill[e] > c.bossCap) Status.chill[e] = c.bossCap;
      } else if (Status.chill[e] >= 1) {
        Status.chill[e] = 0;
        Status.freezeT[e] = c.freeze;
        sim.events.push(EV.FREEZE, e, 0, Pos.x[e], Pos.y[e], 0, 0, true);
      }
      break;
    }
    case LIGHTNING:
      if (power > Status.shockT[e]) Status.shockT[e] = power;
      break;
    case POISON:
      Status.toxStacks[e] = Math.min(STATUS.toxin.max, Status.toxStacks[e] + power);
      Status.toxT[e] = STATUS.toxin.duration;
      toxSlot[e] = slot;
      break;
    case ARCANE:
      if (power > Status.exposeAmt[e]) Status.exposeAmt[e] = Math.min(STATUS.expose.max, power);
      Status.exposeT[e] = STATUS.expose.duration;
      break;
  }
}

/** Petit arc électrique vers le voisin le plus proche (dégâts partiels, sans marque). */
export function shockArc(sim: RunSim, e: number, dmg: number, slot: number): void {
  const s = STATUS.shock;
  Status.arcCd[e] = s.arcCooldown;
  const buf = takeBuffer(sim);
  if (!buf) return;
  const x = Pos.x[e];
  const y = Pos.y[e];
  const n = sim.grid.query(x, y, s.arcRange + MAX_ENEMY_RADIUS, buf);
  let best = -1;
  let bestD2 = s.arcRange * s.arcRange;
  for (let i = 0; i < n; i++) {
    const o = buf[i];
    if (o === e || Life.hp[o] <= 0) continue;
    const dx = Pos.x[o] - x;
    const dy = Pos.y[o] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = o;
    }
  }
  releaseBuffer(sim);
  if (best < 0) return;
  sim.events.push(EV.BEAM, slot, LIGHTNING, x, y, Pos.x[best], Pos.y[best], true);
  HIT.noArc = true;
  hitFoe(
    sim,
    best,
    dmg * s.arcDamage,
    LIGHTNING | STATUS_ONLY,
    slot,
    Math.max(1, Status.shockT[e]),
    x,
    y,
    0,
  );
  HIT.noArc = false;
}

/**
 * Zone d'effet : dégâts, recul, étourdissement, fragilité et aveuglement sur ennemis et boss.
 * Renvoie le nombre de cibles touchées.
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
  const out = takeBuffer(sim);
  if (!out) return 0;
  const count = sim.grid.query(x, y, r + MAX_ENEMY_RADIUS, out);
  let hits = 0;
  for (let i = 0; i < count; i++) {
    const e = out[i];
    if (Life.hp[e] <= 0) continue;
    const dx = Pos.x[e] - x;
    const dy = Pos.y[e] - y;
    const rr = r + Body.r[e];
    if (dx * dx + dy * dy > rr * rr) continue;
    if (dmg > 0 || power > 0) hitFoe(sim, e, dmg, element, slot, power, x, y, knock);
    if (stun > 0 && Status.stunT[e] < stun) Status.stunT[e] = stun;
    if (brittle > 0 && Status.brittleT[e] < brittle) Status.brittleT[e] = brittle;
    if (blindFor > 0) blind(e, blindFor);
    hits++;
  }
  const boss = liveBoss(sim);
  if (boss >= 0) {
    const dx = Pos.x[boss] - x;
    const dy = Pos.y[boss] - y;
    const rr = r + Body.r[boss];
    if (dx * dx + dy * dy <= rr * rr) {
      if (dmg > 0 || power > 0) hitFoe(sim, boss, dmg, element, slot, power, x, y, 0);
      if (brittle > 0 && Status.brittleT[boss] < brittle) Status.brittleT[boss] = brittle;
      hits++;
    }
  }
  releaseBuffer(sim);
  return hits;
}

/** Attire les ennemis d'un disque vers son centre (vitesse ~ `speed` px/s). */
export function pullFoes(sim: RunSim, x: number, y: number, r: number, speed: number): number {
  const out = takeBuffer(sim);
  if (!out) return 0;
  const count = sim.grid.query(x, y, r + MAX_ENEMY_RADIUS, out);
  // Le recul est amorti de 18 % par tick : une impulsion de 0,18 × v entretient la vitesse v.
  const impulse = speed * 0.18;
  let n = 0;
  for (let i = 0; i < count; i++) {
    const e = out[i];
    if (Life.hp[e] <= 0) continue;
    const dx = x - Pos.x[e];
    const dy = y - Pos.y[e];
    const d2 = dx * dx + dy * dy;
    if (d2 > r * r || d2 < 64) continue;
    const d = Math.sqrt(d2);
    const k = impulse * (1 - Foe.kbRes[e] * 0.6);
    Status.kx[e] += (dx / d) * k;
    Status.ky[e] += (dy / d) * k;
    n++;
  }
  releaseBuffer(sim);
  return n;
}

/**
 * Projectile du joueur (ou éclat de réaction). Renvoie l'eid, -1 si le pool est plein.
 * Les champs rares (explosion, fragments, tête chercheuse) sont remis à zéro par le pool.
 */
export function spawnShot(
  sim: RunSim,
  x: number,
  y: number,
  angle: number,
  speed: number,
  dmg: number,
  element: number,
  power: number,
  slot: number,
  pierce: number,
  ttl: number,
  r: number,
  frame: number,
  tint: number,
): number {
  const s = sim.spawnIn(sim.world.shots);
  if (s < 0) return -1;
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  Pos.x[s] = x;
  Pos.y[s] = y;
  Pos.px[s] = x;
  Pos.py[s] = y;
  Vel.x[s] = c * speed;
  Vel.y[s] = sn * speed;
  Shot.speed[s] = speed;
  Shot.weapon[s] = slot;
  Shot.element[s] = element;
  Shot.dmg[s] = dmg;
  Shot.power[s] = power;
  Shot.pierce[s] = pierce;
  Shot.ttl[s] = ttl;
  Shot.r[s] = r;
  Look.frame[s] = frame;
  Look.rot[s] = angle;
  Look.tint[s] = tint;
  return s;
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

/** Recharge de touche d'un boomerang sur un même ennemi (s). */
const BOOMERANG_REHIT = 0.35;

/** Un projectile touche l'ennemi e ; renvoie true s'il est épuisé. */
function shotHits(sim: RunSim, s: number, e: number): boolean {
  // Positions relues ici plutôt que passées en argument (évite d'emballer des flottants).
  const x = Pos.x[s];
  const y = Pos.y[s];
  const slot = Shot.weapon[s];
  const boomerang = Shot.kind[s] === SHOT_KIND.BOOMERANG;
  if (boomerang && slot < WEAPON_SLOTS) {
    const k = e * WEAPON_SLOTS + slot;
    if (WeaponHit.cd[k] > 0) return false;
    WeaponHit.cd[k] = BOOMERANG_REHIT;
  } else {
    if (alreadyHit(s, e)) return false;
    rememberHit(s, e);
  }
  if ((Shot.flags[s] & SHOT_FLAG.CRIT) !== 0) HIT.forceCrit = true;
  hitFoe(
    sim,
    e,
    Shot.dmg[s],
    Shot.element[s],
    slot,
    Shot.power[s],
    x - Vel.x[s] * 0.05,
    y - Vel.y[s] * 0.05,
    boomerang ? 25 : 45,
  );
  HIT.forceCrit = false;
  if (Shot.arc[s] > 0 && Life.hp[e] > 0 && sim.rng.combat.chance(Shot.arc[s]))
    shockArc(sim, e, Shot.dmg[s], slot);
  if (Shot.explode[s] > 0) {
    aoe(
      sim,
      x,
      y,
      Shot.explode[s],
      Shot.dmg[s] * 0.5,
      slot,
      60,
      0,
      0,
      0,
      Shot.element[s] | STATUS_ONLY,
      Shot.power[s],
    );
    sim.events.push(EV.EXPLOSION, 3, 0, x, y, Shot.explode[s], Shot.element[s] & 0x7f, true);
  }
  if (boomerang) return false;
  return --Shot.pierce[s] < 0;
}

/** Libère les fragments d'un projectile qui expire ou s'épuise. */
function splitShot(sim: RunSim, s: number): void {
  const n = Shot.split[s];
  if (n === 0) return;
  const base = sim.rng.combat.range(0, Math.PI * 2);
  for (let k = 0; k < n; k++) {
    const f = spawnShot(
      sim,
      Pos.x[s],
      Pos.y[s],
      base + (k / n) * Math.PI * 2,
      Shot.speed[s] * 0.6,
      Shot.dmg[s] * 0.4,
      Shot.element[s] | STATUS_ONLY,
      Shot.power[s],
      Shot.weapon[s],
      0,
      0.35,
      Shot.r[s] * 0.7,
      Look.frame[s],
      Look.tint[s],
    );
    if (f >= 0) Look.scale[f] = 0.7;
  }
}

/** Projectiles du joueur : trajectoires (droite, boomerang, tête chercheuse), collisions. */
export function updateShots(sim: RunSim): void {
  const pool = sim.world.shots;
  const out = sim.scratch;
  const boss = liveBoss(sim);
  const player = sim.state.player.eid;
  for (let i = pool.count - 1; i >= 0; i--) {
    const s = pool.active[i];
    Shot.ttl[s] -= DT;
    Shot.age[s] += DT;
    const kind = Shot.kind[s];
    if (kind === SHOT_KIND.BOOMERANG) {
      if (Shot.age[s] >= Shot.outT[s]) {
        // Retour vers le joueur.
        const dx = Pos.x[player] - Pos.x[s];
        const dy = Pos.y[player] - Pos.y[s];
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 22) {
          pool.despawn(s);
          continue;
        }
        const sp = Shot.speed[s] * 1.15;
        Vel.x[s] = (dx / d) * sp;
        Vel.y[s] = (dy / d) * sp;
      }
      Look.rot[s] += 14 * DT;
    } else if (kind === SHOT_KIND.HOMING) {
      steerHoming(sim, s);
    }
    if (Shot.ttl[s] <= 0) {
      splitShot(sim, s);
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
      if (Life.hp[e] <= 0) continue;
      const dx = Pos.x[e] - x;
      const dy = Pos.y[e] - y;
      const rr = r + Body.r[e];
      if (dx * dx + dy * dy > rr * rr) continue;
      if (shotHits(sim, s, e)) {
        spent = true;
        break;
      }
    }
    if (!spent && boss >= 0 && Life.hp[boss] > 0) {
      const dx = Pos.x[boss] - x;
      const dy = Pos.y[boss] - y;
      const rr = r + Body.r[boss];
      if (dx * dx + dy * dy <= rr * rr && shotHits(sim, s, boss)) spent = true;
    }
    if (spent) {
      splitShot(sim, s);
      pool.despawn(s);
    }
  }
}

/** Tête chercheuse : reciblage périodique, virage limité, vitesse constante. */
function steerHoming(sim: RunSim, s: number): void {
  let t = Shot.target[s];
  const retarget = (sim.state.tick + s) % 8 === 0;
  if (t < 0 || Life.hp[t] <= 0 || retarget) {
    const found = nearestFoeInto(sim, Pos.x[s], Pos.y[s], 520, sim.homingScratch);
    if (found >= 0) t = found;
    else if (t >= 0 && Life.hp[t] <= 0) t = -1;
    Shot.target[s] = t;
  }
  let a = Math.atan2(Vel.y[s], Vel.x[s]);
  if (t >= 0) {
    const want = Math.atan2(Pos.y[t] - Pos.y[s], Pos.x[t] - Pos.x[s]);
    let d = want - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const max = Shot.turn[s] * DT;
    a += d > max ? max : d < -max ? -max : d;
  }
  const sp = Shot.speed[s];
  Vel.x[s] = Math.cos(a) * sp;
  Vel.y[s] = Math.sin(a) * sp;
  Look.rot[s] = a;
}

/** Ennemi (ou boss) le plus proche dans le rayon r, avec un tampon dédié ; -1 sinon. */
export function nearestFoeInto(
  sim: RunSim,
  x: number,
  y: number,
  r: number,
  buf: Int32Array,
): number {
  const count = sim.grid.query(x, y, r + MAX_ENEMY_RADIUS, buf);
  let best = -1;
  let bestD2 = r * r;
  for (let i = 0; i < count; i++) {
    const e = buf[i];
    if (Life.hp[e] <= 0) continue;
    const dx = Pos.x[e] - x;
    const dy = Pos.y[e] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      best = e;
      bestD2 = d2;
    }
  }
  const boss = liveBoss(sim);
  if (boss >= 0) {
    const dx = Pos.x[boss] - x;
    const dy = Pos.y[boss] - y;
    const edge = Math.max(0, Math.sqrt(dx * dx + dy * dy) - Body.r[boss]);
    if (edge * edge < bestD2) best = boss;
  }
  return best;
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

/** Statuts : dégâts sur la durée toutes les 0,5 s, décroissance des minuteurs et des marques. */
export function updateStatuses(sim: RunSim): void {
  const tick = sim.state.tick;
  const dotPhase = Math.round(STATUS.burn.interval / DT);
  updateStatusPool(sim, sim.world.enemies.active, sim.world.enemies.count, tick, dotPhase, false);
  const boss = sim.state.boss.eid;
  if (boss >= 0 && sim.world.boss.isActive(boss)) {
    Status.freezeT[boss] = 0;
    Status.stunT[boss] = 0;
    Status.blindT[boss] = 0;
    const one = sim.bossList;
    one[0] = boss;
    updateStatusPool(sim, one, 1, tick, dotPhase, true);
  }
}

function updateStatusPool(
  sim: RunSim,
  list: Int32Array,
  n: number,
  tick: number,
  dotPhase: number,
  isBoss: boolean,
): void {
  const interval = STATUS.burn.interval;
  const stats = sim.state.player.stats;
  const toxDps = STATUS.toxin.dpsPerStack * stats.damageMult * stats.elementMult[POISON];
  const pct = isBoss ? STATUS.percentBossFactor : 1;
  for (let i = 0; i < n; i++) {
    const e = list[i];
    const dot = (tick + e) % dotPhase === 0 && Life.hp[e] > 0;
    if (Status.burnT[e] > 0) {
      Status.burnT[e] -= DT;
      if (dot) hitFoe(sim, e, Status.burnDps[e] * interval, NO_ELEMENT, burnSlot[e], 0, 0, 0, 0);
      if (Status.burnT[e] <= 0) Status.burnDps[e] = 0;
    }
    if (Status.toxT[e] > 0) {
      Status.toxT[e] -= DT;
      if (dot && Life.hp[e] > 0) {
        hitFoe(sim, e, Status.toxStacks[e] * toxDps * interval, NO_ELEMENT, toxSlot[e], 0, 0, 0, 0);
      }
      if (Status.toxT[e] <= 0) Status.toxStacks[e] = 0;
    }
    if (Status.blackT[e] > 0) {
      Status.blackT[e] -= DT;
      if (dot && Life.hp[e] > 0) {
        const d = BLACKFLAME.damage * Life.max[e] * pct * interval * stats.elementMult[FIRE];
        hitFoe(sim, e, d, NO_ELEMENT, SLOT_REACTION, 0, 0, 0, 0);
      }
    }
    if (Status.corrodeT[e] > 0) {
      Status.corrodeT[e] -= DT;
      if (dot && Life.hp[e] > 0) {
        const d = CORROSION.damage * Life.max[e] * pct * interval * stats.elementMult[POISON];
        hitFoe(sim, e, d, NO_ELEMENT, SLOT_REACTION, 0, 0, 0, 0);
      }
    }
    if (Status.chill[e] > 0)
      Status.chill[e] = Math.max(0, Status.chill[e] - STATUS.chill.decay * DT);
    if (Status.freezeT[e] > 0) Status.freezeT[e] -= DT;
    if (Status.shockT[e] > 0) Status.shockT[e] -= DT;
    if (Status.arcCd[e] > 0) Status.arcCd[e] -= DT;
    if (Status.stunT[e] > 0) Status.stunT[e] -= DT;
    if (Status.blindT[e] > 0) Status.blindT[e] -= DT;
    if (Status.brittleT[e] > 0) Status.brittleT[e] -= DT;
    if (Status.plagueT[e] > 0) Status.plagueT[e] -= DT;
    if (Status.exposeT[e] > 0) {
      Status.exposeT[e] -= DT;
      if (Status.exposeT[e] <= 0) Status.exposeAmt[e] = 0;
    }
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

/** Flamme noire : à la mort, se propage aux voisins. */
function spreadBlackflame(sim: RunSim, e: number): void {
  const buf = takeBuffer(sim);
  if (!buf) return;
  const x = Pos.x[e];
  const y = Pos.y[e];
  const r = BLACKFLAME.radius;
  const n = sim.grid.query(x, y, r + MAX_ENEMY_RADIUS, buf);
  let left = BLACKFLAME.power;
  for (let i = 0; i < n && left > 0; i++) {
    const o = buf[i];
    if (o === e || Life.hp[o] <= 0 || Status.blackT[o] > 0) continue;
    const dx = Pos.x[o] - x;
    const dy = Pos.y[o] - y;
    if (dx * dx + dy * dy > r * r) continue;
    Status.blackT[o] = BLACKFLAME.duration;
    left--;
  }
  releaseBuffer(sim);
}

/** Fléau : à la mort, les statuts de l'ennemi contaminent ses voisins. */
function spreadPlague(sim: RunSim, e: number): void {
  const buf = takeBuffer(sim);
  if (!buf) return;
  const x = Pos.x[e];
  const y = Pos.y[e];
  const r = PLAGUE.radius;
  const n = sim.grid.query(x, y, r + MAX_ENEMY_RADIUS, buf);
  let left = PLAGUE.power;
  const base = e * MARK_SLOTS;
  for (let i = 0; i < n && left > 0; i++) {
    const o = buf[i];
    if (o === e || Life.hp[o] <= 0) continue;
    const dx = Pos.x[o] - x;
    const dy = Pos.y[o] - y;
    if (dx * dx + dy * dy > r * r) continue;
    if (Status.burnT[e] > 0) {
      Status.burnT[o] = Math.max(Status.burnT[o], Status.burnT[e]);
      Status.burnDps[o] = Math.max(Status.burnDps[o], Status.burnDps[e]);
      burnSlot[o] = burnSlot[e];
    }
    if (Status.toxT[e] > 0) {
      Status.toxStacks[o] = Math.max(Status.toxStacks[o], Status.toxStacks[e]);
      Status.toxT[o] = STATUS.toxin.duration;
      toxSlot[o] = toxSlot[e];
    }
    if (Status.exposeT[e] > 0) {
      Status.exposeT[o] = Math.max(Status.exposeT[o], Status.exposeT[e]);
      Status.exposeAmt[o] = Math.max(Status.exposeAmt[o], Status.exposeAmt[e]);
    }
    Status.chill[o] = Math.max(Status.chill[o], Status.chill[e]);
    if (Status.shockT[e] > 0) Status.shockT[o] = Math.max(Status.shockT[o], Status.shockT[e]);
    if (Status.blackT[e] > 0) Status.blackT[o] = Math.max(Status.blackT[o], Status.blackT[e]);
    if (Status.corrodeT[e] > 0)
      Status.corrodeT[o] = Math.max(Status.corrodeT[o], Status.corrodeT[e]);
    // Les marques aussi : la contagion prépare de nouvelles réactions.
    const m = Status.marks[e];
    if (m !== 0) {
      const ob = o * MARK_SLOTS;
      for (let k = 0; k < ELEMENTS.length; k++) {
        if (m & (1 << k))
          Status.markT[ob + k] = Math.max(Status.markT[ob + k], Status.markT[base + k]);
      }
      Status.marks[o] |= m;
    }
    Status.plagueT[o] = Math.max(Status.plagueT[o], PLAGUE.duration * 0.5);
    left--;
  }
  releaseBuffer(sim);
}

/** Morts d'ennemis : gemme, coffre d'élite, propagations, statistiques, retour au pool. */
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
      if (Foe.elite[e] !== 0) {
        stats.elitesKilled++;
        dropChest(sim, Pos.x[e], Pos.y[e]);
      }
    }
    if (Status.blackT[e] > 0.3) spreadBlackflame(sim, e);
    if (Status.plagueT[e] > 0) spreadPlague(sim, e);
    pool.despawn(e);
  }
}
