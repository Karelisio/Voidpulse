/** Images des menus (hors partie) : portraits des vaisseaux et icônes, en data URL, en cache. */
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
