/**
 * Armes : trois archétypes codés (projectile, orbite, chaîne) paramétrés par les données.
 * Le niveau d'une arme cumule les deltas de config ; les recharges tiennent compte des passifs
 * et de l'Éveil.
 */
import {
  NO_ELEMENT,
  RESONANCE,
  WEAPONS,
  elementIndex,
  type WeaponDef,
  type WeaponStats,
} from '../content/data';
import { FRAME } from '../content/frames';
import {
  Body,
  Life,
  Look,
  Orbit,
  Pos,
  Shot,
  SHOT_HIT_MEMORY,
  Vel,
  WEAPON_SLOTS,
  WeaponHit,
} from '../engine/components';
import { DT } from '../engine/constants';
import { hitFoe } from './combat';
import { MAX_ENEMY_RADIUS } from './enemies';
import { EV } from './events';
import type { RunSim } from './sim';
import type { WeaponInstance } from './state';

export function maxWeaponLevel(def: WeaponDef): number {
  return def.levels.length + 1;
}

export function weaponStats(def: WeaponDef, level: number): WeaponStats {
  // Littéral à clés ordonnées : une seule forme d'objet pour toutes les armes (accès monomorphes).
  const b = def.base;
  const s: WeaponStats = {
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
  };
  weapons.push(w);
  return w;
}

export function levelUpWeapon(w: WeaponInstance): void {
  w.level = Math.min(maxWeaponLevel(w.def), w.level + 1);
  w.stats = weaponStats(w.def, w.level);
}

/** Ennemi (ou boss) le plus proche de (x, y) dans le rayon r, hors `exclude[0..n)` ; -1 sinon. */
export function nearestFoe(
  sim: RunSim,
  x: number,
  y: number,
  r: number,
  exclude: Int32Array | null,
  n: number,
): number {
  const out = sim.scratch;
  const count = sim.grid.query(x, y, r + MAX_ENEMY_RADIUS, out);
  let best = -1;
  let bestD2 = r * r;
  for (let i = 0; i < count; i++) {
    const e = out[i];
    if (Life.hp[e] <= 0) continue;
    const dx = Pos.x[e] - x;
    const dy = Pos.y[e] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= bestD2) continue;
    if (exclude !== null && contains(exclude, n, e)) continue;
    best = e;
    bestD2 = d2;
  }
  const boss = sim.state.boss.eid;
  if (boss >= 0 && sim.world.boss.isActive(boss) && Life.hp[boss] > 0) {
    const dx = Pos.x[boss] - x;
    const dy = Pos.y[boss] - y;
    const edge = Math.max(0, Math.sqrt(dx * dx + dy * dy) - Body.r[boss]);
    if (edge * edge < bestD2 && !(exclude !== null && contains(exclude, n, boss))) best = boss;
  }
  return best;
}

function contains(list: Int32Array, n: number, v: number): boolean {
  for (let i = 0; i < n; i++) if (list[i] === v) return true;
  return false;
}

export function updateWeapons(sim: RunSim): void {
  const st = sim.state;
  const cdMult =
    st.player.stats.cooldownMult * (st.resonance.eveilT > 0 ? RESONANCE.eveil.cooldownMult : 1);
  for (let i = 0; i < st.weapons.length; i++) {
    const w = st.weapons[i];
    switch (w.def.archetype) {
      case 'projectile':
        w.cd -= DT;
        if (w.cd <= 0) {
          fireProjectiles(sim, w);
          w.cd = Math.max(0, w.cd) + w.stats.cooldown * cdMult;
        }
        break;
      case 'chain':
        w.cd -= DT;
        if (w.cd <= 0) w.cd = fireChain(sim, w) ? w.stats.cooldown * cdMult : 0.2;
        break;
      case 'orbit':
        updateOrbit(sim, w, cdMult);
        break;
    }
  }
}

