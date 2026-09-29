/**
 * Palettes des thèmes : Arcade (néon, défaut), Clair, Sombre, et Material You (schéma clair ou
 * sombre généré depuis une couleur graine). Palettes des éléments adaptées au daltonisme :
 * cherchées pour maximiser l'écart perceptuel minimal entre éléments sous chaque type de
 * daltonisme (ΔE OKLab × 100 ≥ 17, cible 8), en gardant les familles de teintes.
 */
import type { ColorblindMode, ThemeId } from '../save/schema';
import { tone } from './color';

export const ELEMENT_PALETTES: Record<ColorblindMode, readonly string[]> = {
  // feu, givre, foudre, poison, arcane, vide
  off: ['#ff7a2f', '#7fe8ff', '#fff06a', '#9cff3d', '#ff6af0', '#a88aff'],
  deuteranopia: ['#bc6543', '#86fefe', '#f5eb32', '#6fd17e', '#f670f9', '#6b6dee'],
  protanopia: ['#c6595b', '#9bf9f8', '#dca805', '#d2fc19', '#ed9dd0', '#8763f6'],
  tritanopia: ['#f64847', '#78feff', '#eff06c', '#269b39', '#a766ae', '#afa8fc'],
};

/** Jetons CSS d'un thème (sans les couleurs des éléments). */
export type Tokens = Record<string, string>;

const ARCADE: Tokens = {
  '--vp-bg': '#05010d',
  '--vp-panel': 'rgba(17, 11, 31, 0.92)',
  '--vp-panel-2': '#1a1030',
  '--vp-line': '#2d2248',
  '--vp-fg': '#efe9ff',
  '--vp-muted': '#a298c6',
  '--vp-accent': '#c65bff',
  '--vp-accent-2': '#3ee6ff',
  '--vp-on-accent': '#ffffff',
  '--vp-gold': '#ffd23d',
  '--vp-overlay': 'rgba(5, 1, 13, 0.78)',
  '--vp-backdrop': '#1a0b33',
};

const LIGHT: Tokens = {
  '--vp-bg': '#f4f1fa',
  '--vp-panel': '#ffffff',
  '--vp-panel-2': '#ebe6f5',
  '--vp-line': '#d6cfe6',
  '--vp-fg': '#1b1530',
  '--vp-muted': '#5d5873',
  '--vp-accent': '#6a3dff',
  '--vp-accent-2': '#0a7f9c',
  '--vp-on-accent': '#ffffff',
  '--vp-gold': '#a86b00',
  '--vp-overlay': 'rgba(244, 241, 250, 0.92)',
  '--vp-backdrop': '#e7e0f7',
};

const DARK: Tokens = {
  '--vp-bg': '#121017',
  '--vp-panel': '#1c1a22',
  '--vp-panel-2': '#26232e',
  '--vp-line': '#34303e',
  '--vp-fg': '#ece8f3',
  '--vp-muted': '#9a95a8',
  '--vp-accent': '#a88bff',
  '--vp-accent-2': '#5ec8df',
  '--vp-on-accent': '#15111f',
  '--vp-gold': '#e8b94a',
  '--vp-overlay': 'rgba(18, 16, 23, 0.94)',
  '--vp-backdrop': '#1a1722',
};

/** Schéma Material 3 depuis une graine : tons de la teinte primaire et neutres légèrement teintés. */
export function materialTokens(seed: string, dark: boolean): Tokens {
  const n = (t: number): string => tone(seed, t, 0.012);
  const nv = (t: number): string => tone(seed, t, 0.03);
  const p = (t: number): string => tone(seed, t);
  const tertiary = (t: number): string => tone(seed, t, undefined, 60);
  return dark
    ? {
        '--vp-bg': n(6),
        '--vp-panel': n(12),
        '--vp-panel-2': n(17),
        '--vp-line': nv(30),
        '--vp-fg': n(92),
        '--vp-muted': nv(75),
        '--vp-accent': p(80),
        '--vp-accent-2': tertiary(80),
        '--vp-on-accent': p(20),
        '--vp-container': p(30),
        '--vp-on-container': p(90),
        '--vp-gold': '#e8c26a',
        '--vp-overlay': 'rgba(10, 10, 14, 0.6)',
        '--vp-backdrop': n(10),
      }
    : {
        '--vp-bg': n(98),
        '--vp-panel': n(96),
        '--vp-panel-2': n(92),
        '--vp-line': nv(80),
        '--vp-fg': n(10),
        '--vp-muted': nv(35),
        '--vp-accent': p(40),
        '--vp-accent-2': tertiary(40),
        '--vp-on-accent': p(100),
        '--vp-container': p(90),
        '--vp-on-container': p(10),
        '--vp-gold': '#8a5a00',
        '--vp-overlay': 'rgba(20, 16, 30, 0.32)',
        '--vp-backdrop': n(94),
      };
}

export function themeTokens(theme: ThemeId, seed: string, prefersDark: boolean): Tokens {
  switch (theme) {
    case 'light':
      return LIGHT;
    case 'dark':
      return DARK;
    case 'material':
      return materialTokens(seed, prefersDark);
    default:
      return ARCADE;
  }
}
