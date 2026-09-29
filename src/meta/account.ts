/**
 * Niveau de compte (XP gagnée à chaque partie selon le score), niveaux Paragon illimités au-delà
 * du maximum : chacun donne un point à placer dans des statistiques plafonnées très haut.
 */
import { META, type MetaStats } from '../content/data';
import type { SaveData } from '../save/schema';

const A = META.account;

/** XP pour passer du niveau `level` au suivant (ou d'un niveau Paragon au suivant). */
export function xpForLevel(level: number): number {
  if (level >= A.maxLevel) return A.paragonXp;
  return Math.round(A.curve.base * Math.pow(level, A.curve.exponent));
}

export interface AccountGain {
  /** Niveaux atteints (compte), niveaux Paragon gagnés, fragments versés, déblocages. */
  levels: number[];
  paragon: number;
  fragments: number;
  unlocks: string[];
}

export function addAccountXp(d: SaveData, xp: number): AccountGain {
  const a = d.meta.account;
  const out: AccountGain = { levels: [], paragon: 0, fragments: 0, unlocks: [] };
  a.xp += Math.max(0, Math.floor(xp));
  for (let guard = 0; guard < 1000; guard++) {
    const need = xpForLevel(a.level + a.paragon);
    if (a.xp < need) break;
    a.xp -= need;
    if (a.level < A.maxLevel) {
      a.level++;
      out.levels.push(a.level);
      const f = A.levelFragments.base + A.levelFragments.perLevel * a.level;
      out.fragments += f;
      for (const u of A.unlocks) if (u.level === a.level) out.unlocks.push(u.name);
    } else {
      a.paragon++;
      out.paragon++;
    }
  }
  d.wallet.fragments += out.fragments;
  return out;
}

/** Nombre de déblocages d'un type atteints (emplacements de relique : 1 d'office). */
export function unlockCount(d: SaveData, unlock: (typeof A.unlocks)[number]['unlock']): number {
  return A.unlocks.filter((u) => u.unlock === unlock && u.level <= d.meta.account.level).length;
}

export function relicSlots(d: SaveData): number {
  return Math.min(META.relics.slots, 1 + unlockCount(d, 'relicSlot'));
}

export const forgeOpen = (d: SaveData): boolean => unlockCount(d, 'forge') > 0;
export const ascensionOpen = (d: SaveData): boolean => unlockCount(d, 'ascension') > 0;

// --- Paragon -----------------------------------------------------------------------------

export function paragonSpent(d: SaveData): number {
  return Object.values(d.meta.account.spent).reduce((s, v) => s + v, 0);
}

export function paragonFree(d: SaveData): number {
  return d.meta.account.paragon - paragonSpent(d);
}

/** Place (n > 0) ou retire (n < 0) des points ; renvoie le nombre réellement déplacé. */
export function spendParagon(d: SaveData, stat: string, n: number): number {
  const def = META.paragon.find((p) => p.stat === stat);
  if (!def) return 0;
  const spent = d.meta.account.spent;
  const cur = spent[stat] ?? 0;
  const next = Math.max(0, Math.min(def.cap, cur + Math.min(n, paragonFree(d))));
  spent[stat] = next;
  return next - cur;
}

export function resetParagon(d: SaveData): void {
  d.meta.account.spent = {};
}

export function paragonStats(d: SaveData): MetaStats {
  const out: MetaStats = {};
  for (const p of META.paragon) {
    const pts = Math.min(p.cap, d.meta.account.spent[p.stat] ?? 0);
    if (pts > 0) out[p.stat] = (out[p.stat] ?? 0) + pts * p.per;
  }
  return out;
}
