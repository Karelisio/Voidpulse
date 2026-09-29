/**
 * Résonance : marques élémentaires, 15 réactions (une par paire d'éléments), jauge avec bonus
 * de diversité et rendement décroissant, Éveil de 8 s : chaque coup porte tous les éléments
 * équipés, et des impulsions prennent la forme de la réaction dominante (l'ultime fusionné),
 * jusqu'à une détonation finale.
 */
import { ELEMENTS, REACTIONS, RESONANCE, colorOf, reactionFor } from '../content/data';
import { FRAME } from '../content/frames';
import { Body, Life, MARK_SLOTS, Pos, SHOT_FLAG, Shot, Status } from '../engine/components';
import { DT } from '../engine/constants';
import {
  ARCANE,
  FIRE,
  POISON,
  STATUS_ONLY,
  aoe,
  hitFoe,
  liveBoss,
  releaseBuffer,
  spawnShot,
  takeBuffer,
} from './combat';
import { MAX_ENEMY_RADIUS } from './enemies';
import { EV, SLOT_EVEIL, SLOT_REACTION } from './events';
import type { RunSim } from './sim';
import type { ResonanceState } from './state';
import { nearestExcluding } from './weapons';
import { spawnSurge, spawnVapor, spawnWell } from './zones';

const EFFECT: Record<string, number> = {
  vapor: 0,
  overload: 1,
  superconduct: 2,
  deflagration: 3,
  nova: 4,
  blackflame: 5,
  necrocrystal: 6,
  prism: 7,
  absolutezero: 8,
  toxicchain: 9,
  surge: 10,
  rift: 11,
  plague: 12,
  corrosion: 13,
  implosion: 14,
};
const EFFECT_OF = Uint8Array.from(REACTIONS.map((r) => EFFECT[r.id] ?? 1));
const TINT = Uint32Array.from(REACTIONS.map((r) => colorOf(r.color)));

const RECENT = 16;
/** Fenêtre (s) pour déterminer la réaction dominante à l'entrée en Éveil. */
const DOMINANT_WINDOW = 30;

export function createResonance(): ResonanceState {
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
    dominant: -1,
  };
}

/** Masque des éléments équipés (armes). */
export function equippedMask(sim: RunSim): number {
  let mask = 0;
  const weapons = sim.state.weapons;
  for (let i = 0; i < weapons.length; i++) mask |= 1 << weapons[i].element;
  return mask;
}

/**
 * Applique la marque d'un élément à un ennemi ; si une autre marque est présente (et que la
 * recharge interne est prête), déclenche la réaction de la paire et consomme les marques.
 * Pendant l'Éveil, chaque coup marque de tous les éléments équipés.
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
      triggerReaction(sim, rid, Pos.x[e], Pos.y[e], e);
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

/** Réaction déclenchée sur l'ennemi `e` en (x, y) : effet, statistiques, jauge. */
export function triggerReaction(sim: RunSim, rid: number, x: number, y: number, e: number): void {
  const def = REACTIONS[rid];
  const res = sim.state.resonance;
  res.countById[rid]++;
  reactionEffect(sim, rid, x, y, e, 1, SLOT_REACTION);
  sim.events.push(EV.REACTION, rid, 0, x, y, def.radius * sim.state.player.stats.areaMult);
  if (res.eveilT <= 0) {
    res.gauge += def.gauge * gaugeMultiplier(sim, rid) * sim.state.player.stats.gaugeMult;
    if (res.gauge >= RESONANCE.gaugeMax) startEveil(sim);
  } else {
    // Pendant l'Éveil, la réaction nourrit tout de même la mémoire des paires récentes.
    res.recentIds[res.recentHead] = rid;
    res.recentTimes[res.recentHead] = sim.state.time;
    res.recentHead = (res.recentHead + 1) % RECENT;
  }
}

/**
 * Effet d'une réaction (sans statistiques ni jauge) : utilisé par les réactions et par la
 * forme ultime de l'Éveil (`scale` agrandit rayon et dégâts). `e` : ennemi source ou -1.
 */
