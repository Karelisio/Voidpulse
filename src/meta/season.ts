/**
 * Passe de saison gratuit : 50 paliers, saisons de 6 semaines calculées depuis une époque
 * fixe (heure locale), un thème par saison. XP gagnée en partie (score) et par les quêtes.
 * Les récompenses se réclament ; à la fin d'une saison, celles atteintes et non réclamées
 * sont versées d'office.
 */
import { RETENTION } from '../content/data';
import { Rng } from '../engine/rng';
import type { SaveData } from '../save/schema';
import { dayNumber, localDay } from './clock';
import { grantRelic } from './relics';

const S = RETENTION.season;
const EPOCH = dayNumber(S.epoch);

export function seasonIndex(now: number): number {
  return Math.max(0, Math.floor((dayNumber(localDay(now)) - EPOCH) / S.days));
}

export interface SeasonInfo {
  index: number;
  theme: (typeof S.themes)[number];
  /** Jours restants (le jour même compris). */
  daysLeft: number;
}

export function seasonInfo(now: number): SeasonInfo {
  const index = seasonIndex(now);
  const today = dayNumber(localDay(now));
  return {
    index,
    theme: S.themes[index % S.themes.length],
    daysLeft: EPOCH + (index + 1) * S.days - today,
  };
}

export function seasonTier(d: SaveData): number {
  return Math.min(S.tiers, Math.floor(d.retention.season.xp / S.xpPerTier));
}

export function addSeasonXp(d: SaveData, xp: number): void {
  const s = d.retention.season;
  s.xp += Math.max(0, Math.floor(xp));
  s.best = Math.max(s.best, seasonTier(d));
}

export interface TierReward {
  fragments: number;
  /** Rareté minimale de la relique offerte (absente : pas de relique). */
  relic?: number;
}

export function tierReward(tier: number): TierReward {
  const r = S.rewards;
  if (tier % r.relicEvery === 0) {
    return { fragments: r.milestoneFragments, relic: r.relicRarity[String(tier)] ?? 0 };
  }
  if (tier % r.milestoneEvery === 0) return { fragments: r.milestoneFragments };
  return { fragments: r.fragmentsBase + r.fragmentsPerTier * tier };
}

function grant(d: SaveData, tier: number): TierReward {
  const r = tierReward(tier);
  d.wallet.fragments += r.fragments;
  if (r.relic !== undefined) {
    grantRelic(
      d,
      new Rng(`saison:${String(d.retention.season.id)}:${String(tier)}`),
      undefined,
      r.relic,
    );
  }
  d.retention.season.claimed.push(tier);
  return r;
}

export function claimSeasonTier(d: SaveData, tier: number): boolean {
  const s = d.retention.season;
  if (tier < 1 || tier > seasonTier(d) || s.claimed.includes(tier)) return false;
  grant(d, tier);
  return true;
}

/** Réclame tous les paliers atteints ; renvoie leur nombre. */
export function claimAllSeason(d: SaveData): number {
  let n = 0;
  for (let t = 1; t <= seasonTier(d); t++) if (claimSeasonTier(d, t)) n++;
  return n;
}

/** Nouvelle saison : verse les paliers atteints non réclamés, puis repart de zéro. */
export function syncSeason(d: SaveData, now: number): number {
  const s = d.retention.season;
  const index = seasonIndex(now);
  if (s.id === index) return 0;
  const granted = s.id >= 0 ? claimAllSeason(d) : 0;
  s.id = index;
  s.xp = 0;
  s.claimed = [];
  return granted;
}
