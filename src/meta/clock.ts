/**
 * Horloge de la rétention : temps local de l'appareil, protégé contre les retours en arrière
 * (au-delà d'une tolérance, on garde le plus grand instant déjà vu : reculer l'heure ne fait
 * ni recharger le coffre ni changer les quêtes).
 */
import { RETENTION } from '../content/data';
import type { SaveData } from '../save/schema';

/** Instant sûr sans rien écrire (affichage). */
export function readNow(d: SaveData, device = Date.now()): number {
  const max = d.retention.clock.max;
  return device < max - RETENTION.clock.rollbackToleranceMs ? max : Math.max(device, 0);
}

/** Instant sûr, retenu comme plus grand instant vu. */
export function safeNow(d: SaveData, device = Date.now()): number {
  const now = readNow(d, device);
  if (now > d.retention.clock.max) d.retention.clock.max = now;
  return now;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Jour local (AAAA-MM-JJ). */
export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Numéro de jour (jours depuis 1970) d'une date AAAA-MM-JJ, indépendant de l'heure d'été. */
export function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** Prochain instant local à `hour` heures (le jour même s'il n'est pas passé). */
export function nextLocalHour(ms: number, hour: number): number {
  const d = new Date(ms);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= ms) d.setDate(d.getDate() + 1);
  return d.getTime();
}
