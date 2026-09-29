/**
 * Codex : ennemis, armes, évolutions, réactions et boss découverts en partie ; chaque palier
 * de complétion d'une catégorie (25, 50, 75, 100 %) verse des fragments.
 */
import { BOSSES, ENEMIES, META, REACTIONS, WEAPONS } from '../content/data';
import type { SaveData } from '../save/schema';

export type CodexCategory = 'enemies' | 'weapons' | 'evolutions' | 'reactions' | 'bosses';

/** Identifiants de toutes les entrées d'une catégorie (la horde dorée n'est pas un ennemi). */
export function codexEntries(cat: CodexCategory): string[] {
  switch (cat) {
    case 'enemies':
      return ENEMIES.filter((e) => e.biome !== 'event').map((e) => e.id);
    case 'weapons':
      return WEAPONS.map((w) => w.id);
    case 'evolutions':
      return WEAPONS.map((w) => w.evolution.id);
    case 'reactions':
      return REACTIONS.map((r) => r.id);
    case 'bosses':
      return BOSSES.map((b) => b.id);
  }
}

/** Ajoute des découvertes ; renvoie les nouvelles. */
export function discover(d: SaveData, cat: CodexCategory, ids: readonly string[]): string[] {
  const known = d.meta.codex[cat];
  const all = new Set(codexEntries(cat));
  const fresh: string[] = [];
  for (const id of ids) {
    if (!all.has(id) || known.includes(id)) continue;
    known.push(id);
    fresh.push(id);
  }
  return fresh;
}

export function codexProgress(d: SaveData, cat: CodexCategory): number {
  return d.meta.codex[cat].length / Math.max(1, codexEntries(cat).length);
}

/** Verse les récompenses des paliers atteints et pas encore versés ; renvoie les fragments. */
export function claimCodex(d: SaveData): { cat: string; tier: number; fragments: number }[] {
  const out: { cat: string; tier: number; fragments: number }[] = [];
  const c = META.codex;
  for (const { id } of c.categories) {
    const cat = id as CodexCategory;
    const progress = codexProgress(d, cat);
    let claimed = d.meta.codex.claimed[cat] ?? 0;
    while (claimed < c.thresholds.length && progress >= c.thresholds[claimed] - 1e-9) {
      d.wallet.fragments += c.fragments[claimed];
      out.push({ cat, tier: claimed, fragments: c.fragments[claimed] });
      claimed++;
    }
    d.meta.codex.claimed[cat] = claimed;
  }
  return out;
}
