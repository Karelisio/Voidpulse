/**
 * Résonance : marques élémentaires, 15 réactions (paires d'éléments), jauge avec bonus de
 * diversité et rendement décroissant, Éveil de 8 s (chaque coup porte tous les éléments
 * équipés, nova périodique, recharges réduites).
 */
import { ELEMENTS, REACTIONS, RESONANCE, reactionFor } from '../content/data';
import { MARK_SLOTS, Pos, Status } from '../engine/components';
import { DT } from '../engine/constants';
import { aoe } from './combat';
import { EV, SLOT_EVEIL, SLOT_REACTION } from './events';
import type { RunSim } from './sim';
import { spawnVapor } from './zones';

/** Effet codé de chaque réaction (0 = effet générique tant que la réaction n'est pas implémentée). */
const EFFECT = { GENERIC: 0, VAPOR: 1, OVERLOAD: 2, SUPERCONDUCT: 3 } as const;
const EFFECT_OF = Uint8Array.from(
  REACTIONS.map((r) =>
    r.id === 'vapor'
      ? EFFECT.VAPOR
      : r.id === 'overload'
        ? EFFECT.OVERLOAD
        : r.id === 'superconduct'
          ? EFFECT.SUPERCONDUCT
          : EFFECT.GENERIC,
  ),
);

const RECENT = 8;

export function createResonance(): RunSim['state']['resonance'] {
  return {
    gauge: 0,
    eveilT: 0,
    novaT: 0,
    novaElement: 0,
    lastReaction: -1,
    repeat: 0,
    recentIds: new Int8Array(RECENT).fill(-1),
    recentTimes: new Float32Array(RECENT),
    recentHead: 0,
    countById: new Int32Array(REACTIONS.length),
    eveils: 0,
  };
}

/** Masque des éléments équipés (armes). */
function equippedMask(sim: RunSim): number {
  let mask = 0;
  const weapons = sim.state.weapons;
  for (let i = 0; i < weapons.length; i++) mask |= 1 << weapons[i].element;
  return mask;
}

/**
 * Applique la marque d'un élément à un ennemi ; si une autre marque est présente (et que la
 * recharge interne est prête), déclenche la réaction de la paire et consomme les marques.
 */
export function applyMark(sim: RunSim, e: number, element: number): void {
  const res = sim.state.resonance;
  const eveil = res.eveilT > 0;
  const base = e * MARK_SLOTS;
  let marks = Status.marks[e];
  if (Status.reactCd[e] <= 0 && marks !== 0) {
    for (let m = 0; m < ELEMENTS.length; m++) {
      if (m === element || !(marks & (1 << m))) continue;
      const rid = reactionFor(m, element);
      if (rid < 0) continue;
      marks &= ~(1 << m);
      Status.markT[base + m] = 0;
      Status.marks[e] = marks;
      Status.reactCd[e] = RESONANCE.reactionCooldown;
      triggerReaction(sim, rid, Pos.x[e], Pos.y[e]);
      if (!eveil) return;
      break;
    }
  }
  if (eveil) {
    const mask = equippedMask(sim);
    for (let k = 0; k < ELEMENTS.length; k++) {
      if (mask & (1 << k)) Status.markT[base + k] = RESONANCE.markDuration;
    }
    marks |= mask;
  } else {
    marks |= 1 << element;
    Status.markT[base + element] = RESONANCE.markDuration;
  }
  Status.marks[e] = marks;
}

/** Multiplicateur de gain de jauge : diversité récente récompensée, répétition amortie. */
function gaugeMultiplier(sim: RunSim, rid: number): number {
  const res = sim.state.resonance;
  const now = sim.state.time;
  if (rid === res.lastReaction) res.repeat++;
  else res.repeat = 0;
  res.lastReaction = rid;
  let mult = Math.max(RESONANCE.repeatFloor, RESONANCE.repeatFalloff ** res.repeat);
  // Paires distinctes dans la fenêtre récente (sans allocation : masque de bits).
  let seen = 1 << rid;
  let distinct = 1;
  for (let i = 0; i < RECENT; i++) {
    const id = res.recentIds[i];
    if (id < 0 || now - res.recentTimes[i] > RESONANCE.diversityWindow) continue;
    if (!(seen & (1 << id))) {
      seen |= 1 << id;
      distinct++;
    }
  }
  if (distinct >= 2) mult *= 1 + RESONANCE.diversityBonus;
  res.recentIds[res.recentHead] = rid;
  res.recentTimes[res.recentHead] = now;
  res.recentHead = (res.recentHead + 1) % RECENT;
  return mult;
}

export function triggerReaction(sim: RunSim, rid: number, x: number, y: number): void {
  const def = REACTIONS[rid];
  const res = sim.state.resonance;
  const area = sim.state.player.stats.areaMult;
  const dmgMult = sim.state.player.stats.damageMult;
  res.countById[rid]++;
  const r = def.radius * area;
  switch (EFFECT_OF[rid]) {
    case EFFECT.VAPOR:
      spawnVapor(sim, x, y, r, def.duration, def.damage * dmgMult, def.power);
      break;
    case EFFECT.OVERLOAD:
      aoe(sim, x, y, r, def.damage * dmgMult, SLOT_REACTION, def.power, 0, 0, 0);
      break;
    case EFFECT.SUPERCONDUCT:
      aoe(sim, x, y, r, def.damage * dmgMult, SLOT_REACTION, 0, def.power, def.duration, 0);
      break;
    default:
      aoe(sim, x, y, 60 * area, 15 * dmgMult, SLOT_REACTION, 60, 0, 0, 0);
  }
  sim.events.push(EV.REACTION, rid, 0, x, y, r);
  if (res.eveilT <= 0) {
    res.gauge += def.gauge * gaugeMultiplier(sim, rid);
    if (res.gauge >= RESONANCE.gaugeMax) startEveil(sim);
  }
}

export function startEveil(sim: RunSim): void {
  const res = sim.state.resonance;
  res.gauge = 0;
  res.eveilT = RESONANCE.eveil.duration;
  res.novaT = 0.2;
  res.eveils++;
  sim.events.push(EV.EVEIL_START, 0, 0, 0, 0, RESONANCE.eveil.duration);
}

export function updateResonance(sim: RunSim): void {
  const res = sim.state.resonance;
  if (res.eveilT <= 0) return;
  res.eveilT -= DT;
  res.novaT -= DT;
  const player = sim.state.player.eid;
  if (res.novaT <= 0) {
    res.novaT = RESONANCE.eveil.novaInterval;
    // Nova : chaque impulsion porte un élément équipé différent (et déclenche des réactions).
    const mask = equippedMask(sim);
    let el = res.novaElement;
    for (let k = 0; k < ELEMENTS.length; k++) {
      el = (el + 1) % ELEMENTS.length;
      if (mask & (1 << el)) break;
    }
    res.novaElement = el;
    const stats = sim.state.player.stats;
    const r = RESONANCE.eveil.novaRadius * stats.areaMult;
    const x = Pos.x[player];
    const y = Pos.y[player];
    aoe(
      sim,
      x,
      y,
      r,
      RESONANCE.eveil.novaDamage * stats.damageMult,
      SLOT_EVEIL,
      120,
      0,
      0,
      0,
      el,
      2,
    );
    sim.events.push(EV.EVEIL_NOVA, el, 0, x, y, r);
  }
  if (res.eveilT <= 0) {
    res.eveilT = 0;
    sim.events.push(EV.EVEIL_END, 0, 0, 0, 0, 0);
  }
}
