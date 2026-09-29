/**
 * Décor du stage : sol généré (grille néon aux couleurs du stage, détails du biome) en tuile
 * défilante, et voile en parallaxe (brume, cendres, neige, étoiles…). Tout est dessiné au
 * démarrage en Canvas2D, à partir de la palette et du biome de config/stages.
 */
import { Container, Texture, TilingSprite } from 'pixi.js';
import type { StageDef } from '../content/data';
import { Rng } from '../engine/rng';

const TILE = 512;

type G = CanvasRenderingContext2D;

function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${String((n >> 16) & 255)},${String((n >> 8) & 255)},${String(n & 255)}`;
}

function canvas(): [HTMLCanvasElement, G] {
  const c = document.createElement('canvas');
  c.width = TILE;
  c.height = TILE;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D indisponible');
  return [c, g];
}

/** Dessine `fn` aux 9 positions de répétition pour que la tuile se raccorde sans couture. */
function wrap(fn: (ox: number, oy: number) => void): void {
  for (const ox of [-TILE, 0, TILE]) for (const oy of [-TILE, 0, TILE]) fn(ox, oy);
}

function glowDots(g: G, rng: Rng, n: number, hues: string[], r0: number, r1: number): void {
  for (let i = 0; i < n; i++) {
    const x = rng.range(0, TILE);
    const y = rng.range(0, TILE);
    const hue = rng.pick(hues);
    g.fillStyle = `rgba(${hue},${rng.range(0.15, 0.5).toFixed(2)})`;
    g.shadowColor = `rgba(${hue},0.8)`;
    g.shadowBlur = 6;
    g.beginPath();
    g.arc(x, y, rng.range(r0, r1), 0, Math.PI * 2);
    g.fill();
  }
  g.shadowBlur = 0;
}

function strokes(
  g: G,
  rng: Rng,
  n: number,
  color: string,
  len: [number, number],
  width: number,
  bend: number,
): void {
  g.lineWidth = width;
  for (let i = 0; i < n; i++) {
    const x = rng.range(0, TILE);
    const y = rng.range(0, TILE);
    const a = rng.range(0, Math.PI * 2);
    const l = rng.range(len[0], len[1]);
    g.strokeStyle = `rgba(${color},${rng.range(0.08, 0.22).toFixed(2)})`;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(
      x + Math.cos(a) * l * 0.5 + bend,
      y + Math.sin(a) * l * 0.5,
      x + Math.cos(a) * l,
      y + Math.sin(a) * l,
    );
    g.stroke();
  }
}

function polygons(g: G, rng: Rng, n: number, color: string, r0: number, r1: number): void {
  g.lineWidth = 1.2;
  for (let i = 0; i < n; i++) {
    const x = rng.range(0, TILE);
    const y = rng.range(0, TILE);
    const r = rng.range(r0, r1);
    const k = 3 + rng.int(4);
    const a0 = rng.range(0, Math.PI);
    g.strokeStyle = `rgba(${color},${rng.range(0.1, 0.25).toFixed(2)})`;
    g.fillStyle = `rgba(${color},0.04)`;
    g.beginPath();
    for (let j = 0; j < k; j++) {
      const a = a0 + (j / k) * Math.PI * 2;
      const rr = r * rng.range(0.6, 1);
      if (j === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
    g.stroke();
  }
}

/** Détails propres au biome, posés sur la grille. */
function biomeDetails(g: G, rng: Rng, stage: StageDef): void {
  const grid = rgb(stage.palette.grid);
  const accent = rgb(stage.palette.accent);
  switch (stage.biome) {
    case 'forest':
      glowDots(g, rng, 70, ['125,255,190', grid, '184,255,77'], 0.8, 2.2);
      strokes(g, rng, 26, '90,200,160', [6, 16], 1.2, 4);
      break;
    case 'desert':
      // Dunes (arcs) et éclats de verre.
      g.lineWidth = 1;
      for (let i = 0; i < 22; i++) {
        const x = rng.range(0, TILE);
        const y = rng.range(0, TILE);
        g.strokeStyle = `rgba(${grid},${rng.range(0.05, 0.12).toFixed(2)})`;
        g.beginPath();
        g.arc(x, y + 60, 70, -Math.PI * 0.8, -Math.PI * 0.2);
        g.stroke();
      }
      polygons(g, rng, 30, accent, 3, 8);
      break;
    case 'sunken':
      // Bulles et algues ondulantes.
      g.lineWidth = 1;
      for (let i = 0; i < 40; i++) {
        g.strokeStyle = `rgba(${accent},${rng.range(0.1, 0.3).toFixed(2)})`;
        g.beginPath();
        g.arc(rng.range(0, TILE), rng.range(0, TILE), rng.range(1.5, 5), 0, Math.PI * 2);
        g.stroke();
      }
      strokes(g, rng, 30, grid, [14, 30], 1.4, 10);
      break;
    case 'volcano':
      // Fissures incandescentes.
      g.shadowColor = `rgba(${grid},0.9)`;
      g.shadowBlur = 8;
      for (let i = 0; i < 14; i++) {
        let x = rng.range(0, TILE);
        let y = rng.range(0, TILE);
        g.strokeStyle = `rgba(${grid},${rng.range(0.2, 0.45).toFixed(2)})`;
        g.lineWidth = rng.range(1, 2);
        g.beginPath();
        g.moveTo(x, y);
        for (let j = 0; j < 5; j++) {
          x += rng.range(-22, 22);
          y += rng.range(-22, 22);
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.shadowBlur = 0;
      glowDots(g, rng, 30, [accent], 0.8, 1.8);
      break;
    case 'station':
      // Panneaux de coque et voyants.
      g.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const x = Math.floor(rng.range(0, 8)) * 64;
        const y = Math.floor(rng.range(0, 8)) * 64;
        g.strokeStyle = `rgba(${grid},0.14)`;
        g.strokeRect(x + 6, y + 6, 52, 52);
        g.fillStyle = `rgba(${grid},0.03)`;
        g.fillRect(x + 6, y + 6, 52, 52);
      }
      glowDots(g, rng, 24, [accent, grid], 1, 1.6);
      break;
    case 'tundra':
      polygons(g, rng, 26, grid, 6, 16);
      glowDots(g, rng, 40, ['255,255,255', accent], 0.6, 1.4);
      break;
    case 'swamp':
      // Flaques et roseaux.
      for (let i = 0; i < 16; i++) {
        const x = rng.range(0, TILE);
        const y = rng.range(0, TILE);
        const r = rng.range(14, 34);
        g.fillStyle = `rgba(${grid},0.05)`;
        g.beginPath();
        g.ellipse(x, y, r, r * 0.6, rng.range(0, Math.PI), 0, Math.PI * 2);
        g.fill();
      }
      strokes(g, rng, 40, grid, [8, 20], 1.2, 2);
      glowDots(g, rng, 30, [accent], 0.8, 2);
      break;
    case 'cathedral':
      // Dalles et runes.
      g.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        const x = rng.range(0, TILE);
        const y = rng.range(0, TILE);
        const r = rng.range(8, 14);
        g.strokeStyle = `rgba(${accent},${rng.range(0.12, 0.25).toFixed(2)})`;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.moveTo(x - r * 0.6, y);
        g.lineTo(x + r * 0.6, y);
        g.moveTo(x, y - r * 0.6);
        g.lineTo(x, y + r * 0.6);
        g.stroke();
      }
      glowDots(g, rng, 40, [grid, accent], 0.7, 1.6);
      break;
    default:
      glowDots(g, rng, 40, [grid, accent], 0.8, 2);
  }
}

function groundTexture(stage: StageDef): Texture {
  const [c, g] = canvas();
  const rng = new Rng(`${stage.id}-floor`);
  const grid = rgb(stage.palette.grid);
  const accent = rgb(stage.palette.accent);
  g.fillStyle = stage.palette.base;
  g.fillRect(0, 0, TILE, TILE);
  // Taches de sol (profondeur), aux deux teintes du stage.
  for (let i = 0; i < 18; i++) {
    const x = rng.range(0, TILE);
    const y = rng.range(0, TILE);
    const r = rng.range(40, 110);
    const hue = rng.chance(0.5) ? grid : accent;
    wrap((ox, oy) => {
      const rg = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      rg.addColorStop(0, `rgba(${hue},0.07)`);
      rg.addColorStop(1, `rgba(${hue},0)`);
      g.fillStyle = rg;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }
  // Grille néon discrète.
  g.strokeStyle = `rgba(${grid},0.07)`;
  g.lineWidth = 1;
  for (let i = 0; i <= TILE; i += 64) {
    g.beginPath();
    g.moveTo(i + 0.5, 0);
    g.lineTo(i + 0.5, TILE);
    g.moveTo(0, i + 0.5);
    g.lineTo(TILE, i + 0.5);
    g.stroke();
  }
  g.strokeStyle = `rgba(${accent},0.1)`;
  g.beginPath();
  g.moveTo(0.5, 0);
  g.lineTo(0.5, TILE);
  g.moveTo(0, 0.5);
  g.lineTo(TILE, 0.5);
  g.stroke();
  biomeDetails(g, rng, stage);
  return Texture.from(c);
}

/** Voile en parallaxe : nappes (brume, vapeur) ou particules (cendres, neige, étoiles). */
function veilTexture(stage: StageDef): Texture {
  const [c, g] = canvas();
  const rng = new Rng(`${stage.id}-veil`);
  const accent = rgb(stage.palette.accent);
  const specks =
    stage.biome === 'volcano'
      ? rgb('#ffb13d')
      : stage.biome === 'tundra'
        ? '255,255,255'
        : stage.biome === 'station'
          ? '220,236,255'
          : null;
  if (specks) {
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(${specks},${rng.range(0.15, 0.6).toFixed(2)})`;
      g.beginPath();
      g.arc(rng.range(0, TILE), rng.range(0, TILE), rng.range(0.5, 1.6), 0, Math.PI * 2);
      g.fill();
    }
    return Texture.from(c);
  }
  const tint = stage.biome === 'forest' ? '150,120,255' : accent;
  for (let i = 0; i < 26; i++) {
    const x = rng.range(0, TILE);
    const y = rng.range(0, TILE);
    const r = rng.range(60, 150);
    wrap((ox, oy) => {
      const rg = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      rg.addColorStop(0, `rgba(${tint},0.10)`);
      rg.addColorStop(1, `rgba(${tint},0)`);
      g.fillStyle = rg;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }
  return Texture.from(c);
}

export class Background {
  readonly container = new Container();
  private readonly ground: TilingSprite;
  private readonly veil: TilingSprite;
  /** Dérive du voile (px/s) : les cendres montent, la neige tombe. */
  private readonly driftX: number;
  private readonly driftY: number;
  private time = 0;

  constructor(stage: StageDef) {
    this.ground = new TilingSprite({ texture: groundTexture(stage), width: 16, height: 16 });
    this.veil = new TilingSprite({ texture: veilTexture(stage), width: 16, height: 16 });
    this.veil.alpha = 0.55;
    const b = stage.biome;
    this.driftX = b === 'tundra' ? -6 : b === 'station' ? 2 : 9;
    this.driftY = b === 'volcano' ? -14 : b === 'tundra' ? 22 : b === 'station' ? 1 : 4;
    this.container.addChild(this.ground, this.veil);
  }

  resize(width: number, height: number): void {
    this.ground.width = width;
    this.ground.height = height;
    this.veil.width = width;
    this.veil.height = height;
  }

  /** Aligne les tuiles sur la caméra (le sol suit le monde, le voile dérive en parallaxe). */
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
    this.veil.tileScale.set(zoom * 1.4, zoom * 1.4);
    this.veil.tilePosition.set(
      width / 2 - camX * zoom * 1.15 + this.time * this.driftX,
      height / 2 - camY * zoom * 1.15 + this.time * this.driftY,
    );
  }
}
