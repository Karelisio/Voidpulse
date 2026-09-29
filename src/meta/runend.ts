/**
 * Bilan de fin de partie appliqué à la sauvegarde (fonction pure, sans UI) : records du mode,
 * fragments, codex, maîtrise, reliques, Ascension, XP de compte, carrière, quêtes et saison,
 * progression de campagne, déblocages et succès. Partagé par l'écran de jeu et par le
 * simulateur d'équilibrage (sim/balance).
 */
import { BOSSES, ENEMIES, REACTIONS, type ModeId } from '../content/data';
import type { ModeRun } from '../modes/modes';
import { recordMode } from '../modes/records';
import type { SaveData } from '../save/schema';
import { heat, rankIndex, runScore } from '../systems/pacts';
import type { RunState } from '../systems/state';
import { ascensionReward } from './ascension';
import type { MetaBonus } from './bonus';
import { applyRunMeta } from './progress';
import { achievementLines, applyRunRetention } from './retention';
import { recordStage } from './stages';
import { tallyOf } from './tally';
import { applyUnlocks } from './unlocks';

export interface RunEndInput {
  mode: ModeId;
  run: ModeRun;
  /** Essai du défi du jour compté au classement. */
  counted: boolean;
  /** Bonus de méta figés au lancement de la partie. */
  meta: MetaBonus;
  /** Horodatage de fin (ms). */
  at: number;
}

export interface RunEndResult {
  bestScore: boolean;
  /** Personnages débloqués (noms). */
  unlocked: string[];
  /** Stages ouverts, boss vaincus pour la première fois (noms). */
  stages: string[];
  bosses: string[];
  /** Lignes du bilan (classement, fragments, méta, quêtes, succès…). */
  lines: string[];
}

export function applyRunEnd(d: SaveData, st: RunState, input: RunEndInput): RunEndResult {
  const { mode, run } = input;
  const score = runScore(st);
  const rank = rankIndex(heat(st));
  const counts = mode !== 'training';
  const victory = st.status === 'victory';
  const out: RunEndResult = {
    bestScore: counts && score > d.profile.bestScore,
    unlocked: [],
    stages: [],
    bosses: [],
    lines: [],
  };
  const result = recordMode(
    d,
    {
      mode,
      stage: st.stage.name,
      character: st.character.name,
      victory,
      score,
      time: st.time,
      bosses: st.stats.bossesDefeated.length,
      fragments: st.stats.fragments,
      period: run.period,
      counted: input.counted,
      at: input.at,
    },
    input.meta.fragMult * ascensionReward(run.ascension),
  );
  out.lines.push(...result.lines);
  if (!counts) return out;
  const progress = applyRunMeta(d, {
    mode,
    stage: st.stage.id,
    stageName: st.stage.name,
    victory,
    score,
    ascension: run.ascension,
    seed: run.seed,
    weapons: st.weapons.map((w) => ({ id: w.def.id, damage: st.stats.damageBySlot[w.slot] })),
    enemies: ENEMIES.filter((_, i) => st.stats.killsByType[i] > 0).map((e) => e.id),
    evolutions: st.weapons.filter((w) => w.evolved).map((w) => w.def.evolution.id),
    reactions: REACTIONS.filter((_, i) => st.resonance.countById[i] > 0).map((r) => r.id),
    bosses: st.stats.bossesDefeated.map((i) => BOSSES[i].id),
    xpMult: input.meta.xpMult,
  });
  out.lines.push(...progress.lines);
  // Carrière, quêtes et passe de saison, avant les déblocages qui lisent la carrière.
  out.lines.push(...applyRunRetention(d, tallyOf(st, mode), score));
  d.profile.bestScore = Math.max(d.profile.bestScore, score);
  // Le rang ne compte qu'en cas de victoire (sinon, des pactes suivis d'une défaite suffiraient).
  if (victory) d.profile.bestRank = Math.max(d.profile.bestRank, rank);
  // La campagne n'avance qu'en Campagne et en Hardcore ; les boss vaincus comptent partout.
  const campaign = mode === 'campaign' || mode === 'hardcore';
  const stageProgress = recordStage(d, {
    stage: campaign ? st.stage.id : '',
    victory,
    score,
    time: st.time,
    rank,
    bosses: st.stats.bossesDefeated,
  });
  out.stages = stageProgress.stages.map((x) => x.name);
  out.bosses = stageProgress.bosses;
  out.unlocked = applyUnlocks(d).map((c) => c.name);
  out.lines.push(...achievementLines(d));
  return out;
}
