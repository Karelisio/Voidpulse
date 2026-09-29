/**
 * Armes : dix archétypes codés (projectile, orbite, rayon, nova, boomerang, chaîne, aura,
 * mines, tête chercheuse, zone) paramétrés par les données. Le niveau cumule les deltas de
 * config ; l'évolution remplace statistiques et paramètres. Les passifs modulent dégâts
 * (général et par élément), statuts, zone, durée, vitesse, recharges et quantité.
 */
import {
  RESONANCE,
  WEAPONS,
  elementIndex,
  type WeaponDef,
  type WeaponParams,
  type WeaponStats,
} from '../content/data';
import { FRAME } from '../content/frames';
import {
  Body,
  Life,
  Look,
  Orbit,
  Pos,
  SHOT_KIND,
  Shot,
  WEAPON_SLOTS,
  WeaponHit,
  Zone,
} from '../engine/components';
import { DT } from '../engine/constants';
import {
  FIRE,
  FROST,
  LIGHTNING,
  VOID,
  aoe,
  hitFoe,
  liveBoss,
  nearestFoeInto,
  pullFoes,
  releaseBuffer,
  spawnShot,
  takeBuffer,
} from './combat';
import { MAX_ENEMY_RADIUS } from './enemies';
import { EV } from './events';
import { healPlayer } from './player';
import type { RunSim } from './sim';
import type { WeaponInstance, WeaponParamsN } from './state';
import { ZONE, armZone, spawnZone } from './zones';

export function maxWeaponLevel(def: WeaponDef): number {
  return def.levels.length + 1;
}

/** Copie à forme fixe (accès monomorphes dans la boucle chaude). */
function statsFrom(b: WeaponStats): WeaponStats {
  return {
    damage: b.damage,
    cooldown: b.cooldown,
    count: b.count,
    pierce: b.pierce,
    speed: b.speed,
    size: b.size,
    range: b.range,
    duration: b.duration,
    status: b.status,
  };
}

export function weaponStats(def: WeaponDef, level: number): WeaponStats {
  const s = statsFrom(def.base);
  for (let i = 0; i < level - 1 && i < def.levels.length; i++) {
    const d = def.levels[i];
    s.damage += d.damage ?? 0;
    s.cooldown += d.cooldown ?? 0;
    s.count += d.count ?? 0;
    s.pierce += d.pierce ?? 0;
    s.speed += d.speed ?? 0;
    s.size += d.size ?? 0;
    s.range += d.range ?? 0;
    s.duration += d.duration ?? 0;
    s.status += d.status ?? 0;
  }
  return s;
}

export function normParams(p: WeaponParams): WeaponParamsN {
  return {
    spread: p.spread ?? 0.16,
    pattern: p.pattern ?? 0,
    explode: p.explode ?? 0,
    split: p.split ?? 0,
    turn: p.turn ?? 0,
    sweep: p.sweep ?? 0,
    track: p.track ?? 0,
    tick: p.tick ?? 0.5,
    pull: p.pull ?? 0,
    knock: p.knock ?? 0,
    strike: p.strike ?? 0,
    pool: p.pool ?? 0,
    arm: p.arm ?? 0.3,
    fork: p.fork ?? 0,
    arcs: p.arcs ?? 0,
    heal: p.heal ?? 0,
    critBonus: p.critBonus ?? 0,
  };
}

const ARCH = {
  projectile: 0,
  orbit: 1,
  beam: 2,
  nova: 3,
  boomerang: 4,
  chain: 5,
  aura: 6,
  mines: 7,
  homing: 8,
  zone: 9,
} as const;
const ARCH_OF = Uint8Array.from(WEAPONS.map((w) => ARCH[w.archetype]));

