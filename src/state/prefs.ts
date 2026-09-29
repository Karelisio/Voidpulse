/**
 * Préférences d'affichage appliquées hors React : langue (textes et contenu), thème de
 * l'interface, palette daltonienne. Réappliquées à chaque modification de la sauvegarde et
 * quand l'appareil passe du mode clair au mode sombre (Material You).
 */
import { setLanguage } from '../i18n';
import { applyOrientation, initAndroid } from '../platform/android';
import { applyTheme } from '../theme';
import type { DisplayPrefs } from '../save/schema';
import { useSave } from './save';

let last: DisplayPrefs | null = null;

function apply(d: DisplayPrefs): void {
  if (
    last?.language === d.language &&
    last.theme === d.theme &&
    last.colorblind === d.colorblind &&
    last.accent === d.accent &&
    last.orientation === d.orientation
  ) {
    return;
  }
  const prev = last;
  last = d;
  if (prev?.orientation !== d.orientation) applyOrientation(d.orientation);
  setLanguage(d.language);
  document.documentElement.lang = d.language;
  applyTheme(d);
}

export function watchPrefs(): void {
  apply(useSave.getState().data.display);
  void initAndroid(() => {
    applyTheme(useSave.getState().data.display);
  });
  useSave.subscribe((s) => {
    apply(s.data.display);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const d = useSave.getState().data.display;
    applyTheme(d);
  });
}
