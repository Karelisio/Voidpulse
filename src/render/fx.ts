/**
 * Effets visuels côté rendu (jamais dans la simulation) : étincelles, ondes de choc, éclairs,
 * chiffres de dégâts agrégés. Tampons circulaires SoA : aucune allocation en jeu.
 */
import type { Texture } from 'pixi.js';
import { MAX_ENTITIES } from '../engine/constants';
import { SpriteLayer } from './layer';
import { particleColor } from './palette';

/** Particules simples : position, vitesse, traînée, échelle interpolée, couleur, opacité. */
export class FxLayer {
  readonly layer: SpriteLayer;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly life: Float32Array;
  private readonly max: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly sy: Float32Array;
  private readonly rot: Float32Array;
  private readonly vrot: Float32Array;
  private readonly color: Uint32Array;
  private readonly alpha: Float32Array;
  private readonly drag: Float32Array;
  private readonly anchor: Uint8Array;
  private readonly tex: Texture[];
  private head = 0;
  /** Multiplicateur de quantité (réglage de qualité). */
  density = 1;

  constructor(
    readonly capacity: number,
    texture: Texture,
    blend: 'normal' | 'add' = 'add',
  ) {
    this.layer = new SpriteLayer(capacity, texture, blend);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.max = new Float32Array(capacity);
    this.s0 = new Float32Array(capacity);
    this.s1 = new Float32Array(capacity);
    this.sy = new Float32Array(capacity);
    this.rot = new Float32Array(capacity);
    this.vrot = new Float32Array(capacity);
    this.color = new Uint32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.anchor = new Uint8Array(capacity);
    this.tex = new Array<Texture>(capacity).fill(texture);
  }

  spawn(
    tex: Texture,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    s0: number,
    s1: number,
    color: number,
    alpha = 1,
    rot = 0,
    vrot = 0,
    drag = 0,
    scaleY = 0,
    anchorLeft = false,
  ): void {
    const i = this.head;
    this.head = (i + 1) % this.capacity;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.max[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.sy[i] = scaleY;
    this.rot[i] = rot;
    this.vrot[i] = vrot;
    this.color[i] = color;
    this.alpha[i] = alpha;
    this.drag[i] = drag;
    this.anchor[i] = anchorLeft ? 1 : 0;
    this.tex[i] = tex;
  }

  update(dt: number): void {
    const layer = this.layer;
    layer.begin();
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const k = this.drag[i] > 0 ? Math.max(0, 1 - this.drag[i] * dt) : 1;
      this.vx[i] *= k;
      this.vy[i] *= k;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += this.vrot[i] * dt;
      const t = 1 - this.life[i] / this.max[i];
      const p = layer.next();
      if (!p) break;
      const s = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      p.texture = this.tex[i];
      p.x = this.x[i];
      p.y = this.y[i];
      p.rotation = this.rot[i];
      p.scaleX = s;
      p.scaleY = this.sy[i] > 0 ? this.sy[i] : s;
      p.anchorX = this.anchor[i] ? 0 : 0.5;
      p.color = particleColor(this.color[i], this.alpha[i] * (1 - t * t));
    }
    layer.end();
  }
}

/** Chiffres de dégâts : un nombre par ennemi, agrégé sur une courte fenêtre. */
export class DamageNumbers {
  readonly layer: SpriteLayer;
  private readonly value: Float32Array;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly t: Float32Array;
  private readonly crit: Uint8Array;
  private readonly color: Uint32Array;
  private readonly owner: Int32Array;
  private readonly slotOf: Int32Array;
  private head = 0;
  enabled = true;
  private static readonly LIFE = 0.75;
  private static readonly MERGE = 0.3;

  constructor(
    readonly capacity: number,
    private readonly digits: Texture[],
  ) {
    this.layer = new SpriteLayer(capacity * 5, digits[0], 'normal', { rotation: false });
    this.value = new Float32Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.t = new Float32Array(capacity).fill(DamageNumbers.LIFE);
    this.crit = new Uint8Array(capacity);
    this.color = new Uint32Array(capacity);
    this.owner = new Int32Array(capacity).fill(-1);
    this.slotOf = new Int32Array(MAX_ENTITIES).fill(-1);
  }

  add(eid: number, x: number, y: number, amount: number, crit: boolean, color: number): void {
    if (!this.enabled) return;
    const existing = eid >= 0 ? this.slotOf[eid] : -1;
    if (existing >= 0 && this.owner[existing] === eid && this.t[existing] < DamageNumbers.MERGE) {
      this.value[existing] += amount;
      this.x[existing] = x;
      if (crit) this.crit[existing] = 1;
      return;
    }
    const i = this.head;
    this.head = (i + 1) % this.capacity;
    if (this.owner[i] >= 0 && this.slotOf[this.owner[i]] === i) this.slotOf[this.owner[i]] = -1;
    this.value[i] = amount;
    this.x[i] = x;
    this.y[i] = y - 14;
    this.t[i] = 0;
    this.crit[i] = crit ? 1 : 0;
    this.color[i] = color;
    this.owner[i] = eid;
    if (eid >= 0) this.slotOf[eid] = i;
  }

  update(dt: number): void {
    const layer = this.layer;
    layer.begin();
    const LIFE = DamageNumbers.LIFE;
    for (let i = 0; i < this.capacity; i++) {
      if (this.t[i] >= LIFE) continue;
      this.t[i] += dt;
      const t = this.t[i] / LIFE;
      if (t >= 1) continue;
      let v = Math.round(this.value[i]);
      if (v < 1) v = 1;
      const n = v >= 10000 ? 5 : v >= 1000 ? 4 : v >= 100 ? 3 : v >= 10 ? 2 : 1;
      const pop = t < 0.12 ? 1 + (0.12 - t) * 4 : 1;
      const scale = (this.crit[i] ? 0.95 : 0.7) * pop;
      const alpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      const y = this.y[i] - 26 * (1 - (1 - t) * (1 - t));
      const w = 11 * scale;
      const color = particleColor(this.crit[i] ? 0xffd23d : this.color[i], alpha);
      let x = this.x[i] + ((n - 1) * w) / 2;
      for (let d = 0; d < n; d++) {
        const p = layer.next();
        if (!p) break;
        p.texture = this.digits[v % 10];
        v = Math.floor(v / 10);
        p.x = x;
        p.y = y;
        p.scaleX = scale;
        p.scaleY = scale;
        p.color = color;
        x -= w;
      }
    }
    layer.end();
  }
}
