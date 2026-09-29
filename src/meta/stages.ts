/**
 * Progression de la campagne (module pur, testé) : le premier stage est ouvert, chaque boss
 * final vaincu ouvre le stage suivant. Les boss vaincus et les records par stage sont gardés.
 */
import { BOSSES, CAMPAIGN, type StageDef } from '../content/data';
import type { SaveData } from '../save/schema';

export function stageUnlocked(d: SaveData, index: number): boolean {
  return index <= 0 || d.profile.cleared.includes(CAMPAIGN[index - 1].id);
}

export interface StageResult {
  stage: string;
  victory: boolean;
  score: number;
  time: number;
  rank: number;
  /** Index des boss vaincus (BOSSES). */
  bosses: readonly number[];
}

/** Enregistre la run ; renvoie les stages nouvellement ouverts et les boss vaincus pour la 1re fois. */
export function recordStage(d: SaveData, r: StageResult): { stages: StageDef[]; bosses: string[] } {
  const out = { stages: [] as StageDef[], bosses: [] as string[] };
  for (const i of r.bosses) {
    const id = BOSSES[i].id;
    if (d.profile.bosses.includes(id)) continue;
    d.profile.bosses.push(id);
    out.bosses.push(BOSSES[i].name);
  }
  const index = CAMPAIGN.findIndex((s) => s.id === r.stage);
  if (index < 0) return out;
  const best = (d.profile.stageBest[r.stage] ??= { score: 0, time: 0, rank: -1 });
  best.score = Math.max(best.score, r.score);
  best.time = Math.max(best.time, r.time);
  if (r.victory) best.rank = Math.max(best.rank, r.rank);
  if (r.victory && !d.profile.cleared.includes(r.stage)) {
    d.profile.cleared.push(r.stage);
    const next = CAMPAIGN[index + 1] as StageDef | undefined;
    if (next) out.stages.push(next);
  }
  return out;
}
