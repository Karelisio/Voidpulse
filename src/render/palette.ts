/** Palette de la direction artistique (vectoriel néon sur fond de vide). */
export const PALETTE = {
  void: 0x07040f,
  voidDeep: 0x030208,
  ink: 0xefe9ff,
  cyan: 0x3ee6ff,
  magenta: 0xff3ea5,
  violet: 0xb04dff,
  lime: 0xb8ff4d,
  orange: 0xff8a3d,
  yellow: 0xffd23d,
  red: 0xff3e5e,
  white: 0xffffff,
} as const;

/** Couleur des éléments (projectiles, marques, réactions). */
export const ELEMENT_COLORS = [0xff7a2f, 0x7fe8ff, 0xfff06a, 0x9cff3d, 0xff6af0, 0x8a5cff] as const;

export function css(color: number, alpha = 1): string {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

/** Mélange linéaire de deux couleurs 0xrrggbb. */
export function mix(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** Couleur 0xrrggbb + alpha → valeur `color` d'une Particle Pixi (BGR + alpha). */
export function particleColor(rgb: number, alpha: number): number {
  const bgr = ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff);
  return bgr + (((alpha * 255) | 0) << 24);
}
