/**
 * Maîtrise d'arme : les dégâts infligés avec une arme lui donnent de l'XP ; chaque rang
 * ajoute des dégâts à cette arme, certains rangs débloquent une apparence (teinte).
 */
import { META, WEAPONS, colorOf } from '../content/data';
import type { SaveData } from '../save/schema';

const M = META.mastery;
export const MAX_MASTERY = M.ranks.length;

export function masteryRank(xp: number): number {
  let r = 0;
  while (r < M.ranks.length && xp >= M.ranks[r]) r++;
  return r;
}

/** Progression dans le rang en cours (0 → 1 ; 1 au rang maximal). */
export function masteryProgress(xp: number): number {
  const r = masteryRank(xp);
  if (r >= M.ranks.length) return 1;
  const from = r === 0 ? 0 : M.ranks[r - 1];
  return (xp - from) / (M.ranks[r] - from);
}

/** Ajoute l'XP des dégâts infligés ; renvoie le nouveau rang s'il a changé. */
export function addMastery(d: SaveData, weapon: string, damage: number): number | null {
  const before = d.meta.mastery[weapon] ?? 0;
  const after = before + Math.max(0, damage) * M.xpPerDamage;
  d.meta.mastery[weapon] = after;
  const r = masteryRank(after);
  return r > masteryRank(before) ? r : null;
}

export function weaponRank(d: SaveData, weapon: string): number {
  return masteryRank(d.meta.mastery[weapon] ?? 0);
}

/** Apparences débloquées au rang `rank` (index dans META.mastery.skins). */
export function skinsUnlocked(rank: number): number[] {
  return M.skins.flatMap((s, i) => (rank >= s.rank ? [i] : []));
}

export function selectSkin(d: SaveData, weapon: string, skin: number): boolean {
  if (skin >= 0 && !skinsUnlocked(weaponRank(d, weapon)).includes(skin)) return false;
  d.meta.skins[weapon] = skin;
  return true;
}

/** Multiplicateurs de dégâts et teintes (0 : d'origine) par arme, pour la simulation. */
export function masteryBonus(d: SaveData): { damage: number[]; tint: number[] } {
  return {
    damage: WEAPONS.map((w) => 1 + M.damagePerRank * weaponRank(d, w.id)),
    tint: WEAPONS.map((w) => {
      const s = d.meta.skins[w.id] ?? -1;
      return s >= 0 && skinsUnlocked(weaponRank(d, w.id)).includes(s)
        ? colorOf(M.skins[s].color)
        : 0;
    }),
  };
}
