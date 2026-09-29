/**
 * Reliques : équipement de méta en emplacements (1, puis 2 et 3 avec le niveau de compte).
 * Une relique a une base (statistique signature), une rareté (nombre de statistiques
 * secondaires tirées, multiplicateur), un niveau (+10 % par niveau). On l'améliore, on relance
 * ses secondaires, on la recycle en fragments ; la forge vend des caches aléatoires.
 */
import { META, type MetaStats } from '../content/data';
import type { Rng } from '../engine/rng';
import type { RelicItem, SaveData } from '../save/schema';
import { forgeOpen, relicSlots } from './account';
import { addStats } from './stats';

const R = META.relics;

export function relicBase(id: string): (typeof R.bases)[number] | undefined {
  return R.bases.find((b) => b.id === id);
}

export function rarityOf(item: RelicItem): (typeof R.rarities)[number] {
  return R.rarities[Math.min(item.rarity, R.rarities.length - 1)];
}

/** Rareté tirée selon les poids (au moins `min`). */
export function rollRarity(rng: Rng, min = 0): number {
  const pool = R.rarities.map((r, i) => (i >= min ? r.weight : 0));
  let roll = rng.next() * pool.reduce((s, w) => s + w, 0);
  for (let i = 0; i < pool.length; i++) {
    roll -= pool[i];
    if (roll <= 0 && pool[i] > 0) return i;
  }
  return Math.max(min, 0);
}

function rollSecondaries(rng: Rng, base: string, rarity: number): RelicItem['stats'] {
  const sig = relicBase(base)?.signature.stat;
  const free = R.pool.filter((p) => p.stat !== sig);
  const out: RelicItem['stats'] = [];
  const n = R.rarities[rarity].secondaries;
  while (out.length < n && free.length > 0) {
    const p = free.splice(rng.int(free.length), 1)[0];
    const v = p.min + (p.max - p.min) * rng.next();
    out.push({ stat: p.stat, value: Math.round(v * 1000) / 1000 });
  }
  return out;
}

/** Nouvelle relique (base tirée si absente), versée à l'inventaire s'il reste de la place. */
export function grantRelic(d: SaveData, rng: Rng, base?: string, minRarity = 0): RelicItem | null {
  const r = d.meta.relics;
  if (r.items.length >= R.inventory) return null;
  const id = base ?? rng.pick(R.bases).id;
  const rarity = rollRarity(rng, minRarity);
  const item: RelicItem = {
    uid: r.nextUid++,
    base: id,
    rarity,
    level: 1,
    stats: rollSecondaries(rng, id, rarity),
  };
  r.items.push(item);
  return item;
}

/** Statistiques effectives : signature et secondaires × rareté × niveau. */
export function relicStats(item: RelicItem): MetaStats {
  const k = rarityOf(item).mult * (1 + R.levelBonus * (item.level - 1));
  const out: MetaStats = {};
  const base = relicBase(item.base);
  if (base) addStats(out, { [base.signature.stat]: base.signature.value * k });
  for (const s of item.stats) addStats(out, { [s.stat]: s.value * k });
  return out;
}

export function findRelic(d: SaveData, uid: number): RelicItem | undefined {
  return d.meta.relics.items.find((x) => x.uid === uid);
}

/** Équipe dans un emplacement ouvert (retire la relique des autres emplacements). */
export function equipRelic(d: SaveData, uid: number, slot: number): boolean {
  const r = d.meta.relics;
  if (slot < 0 || slot >= relicSlots(d) || (uid !== 0 && !findRelic(d, uid))) return false;
  while (r.equipped.length < R.slots) r.equipped.push(0);
  for (let i = 0; i < r.equipped.length; i++) if (r.equipped[i] === uid) r.equipped[i] = 0;
  r.equipped[slot] = uid;
  return true;
}

export function equippedRelics(d: SaveData): RelicItem[] {
  const n = relicSlots(d);
  return d.meta.relics.equipped
    .slice(0, n)
    .map((uid) => findRelic(d, uid))
    .filter((x): x is RelicItem => x !== undefined);
}

export function relicsStats(d: SaveData): MetaStats {
  const out: MetaStats = {};
  for (const item of equippedRelics(d)) addStats(out, relicStats(item));
  return out;
}

export function upgradeCost(item: RelicItem): number | null {
  if (item.level >= R.maxLevel) return null;
  return Math.round(
    R.upgradeCost.base * (1 + item.rarity) * Math.pow(R.upgradeCost.growth, item.level - 1),
  );
}

export function upgradeRelic(d: SaveData, uid: number): boolean {
  const item = findRelic(d, uid);
  const cost = item ? upgradeCost(item) : null;
  if (!item || cost === null || d.wallet.fragments < cost) return false;
  d.wallet.fragments -= cost;
  item.level++;
  return true;
}

export const rerollCost = (item: RelicItem): number => R.rerollCost * (1 + item.rarity);

export function rerollRelic(d: SaveData, uid: number, rng: Rng): boolean {
  const item = findRelic(d, uid);
  if (!item || item.stats.length === 0 || d.wallet.fragments < rerollCost(item)) return false;
  d.wallet.fragments -= rerollCost(item);
  item.stats = rollSecondaries(rng, item.base, item.rarity);
  return true;
}

export const salvageValue = (item: RelicItem): number => R.salvage * (1 + item.rarity) * item.level;

export function salvageRelic(d: SaveData, uid: number): number {
  const r = d.meta.relics;
  const i = r.items.findIndex((x) => x.uid === uid);
  if (i < 0) return 0;
  const value = salvageValue(r.items[i]);
  r.items.splice(i, 1);
  r.equipped = r.equipped.map((u) => (u === uid ? 0 : u));
  d.wallet.fragments += value;
  return value;
}

/** Forge : cache aléatoire contre des fragments (si la forge est ouverte). */
export function buyCache(d: SaveData, rng: Rng): RelicItem | null {
  if (!forgeOpen(d) || d.wallet.fragments < R.cacheCost) return null;
  const item = grantRelic(d, rng);
  if (item) d.wallet.fragments -= R.cacheCost;
  return item;
}
