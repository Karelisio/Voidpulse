/**
 * Arbre de talents permanent (config/talents.json) : rangs achetés avec les fragments, un
 * nœud s'ouvre dès qu'un nœud requis a au moins un rang. Réinitialisation remboursée.
 */
import { TALENTS, type MetaStats, type TalentNodeDef } from '../content/data';
import type { SaveData } from '../save/schema';
import { addStats } from './stats';

const BY_ID = new Map(TALENTS.nodes.map((n) => [n.id, n]));

export function talentNode(id: string): TalentNodeDef | undefined {
  return BY_ID.get(id);
}

export function talentRank(d: SaveData, id: string): number {
  return d.meta.talents[id] ?? 0;
}

export function talentOpen(d: SaveData, node: TalentNodeDef): boolean {
  return node.requires.length === 0 || node.requires.some((r) => talentRank(d, r) > 0);
}

/** Coût du prochain rang (null : rang maximal atteint). */
export function nextCost(d: SaveData, node: TalentNodeDef): number | null {
  const rank = talentRank(d, node.id);
  return rank < node.cost.length ? node.cost[rank] : null;
}

export type BuyCheck = 'ok' | 'locked' | 'maxed' | 'poor';

export function canBuy(d: SaveData, node: TalentNodeDef): BuyCheck {
  const cost = nextCost(d, node);
  if (cost === null) return 'maxed';
  if (!talentOpen(d, node)) return 'locked';
  return d.wallet.fragments >= cost ? 'ok' : 'poor';
}

export function buyTalent(d: SaveData, id: string): boolean {
  const node = BY_ID.get(id);
  if (!node || canBuy(d, node) !== 'ok') return false;
  const cost = nextCost(d, node) ?? 0;
  d.wallet.fragments -= cost;
  d.meta.talents[id] = talentRank(d, id) + 1;
  return true;
}

/** Fragments investis dans l'arbre. */
export function talentSpent(d: SaveData): number {
  let total = 0;
  for (const [id, rank] of Object.entries(d.meta.talents)) {
    const node = BY_ID.get(id);
    if (node) for (let r = 0; r < rank; r++) total += node.cost[r];
  }
  return total;
}

/** Réinitialise l'arbre et rembourse tout. */
export function resetTalents(d: SaveData): number {
  const refund = talentSpent(d);
  d.wallet.fragments += refund;
  d.meta.talents = {};
  return refund;
}

export function talentStats(d: SaveData): MetaStats {
  const out: MetaStats = {};
  for (const [id, rank] of Object.entries(d.meta.talents)) {
    const node = BY_ID.get(id);
    if (node && rank > 0) addStats(out, node.stats, Math.min(rank, node.cost.length));
  }
  return out;
}
