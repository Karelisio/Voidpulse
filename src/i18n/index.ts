/**
 * Traduction (français par défaut, anglais) : `t(clé, paramètres)` commun à React et à Pixi,
 * clés typées (« espace.clé »), paramètres « {n} ». Le contenu des données de jeu (armes,
 * ennemis, boss…) est traduit par une surcouche (`content.ts`).
 */
import { useSyncExternalStore } from 'react';
import { applyContentLanguage } from './content';
import core from './strings/core';
import end from './strings/end';
import feel from './strings/feel';
import goals from './strings/goals';
import hud from './strings/hud';
import lines from './strings/lines';
import meta from './strings/meta';
import modes from './strings/modes';
import overlays from './strings/overlays';
import run from './strings/run';
import select from './strings/select';
import settings from './strings/settings';
import stats from './strings/stats';
import title from './strings/title';
import training from './strings/training';
import update from './strings/update';

export type Lang = 'fr' | 'en';
export const LANGS: readonly Lang[] = ['fr', 'en'];

const DICT = {
  core,
  title,
  modes,
  select,
  run,
  overlays,
  end,
  settings,
  training,
  meta,
  goals,
  hud,
  feel,
  lines,
  stats,
  update,
};
type Dict = typeof DICT;
export type TKey = {
  [N in keyof Dict]: `${N}.${keyof Dict[N]['fr'] & string}`;
}[keyof Dict];
export type TParams = Record<string, string | number>;

let current: Lang = 'fr';
let version = 0;
const listeners = new Set<() => void>();

export function language(): Lang {
  return current;
}

/** Change la langue : textes, contenu des données, formats de nombres ; prévient React. */
export function setLanguage(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  applyContentLanguage(lang);
  version++;
  for (const l of listeners) l();
}

/** Locale des formats (nombres, dates). */
export function locale(): string {
  return current === 'fr' ? 'fr-FR' : 'en-US';
}

/** Nombre formaté selon la langue (séparateurs de milliers, décimales). */
export function num(v: number, digits = 0): string {
  return v.toLocaleString(locale(), { maximumFractionDigits: digits });
}

export function t(key: TKey, params?: TParams): string {
  const dot = key.indexOf('.');
  const ns: { fr: Partial<Record<string, string>>; en: Partial<Record<string, string>> } =
    DICT[key.slice(0, dot) as keyof Dict];
  const k = key.slice(dot + 1);
  let s = ns[current][k] ?? ns.fr[k] ?? key;
  if (params) {
    for (const [p, v] of Object.entries(params)) {
      s = s.replaceAll(`{${p}}`, typeof v === 'number' ? num(v, 2) : v);
    }
  }
  return s;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Hook React : rend à nouveau le composant quand la langue change. */
export function useLang(): Lang {
  useSyncExternalStore(subscribe, () => version);
  return current;
}

/** Abonnement hors React (HUD Pixi, caches). */
export function onLanguageChange(fn: () => void): () => void {
  return subscribe(fn);
}