function fireProjectiles(sim: RunSim, w: WeaponInstance): void {
  const p = sim.state.player;
  const px = Pos.x[p.eid];
  const py = Pos.y[p.eid];
  let ax = p.faceX;
  let ay = p.faceY;
  if (sim.input.aim === 'auto') {
    const target = nearestFoe(sim, px, py, 520, null, 0);
    if (target >= 0) {
      ax = Pos.x[target] - px;
      ay = Pos.y[target] - py;
    }
  }
  const base = Math.atan2(ay, ax);
  const n = w.stats.count;
  const spread = 0.16;
  const stats = p.stats;
  for (let k = 0; k < n; k++) {
    const angle = base + (k - (n - 1) / 2) * spread;
    const s = sim.spawnIn(sim.world.shots);
    if (s < 0) return;
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    Pos.x[s] = px;
    Pos.y[s] = py;
    Pos.px[s] = px;
    Pos.py[s] = py;
    Vel.x[s] = c * w.stats.speed;
    Vel.y[s] = sn * w.stats.speed;
    Shot.weapon[s] = w.slot;
    Shot.element[s] = w.element;
    Shot.dmg[s] = w.stats.damage * stats.damageMult;
    Shot.power[s] = w.stats.status;
    Shot.pierce[s] = w.stats.pierce;
    Shot.ttl[s] = w.stats.duration;
    Shot.r[s] = w.stats.size * stats.areaMult;
    for (let h = 0; h < SHOT_HIT_MEMORY; h++) Shot.hits[s * SHOT_HIT_MEMORY + h] = -1;
    Look.frame[s] = FRAME.SHOT_FIRE;
    Look.rot[s] = angle;
    Look.scale[s] = stats.areaMult;
  }
  sim.events.push(EV.FIRE, w.slot, w.defIndex, px, py, 0);
}

function fireChain(sim: RunSim, w: WeaponInstance): boolean {
  const p = sim.state.player;
  let fromX = Pos.x[p.eid];
  let fromY = Pos.y[p.eid];
  let cur = nearestFoe(sim, fromX, fromY, w.stats.range, null, 0);
  if (cur < 0) return false;
  const chain = sim.chainList;
  let n = 0;
  const hop = w.stats.range * 0.6;
  const dmg = w.stats.damage * p.stats.damageMult;
  for (let k = 0; k < w.stats.count && cur >= 0; k++) {
    const x = Pos.x[cur];
    const y = Pos.y[cur];
    sim.events.push(EV.BEAM, w.slot, w.element, fromX, fromY, x, y);
    chain[n++] = cur;
    hitFoe(sim, cur, dmg * (1 - 0.06 * k), w.element, w.slot, w.stats.status, fromX, fromY, 0);
    fromX = x;
    fromY = y;
    cur = n < chain.length ? nearestFoe(sim, x, y, hop, chain, n) : -1;
  }
  sim.events.push(EV.FIRE, w.slot, w.defIndex, Pos.x[p.eid], Pos.y[p.eid], 0);
  return true;
}

function updateOrbit(sim: RunSim, w: WeaponInstance, cdMult: number): void {
  const pool = sim.world.orbits;
  const count = w.stats.count;
  // Ajuste le nombre d'éclats de cette arme.
  while (w.shards < count) {
    const o = sim.spawnIn(pool);
    if (o < 0) break;
    Orbit.slot[o] = w.slot;
    Orbit.index[o] = w.shards++;
    Look.frame[o] = FRAME.ORB_FROST;
  }
  const p = sim.state.player;
  const px = Pos.x[p.eid];
  const py = Pos.y[p.eid];
  w.angle += w.stats.speed * DT;
  const radius = w.stats.range * p.stats.areaMult;
  const size = w.stats.size * p.stats.areaMult;
  const dmg = w.stats.damage * p.stats.damageMult;
  const hitCd = w.stats.cooldown * cdMult;
  const out = sim.scratch;
  const boss = sim.state.boss.eid;
  const bossAlive = boss >= 0 && sim.world.boss.isActive(boss) && Life.hp[boss] > 0;
  for (let i = 0; i < pool.count; i++) {
    const o = pool.active[i];
    if (Orbit.slot[o] !== w.slot) continue;
    const a = w.angle + (Orbit.index[o] * Math.PI * 2) / count;
    const x = px + Math.cos(a) * radius;
    const y = py + Math.sin(a) * radius;
    Pos.x[o] = x;
    Pos.y[o] = y;
    Look.rot[o] = a;
    Look.scale[o] = p.stats.areaMult;
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
      hitFoe(sim, e, dmg, w.element, w.slot, w.stats.status, px, py, 70);
    }
    if (bossAlive) {
      const k = boss * WEAPON_SLOTS + w.slot;
      const dx = Pos.x[boss] - x;
      const dy = Pos.y[boss] - y;
      const rr = size + Body.r[boss];
      if (WeaponHit.cd[k] <= 0 && dx * dx + dy * dy <= rr * rr) {
        WeaponHit.cd[k] = hitCd;
        hitFoe(sim, boss, dmg, w.element, w.slot, w.stats.status, px, py, 0);
      }
    }
  }
}

export { NO_ELEMENT };
