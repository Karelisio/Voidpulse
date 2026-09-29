import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

function sequence(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => rng.nextU32());
}

describe('Rng', () => {
  it('est déterministe pour une même seed', () => {
    expect(sequence(new Rng('daily-2026-09-29'), 50)).toEqual(
      sequence(new Rng('daily-2026-09-29'), 50),
    );
    expect(sequence(new Rng(42), 20)).toEqual(sequence(new Rng(42), 20));
  });

  it('diverge pour des seeds différentes', () => {
    expect(sequence(new Rng(1), 10)).not.toEqual(sequence(new Rng(2), 10));
  });

  it('reprend exactement après save/restore', () => {
    const rng = new Rng('run');
    sequence(rng, 7);
    const saved = rng.save();
    const expected = sequence(rng, 10);
    rng.restore(saved);
    expect(sequence(rng, 10)).toEqual(expected);
  });

  it('dérive des flux déterministes et indépendants', () => {
    const a = new Rng('root').fork('spawn');
    const b = new Rng('root').fork('spawn');
    expect(sequence(a, 10)).toEqual(sequence(b, 10));
    const root = new Rng('root');
    expect(sequence(root.fork('spawn'), 5)).not.toEqual(sequence(root.fork('spawn'), 5));
  });

  it('respecte les bornes et une distribution plausible', () => {
    const rng = new Rng(7);
    let sum = 0;
    const counts = new Array<number>(6).fill(0);
    const n = 60000;
    for (let i = 0; i < n; i++) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      sum += f;
      const k = rng.int(6);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
    for (const c of counts) expect(Math.abs(c - n / 6)).toBeLessThan(n / 60);
    for (let i = 0; i < 1000; i++) {
      const v = rng.intRange(-3, 3);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThanOrEqual(3);
    }
  });
});
