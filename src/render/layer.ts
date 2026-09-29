import { Particle, ParticleContainer, type Texture } from 'pixi.js';

/**
 * Couche de sprites massifs : un ParticleContainer et un pool fixe de particules, réécrit à
 * chaque frame depuis une liste d'entités (aucune correspondance entité ↔ particule à tenir :
 * la i-ème entité utilise la i-ème particule). Aucune allocation après la construction.
 */
export class SpriteLayer {
  readonly container: ParticleContainer;
  private readonly particles: Particle[] = [];
  private used = 0;
  private shown = 0;

  constructor(
    readonly capacity: number,
    texture: Texture,
    blend: 'normal' | 'add',
    opts: { rotation?: boolean; scale?: boolean } = {},
  ) {
    this.container = new ParticleContainer({
      texture,
      dynamicProperties: {
        position: true,
        rotation: opts.rotation ?? true,
        vertex: opts.scale ?? true,
        uvs: true,
        color: true,
      },
    });
    this.container.blendMode = blend;
    for (let i = 0; i < capacity; i++) {
      const p = new Particle({ texture, anchorX: 0.5, anchorY: 0.5 });
      p.color = 0;
      this.particles.push(p);
    }
    this.container.addParticle(...this.particles);
  }

  begin(): void {
    this.used = 0;
  }

  /** Particule suivante de la passe (null si la couche est pleine). */
  next(): Particle | null {
    if (this.used >= this.capacity) return null;
    return this.particles[this.used++];
  }

  /** Cache les particules non utilisées par cette passe. */
  end(): void {
    for (let i = this.used; i < this.shown; i++) this.particles[i].color = 0;
    this.shown = this.used;
  }

  get count(): number {
    return this.used;
  }
}
