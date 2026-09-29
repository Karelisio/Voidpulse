/** Images des menus (hors partie) : portraits des vaisseaux et icônes, en data URL, en cache. */
import { BOSSES } from '../content/data';
import { drawBossArt } from '../render/boss-art';
import { drawIcon, iconColor } from '../render/icons';
import { Pen } from '../render/pen';
import { drawShip } from '../render/ship-art';

const cache = new Map<string, string>();

function render(key: string, size: number, draw: (p: Pen) => void): string {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  draw(new Pen(ctx, false));
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/** Vaisseau d'un personnage, nez vers le haut. */
export function shipPortrait(id: string): string {
  return render(`ship:${id}`, 160, (p) => {
    p.ctx.setTransform(5, 0, 0, 5, 80, 80);
    p.ctx.rotate(-Math.PI / 2);
    drawShip(p, id);
  });
}

export function iconUrl(id: string): string {
  return render(`icon:${id}`, 96, (p) => {
    p.ctx.setTransform(1.5, 0, 0, 1.5, 48, 48);
    drawIcon(p, id, iconColor(id));
  });
}

/** Boss, avant vers le haut, cadré sur son rayon. */
export function bossPortrait(id: string): string {
  const def = BOSSES.find((b) => b.id === id);
  if (!def) return '';
  return render(`boss:${id}`, 128, (p) => {
    const k = 44 / (def.radius * 1.35);
    p.ctx.setTransform(k, 0, 0, k, 64, 64);
    p.ctx.rotate(-Math.PI / 2);
    drawBossArt(p, def);
  });
}