export function reactionEffect(
  sim: RunSim,
  rid: number,
  x: number,
  y: number,
  e: number,
  scale: number,
  slot: number,
): void {
  const def = REACTIONS[rid];
  const stats = sim.state.player.stats;
  const r = def.radius * stats.areaMult * scale;
  const dmg = def.damage * stats.damageMult * scale;
  const tint = TINT[rid];
  switch (EFFECT_OF[rid]) {
    case 0: // Vapeur : nuage aveuglant qui ronge.
      spawnVapor(sim, x, y, r, def.duration, dmg, def.power);
      break;
    case 1: // Surcharge : explosion et recul.
      aoe(sim, x, y, r, dmg, slot, def.power, 0, 0, 0);
      break;
    case 2: // Supraconduction : étourdit, brise l'armure.
      aoe(sim, x, y, r, dmg, slot, 0, def.power, def.duration, 0);
      break;
    case 3: {
      // Déflagration : les toxines explosent et enflamment la zone.
      let stacks = 6;
      if (e >= 0) {
        stacks = Status.toxStacks[e];
        Status.toxStacks[e] = 0;
        Status.toxT[e] = 0;
      }
      const burn = def.damage * 0.3 * stats.damageMult * stats.elementMult[FIRE];
      aoe(
        sim,
        x,
        y,
        r,
        dmg + def.power * stacks * stats.damageMult * scale,
        slot,
        60,
        0,
        0,
        0,
        FIRE | STATUS_ONLY,
        burn,
      );
      break;
    }
    case 4: // Nova : salve d'éclats critiques en cercle.
      burstShards(
        sim,
        x,
        y,
        def.power,
        r,
        def.duration,
        dmg,
        FIRE | STATUS_ONLY,
        4,
        slot,
        FRAME.SHOT_ORB,
        tint,
        true,
      );
      break;
    case 5: {
      // Flamme noire : % des PV max, propagée à la mort (voir combat.processDeaths).
      const buf = takeBuffer(sim);
      if (!buf) break;
      const n = queryDisc(sim, x, y, r, buf);
      for (let i = 0; i < n; i++)
        Status.blackT[buf[i]] = Math.max(Status.blackT[buf[i]], def.duration);
      releaseBuffer(sim);
      break;
    }
    case 6: // Cristaux nécrotiques : éclats toxiques.
      burstShards(
        sim,
        x,
        y,
        def.power,
        r,
        0.45,
        dmg,
        POISON | STATUS_ONLY,
        def.duration,
        slot,
        FRAME.SHOT_SHARD,
        tint,
        false,
      );
      break;
    case 7: {
      // Prisme : gel de la cible, rayons réfractés vers les voisins.
      if (e >= 0 && e !== sim.state.boss.eid)
        Status.freezeT[e] = Math.max(Status.freezeT[e], def.duration);
      const list = sim.reactList;
      let n = 0;
      if (e >= 0) list[n++] = e;
      for (let k = 0; k < def.power && n < list.length; k++) {
        const t = nearestExcluding(sim, x, y, r, list, n);
        if (t < 0) break;
        list[n++] = t;
        sim.events.push(EV.BEAM, slot, ARCANE, x, y, Pos.x[t], Pos.y[t], true);
        hitFoe(sim, t, dmg, ARCANE | STATUS_ONLY, slot, 0.2, x, y, 0);
      }
      break;
    }
    case 8: {
      // Zéro absolu : stase ; exécution sous le seuil de PV.
      const buf = takeBuffer(sim);
      if (!buf) break;
      const n = queryDisc(sim, x, y, r, buf);
      const boss = sim.state.boss.eid;
      for (let i = 0; i < n; i++) {
        const o = buf[i];
        if (o === boss) continue;
        Status.stunT[o] = Math.max(Status.stunT[o], def.duration);
        Status.freezeT[o] = Math.max(Status.freezeT[o], def.duration);
        if (Life.hp[o] < def.power * Life.max[o]) {
          sim.state.stats.damageBySlot[slot] += Life.hp[o];
          sim.events.push(EV.HIT, o, slot | (1 << 16), Pos.x[o], Pos.y[o], Life.hp[o], 0, true);
          Life.hp[o] = 0;
        }
      }
      releaseBuffer(sim);
      aoe(sim, x, y, r, dmg, slot, 0, 0, 0, 0);
      break;
    }
    case 9: {
      // Chaîne toxique : arcs empoisonnés de proie en proie.
      const list = sim.reactList;
      let n = 0;
      let fx = x;
      let fy = y;
      let cur = e >= 0 && Life.hp[e] > 0 ? e : nearestExcluding(sim, x, y, r, list, 0);
      for (let k = 0; k < def.power && cur >= 0 && n < list.length; k++) {
        list[n++] = cur;
        const cx = Pos.x[cur];
        const cy = Pos.y[cur];
        if (k > 0) sim.events.push(EV.BEAM, slot, POISON, fx, fy, cx, cy, true);
        hitFoe(sim, cur, dmg, POISON | STATUS_ONLY, slot, def.duration, fx, fy, 0);
        fx = cx;
        fy = cy;
        cur = nearestExcluding(sim, cx, cy, r, list, n);
      }
      break;
    }
    case 10: // Surtension : orbe d'arcs en orbite.
      spawnSurge(sim, dmg, scale, tint);
      break;
    case 11: {
      // Faille : aspire et regroupe les ennemis au point de réaction.
      const buf = takeBuffer(sim);
      if (!buf) break;
      const n = queryDisc(sim, x, y, r, buf);
      const boss = sim.state.boss.eid;
      const rng = sim.rng.combat;
      for (let i = 0; i < n; i++) {
        const o = buf[i];
        if (o === boss) continue;
        const nx = x + rng.range(-18, 18);
        const ny = y + rng.range(-18, 18);
        Pos.x[o] = nx;
        Pos.y[o] = ny;
        Pos.px[o] = nx;
        Pos.py[o] = ny;
        Status.stunT[o] = Math.max(Status.stunT[o], def.power);
        hitFoe(sim, o, dmg, 255, slot, 0, x, y, 0);
      }
      releaseBuffer(sim);
      break;
    }
    case 12: {
      // Fléau : contamination (transmission des statuts à la mort, voir combat).
      const buf = takeBuffer(sim);
      if (!buf) break;
      const n = queryDisc(sim, x, y, r, buf);
      for (let i = 0; i < n; i++) {
        const o = buf[i];
        Status.plagueT[o] = Math.max(Status.plagueT[o], def.duration);
        hitFoe(sim, o, dmg, 255, slot, 0, x, y, 0);
      }
      releaseBuffer(sim);
      break;
    }
    case 13: {
      // Corrosion : armure fondue et poison en % des PV max.
      const buf = takeBuffer(sim);
      if (!buf) break;
      const n = queryDisc(sim, x, y, r, buf);
      for (let i = 0; i < n; i++) {
        const o = buf[i];
        Status.corrodeT[o] = Math.max(Status.corrodeT[o], def.duration);
        Status.brittleT[o] = Math.max(Status.brittleT[o], def.duration);
      }
      releaseBuffer(sim);
      break;
    }
    case 14: // Implosion : puits gravitationnel puis détonation.
      spawnWell(sim, x, y, scale, dmg, tint);
      break;
  }
}