/** Image des projectiles droits selon l'élément. */
function projectileFrame(element: number): number {
  switch (element) {
    case FIRE:
      return FRAME.SHOT_FIRE;
    case FROST:
      return FRAME.SHOT_SHARD;
    case LIGHTNING:
      return FRAME.SHOT_BOLT;
    case VOID:
      return FRAME.SHOT_VOID;
    default:
      return FRAME.SHOT_ORB;
  }
}

/**
 * Image d'un tir : les images colorées d'origine (feu, givre) sont remplacées par leur
 * équivalent blanc quand l'arme porte une apparence de maîtrise.
 */
function shotFrame(sim: RunSim, defIndex: number, frame: number): number {
  if (sim.skinned[defIndex] === 0) return frame;
  return frame === FRAME.SHOT_FIRE
    ? FRAME.SHOT_ORB
    : frame === FRAME.ORB_FROST
      ? FRAME.ORB_GENERIC
      : frame;
}

/** Les images colorées d'origine (feu, givre) ne sont pas teintées. */
function tintFor(sim: RunSim, defIndex: number, frame: number): number {
  return frame === FRAME.SHOT_FIRE || frame === FRAME.ORB_FROST
    ? 0xffffff
    : sim.weaponTint[defIndex];
}

export function addWeapon(sim: RunSim, defIndex: number): WeaponInstance | null {
  const weapons = sim.state.weapons;
  if (weapons.length >= WEAPON_SLOTS) return null;
  const def = WEAPONS[defIndex];
  const w: WeaponInstance = {
    def,
    defIndex,
    slot: weapons.length,
    level: 1,
    element: elementIndex(def.element),
    stats: weaponStats(def, 1),
    cd: 0.4,
    angle: 0,
    shards: 0,
    params: normParams(def.params),
    evolved: false,
    pulses: 0,
    pulseT: 0,
    fxT: 0,
  };
  weapons.push(w);
  return w;
}

export function levelUpWeapon(w: WeaponInstance): void {
  if (w.evolved) return;
  w.level = Math.min(maxWeaponLevel(w.def), w.level + 1);
  w.stats = weaponStats(w.def, w.level);
}

/** Évolution : l'arme au niveau max prend les statistiques et paramètres évolués. */
export function evolveWeapon(sim: RunSim, w: WeaponInstance): void {
  if (w.evolved) return;
  w.evolved = true;
  w.level = maxWeaponLevel(w.def);
  w.stats = statsFrom(w.def.evolution.base);
  w.params = normParams(w.def.evolution.params);
  sim.state.stats.evolutions++;
  sim.events.push(EV.EVOLUTION, w.defIndex, w.slot, 0, 0, 0);
}

/** Évolution possible : niveau max atteint, passif requis possédé. */
export function canEvolve(sim: RunSim, w: WeaponInstance): boolean {
  if (w.evolved || w.level < maxWeaponLevel(w.def)) return false;
  const req = w.def.evolution.passive;
  return sim.state.passives.some((p) => p.def.id === req);
}

/** Ennemi (ou boss) le plus proche de (x, y) dans le rayon r ; -1 sinon. */
export function nearestFoe(sim: RunSim, x: number, y: number, r: number): number {
  return nearestFoeInto(sim, x, y, r, sim.scratch);
}

/** Direction de tir : ennemi le plus proche (visée auto) ou direction du regard. */
function aimAngle(sim: RunSim, px: number, py: number, range: number): number {
  const p = sim.state.player;
  if (sim.input.aim === 'auto') {
    const t = nearestFoe(sim, px, py, range);
    if (t >= 0) return Math.atan2(Pos.y[t] - py, Pos.x[t] - px);
  }
  return Math.atan2(p.faceY, p.faceX);
}

