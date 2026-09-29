/**
 * Décor du stage (forêt brumeuse) : sol généré (grille néon, mousses lumineuses) en tuile
 * défilante, et brume en parallaxe. Tout est dessiné au démarrage en Canvas2D.
 */
import { Container, Texture, TilingSprite } from 'pixi.js';
import { Rng } from '../engine/rng';

const TILE = 512;

function groundTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = TILE;
  c.height = TILE;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D indisponible');
  const rng = new Rng('forest-floor');
  const base = g.createLinearGradient(0, 0, TILE, TILE);
  base.addColorStop(0, '#0a0b16');
  base.addColorStop(1, '#090714');
  g.fillStyle = base;
  g.fillRect(0, 0, TILE, TILE);
  // Taches de sol sombres (profondeur).
  for (let i = 0; i < 18; i++) {
    const x = rng.range(0, TILE);
    const y = rng.range(0, TILE);
    const r = rng.range(40, 110);
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, rng.chance(0.5) ? 'rgba(20,40,52,0.35)' : 'rgba(36,18,52,0.3)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    for (const ox of [-TILE, 0, TILE])
      for (const oy of [-TILE, 0, TILE]) g.fillRect(x - r + ox, y - r + oy, r * 2, r * 2);
  }
  // Grille néon discrète.
  g.strokeStyle = 'rgba(62,230,255,0.07)';
  g.lineWidth = 1;
  for (let i = 0; i <= TILE; i += 64) {
    g.beginPath();
    g.moveTo(i + 0.5, 0);
    g.lineTo(i + 0.5, TILE);
    g.moveTo(0, i + 0.5);
    g.lineTo(TILE, i + 0.5);
    g.stroke();
  }
  g.strokeStyle = 'rgba(176,77,255,0.1)';
  g.beginPath();
  g.moveTo(0.5, 0);
  g.lineTo(0.5, TILE);
  g.moveTo(0, 0.5);
  g.lineTo(TILE, 0.5);
  g.stroke();
  // Mousses lumineuses et brins.
  for (let i = 0; i < 70; i++) {
    const x = rng.range(0, TILE);
    const y = rng.range(0, TILE);
    const hue = rng.pick(['125,255,190', '62,230,255', '184,255,77']);
    g.fillStyle = `rgba(${hue},${rng.range(0.15, 0.5).toFixed(2)})`;
    g.shadowColor = `rgba(${hue},0.8)`;
    g.shadowBlur = 6;
    g.beginPath();
    g.arc(x, y, rng.range(0.8, 2.2), 0, Math.PI * 2);
    g.fill();
  }
  g.shadowBlur = 0;
  for (let i = 0; i < 26; i++) {
    const x = rng.range(0, TILE);
    const y = rng.range(0, TILE);
    const a = rng.range(0, Math.PI * 2);
    const l = rng.range(6, 16);
    g.strokeStyle = `rgba(90,200,160,${rng.range(0.08, 0.2).toFixed(2)})`;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(
      x + Math.cos(a) * l * 0.5 + 4,
      y + Math.sin(a) * l * 0.5,
      x + Math.cos(a) * l,
      y + Math.sin(a) * l,
    );
    g.stroke();
  }
  return Texture.from(c);
}

function mistTexture(): Texture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D indisponible');
  const rng = new Rng('forest-mist');
  for (let i = 0; i < 26; i++) {
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    const r = rng.range(60, 150);
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const rg = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        rg.addColorStop(0, 'rgba(150,120,255,0.10)');
        rg.addColorStop(1, 'rgba(150,120,255,0)');
        g.fillStyle = rg;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
  return Texture.from(c);
}

export class Background {
  readonly container = new Container();
  private readonly ground: TilingSprite;
  private readonly mist: TilingSprite;
  private time = 0;

  constructor() {
    this.ground = new TilingSprite({ texture: groundTexture(), width: 16, height: 16 });
    this.mist = new TilingSprite({ texture: mistTexture(), width: 16, height: 16 });
    this.mist.alpha = 0.55;
    this.container.addChild(this.ground, this.mist);
  }

  resize(width: number, height: number): void {
    this.ground.width = width;
    this.ground.height = height;
    this.mist.width = width;
    this.mist.height = height;
  }

  /** Aligne les tuiles sur la caméra (le sol suit le monde, la brume dérive en parallaxe). */
  update(
    camX: number,
    camY: number,
    zoom: number,
    width: number,
    height: number,
    dt: number,
  ): void {
    this.time += dt;
    this.ground.tileScale.set(zoom, zoom);
    this.ground.tilePosition.set(width / 2 - camX * zoom, height / 2 - camY * zoom);
    this.mist.tileScale.set(zoom * 1.4, zoom * 1.4);
    this.mist.tilePosition.set(
      width / 2 - camX * zoom * 1.15 + this.time * 9,
      height / 2 - camY * zoom * 1.15 + this.time * 4,
    );
  }
}
