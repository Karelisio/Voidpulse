/** Résumé de fin de run pour l'écran de fin (statistiques de la simulation). */
import { REACTIONS } from '../content/data';
import type { RunSummary } from '../state/ui';
import { SLOT_DASH, SLOT_EVEIL, SLOT_REACTION } from '../systems/events';
import { heat, rankOf, runScore } from '../systems/pacts';
import type { RunSim } from '../systems/sim';

/** Ce que la run a changé dans la carrière (records, déblocages). */
export interface RunRecord {
  bestScore: boolean;
  unlocked: string[];
  /** Stages ouverts, boss vaincus pour la première fois (noms). */
  stages: string[];
  bosses: string[];
  /** Mode : libellé, détail, lignes (classement, essai compté, fragments…). */
  mode: string;
  modeDetail: string;
  modeLines: string[];
}

export function buildSummary(
  sim: RunSim,
  iconUrls: Readonly<Partial<Record<string, string>>>,
  record: RunRecord = {
    bestScore: false,
    unlocked: [],
    stages: [],
    bosses: [],
    mode: '',
    modeDetail: '',
    modeLines: [],
  },
): RunSummary {
  const st = sim.state;
  return {
    victory: st.status === 'victory',
    time: st.time,
    kills: st.stats.kills,
    level: st.player.level,
    xp: st.stats.xpCollected,
    damageTaken: st.stats.damageTaken,
    eveils: st.resonance.eveils,
    weapons: st.weapons.map((w) => ({
      name: w.evolved ? w.def.evolution.name : w.def.name,
      element: w.def.element,
      damage: st.stats.damageBySlot[w.slot],
      icon: iconUrls[w.evolved ? w.def.evolution.id : w.def.id] ?? '',
    })),
    reactionDamage: st.stats.damageBySlot[SLOT_REACTION],
    eveilDamage: st.stats.damageBySlot[SLOT_EVEIL],
    reactions: REACTIONS.map((r, i) => ({
      name: r.name,
      count: st.resonance.countById[i],
      color: r.color,
    })).filter((r) => r.count > 0),
    dashDamage: st.stats.damageBySlot[SLOT_DASH],
    mode: record.mode,
    modeDetail: record.modeDetail,
    modeLines: record.modeLines,
    stage: st.stage.name,
    character: st.character.name,
    pacts: st.pacts.taken.map((p) => p.name),
    rank: rankOf(heat(st)),
    score: runScore(st),
    bestScore: record.bestScore,
    unlocked: record.unlocked,
    timeline: {
      step: st.timeline.step,
      dps: Array.from(st.timeline.dps.subarray(0, st.timeline.n)),
      hp: Array.from(st.timeline.hp.subarray(0, st.timeline.n)),
    },
    newStages: record.stages,
    newBosses: record.bosses,
  };
}

export function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
