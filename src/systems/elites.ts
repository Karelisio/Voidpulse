/**
 * Élites : multiplicateurs (PV, taille, dégâts…) et affixes tirés au hasard, 1 à 3 selon le
 * temps de jeu (progression.json). Effets continus (régénération, aura glaciale, bulle,
 * traînée, salves, invocations, téléportation, rage) et effets à la mort (fission, explosion).
 */
import {
  AFFIXES,
  BEHAVIOR_OF,
  BEHAVIORS,
  ENEMY_PARAM,
  PROGRESSION,
  affixIndex,
} from '../content/data';
import { Body, FOE_FLAG, Foe, Life, Look, Pos } from '../engine/components';
import { canSummon, radialBullets, spawnEnemy, summonAround } from './enemies';
import { ENEMY_ACTION, EV, TELEGRAPH_KIND } from './events';
import { slowPlayer } from './player';
import type { RunSim } from './sim';
import { spawnHazard, spawnZone, ZONE } from './zones';

const bit = (id: string): number => 1 << affixIndex(id);
const params = (id: string): Readonly<Record<string, number>> => AFFIXES[affixIndex(id)].params;

export const AFFIX = {
  SWIFT: bit('swift'),
  REGEN: bit('regen'),
  SPLITTING: bit('splitting'),
  FROSTAURA: bit('frostaura'),
  ARMORED: bit('armored'),
  SHIELDED: bit('shielded'),
  VOLATILE: bit('volatile'),
  SUMMONER: bit('summoner'),
  BLINKING: bit('blinking'),
  BERSERK: bit('berserk'),
  BURNING: bit('burning'),
  GUNNER: bit('gunner'),
} as const;

const SWIFT = params('swift');
const REGEN = params('regen');
const SPLITTING = params('splitting');
const FROSTAURA = params('frostaura');
const SHIELDED = params('shielded');
const VOLATILE = params('volatile');
const SUMMONER = params('summoner');
const BLINKING = params('blinking');
const BERSERK = params('berserk');
const BURNING = params('burning');
const GUNNER = params('gunner');
/** Multiplicateur des dégâts subis par une élite blindée. */
export const ARMORED_MULT = params('armored').damage;
/** Délai de recharge de la bulle (affixe Bouclier). */
export const BUBBLE_DELAY = SHIELDED.delay;
export const FROST_AURA_RADIUS = FROSTAURA.radius;

const TAU = Math.PI * 2;
const AFFIX_COLOR_FIRE = 0xff7a2f;
const GUNNER_TINT = 0xfff06a;
/** Affixes compatibles avec chaque comportement (masque). */
const ALLOWED = Uint16Array.from(
  BEHAVIORS.map((b) => AFFIXES.reduce((m, a, i) => (a.excludes.includes(b) ? m : m | (1 << i)), 0)),
);

/** Nombre d'affixes d'une élite apparue à l'instant `t`. */
export function affixesAt(t: number): number {
  let n = 0;
  for (const [t0, count] of PROGRESSION.elite.affixes) if (t >= t0) n = count;
  return n;
}

/** Transforme un ennemi fraîchement apparu en élite, avec `count` affixes au hasard. */
export function makeElite(sim: RunSim, e: number, count: number): void {
  const el = PROGRESSION.elite;
  const type = Foe.type[e];
  Foe.elite[e] = 1;
  Life.hp[e] *= el.hp;
  Life.max[e] = Life.hp[e];
  Body.r[e] *= el.scale;
  Body.mass[e] *= 3;
  Look.scale[e] = el.scale;
  Foe.dmg[e] *= el.damage;
  Foe.speed[e] *= el.speed;
  Foe.kbRes[e] = Math.max(Foe.kbRes[e], 0.8);
  Foe.xp[e] *= el.xp;
  if (Foe.shield[e] > 0) Foe.shield[e] = Life.max[e] * ENEMY_PARAM.shield[type];
  // Tirage sans remise parmi les affixes compatibles.
  let pool = ALLOWED[BEHAVIOR_OF[type]];
  let mask = 0;
  const rng = sim.rng.spawn;
  for (let k = 0; k < count && pool !== 0; k++) {
    let options = 0;
    for (let m = pool; m !== 0; m &= m - 1) options++;
    let pick = Math.floor(rng.next() * options);
    for (let i = 0; i < AFFIXES.length; i++) {
      if ((pool & (1 << i)) === 0) continue;
      if (pick-- === 0) {
        mask |= 1 << i;
        pool &= ~(1 << i);
        break;
      }
    }
  }
  applyAffixes(sim, e, mask);
}

