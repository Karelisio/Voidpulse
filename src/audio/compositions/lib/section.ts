/**
 * Fenêtre de rendu : l'intro et la boucle sont rendues séparément, chacune avec sa queue.
 * Les instruments ignorent tout événement dont le temps de départ sort de la fenêtre active.
 */
let from = 0;
let to = Infinity;

export function setRenderWindow(start: number, end: number): void {
  from = start;
  to = end;
}

export function resetRenderWindow(): void {
  from = 0;
  to = Infinity;
}

/**
 * Tolérance : l'humanisation (±7 ms au plus) ne doit jamais faire changer de section une note
 * posée sur la frontière ; les dernières notes réelles d'une section sont au moins une
 * double croche (≥ 100 ms) avant la frontière.
 */
const TOLERANCE = 0.025;

/** Vrai si un événement démarrant à `t` (s) appartient à la section rendue. */
export function inWindow(t: number): boolean {
  return t >= from - TOLERANCE && t < to - TOLERANCE;
}

/** Intersection d'un intervalle avec la fenêtre (null si vide). */
export function clipToWindow(t0: number, t1: number): [number, number] | null {
  const a = Math.max(t0, from);
  const b = Math.min(t1, to);
  return b > a ? [a, b] : null;
}
