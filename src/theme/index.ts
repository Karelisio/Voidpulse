/**
 * Application du thème de l'interface (Arcade, Material You, Clair, Sombre) et de la palette
 * des éléments (daltonisme) : jetons CSS sur la racine du document, attributs `data-theme` et
 * `data-cvd`, palette des éléments du rendu Pixi. Le jeu garde sa direction artistique.
 */
import { ELEMENTS } from '../../config/elements';
import { ELEMENT_COLORS } from '../render/palette';
import type { DisplayPrefs } from '../save/schema';
import { hexToNumber, tone } from './color';
import { ELEMENT_PALETTES, themeTokens } from './palettes';

/** Couleurs d'origine des éléments dans le rendu. */
const GAME_COLORS = [...ELEMENT_COLORS];

/** Couleur d'accent fournie par l'appareil (Material You / Monet), si un plugin la donne. */
let systemAccent: string | null = null;

export function setSystemAccent(hex: string | null): void {
  systemAccent = hex;
}

/** Graine de Material You : couleur de l'appareil, sinon celle choisie dans les réglages. */
export function materialSeed(d: DisplayPrefs): string {
  return systemAccent ?? d.accent;
}

/** Couleur d'accent du HUD (0xrrggbb), ou null quand l'option est désactivée. */
export function hudAccent(d: DisplayPrefs): number | null {
  if (d.theme !== 'material' || !d.hudAccent) return null;
  return hexToNumber(tone(materialSeed(d), 75));
}

export function applyTheme(d: DisplayPrefs): void {
  const root = document.documentElement;
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = d.theme;
  root.dataset.cvd = d.colorblind;
  root.dataset.scheme = d.theme === 'light' || (d.theme === 'material' && !dark) ? 'light' : 'dark';
  for (const [k, v] of Object.entries(themeTokens(d.theme, materialSeed(d), dark))) {
    root.style.setProperty(k, v);
  }
  const palette = ELEMENT_PALETTES[d.colorblind];
  ELEMENTS.forEach((el, i) => {
    root.style.setProperty(`--vp-${el}`, palette[i]);
    // Sans daltonisme, le rendu garde ses couleurs néon d'origine.
    ELEMENT_COLORS[i] = d.colorblind === 'off' ? GAME_COLORS[i] : hexToNumber(palette[i]);
  });
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', getComputedStyle(root).getPropertyValue('--vp-bg').trim());
}

/** Palette des éléments (0xrrggbb) du mode daltonien donné. */
export function elementPalette(mode: DisplayPrefs['colorblind']): number[] {
  return ELEMENT_PALETTES[mode].map(hexToNumber);
}