/** Ennemis vivants (et boss) dont le corps touche le disque (x, y, r), écrits dans `out`. */
function queryDisc(sim: RunSim, x: number, y: number, r: number, out: Int32Array): number {
  const count = sim.grid.query(x, y, r + MAX_ENEMY_RADIUS, out);
  let n = 0;
  for (let i = 0; i < count; i++) {
    const o = out[i];
    if (Life.hp[o] <= 0) continue;
    const dx = Pos.x[o] - x;
    const dy = Pos.y[o] - y;
    const rr = r + Body.r[o];
    if (dx * dx + dy * dy <= rr * rr) out[n++] = o;
  }
  const boss = liveBoss(sim);
  if (boss >= 0 && n < out.length) {
    const dx = Pos.x[boss] - x;
    const dy = Pos.y[boss] - y;
    const rr = r + Body.r[boss];
    if (dx * dx + dy * dy <= rr * rr) out[n++] = boss;
  }
  return n;
}

/** Salve d'éclats en étoile depuis (x, y), portée r en `ttl` secondes. */
function burstShards(
  sim: RunSim,
  x: number,
  y: number,
  count: number,
  r: number,
  ttl: number,
  dmg: number,
  element: number,
  power: number,
  slot: number,
  frame: number,
  tint: number,
  crit: boolean,
): void {
  const base = sim.rng.combat.range(0, Math.PI * 2);
  for (let k = 0; k < count; k++) {
    const s = spawnShot(
      sim,
      x,
      y,
      base + (k / count) * Math.PI * 2,
      r / ttl,
      dmg,
      element,
      power,
      slot,
      1,
      ttl,
      8,
      frame,
      tint,
    );
    if (s < 0) return;
    if (crit) Shot.flags[s] |= SHOT_FLAG.CRIT;
  }
}

