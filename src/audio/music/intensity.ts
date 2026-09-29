/**
 * Directeur d'intensité musicale (fonction pure, testée) : mesure brute issue de la partie
 * → valeur lissée (montée rapide, descente lente) → palier 0-3 avec hystérésis.
 * La quantification à la mesure et le temps minimal par palier sont gérés par le lecteur.
 */

/** Nombre d'ennemis proches qui sature la mesure de densité. */
const DENSITY_FULL = 90;
const RISE_SECONDS = 1.5;
const FALL_SECONDS = 6;
/** Seuils de montée et de descente des paliers 1, 2, 3 (hystérésis). */
export const TIER_UP = [0.2, 0.45, 0.72] as const;
export const TIER_DOWN = [0.13, 0.36, 0.62] as const;

/**
 * Mesure brute (0-1) : ennemis proches, PV / PV max, élites proches, boss en vie.
 * Arguments positionnels : appelée à chaque frame sans allocation.
 */
export function rawIntensity(
  nearby: number,
  hpRatio: number,
  elites: number,
  boss: boolean,
): number {
  const density = Math.min(1, nearby / DENSITY_FULL);
  const danger = Math.max(0, Math.min(1, (0.6 - hpRatio) / 0.45));
  const v =
    0.76 * density ** 0.75 + 0.22 * danger + Math.min(0.3, elites * 0.12) + (boss ? 0.35 : 0);
  return Math.max(0, Math.min(1, v));
}

export class IntensityDirector {
  value = 0;
  tier = 0;

  reset(value = 0): void {
    this.value = value;
    this.tier = tierFor(value, 0);
  }

  /** Avance de `dt` secondes vers la mesure brute ; renvoie le palier courant. */
  update(raw: number, dt: number): number {
    const tau = raw > this.value ? RISE_SECONDS : FALL_SECONDS;
    this.value += (raw - this.value) * (1 - Math.exp(-dt / tau));
    this.tier = tierFor(this.value, this.tier);
    return this.tier;
  }
}

/** Palier pour une valeur lissée, en partant du palier courant (hystérésis). */
export function tierFor(value: number, current: number): number {
  let t = current;
  while (t < 3 && value >= TIER_UP[t]) t++;
  while (t > 0 && value < TIER_DOWN[t - 1]) t--;
  return t;
}

/**
 * Gains cibles des stems d'un deck pour un palier. Deck de stage : pistes calme puis intense
 * (mêmes stems en phase) ; le palier 3 bascule sur la version intense.
 */
export function stemTargets(
  enterAt: readonly number[],
  calmCount: number,
  tier: number,
): Float32Array {
  const out = new Float32Array(enterAt.length);
  const hasIntense = calmCount < enterAt.length;
  const intense = hasIntense && tier >= 3;
  for (let i = 0; i < enterAt.length; i++) {
    const isCalm = i < calmCount;
    if (hasIntense && isCalm === intense) continue;
    // Version intense : toutes ses couches jouent dès la bascule.
    out[i] = intense || enterAt[i] <= tier ? 1 : 0;
  }
  return out;
}
