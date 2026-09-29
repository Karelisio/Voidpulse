/**
 * Décompte d'une partie terminée, pour les quêtes, la saison et la carrière (succès) :
 * lu une fois sur l'état de la simulation en fin de partie.
 */
import { ELEMENTS, type ModeId } from '../content/data';
import type { SaveData } from '../save/schema';
import type { RunState } from '../systems/state';

export interface RunTally {
  mode: ModeId;
  character: string;
  victory: boolean;
  kills: number;
  elites: number;
  bosses: number;
  reactions: number;
  eveils: number;
  seconds: number;
  gold: number;
  chests: number;
  level: number;
  /** Dégâts des armes par élément (identifiant d'élément). */
  elementDamage: Record<string, number>;
}

export function tallyOf(st: RunState, mode: ModeId): RunTally {
  const elementDamage: Record<string, number> = {};
  for (const w of st.weapons) {
    const el = ELEMENTS[w.element];
    elementDamage[el] = (elementDamage[el] ?? 0) + st.stats.damageBySlot[w.slot];
  }
  let reactions = 0;
  for (const n of st.resonance.countById) reactions += n;
  return {
    mode,
    character: st.character.id,
    victory: st.status === 'victory',
    kills: st.stats.kills,
    elites: st.stats.elitesKilled,
    bosses: st.stats.bossesDefeated.length,
    reactions,
    eveils: st.resonance.eveils,
    seconds: st.time,
    gold: st.stats.fragments + st.stats.spent,
    chests: st.stats.chests,
    level: st.player.level,
    elementDamage,
  };
}

/** Statistiques de carrière (l'entraînement ne compte pas). */
export function recordLifetime(d: SaveData, t: RunTally): void {
  if (t.mode === 'training') return;
  const s = d.stats;
  s.runs++;
  if (t.victory) {
    s.victories++;
    s.charWins[t.character] = (s.charWins[t.character] ?? 0) + 1;
  }
  s.kills += t.kills;
  s.elites += t.elites;
  s.bosses += t.bosses;
  s.eveils += t.eveils;
  s.reactions += t.reactions;
  s.gold += t.gold;
  s.chests += t.chests;
  s.bestTime = Math.max(s.bestTime, t.seconds);
  s.bestLevel = Math.max(s.bestLevel, t.level);
  s.playSeconds += t.seconds;
  if (t.mode === 'daily') s.daily++;
  if (t.mode === 'weekly') s.weekly++;
}
