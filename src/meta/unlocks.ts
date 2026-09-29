/**
 * Déblocage des personnages selon les statistiques de carrière (module pur, testé). Les
 * conditions sont dans config/characters.json (`unlock`).
 */
import { CHARACTERS, type CharacterDef } from '../content/data';
import type { SaveData } from '../save/schema';

export function isUnlocked(d: SaveData, c: CharacterDef): boolean {
  return c.unlock.kind === 'default' || d.profile.unlocked.includes(c.id);
}

function reached(d: SaveData, c: CharacterDef): boolean {
  const s = d.stats;
  const v = c.unlock.value;
  switch (c.unlock.kind) {
    case 'default':
      return true;
    case 'runs':
      return s.runs >= v;
    case 'kills':
      return s.kills >= v;
    case 'victories':
      return s.victories >= v;
    case 'bestTime':
      return s.bestTime >= v;
    case 'bestLevel':
      return s.bestLevel >= v;
    case 'elites':
      return s.elites >= v;
    case 'rank':
      return d.profile.bestRank >= v;
  }
}

/** Débloque ce qui est atteint ; renvoie les personnages nouvellement débloqués. */
export function applyUnlocks(d: SaveData): CharacterDef[] {
  const fresh: CharacterDef[] = [];
  for (const c of CHARACTERS) {
    if (d.profile.unlocked.includes(c.id) || !reached(d, c)) continue;
    d.profile.unlocked.push(c.id);
    if (c.unlock.kind !== 'default') fresh.push(c);
  }
  return fresh;
}
