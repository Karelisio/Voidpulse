/** Portraits d'ennemis pour le codex (data URL en cache), dessinés avec le sprite du jeu. */
import type { EnemyDef } from '../../content/data';
import { drawEnemyArt } from '../../render/enemy-art';
import { Pen } from '../../render/pen';

const cache = new Map<string, string>();

/** Ennemi de face (avant vers le haut), cadré sur son rayon. */
export function enemyPortrait(def: EnemyDef): string {
  const hit = cache.get(def.id);
  if (hit !== undefined) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const k = 44 / (def.radius * 1.4);
  ctx.setTransform(k, 0, 0, k, 64, 64);
  ctx.rotate(-Math.PI / 2);
  drawEnemyArt(new Pen(ctx, false), def);
  const url = canvas.toDataURL('image/png');
  cache.set(def.id, url);
  return url;
}
