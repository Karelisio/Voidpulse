/**
 * Chronologie de la partie (graphique de fin) : dégâts par seconde et PV relevés à pas fixe
 * dans des tableaux préalloués. Quand ils sont pleins, deux relevés voisins fusionnent et le
 * pas double : aucune allocation, quelle que soit la durée de la partie.
 */
import { DT } from '../engine/constants';
import type { RunSim } from './sim';

export const TIMELINE_CAP = 240;
const FIRST_STEP = 5;

export interface Timeline {
  /** Pas entre deux relevés (s). */
  step: number;
  dps: Float32Array;
  /** PV en proportion des PV max (0 → 1). */
  hp: Float32Array;
  n: number;
  /** Dégâts cumulés au dernier relevé ; temps écoulé depuis. */
  lastDamage: number;
  acc: number;
}

export function createTimeline(): Timeline {
  return {
    step: FIRST_STEP,
    dps: new Float32Array(TIMELINE_CAP),
    hp: new Float32Array(TIMELINE_CAP),
    n: 0,
    lastDamage: 0,
    acc: 0,
  };
}

function halve(t: Timeline): void {
  const half = t.n >> 1;
  for (let i = 0; i < half; i++) {
    t.dps[i] = (t.dps[2 * i] + t.dps[2 * i + 1]) * 0.5;
    t.hp[i] = Math.min(t.hp[2 * i], t.hp[2 * i + 1]);
  }
  t.n = half;
  t.step *= 2;
}

export function updateTimeline(sim: RunSim): void {
  const st = sim.state;
  const t = st.timeline;
  t.acc += DT;
  if (t.acc < t.step) return;
  const dmg = st.stats.damageBySlot;
  let total = 0;
  for (let i = 0; i < dmg.length; i++) total += dmg[i];
  if (t.n >= TIMELINE_CAP) halve(t);
  t.dps[t.n] = (total - t.lastDamage) / t.acc;
  const p = st.player;
  t.hp[t.n] = Math.max(0, p.hp / Math.max(1, p.stats.maxHp));
  t.n++;
  t.lastDamage = total;
  t.acc = 0;
}
