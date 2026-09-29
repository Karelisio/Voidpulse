import { describe, expect, it } from 'vitest';
import { compareSemver, isNewer, parseSemver } from './semver';

const v = (s: string) => {
  const p = parseSemver(s);
  if (!p) throw new Error(s);
  return p;
};

describe('versions sémantiques', () => {
  it('analyse, préfixe v, métadonnées de build', () => {
    expect(parseSemver('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, pre: [] });
    expect(parseSemver('1.2.3-beta.2+sha.abc')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      pre: ['beta', 2],
    });
    expect(parseSemver('1.2')).toBeNull();
    expect(parseSemver('abc')).toBeNull();
  });

  it('ordre de la spécification SemVer 2.0', () => {
    const order = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
      '1.0.1',
      '1.1.0',
      '2.0.0',
    ];
    for (let i = 1; i < order.length; i++) {
      expect(compareSemver(v(order[i - 1]), v(order[i])), order[i]).toBeLessThan(0);
      expect(compareSemver(v(order[i]), v(order[i - 1]))).toBeGreaterThan(0);
    }
    expect(compareSemver(v('1.0.0+a'), v('1.0.0+b'))).toBe(0);
  });

  it('mise à jour disponible seulement si strictement plus récente', () => {
    expect(isNewer('v1.3.0', '1.2.9')).toBe(true);
    expect(isNewer('1.2.9', '1.2.9')).toBe(false);
    expect(isNewer('1.3.0-beta.1', '1.2.9')).toBe(true);
    expect(isNewer('1.3.0-beta.1', '1.3.0')).toBe(false);
    expect(isNewer('garbage', '1.0.0')).toBe(false);
    expect(isNewer('1.0.0', '0.0.0-dev')).toBe(true);
  });
});
