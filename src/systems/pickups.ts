/** Gemmes d'XP : apparition (fusion au-delà d'un seuil), aimantation, collecte, montée de niveau. */
import { PLAYER, PROGRESSION } from '../content/data';
import { FRAME } from '../content/frames';
import { Chest, Gem, Look, Pos, Vel } from '../engine/components';
import { DT } from '../engine/constants';
import { EV } from './events';
import { openChest } from './loot';
import { gainLevel } from './progression';
import type { RunSim } from './sim';

function gemFrame(value: number): number {
  return value >= 10 ? FRAME.GEM_L : value >= 3 ? FRAME.GEM_M : FRAME.GEM_S;
}

export function dropGem(sim: RunSim, x: number, y: number, value: number): void {
  const pool = sim.world.gems;
  if (pool.count >= PROGRESSION.gemMergeThreshold || pool.full) {
    // Trop de gemmes : la valeur rejoint la gemme la plus proche (nombre d'entités borné).
    let best = -1;
    let bestD2 = Infinity;
    for (let i = 0; i < pool.count; i++) {
      const g = pool.active[i];
      const dx = Pos.x[g] - x;
      const dy = Pos.y[g] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = g;
      }
    }
    if (best >= 0) {
      Gem.value[best] += value;
      Look.frame[best] = gemFrame(Gem.value[best]);
    }
    return;
  }
  const g = sim.spawnIn(pool);
  if (g < 0) return;
  const ox = sim.rng.loot.range(-6, 6);
  const oy = sim.rng.loot.range(-6, 6);
  Pos.x[g] = x + ox;
  Pos.y[g] = y + oy;
  Pos.px[g] = Pos.x[g];
  Pos.py[g] = Pos.y[g];
  Gem.value[g] = value;
  Look.frame[g] = gemFrame(value);
}

/** Coffre d'élite posé au sol (ramassé au contact). */
export function dropChest(sim: RunSim, x: number, y: number): void {
  const c = sim.spawnIn(sim.world.chests);
  if (c < 0) return;
  Pos.x[c] = x;
  Pos.y[c] = y;
  Pos.px[c] = x;
  Pos.py[c] = y;
  Chest.tier[c] = 1;
  Look.frame[c] = FRAME.CHEST;
  sim.events.push(EV.CHEST_DROP, 0, 0, x, y, 0);
}

/** Attire toutes les gemmes (fin de boss, aimant). */
export function magnetizeAll(sim: RunSim): void {
  const pool = sim.world.gems;
  for (let i = 0; i < pool.count; i++) Gem.pull[pool.active[i]] = 1;
}

export function updatePickups(sim: RunSim): void {
  const pool = sim.world.gems;
  const p = sim.state.player;
  const px = Pos.x[p.eid];
  const py = Pos.y[p.eid];
  const radius = p.stats.pickupRadius;
  const r2 = radius * radius;
  const collect = PLAYER.radius + 6;
  for (let i = pool.count - 1; i >= 0; i--) {
    const g = pool.active[i];
    const dx = px - Pos.x[g];
    const dy = py - Pos.y[g];
    const d2 = dx * dx + dy * dy;
    if (Gem.pull[g] === 0) {
      if (d2 > r2) continue;
      Gem.pull[g] = 1;
    }
    const d = Math.sqrt(d2);
    if (d < collect) {
      const value = Gem.value[g] * p.stats.growth;
      p.xp += value;
      sim.state.stats.xpCollected += value;
      sim.events.push(EV.XP, 0, 0, Pos.x[g], Pos.y[g], value, 0, true);
      pool.despawn(g);
      continue;
    }
    // Accélère vers le joueur (légère inertie : les gemmes « aspirées »).
    const speed = Math.min(PLAYER.magnetSpeed, Math.hypot(Vel.x[g], Vel.y[g]) + 1500 * DT);
    Vel.x[g] = (dx / d) * speed;
    Vel.y[g] = (dy / d) * speed;
    Pos.x[g] += Vel.x[g] * DT;
    Pos.y[g] += Vel.y[g] * DT;
  }
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    gainLevel(sim);
  }
  // Coffres : ouverture au contact (un seul par tick).
  const chests = sim.world.chests;
  for (let i = chests.count - 1; i >= 0; i--) {
    const c = chests.active[i];
    Look.rot[c] = Math.sin(sim.state.time * 3 + c) * 0.12;
    const dx = px - Pos.x[c];
    const dy = py - Pos.y[c];
    if (dx * dx + dy * dy < (PLAYER.radius + 22) ** 2 && sim.state.status === 'running') {
      chests.despawn(c);
      openChest(sim);
      break;
    }
  }
}