/** Pose les affixes `mask` sur l'élite `e` (effets permanents, minuteurs de départ). */
export function applyAffixes(sim: RunSim, e: number, mask: number): void {
  const rng = sim.rng.spawn;
  Foe.affix[e] = mask;
  if (mask & AFFIX.SWIFT) Foe.speed[e] *= SWIFT.speed;
  if (mask & AFFIX.ARMORED) Foe.kbRes[e] = 1;
  if (mask & AFFIX.SHIELDED) {
    Foe.bubbleMax[e] = Life.max[e] * SHIELDED.hp;
    Foe.bubble[e] = Foe.bubbleMax[e];
  }
  if (mask & AFFIX.SUMMONER) Foe.summonT[e] = SUMMONER.cooldown * rng.range(0.4, 0.8);
  if (mask & AFFIX.GUNNER) Foe.gunT[e] = GUNNER.cooldown * rng.range(0.3, 0.7);
  if (mask & AFFIX.BLINKING) Foe.blinkT[e] = BLINKING.cooldown * rng.range(0.4, 0.8);
}

/**
 * Effets continus des affixes (appelé par updateEnemies pour les élites). Renvoie true si
 * l'élite vient de se téléporter (son déplacement du tick est alors abandonné).
 */
export function updateAffixes(
  sim: RunSim,
  e: number,
  d: number,
  frozen: boolean,
  edt: number,
): boolean {
  const m = Foe.affix[e];
  if (m & AFFIX.REGEN && Life.hp[e] < Life.max[e]) {
    Life.hp[e] = Math.min(Life.max[e], Life.hp[e] + REGEN.rate * Life.max[e] * edt);
  }
  if (m & AFFIX.FROSTAURA && d < FROSTAURA.radius) slowPlayer(sim, FROSTAURA.slow, 0.25);
  if (m & AFFIX.SHIELDED) {
    if (Foe.bubbleT[e] > 0) Foe.bubbleT[e] -= edt;
    else if (Foe.bubble[e] < Foe.bubbleMax[e]) Foe.bubble[e] = Foe.bubbleMax[e];
  }
  if (
    m & AFFIX.BERSERK &&
    (Foe.flags[e] & FOE_FLAG.ENRAGED) === 0 &&
    Life.hp[e] < BERSERK.threshold * Life.max[e]
  ) {
    Foe.flags[e] |= FOE_FLAG.ENRAGED;
    Foe.speed[e] *= BERSERK.speed;
    Foe.dmg[e] *= BERSERK.damage;
    Look.tint[e] = 0xff8080;
    sim.events.push(EV.ENEMY_ACTION, ENEMY_ACTION.ENRAGE, e, Pos.x[e], Pos.y[e], 0);
  }
  if (frozen) return false;
  const x = Pos.x[e];
  const y = Pos.y[e];
  if (m & AFFIX.BURNING) {
    Foe.trailT[e] -= edt;
    if (Foe.trailT[e] <= 0) {
      Foe.trailT[e] = BURNING.every;
      spawnHazard(sim, x, y, BURNING.radius, BURNING.dps, BURNING.time, 0, AFFIX_COLOR_FIRE);
    }
  }
  if (m & AFFIX.GUNNER) {
    Foe.gunT[e] -= edt;
    if (Foe.gunT[e] <= 0) {
      Foe.gunT[e] = GUNNER.cooldown * sim.rng.ai.range(0.9, 1.1);
      radialBullets(
        sim,
        x,
        y,
        GUNNER.count,
        sim.rng.ai.range(0, TAU),
        GUNNER.speed,
        GUNNER.damage,
        6,
        GUNNER_TINT,
        0,
        0,
      );
      sim.events.push(EV.ENEMY_ACTION, ENEMY_ACTION.VOLLEY, e, x, y, 0);
    }
  }
  if (m & AFFIX.SUMMONER) {
    Foe.summonT[e] -= edt;
    if (Foe.summonT[e] <= 0) {
      Foe.summonT[e] = SUMMONER.cooldown;
      if (canSummon(sim)) {
        const r = Body.r[e] + 30;
        summonAround(sim, e, sim.plan.swarm, SUMMONER.count, r);
        sim.events.push(EV.ENEMY_ACTION, ENEMY_ACTION.SUMMON, e, x, y, r);
      }
    }
  }
  if (m & AFFIX.BLINKING) {
    Foe.blinkT[e] -= edt;
    if (Foe.blinkT[e] <= 0) {
      if ((Foe.flags[e] & FOE_FLAG.BLINKING) === 0) {
        // Destination marquée au sol, près du joueur.
        const p = sim.state.player.eid;
        const a = sim.rng.ai.range(0, TAU);
        Foe.ax[e] = Pos.x[p] + Math.cos(a) * BLINKING.range;
        Foe.ay[e] = Pos.y[p] + Math.sin(a) * BLINKING.range;
        const z = spawnZone(
          sim,
          ZONE.BLINK_MARK,
          Foe.ax[e],
          Foe.ay[e],
          30,
          BLINKING.telegraph,
          0,
          0,
        );
        if (z >= 0) Look.tint[z] = 0xffd23d;
        sim.events.push(
          EV.TELEGRAPH,
          TELEGRAPH_KIND.BLINK,
          e,
          Foe.ax[e],
          Foe.ay[e],
          BLINKING.telegraph,
        );
        Foe.flags[e] |= FOE_FLAG.BLINKING;
        Foe.blinkT[e] = BLINKING.telegraph;
      } else {
        sim.events.push(EV.BLINK, e, 0, x, y, Foe.ax[e], Foe.ay[e]);
        Pos.x[e] = Foe.ax[e];
        Pos.y[e] = Foe.ay[e];
        Pos.px[e] = Pos.x[e];
        Pos.py[e] = Pos.y[e];
        Foe.flags[e] &= ~FOE_FLAG.BLINKING;
        Foe.blinkT[e] = BLINKING.cooldown * sim.rng.ai.range(0.85, 1.15);
        return true;
      }
    }
  }
  return false;
}