export function updateWeapons(sim: RunSim): void {
  const st = sim.state;
  const cdMult =
    st.player.stats.cooldownMult * (st.resonance.eveilT > 0 ? RESONANCE.eveil.cooldownMult : 1);
  for (let i = 0; i < st.weapons.length; i++) {
    const w = st.weapons[i];
    if (w.fxT > 0) w.fxT -= DT;
    switch (ARCH_OF[w.defIndex]) {
      case ARCH.orbit:
        updateOrbit(sim, w, cdMult);
        continue;
      case ARCH.aura:
        updateAura(sim, w, cdMult);
        continue;
      case ARCH.nova:
        if (w.pulses > 0) {
          w.pulseT -= DT;
          if (w.pulseT <= 0) {
            novaPulse(sim, w);
            w.pulses--;
            w.pulseT = 0.2;
          }
        }
        break;
    }
    w.cd -= DT;
    if (w.cd > 0) continue;
    const cast = castWeapon(sim, w);
    w.cd = cast ? Math.max(0, w.cd) + w.stats.cooldown * cdMult : 0.25;
  }
}

/** Lance l'arme ; faux si rien à viser (nouvel essai rapide). */
function castWeapon(sim: RunSim, w: WeaponInstance): boolean {
  switch (ARCH_OF[w.defIndex]) {
    case ARCH.projectile:
      fireProjectiles(sim, w);
      return true;
    case ARCH.beam:
      fireBeams(sim, w);
      return true;
    case ARCH.nova:
      w.pulses = w.stats.count + sim.state.player.stats.amount;
      w.pulseT = 0;
      return true;
    case ARCH.boomerang:
      fireBoomerangs(sim, w);
      return true;
    case ARCH.chain:
      return fireChain(sim, w);
    case ARCH.mines:
      placeMines(sim, w);
      return true;
    case ARCH.homing:
      fireHoming(sim, w);
      return true;
    case ARCH.zone:
      return castZones(sim, w);
    default:
      return true;
  }
}

function damageOf(sim: RunSim, w: WeaponInstance): number {
  const s = sim.state.player.stats;
  return (
    w.stats.damage *
    s.damageMult *
    s.elementMult[w.element] *
    sim.state.meta.weaponDamage[w.defIndex]
  );
}

function powerOf(sim: RunSim, w: WeaponInstance): number {
  return w.stats.status * sim.state.player.stats.statusMult;
}

function fireEvent(sim: RunSim, w: WeaponInstance, x: number, y: number, radius: number): void {
  sim.events.push(EV.FIRE, w.slot, w.defIndex, x, y, radius, w.element);
}

function fireProjectiles(sim: RunSim, w: WeaponInstance): void {
  const p = sim.state.player;
  const stats = p.stats;
  const px = Pos.x[p.eid];
  const py = Pos.y[p.eid];
  const base = aimAngle(sim, px, py, 520);
  const n = w.stats.count + stats.amount;
  const prm = w.params;
  const frame = shotFrame(sim, w.defIndex, projectileFrame(w.element));
  const tint = tintFor(sim, w.defIndex, frame);
  const dmg = damageOf(sim, w);
  const power = powerOf(sim, w);
  const area = stats.areaMult;
  for (let k = 0; k < n; k++) {
    let angle = base + (k - (n - 1) / 2) * prm.spread;
    if (prm.pattern === 1) angle = base + (k / n) * Math.PI * 2;
    else if (prm.pattern === 2) angle = base + sim.rng.combat.range(-0.5, 0.5) * prm.spread * n;
    const s = spawnShot(
      sim,
      px,
      py,
      angle,
      w.stats.speed * stats.projectileSpeed,
      dmg,
      w.element,
      power,
      w.slot,
      w.stats.pierce,
      w.stats.duration * stats.durationMult,
      w.stats.size * area,
      frame,
      tint,
    );
    if (s < 0) break;
    Shot.explode[s] = prm.explode * area;
    Shot.split[s] = prm.split;
    Look.scale[s] = area;
  }
  fireEvent(sim, w, px, py, 0);
}

