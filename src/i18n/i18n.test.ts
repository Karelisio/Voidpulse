import { afterEach, describe, expect, it } from 'vitest';
import { WEAPONS } from '../content/data';
import { contentFields } from './content';
import en from './content-en.json';
import { language, num, setLanguage, t } from './index';

afterEach(() => {
  setLanguage('fr');
});

describe('traduction', () => {
  it('français par défaut, anglais, paramètres', () => {
    expect(language()).toBe('fr');
    expect(t('core.back')).toBe('Retour');
    expect(t('core.fragments', { n: 1234 })).toBe(`${num(1234, 2)} fragments`);
    setLanguage('en');
    expect(t('core.back')).toBe('Back');
    expect(num(1234.5, 1)).toBe('1,234.5');
  });

  it('contenu : anglais puis retour au français à l’identique', () => {
    const fr = WEAPONS[0].name;
    setLanguage('en');
    const table: Partial<Record<string, string>> = en;
    expect(WEAPONS[0].name).toBe(table[`weapon.${WEAPONS[0].id}.name`] ?? fr);
    setLanguage('fr');
    expect(WEAPONS[0].name).toBe(fr);
  });

  it('chaque champ du contenu a sa traduction anglaise, sans clé en trop', () => {
    const fields = contentFields();
    const keys = new Set(fields.map((x) => x.key));
    const table: Partial<Record<string, string>> = en;
    // Un champ vide en français n'a pas à être traduit.
    const missing = fields.filter((x) => x.get() !== '' && !table[x.key]).map((x) => x.key);
    expect(missing.slice(0, 10), `${String(missing.length)} manquantes`).toEqual([]);
    expect(Object.keys(table).filter((k) => !keys.has(k))).toEqual([]);
  });
});