/** Réaction dominante : la plus fréquente dans la fenêtre récente (la plus récente à égalité). */
function dominantReaction(sim: RunSim): number {
  const res = sim.state.resonance;
  const now = sim.state.time;
  let best = -1;
  let bestCount = 0;
  for (let k = 0; k < RECENT; k++) {
    // Parcours de la plus récente à la plus ancienne.
    const i = (res.recentHead - 1 - k + RECENT) % RECENT;
    const id = res.recentIds[i];
    if (id < 0 || now - res.recentTimes[i] > DOMINANT_WINDOW) continue;
    let c = 0;
    for (let j = 0; j < RECENT; j++) {
      if (res.recentIds[j] === id && now - res.recentTimes[j] <= DOMINANT_WINDOW) c++;
    }
    if (c > bestCount) {
      best = id;
      bestCount = c;
    }
  }
  if (best >= 0) return best;
  for (let i = 0; i < res.countById.length; i++) {
    if (res.countById[i] > bestCount) {
      best = i;
      bestCount = res.countById[i];
    }
  }
  if (best >= 0) return best;
  // Aucune réaction encore : paire des deux premiers éléments équipés.
  const mask = equippedMask(sim);
  let a = -1;
  for (let k = 0; k < ELEMENTS.length; k++) {
    if (!(mask & (1 << k))) continue;
    if (a < 0) a = k;
    else return reactionFor(a, k);
  }
  return -1;
}

export function startEveil(sim: RunSim): void {
  const res = sim.state.resonance;
  res.gauge = 0;
  res.eveilT = RESONANCE.eveil.duration;
  res.novaT = 0.2;
  res.eveils++;
  res.dominant = dominantReaction(sim);
  sim.events.push(EV.EVEIL_START, res.dominant, 0, 0, 0, RESONANCE.eveil.duration);
}

export function updateResonance(sim: RunSim): void {
  const res = sim.state.resonance;
  if (res.eveilT <= 0) return;
  res.eveilT -= DT;
  res.novaT -= DT;
  const player = sim.state.player.eid;
  const stats = sim.state.player.stats;
  const x = Pos.x[player];
  const y = Pos.y[player];
  const ev = RESONANCE.eveil;
  if (res.novaT <= 0) {
    res.novaT = ev.novaInterval;
    // Impulsion : chaque impulsion porte un élément équipé différent (et déclenche des réactions).
    const mask = equippedMask(sim);
    let el = res.novaElement;
    for (let k = 0; k < ELEMENTS.length; k++) {
      el = (el + 1) % ELEMENTS.length;
      if (mask & (1 << el)) break;
    }
    res.novaElement = el;
    const r = ev.novaRadius * stats.areaMult;
    aoe(sim, x, y, r, ev.novaDamage * stats.damageMult, SLOT_EVEIL, 120, 0, 0, 0, el, 2);
    sim.events.push(EV.EVEIL_NOVA, el, 0, x, y, r);
    // Forme ultime : l'effet de la réaction dominante accompagne chaque impulsion.
    if (res.dominant >= 0) {
      reactionEffect(sim, res.dominant, x, y, -1, ev.ultimateScale, SLOT_EVEIL);
      sim.events.push(
        EV.REACTION,
        res.dominant,
        1,
        x,
        y,
        REACTIONS[res.dominant].radius * stats.areaMult * ev.ultimateScale,
      );
    }
  }
  if (res.eveilT <= 0) {
    res.eveilT = 0;
    const r = ev.finaleRadius * stats.areaMult;
    aoe(sim, x, y, r, ev.finaleDamage * stats.damageMult, SLOT_EVEIL, 220, 0.6, 0, 0);
    if (res.dominant >= 0) reactionEffect(sim, res.dominant, x, y, -1, 1.5, SLOT_EVEIL);
    sim.events.push(EV.EVEIL_FINALE, res.dominant, 0, x, y, r);
    sim.events.push(EV.EVEIL_END, 0, 0, 0, 0, 0);
    res.dominant = -1;
  }
}
