import { describe, expect, it } from 'vitest';
import { hexToOklch, oklchToHex, tone } from './color';
import { ELEMENT_PALETTES, materialTokens } from './palettes';

describe('couleurs des thèmes', () => {
  it('aller-retour OKLCH et tons croissants', () => {
    const [l, c, h] = hexToOklch('#7c5cff');
    expect(oklchToHex(l, c, h)).toBe('#7c5cff');
    const lum = (hex: string): number => hexToOklch(hex)[0];
    expect(lum(tone('#7c5cff', 10))).toBeLessThan(lum(tone('#7c5cff', 40)));
    expect(lum(tone('#7c5cff', 40))).toBeLessThan(lum(tone('#7c5cff', 90)));
    // Ton 50 : clarté L* 50 ≈ gris moyen (#777777).
    expect(Math.abs(lum(tone('#808080', 50, 0)) - lum('#777777'))).toBeLessThan(0.01);
  });

  it('schémas Material clair et sombre complets, palettes daltoniennes à 6 éléments', () => {
    for (const dark of [true, false]) {
      const t = materialTokens('#1fa38a', dark);
      for (const k of ['--vp-bg', '--vp-fg', '--vp-accent', '--vp-on-accent', '--vp-panel'])
        expect(t[k]).toMatch(/^#[0-9a-f]{6}|^rgba/);
    }
    for (const p of Object.values(ELEMENT_PALETTES)) expect(p).toHaveLength(6);
  });
});