/** Effets d'affixes à la mort d'une élite : fission en copies, explosion différée. */
export function onEliteDeath(sim: RunSim, e: number): void {
  const m = Foe.affix[e];
  const x = Pos.x[e];
  const y = Pos.y[e];
  if (m & AFFIX.SPLITTING && (Foe.flags[e] & FOE_FLAG.CHILD) === 0) {
    const n = SPLITTING.count;
    const hp = Life.max[e] * SPLITTING.hp;
    const type = Foe.type[e];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + 0.4;
      const c = spawnEnemy(sim, type, x + Math.cos(a) * 28, y + Math.sin(a) * 28, 1);
      if (c < 0) break;
      Life.hp[c] = hp;
      Life.max[c] = hp;
      Look.scale[c] = 1.15;
      Body.r[c] *= 1.15;
      Foe.flags[c] |= FOE_FLAG.CHILD;
    }
    sim.events.push(EV.ENEMY_ACTION, ENEMY_ACTION.SPLIT, e, x, y, 0);
  }
  if (m & AFFIX.VOLATILE) {
    const z = spawnZone(
      sim,
      ZONE.VOLATILE,
      x,
      y,
      VOLATILE.radius,
      VOLATILE.fuse,
      VOLATILE.damage,
      0,
    );
    if (z >= 0) Look.tint[z] = 0xffb13d;
    sim.events.push(EV.ENEMY_ACTION, ENEMY_ACTION.VOLATILE, e, x, y, VOLATILE.radius);
  }
}
