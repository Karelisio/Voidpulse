/** Outils d'affichage des objectifs : durées, valeurs, icônes des quêtes. */
import type { QuestTemplateDef } from '../../content/data';
import type { SaveData } from '../../save/schema';

/** Exécute une modification de la sauvegarde avec l'instant sûr ; les succès sont évalués après. */
export type Act = <T>(fn: (d: SaveData, now: number) => T) => T;
export type Notify = (text: string) => void;

const QUEST_ICONS: Record<string, string> = {
  kills: 'amplifier',
  elites: 'scope',
  bosses: 'plating',
  reactions: 'resonator',
  eveils: 'focus',
  minutes: 'persistence',
  runs: 'swiftness',
  victories: 'overclock',
  gold: 'greed',
  chests: 'clover',
  level: 'growth',
  daily: 'multiplier',
  endlessMinutes: 'phase',
};

const ELEMENT_ICONS: Record<string, string> = {
  fire: 'pyro',
  frost: 'cryo',
  lightning: 'electro',
  poison: 'toxo',
  arcane: 'arcano',
  void: 'entropo',
};

export function questIcon(t: QuestTemplateDef | undefined): string {
  if (!t) return 'amplifier';
  if (t.metric === 'elementDamage') return ELEMENT_ICONS[t.element ?? ''] ?? 'pyro';
  return QUEST_ICONS[t.metric] ?? 'amplifier';
}

/** Mesures exprimées en minutes ou en heures : une décimale. */
export const isDecimal = (metric: string): boolean =>
  metric === 'minutes' || metric === 'endlessMinutes' || metric === 'playHours';

/** Valeur affichée : tronquée (jamais « 20 » avant d'avoir atteint 20), la cible une fois atteinte. */
export function fmtValue(value: number, target: number, decimal: boolean): string {
  const v = value >= target ? target : decimal ? Math.floor(value * 10) / 10 : Math.floor(value);
  return v.toLocaleString('fr-FR', { maximumFractionDigits: decimal ? 1 : 0 });
}

/** Prochain minuit local. */
export function nextMidnight(now: number): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** Prochain lundi 00:00 local. */
export function nextMonday(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 7 - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** Durée restante : « 3 j 4 h », « 5 h 12 min » ou « 12 min ». */
export function fmtDuration(ms: number): string {
  const total = Math.max(1, Math.ceil(ms / 60000));
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d > 0) return `${String(d)} j ${String(h)} h`;
  if (h > 0) return `${String(h)} h ${String(m)} min`;
  return `${String(m)} min`;
}
