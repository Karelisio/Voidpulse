/**
 * RNG déterministe sfc32 (état 128 bits dans un Uint32Array, sérialisable).
 * Toute la simulation passe par des flux Rng seedés : jamais de Math.random.
 */
export class Rng {
  readonly state = new Uint32Array(4);

  constructor(seed: number | string) {
    this.reseed(seed);
  }

  reseed(seed: number | string): void {
    const h = typeof seed === 'string' ? seed : `n:${seed}`;
    const s = this.state;
    const words = cyrb128(h);
    s[0] = words[0];
    s[1] = words[1];
    s[2] = words[2];
    s[3] = words[3];
    // Chauffe : décorrèle les états issus de seeds proches.
    for (let i = 0; i < 12; i++) this.nextU32();
  }

  /** Entier non signé 32 bits. */
  nextU32(): number {
    const s = this.state;
    const a = s[0];
    const b = s[1];
    const c = s[2];
    const d = s[3];
    const t = (((a + b) | 0) + d) | 0;
    s[3] = (d + 1) | 0;
    s[0] = b ^ (b >>> 9);
    s[1] = (c + (c << 3)) | 0;
    const r = (c << 21) | (c >>> 11);
    s[2] = (r + t) | 0;
    return t >>> 0;
  }

  /** Flottant dans [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Flottant dans [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Entier dans [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** Entier dans [min, max] (inclus). */
  intRange(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Signe aléatoire (-1 ou 1). */
  sign(): number {
    return this.nextU32() & 1 ? 1 : -1;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick sur une liste vide');
    return items[this.int(items.length)];
  }

  /** Nouveau flux indépendant et déterministe dérivé de celui-ci. */
  fork(label: string): Rng {
    return new Rng(`${label}:${this.nextU32()}:${this.nextU32()}`);
  }

  save(): [number, number, number, number] {
    const s = this.state;
    return [s[0], s[1], s[2], s[3]];
  }

  restore(saved: readonly [number, number, number, number]): void {
    this.state.set(saved);
  }
}

/** Hachage 128 bits d'une chaîne (cyrb128), pour dériver des seeds. */
export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