function fireBoomerangs(sim: RunSim, w: WeaponInstance): void {
  const p = sim.state.player;
  const stats = p.stats;
  const px = Pos.x[p.eid];
  const py = Pos.y[p.eid];
  const base = aimAngle(sim, px, py, w.stats.range * 1.5);
  const n = w.stats.count + stats.amount;
  const speed = w.stats.speed * stats.projectileSpeed;
  const dmg = damageOf(sim, w);
  const power = powerOf(sim, w);
  const area = stats.areaMult;
  for (let k = 0; k < n; k++) {
    const angle = base + (k - (n - 1) / 2) * w.params.spread;
    const s = spawnShot(
      sim,
      px,
      py,
      angle,
      speed,
      dmg,
      w.element,
      power,
      w.slot,
      0,
      12,
      w.stats.size * area,
      FRAME.SHOT_DISC,
      sim.weaponTint[w.defIndex],
    );
    if (s < 0) break;
    Shot.kind[s] = SHOT_KIND.BOOMERANG;
    Shot.outT[s] = (w.stats.range * area) / Math.max(1, speed);
    Shot.arc[s] = w.params.arcs;
    Look.scale[s] = area;
  }
  fireEvent(sim, w, px, py, 0);
}

function fireHoming(sim: RunSim, w: WeaponInstance): void {
  const p = sim.state.player;
  const stats = p.stats;
  const px = Pos.x[p.eid];
  const py = Pos.y[p.eid];
  const base = aimAngle(sim, px, py, 520);
  const n = w.stats.count + stats.amount;
  const dmg = damageOf(sim, w);
  const power = powerOf(sim, w);
  const area = stats.areaMult;
  const frame = FRAME.SHOT_MISSILE;
  for (let k = 0; k < n; k++) {
    const angle = base + (n > 1 ? (k / (n - 1) - 0.5) * w.params.spread * 2 : 0);
    const s = spawnShot(
      sim,
      px,
      py,
      angle,
      w.stats.speed * stats.projectileSpeed,
      dmg,
      w.element,
      power,
      w.slot,
      w.stats.pierce,
      w.stats.duration * stats.durationMult,
      w.stats.size * area,
      frame,
      sim.weaponTint[w.defIndex],
    );
    if (s < 0) break;
    Shot.kind[s] = SHOT_KIND.HOMING;
    Shot.turn[s] = w.params.turn;
    Shot.explode[s] = w.params.explode * area;
    Look.scale[s] = area;
  }
  fireEvent(sim, w, px, py, 0);
}

function fireBeams(sim: RunSim, w: WeaponInstance): void {
  const p = sim.state.player;
  const stats = p.stats;
  const px = Pos.x[p.eid];
  const py = Pos.y[p.eid];
  const prm = w.params;
  const base = aimAngle(sim, px, py, w.stats.range);
  const n = w.stats.count + stats.amount;
  const dmg = damageOf(sim, w);
  const power = powerOf(sim, w);
  for (let k = 0; k < n; k++) {
    // Rayons balayants répartis sur le cercle ; rayons fixes en éventail serré.
    const angle = prm.sweep > 0 ? base + (k / n) * Math.PI * 2 : base + (k - (n - 1) / 2) * 0.3;
    const z = spawnZone(
      sim,
      ZONE.BEAM,
      px,
      py,
      0,
      w.stats.duration * stats.durationMult,
      dmg,
      prm.sweep,
    );
    if (z < 0) break;
    Zone.w[z] = w.stats.range * stats.areaMult;
    Zone.h[z] = w.stats.size * stats.areaMult;
    Zone.rot[z] = angle;
    Zone.state[z] = prm.track;
    Zone.crit[z] = prm.critBonus;
    armZone(z, w.element, w.slot, power, prm.tick, 0, sim.weaponTint[w.defIndex]);
  }
  fireEvent(sim, w, px, py, 0);
}

