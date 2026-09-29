/**
 * File d'événements de la simulation (SoA, pré-allouée) : la simulation écrit, le rendu,
 * l'audio, l'haptique et les statistiques lisent une fois par frame, puis la file est vidée.
 * Les types sont définis par les systèmes ; au-delà de `cosmeticLimit`, les événements
 * marqués cosmétiques sont abandonnés pour préserver les événements de gameplay.
 */
export class EventQueue {
  readonly type: Uint8Array;
  readonly a: Int32Array;
  readonly b: Int32Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly v: Float32Array;
  readonly w: Float32Array;
  count = 0;
  dropped = 0;
  private readonly cosmeticLimit: number;

  constructor(readonly capacity: number) {
    this.type = new Uint8Array(capacity);
    this.a = new Int32Array(capacity);
    this.b = new Int32Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.v = new Float32Array(capacity);
    this.w = new Float32Array(capacity);
    this.cosmeticLimit = Math.floor(capacity * 0.75);
  }

  /** Ajoute un événement ; renvoie false s'il a été abandonné. */
  push(
    type: number,
    a: number,
    b: number,
    x: number,
    y: number,
    v: number,
    w = 0,
    cosmetic = false,
  ): boolean {
    const i = this.count;
    if (i >= this.capacity || (cosmetic && i >= this.cosmeticLimit)) {
      this.dropped++;
      return false;
    }
    this.type[i] = type;
    this.a[i] = a;
    this.b[i] = b;
    this.x[i] = x;
    this.y[i] = y;
    this.v[i] = v;
    this.w[i] = w;
    this.count = i + 1;
    return true;
  }

  clear(): void {
    this.count = 0;
  }
}
