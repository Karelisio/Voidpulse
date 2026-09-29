/**
 * Ascension : 20 paliers par stage. Le palier N applique les modificateurs des paliers 1 à N
 * (cumulés comme des pactes) et multiplie les récompenses ; gagner au palier le plus haut
 * ouvert ouvre le suivant.
 */
import { META, RUN_MOD_MULT } from '../content/data';
import type { SaveData } from '../save/schema';
import type { RunMods } from '../systems/state';

const MULT = new Set<string>(RUN_MOD_MULT);
export const MAX_ASCENSION = META.ascension.tiers.length;

/** Modificateurs cumulés des paliers 1 à `tier`. */
export function ascensionMods(tier: number): Partial<RunMods> {
  const out: Partial<RunMods> = {};
  for (const t of META.ascension.tiers) {
    if (t.tier > tier) break;
    for (const [k, v] of Object.entries(t.mods) as [keyof RunMods, number][]) {
      out[k] = MULT.has(k) ? (out[k] ?? 1) * v : (out[k] ?? 0) + v;
    }
  }
  return out;
}

/** Multiplicateur des récompenses (fragments, XP de compte) au palier `tier`. */
export function ascensionReward(tier: number): number {
  return 1 + META.ascension.rewardPerTier * tier;
}

/** Combine deux jeux de modificateurs (multiplicatifs multipliés, additifs sommés). */
export function combineMods(a: Partial<RunMods>, b: Partial<RunMods>): Partial<RunMods> {
  const out: Partial<RunMods> = { ...a };
  for (const [k, v] of Object.entries(b) as [keyof RunMods, number][]) {
    out[k] = MULT.has(k) ? (out[k] ?? 1) * v : (out[k] ?? 0) + v;
  }
  return out;
}

function entry(d: SaveData, stage: string): { unlocked: number; selected: number } | undefined {
  const all: Partial<Record<string, { unlocked: number; selected: number }>> = d.meta.ascension;
  return all[stage];
}

/** Palier le plus haut ouvert pour un stage (0 tant que le stage n'est pas terminé). */
export function ascensionUnlocked(d: SaveData, stage: string): number {
  return entry(d, stage)?.unlocked ?? 0;
}

export function ascensionSelected(d: SaveData, stage: string): number {
  const a = entry(d, stage);
  return a ? Math.min(a.selected, a.unlocked) : 0;
}

export function selectAscension(d: SaveData, stage: string, tier: number): void {
  const a = (d.meta.ascension[stage] ??= { unlocked: 0, selected: 0 });
  a.selected = Math.max(0, Math.min(a.unlocked, tier));
}

/** Victoire au palier `tier` : ouvre le suivant s'il s'agissait du plus haut. Renvoie le nouveau. */
export function recordAscension(d: SaveData, stage: string, tier: number): number | null {
  const a = (d.meta.ascension[stage] ??= { unlocked: 0, selected: 0 });
  if (tier < a.unlocked || a.unlocked >= MAX_ASCENSION) return null;
  a.unlocked = tier + 1;
  return a.unlocked;
}
