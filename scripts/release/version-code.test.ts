import { describe, expect, it } from 'vitest';
import { versionCode } from './version-code';

describe('versionCode Android', () => {
  it('encode la version et suit l’ordre SemVer', () => {
    expect(versionCode('1.0.0')).toBe(1_000_099);
    expect(versionCode('1.2.3')).toBe(1_020_399);
    const ordered = ['0.9.9', '1.0.0-beta.1', '1.0.0-beta.2', '1.0.0', '1.0.1', '1.1.0', '2.0.0'];
    const codes = ordered.map(versionCode);
    expect([...codes].sort((a, b) => a - b)).toEqual(codes);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('refuse ce qui ne tient pas dans le format', () => {
    expect(() => versionCode('1.100.0')).toThrow();
    expect(() => versionCode('1.0.0-beta.99')).toThrow();
    expect(() => versionCode('abc')).toThrow();
    expect(() => versionCode('0.0.0-alpha.0')).toThrow();
  });
});