function novaPulse(sim: RunSim, w: WeaponInstance): void {
  const p = sim.state.player;
  const px = Pos.x[p.eid];
  const py = Pos.y[p.eid];
  const r = w.stats.range * p.stats.areaMult;
  const dmg = damageOf(sim, w);
  const power = powerOf(sim, w);
  aoe(sim, px, py, r, dmg, w.slot, w.params.knock, 0, 0, 0, w.element, power);
  fireEvent(sim, w, px, py, r);
  const arcs = w.params.arcs;
  if (arcs <= 0) return;
  // Arcs secondaires vers des ennemis juste au-delà du rayon.
  const buf = takeBuffer(sim);
  if (!buf) return;
  const outer = r * 1.9;
  const n = sim.grid.query(px, py, outer + MAX_ENEMY_RADIUS, buf);
  let left = arcs;
  for (let i = 0; i < n && left > 0; i++) {
    const e = buf[i];
    if (Life.hp[e] <= 0) continue;
    const dx = Pos.x[e] - px;
    const dy = Pos.y[e] - py;
    const d2 = dx * dx + dy * dy;
    if (d2 <= r * r || d2 > outer * outer) continue;
    sim.events.push(EV.BEAM, w.slot, w.element, px, py, Pos.x[e], Pos.y[e], true);
    hitFoe(sim, e, dmg * 0.6, w.element, w.slot, power, px, py, 0);
    left--;
  }
  releaseBuffer(sim);
}

function fireChain(sim: RunSim, w: WeaponInstance): boolean {
  const p = sim.state.player;
  const stats = p.stats;
  let fromX = Pos.x[p.eid];
  let fromY = Pos.y[p.eid];
  const range = w.stats.range * stats.areaMult;
  let cur = nearestFoe(sim, fromX, fromY, range);
  if (cur < 0) return false;
  const chain = sim.chainList;
  let n = 0;
  const hop = range * 0.6;
  const dmg = damageOf(sim, w);
  const power = powerOf(sim, w);
  const hops = w.stats.count + stats.amount;
  for (let k = 0; k < hops && cur >= 0 && n < chain.length; k++) {
    const x = Pos.x[cur];
    const y = Pos.y[cur];
    sim.events.push(EV.BEAM, w.slot, w.element, fromX, fromY, x, y);
    chain[n++] = cur;
    hitFoe(sim, cur, dmg * (1 - 0.05 * k), w.element, w.slot, power, fromX, fromY, 0);
    if (w.params.heal > 0) healPlayer(sim, w.params.heal);
    // Branches : ennemis voisins touchés sans poursuivre la chaîne.
    for (let f = 0; f < w.params.fork && n < chain.length; f++) {
      const b = nearestExcluding(sim, x, y, hop, chain, n);
      if (b < 0) break;
      chain[n++] = b;
      sim.events.push(EV.BEAM, w.slot, w.element, x, y, Pos.x[b], Pos.y[b], true);
      hitFoe(sim, b, dmg * 0.7, w.element, w.slot, power, x, y, 0);
    }
    fromX = x;
    fromY = y;
    cur = n < chain.length ? nearestExcluding(sim, x, y, hop, chain, n) : -1;
  }
  fireEvent(sim, w, Pos.x[p.eid], Pos.y[p.eid], 0);
  return true;
}

/** Ennemi (ou boss) le plus proche hors de la liste `exclude[0..n)`. */
export function nearestExcluding(
  sim: RunSim,
  x: number,
  y: number,
  r: number,
  exclude: Int32Array,
  n: number,
): number {
  const buf = takeBuffer(sim);
  if (!buf) return -1;
  const count = sim.grid.query(x, y, r + MAX_ENEMY_RADIUS, buf);
  let best = -1;
  let bestD2 = r * r;
  for (let i = 0; i < count; i++) {
    const e = buf[i];
    if (Life.hp[e] <= 0) continue;
    const dx = Pos.x[e] - x;
    const dy = Pos.y[e] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= bestD2 || contains(exclude, n, e)) continue;
    best = e;
    bestD2 = d2;
  }
  releaseBuffer(sim);
  const boss = liveBoss(sim);
  if (boss >= 0 && !contains(exclude, n, boss)) {
    const dx = Pos.x[boss] - x;
    const dy = Pos.y[boss] - y;
    const edge = Math.max(0, Math.sqrt(dx * dx + dy * dy) - Body.r[boss]);
    if (edge * edge < bestD2) best = boss;
  }
  return best;
}

