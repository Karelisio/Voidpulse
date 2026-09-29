/**
 * Coffre hors ligne : se remplit de fragments pendant l'absence (plus vite avec le niveau de
 * compte), plafonné à quelques heures ; horloge protégée contre les retours en arrière.
 */
import { RETENTION } from '../content/data';
import type { SaveData } from '../save/schema';

const C = RETENTION.chest;
const HOUR = 3600000;

export function chestRate(d: SaveData): number {
  return C.perHour * (1 + C.levelBonus * (d.meta.account.level - 1));
}

export function chestCapacity(d: SaveData): number {
  return Math.floor(chestRate(d) * C.capHours);
}

/** Fragments en attente à l'instant `now`. */
export function chestAmount(d: SaveData, now: number): number {
  const last = d.retention.chest.last;
  if (last <= 0) return 0;
  const hours = Math.min(C.capHours, Math.max(0, now - last) / HOUR);
  return Math.floor(chestRate(d) * hours);
}

/** Instant où le coffre sera plein. */
export function chestFullAt(d: SaveData): number {
  return d.retention.chest.last + C.capHours * HOUR;
}

/** Démarre le coffre au premier lancement. */
export function startChest(d: SaveData, now: number): void {
  if (d.retention.chest.last <= 0) d.retention.chest.last = now;
}

/** Vide le coffre ; renvoie les fragments versés (0 sous le minimum). */
export function claimChest(d: SaveData, now: number): number {
  const amount = chestAmount(d, now);
  if (amount < Math.max(1, C.minClaim)) return 0;
  d.wallet.fragments += amount;
  d.retention.chest.last = now;
  return amount;
}
