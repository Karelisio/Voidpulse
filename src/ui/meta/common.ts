/** Outils partagés des écrans de progression : sons, écriture de la sauvegarde, formats. */
import { audio } from '../../audio';
import { uiSound } from '../../audio/bridge';
import type { MetaStats } from '../../content/data';
import { addStats } from '../../meta/stats';
import type { SaveData } from '../../save/schema';
import { useSave } from '../../state/save';

export const sfx = (id: 'ui.click' | 'ui.card' | 'ui.confirm' | 'ui.back'): void => {
  uiSound(audio(), id);
};

/** Modifie la sauvegarde (copie, écriture différée). */
export const mutate = (fn: (d: SaveData) => void): void => {
  useSave.getState().update(fn);
};

export const fmt = (n: number): string => Math.round(n).toLocaleString('fr-FR');

/** Pourcentage entier arrondi vers le bas (100 % seulement si complet). */
export const pct = (ratio: number): string => `${String(Math.floor(ratio * 100 + 1e-9))} %`;

export function tone(hex: string): React.CSSProperties {
  return { '--tone': hex } as React.CSSProperties;
}

/** Statistiques multipliées par un nombre de rangs. */
export function scaled(stats: MetaStats, n: number): MetaStats {
  const out: MetaStats = {};
  addStats(out, stats, n);
  return out;
}