function contains(list: Int32Array, n: number, v: number): boolean {
  for (let i = 0; i < n; i++) if (list[i] === v) return true;
  return false;
}

function placeMines(sim: RunSim, w: WeaponInstance): void {
  const p = sim.state.player;
  const stats = p.stats;
  const px = Pos.x[p.eid];
  const py = Pos.y[p.eid];
  const n = w.stats.count + stats.amount;
  const dmg = damageOf(sim, w);
  const power = powerOf(sim, w);
  const rng = sim.rng.combat;
  for (let k = 0; k < n; k++) {
    const a = rng.range(0, Math.PI * 2);
    const d = n > 1 ? rng.range(24, 80) : rng.range(0, 30);
    const z = spawnZone(
      sim,
      ZONE.PMINE,
      px + Math.cos(a) * d,
      py + Math.sin(a) * d,
      w.stats.range * stats.areaMult,
      w.stats.duration * stats.durationMult,
      dmg,
      w.params.pool * stats.durationMult,
    );
    if (z < 0) break;
    Zone.w[z] = w.stats.size * stats.areaMult;
    Zone.h[z] = w.params.arm;
    armZone(z, w.element, w.slot, power, 0, w.params.pull, sim.weaponTint[w.defIndex]);
  }
  fireEvent(sim, w, px, py, 0);
}

/** Zones (flaques, tempêtes, frappes) sur des ennemis proches tirés au hasard. */
function castZones(sim: RunSim, w: WeaponInstance): boolean {
  const p = sim.state.player;
  const stats = p.stats;
  const px = Pos.x[p.eid];
  const py = Pos.y[p.eid];
  const buf = takeBuffer(sim);
  if (!buf) return false;
  const found = sim.grid.query(px, py, 430, buf);
  let alive = 0;
  for (let i = 0; i < found; i++) {
    const e = buf[i];
    if (Life.hp[e] > 0) buf[alive++] = e;
  }
  const boss = liveBoss(sim);
  if (alive === 0 && boss < 0) {
    releaseBuffer(sim);
    return false;
  }
  const n = w.stats.count + stats.amount;
  const r = w.stats.range * stats.areaMult;
  const dmg = damageOf(sim, w);
  const power = powerOf(sim, w);
  const prm = w.params;
  const rng = sim.rng.combat;
  for (let k = 0; k < n; k++) {
    let x: number;
    let y: number;
    if (alive > 0) {
      const e = buf[Math.floor(rng.next() * alive)];
      x = Pos.x[e];
      y = Pos.y[e];
    } else {
      x = Pos.x[boss];
      y = Pos.y[boss];
    }
    x += rng.range(-12, 12);
    y += rng.range(-12, 12);
    let z: number;
    if (prm.strike > 0) {
      z = spawnZone(sim, ZONE.STRIKE, x, y, r, prm.strike, dmg, w.defIndex);
      if (z < 0) break;
      Zone.crit[z] = prm.critBonus;
      armZone(z, w.element, w.slot, power, 0, 0, sim.weaponTint[w.defIndex]);
    } else {
      z = spawnZone(sim, ZONE.POOL, x, y, r, w.stats.duration * stats.durationMult, dmg, 0);
      if (z < 0) break;
      armZone(z, w.element, w.slot, power, prm.tick, prm.pull, sim.weaponTint[w.defIndex]);
    }
  }
  releaseBuffer(sim);
  if (prm.strike <= 0) fireEvent(sim, w, px, py, 0);
  return true;
}

