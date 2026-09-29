/**
 * Progression d'un compte simulé : parties successives jouées par le bot sur le stage de
 * campagne le plus avancé, bilan appliqué à la sauvegarde avec le code du jeu
 * (`applyRunEnd`), puis dépenses automatiques (talents les moins chers d'abord, Paragon,
 * reliques). L'habileté du bot progresse comme celle d'un joueur qui apprend.
 */
import { CAMPAIGN, META } from '../../src/content/data';
import { paragonFree, relicSlots, spendParagon } from '../../src/meta/account';
import { buyTalent, nextCost, talentOpen } from '../../src/meta/talents';
import { equipRelic, rarityOf } from '../../src/meta/relics';
import { applyRunEnd } from '../../src/meta/runend';
import { stageUnlocked } from '../../src/meta/stages';
import { TALENTS } from '../../src/content/data';
import { defaultSave, type SaveData } from '../../src/save/schema';
import { playRun, type RunOutcome } from './run';

export interface AccountOptions {
  seed: string;
  runs: number;
  /** Habileté au départ et plafond atteint avec l'expérience (courbe exponentielle). */
  skillStart: number;
  skillMax: number;
  /** Nombre de parties pour franchir ~63 % de l'écart d'habileté. */
  learnRuns: number;
}

export interface RunRecordSim extends RunOutcome {
  index: number;
  stage: string;
  character: string;
  skill: number;
  /** Heures de jeu cumulées à la fin de la partie. */
  hours: number;
  /** Éléments de progression obtenus pendant la partie (et les achats qui ont suivi). */
  gains: {
    characters: number;
    stages: number;
    talents: number;
    relics: number;
    accountLevels: number;
    achievements: number;
  };
  accountLevel: number;
  fragmentsEarned: number;
  talentRanks: number;
  cleared: number;
}

function snapshot(d: SaveData) {
  return {
    characters: d.profile.unlocked.length,
    stages: d.profile.cleared.length,
    talents: Object.values(d.meta.talents).reduce((a, b) => a + b, 0),
    relics: d.meta.relics.items.length,
    accountLevel: d.meta.account.level,
    achievements: d.retention.achievements.length,
    fragments: d.wallet.fragments,
  };
}

/** Dépenses d'un joueur appliqué : talents ouverts les moins chers, Paragon, meilleures reliques. */
export function spend(d: SaveData): void {
  for (;;) {
    let best: string | null = null;
    let bestCost = Infinity;
    for (const node of TALENTS.nodes) {
      const cost = nextCost(d, node);
      if (cost === null || !talentOpen(d, node) || cost > d.wallet.fragments) continue;
      if (cost < bestCost) {
        bestCost = cost;
        best = node.id;
      }
    }
    if (!best || !buyTalent(d, best)) break;
  }
  // Paragon : points répartis sur les statistiques dans l'ordre, jusqu'à leur plafond.
  for (const p of META.paragon) {
    if (paragonFree(d) <= 0) break;
    spendParagon(d, p.stat, paragonFree(d));
  }
  // Reliques : les plus rares et les plus montées dans les emplacements ouverts.
  const ranked = [...d.meta.relics.items].sort(
    (a, b) => rarityOf(b).mult * (1 + b.level) - rarityOf(a).mult * (1 + a.level),
  );
  const slots = relicSlots(d);
  for (let s = 0; s < slots && s < ranked.length; s++) equipRelic(d, ranked[s].uid, s);
}

/** Stage de campagne le plus avancé ouvert (le joueur pousse la campagne). */
function frontier(d: SaveData): string {
  let index = 0;
  for (let i = 0; i < CAMPAIGN.length; i++) if (stageUnlocked(d, i)) index = i;
  return CAMPAIGN[index].id;
}

export function simulateAccount(
  opts: AccountOptions,
  onRun?: (r: RunRecordSim) => void,
): RunRecordSim[] {
  const d = defaultSave(0);
  const out: RunRecordSim[] = [];
  let seconds = 0;
  let at = Date.UTC(2026, 0, 5, 18);
  for (let k = 0; k < opts.runs; k++) {
    const skill =
      opts.skillStart + (opts.skillMax - opts.skillStart) * (1 - Math.exp(-k / opts.learnRuns));
    const stage = frontier(d);
    const character = d.profile.unlocked[k % d.profile.unlocked.length];
    const before = snapshot(d);
    const played = playRun({ stage, character, skill, seed: `${opts.seed}:${String(k)}`, save: d });
    // Menus, écrans de choix et de fin : ~15 % de temps en plus du temps de jeu.
    seconds += played.outcome.time * 1.15 + 20;
    at += (played.outcome.time + 60) * 1000;
    applyRunEnd(d, played.sim.state, {
      mode: 'campaign',
      run: played.run,
      counted: false,
      meta: played.meta,
      at,
    });
    const earned = d.wallet.fragments - before.fragments;
    spend(d);
    const after = snapshot(d);
    const rec: RunRecordSim = {
      ...played.outcome,
      index: k + 1,
      stage,
      character,
      skill,
      hours: seconds / 3600,
      gains: {
        characters: after.characters - before.characters,
        stages: after.stages - before.stages,
        talents: after.talents - before.talents,
        relics: after.relics - before.relics,
        accountLevels: after.accountLevel - before.accountLevel,
        achievements: after.achievements - before.achievements,
      },
      accountLevel: after.accountLevel,
      fragmentsEarned: earned,
      talentRanks: after.talents,
      cleared: after.stages,
    };
    out.push(rec);
    onRun?.(rec);
  }
  return out;
}