function updateAura(sim: RunSim, w: WeaponInstance, cdMult: number): void {
  const p = sim.state.player;
  const px = Pos.x[p.eid];
  const py = Pos.y[p.eid];
  const r = w.stats.range * p.stats.areaMult;
  if (w.params.pull > 0) pullFoes(sim, px, py, r, w.params.pull);
  w.cd -= DT;
  if (w.cd > 0) return;
  w.cd += w.stats.cooldown * cdMult;
  const hits = aoe(
    sim,
    px,
    py,
    r,
    damageOf(sim, w),
    w.slot,
    w.params.knock,
    0,
    0,
    0,
    w.element,
    powerOf(sim, w),
  );
  if (hits > 0) {
    if (w.params.heal > 0) healPlayer(sim, w.params.heal);
    if (w.fxT <= 0) {
      w.fxT = 1.5;
      fireEvent(sim, w, px, py, 0);
    }
  }
}

function updateOrbit(sim: RunSim, w: WeaponInstance, cdMult: number): void {
  const pool = sim.world.orbits;
  const p = sim.state.player;
  const stats = p.stats;
  const count = w.stats.count + stats.amount;
  // Ajuste le nombre d'éclats de cette arme.
  const frame = shotFrame(
    sim,
    w.defIndex,
    w.element === FROST ? FRAME.ORB_FROST : FRAME.ORB_GENERIC,
  );
  while (w.shards < count) {
    const o = sim.spawnIn(pool);
    if (o < 0) break;
    Orbit.slot[o] = w.slot;
    Orbit.index[o] = w.shards++;
    Look.frame[o] = frame;
    Look.tint[o] = tintFor(sim, w.defIndex, frame);
  }
  const px = Pos.x[p.eid];
  const py = Pos.y[p.eid];
  w.angle += w.stats.speed * stats.projectileSpeed * DT;
  const radius = w.stats.range * stats.areaMult;
  const size = w.stats.size * stats.areaMult;
  const dmg = damageOf(sim, w);
  const power = powerOf(sim, w);
  const hitCd = w.stats.cooldown * cdMult;
  const out = sim.scratch;
  const boss = liveBoss(sim);
  let hit = false;
  for (let i = 0; i < pool.count; i++) {
    const o = pool.active[i];
    if (Orbit.slot[o] !== w.slot) continue;
    const a = w.angle + (Orbit.index[o] * Math.PI * 2) / count;
    const x = px + Math.cos(a) * radius;
    const y = py + Math.sin(a) * radius;
    Pos.x[o] = x;
    Pos.y[o] = y;
    Look.rot[o] = a;
    Look.scale[o] = stats.areaMult;
    const n = sim.grid.query(x, y, size + MAX_ENEMY_RADIUS, out);
    for (let j = 0; j < n; j++) {
      const e = out[j];
      if (Life.hp[e] <= 0) continue;
      const k = e * WEAPON_SLOTS + w.slot;
      if (WeaponHit.cd[k] > 0) continue;
      const dx = Pos.x[e] - x;
      const dy = Pos.y[e] - y;
      const rr = size + Body.r[e];
      if (dx * dx + dy * dy > rr * rr) continue;
      WeaponHit.cd[k] = hitCd;
      hitFoe(sim, e, dmg, w.element, w.slot, power, px, py, 70);
      hit = true;
    }
    if (boss >= 0) {
      const k = boss * WEAPON_SLOTS + w.slot;
      const dx = Pos.x[boss] - x;
      const dy = Pos.y[boss] - y;
      const rr = size + Body.r[boss];
      if (WeaponHit.cd[k] <= 0 && dx * dx + dy * dy <= rr * rr) {
        WeaponHit.cd[k] = hitCd;
        hitFoe(sim, boss, dmg, w.element, w.slot, power, px, py, 0);
        hit = true;
      }
    }
  }
  if (hit && w.fxT <= 0) {
    w.fxT = 0.5;
    fireEvent(sim, w, px, py, 0);
  }
}
