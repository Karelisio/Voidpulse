/**
 * Ennemis : apparition, 13 comportements (essaim, tank, tireur, kamikaze, téléporteur,
 * invocateur, bouclier, chargeur, mortier, tourelle, soutien, fouisseur, ruée), traits communs
 * (ondulation, bonds, traînée), séparation des foules et contact. Dans une faille temporelle,
 * leurs déplacements et minuteurs tournent au ralenti (edt).
 */
import {
  BEHAVIOR_OF,
  ENEMIES,
  ENEMY_ELEMENT,
  ENEMY_MINION,
  ENEMY_PARAM,
  PLAYER,
  PROGRESSION,
  RUN_EVENTS,
  colorOf,
} from '../content/data';
import { FRAME } from '../content/frames';
import {
  Body,
  Bullet,
  FOE_FLAG,
  Foe,
  Life,
  Look,
  Pos,
  Status,
  Vel,
  Zone,
} from '../engine/components';
import { DT } from '../engine/constants';
import { releaseBuffer, takeBuffer } from './combat';
import { updateAffixes } from './elites';
import { ENEMY_ACTION, EV, TELEGRAPH_KIND } from './events';
import { damagePlayer, slowPlayer } from './player';
import type { RunSim } from './sim';
import { spawnHazard, spawnLineZone, spawnWarn, spawnZone, ZONE } from './zones';

export { BEHAVIOR_OF };

/** Index de comportement (ordre de BEHAVIORS, config/keys.ts). */
export const BEHAVIOR = {
  swarm: 0,
  tank: 1,
  shooter: 2,
  kamikaze: 3,
  teleporter: 4,
  summoner: 5,
  shield: 6,
  charger: 7,
  mortar: 8,
  turret: 9,
  support: 10,
  burrower: 11,
  stampede: 12,
} as const;

/** Plus grand rayon d'ennemi ordinaire ou élite (marge des requêtes de grille). */
export const MAX_ENEMY_RADIUS = Math.max(...ENEMIES.map((e) => e.radius)) * PROGRESSION.elite.scale;

/** Couleur de chaque type (teinte des projectiles, flaques et télégraphes). */
export const ENEMY_COLOR = Uint32Array.from(ENEMIES.map((e) => colorOf(e.color)));

/**
 * États : déplacement, préparation (télégraphe, visée, incantation, élan), explosé (kamikaze :
 * pas de mort créditée), ruée, récupération, enfouissement, sous terre, surgissement, disparu
 * (ruée sortie de l'écran : retiré sans butin).
 */
export const STATE = {
  MOVE: 0,
  CHARGE: 1,
  EXPLODED: 2,
  DASH: 3,
  RECOVER: 4,
  DIG: 5,
  UNDER: 6,
  EMERGE: 7,
  GONE: 8,
} as const;

/** Au-delà de cette distance au joueur, un ennemi est replacé devant lui. */
const RELOCATE_DISTANCE = 1500;
const TAU = Math.PI * 2;
const DIG_TIME = 0.45;
/** Durée de vie d'un membre de la horde dorée (s). */
const STAMPEDE_LIFE = 9;
/** Distance que les soutiens gardent avec le joueur. */
const SUPPORT_RANGE = 240;
/** Tourelle : distance sous laquelle elle cesse d'avancer. */
const TURRET_HOLD = 190;

const P = ENEMY_PARAM;

export function spawnEnemy(
  sim: RunSim,
  type: number,
  x: number,
  y: number,
  hpScale: number,
): number {
  const e = sim.spawnIn(sim.world.enemies);
  if (e < 0) return -1;
  const def = ENEMIES[type];
  Pos.x[e] = x;
  Pos.y[e] = y;
  Pos.px[e] = x;
  Pos.py[e] = y;
  Body.r[e] = def.radius;
  Body.mass[e] = def.mass;
  const mods = sim.state.pacts.mods;
  Life.hp[e] = def.hp * hpScale * mods.enemyHp;
  Life.max[e] = Life.hp[e];
  Foe.type[e] = type;
  Foe.state[e] = STATE.MOVE;
  Foe.speed[e] = def.speed * mods.enemySpeed * sim.rng.spawn.range(0.9, 1.1);
  Foe.dmg[e] = def.damage;
  Foe.xp[e] = def.xp;
  Foe.kbRes[e] = def.knockbackRes;
  const p = sim.state.player.eid;
  Foe.face[e] = Math.atan2(Pos.y[p] - y, Pos.x[p] - x);
  Look.rot[e] = Foe.face[e];
  const rng = sim.rng.spawn;
  switch (BEHAVIOR_OF[type]) {
    case BEHAVIOR.shooter:
    case BEHAVIOR.mortar:
    case BEHAVIOR.turret:
      Foe.t0[e] = rng.range(0.6, P.fireCooldown[type]);
      break;
    case BEHAVIOR.teleporter:
      Foe.t0[e] = rng.range(1, P.blinkCooldown[type]);
      break;
    case BEHAVIOR.summoner:
      Foe.t0[e] = rng.range(1.5, P.summonCooldown[type]);
      break;
    case BEHAVIOR.charger:
      Foe.t0[e] = rng.range(0.8, P.chargeCooldown[type]);
      break;
    case BEHAVIOR.support:
      Foe.t0[e] = rng.range(0.2, P.pulse[type]);
      break;
    case BEHAVIOR.burrower:
      Foe.t0[e] = rng.range(1, P.burrowCooldown[type]);
      break;
    case BEHAVIOR.shield:
      Foe.shield[e] = Life.max[e] * P.shield[type];
      break;
    case BEHAVIOR.stampede:
      Foe.t1[e] = STAMPEDE_LIFE;
      break;
  }
  if (P.trailEvery[type] > 0) Foe.t2[e] = rng.range(0, P.trailEvery[type]);
  Look.frame[e] = FRAME.ENEMY_BASE + type;
  const stats = sim.state.stats;
  if (sim.world.enemies.count > stats.peakEnemies) stats.peakEnemies = sim.world.enemies.count;
  return e;
}

/** Créatures invoquées autour de `e` (XP réduite, jamais de pièce). */
export function summonAround(
  sim: RunSim,
  e: number,
  type: number,
  count: number,
  radius: number,
): void {
  if (type < 0) return;
  const hpScale = sim.state.director.hpScale;
  const a0 = sim.rng.ai.range(0, TAU);
  for (let k = 0; k < count; k++) {
    const a = a0 + (k / count) * TAU;
    const m = spawnEnemy(
      sim,
      type,
      Pos.x[e] + Math.cos(a) * radius,
      Pos.y[e] + Math.sin(a) * radius,
      hpScale,
    );
    if (m < 0) return;
    Foe.flags[m] |= FOE_FLAG.SUMMONED;
    Foe.xp[m] *= 0.5;
  }
}

/** Les invocations s'arrêtent quand la foule dépasse nettement la densité visée. */
export function canSummon(sim: RunSim): boolean {
  const pool = sim.world.enemies;
  return pool.count < Math.min(pool.capacity - 80, sim.state.director.target * 1.35 + 30);
}

export function fireBullet(
  sim: RunSim,
  x: number,
  y: number,
  dx: number,
  dy: number,
  speed: number,
  dmg: number,
  radius = 6,
  tint = BULLET_TINT,
  slow = 0,
  slowT = 0,
): void {
  const b = sim.spawnIn(sim.world.bullets);
  if (b < 0) return;
  Pos.x[b] = x;
  Pos.y[b] = y;
  Pos.px[b] = x;
  Pos.py[b] = y;
  const k = speed * sim.state.pacts.mods.bulletSpeed;
  Vel.x[b] = dx * k;
  Vel.y[b] = dy * k;
  Bullet.dmg[b] = dmg;
  Bullet.ttl[b] = 6;
  Bullet.r[b] = radius;
  Bullet.slow[b] = slow;
  Bullet.slowT[b] = slowT;
  Look.frame[b] = FRAME.BULLET_TINT;
  Look.tint[b] = tint;
  Look.scale[b] = radius / 6;
}

/** Teinte par défaut des projectiles ennemis (boss). */
export const BULLET_TINT = 0xff4d6d;

/** Salve en étoile de `count` projectiles à partir de l'angle `a0`. */
export function radialBullets(
  sim: RunSim,
  x: number,
  y: number,
  count: number,
  a0: number,
  speed: number,
  dmg: number,
  radius: number,
  tint: number,
  slow: number,
  slowT: number,
): void {
  for (let k = 0; k < count; k++) {
    const a = a0 + (k / count) * TAU;
    fireBullet(sim, x, y, Math.cos(a), Math.sin(a), speed, dmg, radius, tint, slow, slowT);
  }
}

/** Tir d'un tireur : `count` projectiles en éventail d'ouverture `spread` autour de `angle`. */
function fireSpread(sim: RunSim, type: number, x: number, y: number, angle: number): void {
  const count = Math.max(1, P.count[type]);
  const spread = P.spread[type];
  const radius = P.bulletRadius[type] || 6;
  for (let k = 0; k < count; k++) {
    const a = count > 1 ? angle + (k / (count - 1) - 0.5) * spread : angle;
    fireBullet(
      sim,
      x,
      y,
      Math.cos(a),
      Math.sin(a),
      P.bulletSpeed[type],
      P.bulletDamage[type],
      radius,
      ENEMY_COLOR[type],
      P.slow[type],
      P.slowTime[type],
    );
  }
}

/** Explosion d'un kamikaze : souffle, épines, flaque, ralentissement ; pas de mort créditée. */
function explode(sim: RunSim, e: number, type: number, x: number, y: number, d: number): void {
  const radius = P.blastRadius[type];
  if (d < radius + PLAYER.radius) {
    damagePlayer(sim, P.blastDamage[type]);
    if (P.slow[type] > 0) slowPlayer(sim, P.slow[type], P.slowTime[type]);
  }
  sim.events.push(EV.EXPLOSION, 0, 0, x, y, radius, ENEMY_ELEMENT[type]);
  const spikes = P.deathBullets[type];
  if (spikes > 0) {
    radialBullets(
      sim,
      x,
      y,
      spikes,
      sim.rng.ai.range(0, TAU),
      P.bulletSpeed[type],
      P.bulletDamage[type],
      5,
      ENEMY_COLOR[type],
      0,
      0,
    );
  }
  if (P.poolTime[type] > 0) {
    spawnHazard(
      sim,
      x,
      y,
      P.poolRadius[type],
      P.poolDps[type],
      P.poolTime[type],
      ENEMY_ELEMENT[type],
      ENEMY_COLOR[type],
    );
  }
  Foe.state[e] = STATE.EXPLODED;
  Life.hp[e] = 0;
}

/** Retire un ennemi sans mort créditée (ruée sortie du champ). */
function vanish(e: number): void {
  Foe.state[e] = STATE.GONE;
  Life.hp[e] = 0;
}

/** Obus de mortier : cible le joueur en anticipant un peu son déplacement. */
function launchShell(sim: RunSim, e: number, type: number, x: number, y: number): void {
  const pe = sim.state.player.eid;
  const flight = P.flight[type];
  const tx = Pos.x[pe] + Vel.x[pe] * flight * 0.4;
  const ty = Pos.y[pe] + Vel.y[pe] * flight * 0.4;
  const z = spawnZone(
    sim,
    ZONE.MORTAR,
    tx,
    ty,
    P.blastRadius[type],
    flight,
    P.blastDamage[type],
    type,
  );
  if (z >= 0) {
    // Origine de l'obus (arc dessiné par le rendu), élément de la flaque éventuelle.
    Zone.w[z] = x;
    Zone.h[z] = y;
    Zone.element[z] = ENEMY_ELEMENT[type];
    Look.tint[z] = ENEMY_COLOR[type];
  }
  Look.flash[e] = 0.1;
  sim.events.push(EV.ENEMY_ACTION, ENEMY_ACTION.MORTAR, e, x, y, 0);
}

/** Impulsion d'un soutien : protège ou soigne les alliés dans son aura. */
function supportPulse(sim: RunSim, e: number, type: number, x: number, y: number): void {
  const r = P.auraRadius[type];
  const buf = takeBuffer(sim);
  if (!buf) return;
  const n = sim.grid.query(x, y, r + MAX_ENEMY_RADIUS, buf);
  const guard = P.guard[type];
  const heal = P.heal[type];
  const hold = P.pulse[type] + 0.25;
  let healed = 0;
  for (let k = 0; k < n; k++) {
    const o = buf[k];
    if (o === e || Life.hp[o] <= 0 || Foe.hidden[o] !== 0) continue;
    const ox = Pos.x[o] - x;
    const oy = Pos.y[o] - y;
    if (ox * ox + oy * oy > r * r) continue;
    if (guard > 0) {
      Foe.guardT[o] = hold;
      Foe.guard[o] = guard;
    }
    if (heal > 0 && Life.hp[o] < Life.max[o]) {
      Life.hp[o] = Math.min(Life.max[o], Life.hp[o] + heal * Life.max[o]);
      healed++;
    }
  }
  releaseBuffer(sim);
  if (healed > 0) sim.events.push(EV.ENEMY_ACTION, ENEMY_ACTION.HEAL, e, x, y, r);
}

export function updateEnemies(sim: RunSim): void {
  const pool = sim.world.enemies;
  const st = sim.state;
  const player = st.player.eid;
  const px = Pos.x[player];
  const py = Pos.y[player];
  const time = st.time;
  const tick = st.tick;
  const boss = st.boss.eid;
  const bossAlive = boss >= 0 && sim.world.boss.isActive(boss);
  const edt = st.events.riftT > 0 ? DT * RUN_EVENTS.rift.slow : DT;
  // Terrain du stage : eaux lentes (réglage du stage) ou bourbier.
  const mech = st.stage.mechanic;
  const envSlow = 1 - (mech.kind === 'water' ? mech.power : 0.25);

  for (let i = pool.count - 1; i >= 0; i--) {
    const e = pool.active[i];
    if (Life.hp[e] <= 0) continue;
    const type = Foe.type[e];
    const beh = BEHAVIOR_OF[type];
    const x = Pos.x[e];
    const y = Pos.y[e];
    let dx = px - x;
    let dy = py - y;
    const d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
    dx /= d;
    dy /= d;

    const frozen = Status.freezeT[e] > 0 || Status.stunT[e] > 0;
    const slowed = 1 - 0.55 * Status.chill[e];
    let speed = Foe.speed[e] * slowed;
    if (Foe.envT[e] > 0) {
      Foe.envT[e] -= DT;
      speed *= envSlow;
    }
    const blind = Status.blindT[e] > 0;
    if (blind && beh !== BEHAVIOR.stampede) {
      // Aveuglé (vapeur) : erre dans une direction pseudo-aléatoire stable.
      const a = e * 1.7 + time * 1.3;
      dx = Math.cos(a);
      dy = Math.sin(a);
      speed *= 0.5;
    }

    let vx = 0;
    let vy = 0;
    let contact = 1;
    /** Distance à garder avec le joueur (tireurs, invocateurs, mortiers, soutiens), 0 sinon. */
    let keep = 0;
    if (!frozen) {
      switch (beh) {
        case BEHAVIOR.shooter: {
          const range = P.range[type];
          const sniper = P.sniper[type] > 0;
          if (Foe.state[e] === STATE.MOVE) {
            keep = range;
            Foe.t0[e] -= edt;
            if (Foe.t0[e] <= 0 && d < range * 1.3 && !blind) {
              const tele = P.telegraph[type] || 0.35;
              Foe.state[e] = STATE.CHARGE;
              Foe.t1[e] = tele;
              Foe.tx[e] = dx;
              Foe.ty[e] = dy;
              Foe.face[e] = Math.atan2(dy, dx);
              if (sniper) {
                const z = spawnLineZone(sim, x, y, range * 1.25, 5, Foe.face[e], tele);
                if (z >= 0) Look.tint[z] = ENEMY_COLOR[type];
                sim.events.push(EV.ENEMY_ACTION, ENEMY_ACTION.AIM, e, x, y, 0);
              } else {
                sim.events.push(EV.TELEGRAPH, TELEGRAPH_KIND.SHOOTER, e, x, y, tele, 0, true);
              }
            }
          } else {
            Look.flash[e] = 0.05;
            // Les tireurs ordinaires visent au dernier moment ; le tireur d'élite garde sa ligne.
            if (!sniper) Foe.face[e] = Math.atan2(dy, dx);
            Foe.t1[e] -= edt;
            if (Foe.t1[e] <= 0) {
              fireSpread(sim, type, x, y, Foe.face[e]);
              if (sniper) sim.events.push(EV.ENEMY_ACTION, ENEMY_ACTION.SNIPE, e, x, y, 0);
              else sim.events.push(EV.ENEMY_SHOT, e, 0, x, y, 0, 0, true);
              Foe.state[e] = STATE.MOVE;
              Foe.t0[e] = P.fireCooldown[type] * sim.rng.ai.range(0.85, 1.15);
            }
          }
          break;
        }
        case BEHAVIOR.kamikaze: {
          if (Foe.state[e] === STATE.MOVE) {
            vx = dx * speed;
            vy = dy * speed;
            if (d < P.triggerRange[type] && !blind) {
              Foe.state[e] = STATE.CHARGE;
              Foe.t0[e] = P.fuse[type];
              sim.events.push(EV.TELEGRAPH, TELEGRAPH_KIND.KAMIKAZE, e, x, y, Foe.t0[e]);
            }
          } else {
            Look.flash[e] = tick % 8 < 4 ? 0.06 : 0;
            Foe.t0[e] -= edt;
            if (Foe.t0[e] <= 0) {
              explode(sim, e, type, x, y, d);
              continue;
            }
          }
          break;
        }
        case BEHAVIOR.teleporter: {
          if (Foe.state[e] === STATE.MOVE) {
            vx = dx * speed;
            vy = dy * speed;
            Foe.t0[e] -= edt;
            if (Foe.t0[e] <= 0 && d < 650 && !blind) {
              const telegraph = P.telegraph[type];
              const a = sim.rng.ai.range(0, TAU);
              const r = P.blinkRange[type];
              Foe.tx[e] = px + Math.cos(a) * r;
              Foe.ty[e] = py + Math.sin(a) * r;
              Foe.state[e] = STATE.CHARGE;
              Foe.t1[e] = telegraph;
              const z = spawnZone(sim, ZONE.BLINK_MARK, Foe.tx[e], Foe.ty[e], 24, telegraph, 0, 0);
              if (z >= 0) Look.tint[z] = ENEMY_COLOR[type];
              sim.events.push(
                EV.TELEGRAPH,
                TELEGRAPH_KIND.BLINK,
                e,
                Foe.tx[e],
                Foe.ty[e],
                telegraph,
              );
            }
          } else {
            Foe.t1[e] -= edt;
            Look.alpha[e] = 0.4 + 0.6 * Math.max(0, Foe.t1[e] / P.telegraph[type]);
            if (Foe.t1[e] <= 0) {
              sim.events.push(EV.BLINK, e, 0, x, y, Foe.tx[e], Foe.ty[e]);
              Pos.x[e] = Foe.tx[e];
              Pos.y[e] = Foe.ty[e];
              Pos.px[e] = Pos.x[e];
              Pos.py[e] = Pos.y[e];
              Look.alpha[e] = 1;
              Foe.state[e] = STATE.MOVE;
              Foe.t0[e] = P.blinkCooldown[type] * sim.rng.ai.range(0.85, 1.15);
              continue;
            }
          }
          break;
        }
        case BEHAVIOR.summoner: {
          const range = P.range[type];
          if (Foe.state[e] === STATE.MOVE) {
            keep = range;
            Foe.t0[e] -= edt;
            if (Foe.t0[e] <= 0 && d < range * 1.8 && !blind) {
              if (canSummon(sim)) {
                Foe.state[e] = STATE.CHARGE;
                Foe.t1[e] = P.cast[type];
                sim.events.push(EV.TELEGRAPH, TELEGRAPH_KIND.CAST, e, x, y, P.cast[type], 0, true);
              } else Foe.t0[e] = 1;
            }
          } else {
            Look.flash[e] = (tick & 7) < 4 ? 0.05 : 0;
            Foe.t1[e] -= edt;
            if (Foe.t1[e] <= 0) {
              const r = Body.r[e] + 26;
              summonAround(sim, e, ENEMY_MINION[type], P.summonCount[type], r);
              sim.events.push(EV.ENEMY_ACTION, ENEMY_ACTION.SUMMON, e, x, y, r);
              Foe.state[e] = STATE.MOVE;
              Foe.t0[e] = P.summonCooldown[type] * sim.rng.ai.range(0.85, 1.15);
            }
          }
          break;
        }
        case BEHAVIOR.shield: {
          // Le bouclier pivote vers le joueur à vitesse limitée : le contourner expose le flanc.
          let diff = Math.atan2(dy, dx) - Foe.face[e];
          diff -= Math.round(diff / TAU) * TAU;
          const turn = P.turnRate[type] * edt;
          Foe.face[e] += diff > turn ? turn : diff < -turn ? -turn : diff;
          vx = dx * speed;
          vy = dy * speed;
          break;
        }
        case BEHAVIOR.charger: {
          const s = Foe.state[e];
          if (s === STATE.MOVE) {
            vx = dx * speed;
            vy = dy * speed;
            Foe.t0[e] -= edt;
            if (Foe.t0[e] <= 0 && d < P.chargeRange[type] && !blind) {
              Foe.state[e] = STATE.CHARGE;
              Foe.t1[e] = P.windup[type];
              Foe.tx[e] = dx;
              Foe.ty[e] = dy;
              Foe.face[e] = Math.atan2(dy, dx);
              const len = P.dashSpeed[type] * P.dashTime[type] + Body.r[e];
              const z = spawnLineZone(sim, x, y, len, Body.r[e] * 2, Foe.face[e], P.windup[type]);
              if (z >= 0) Look.tint[z] = ENEMY_COLOR[type];
              sim.events.push(EV.ENEMY_ACTION, ENEMY_ACTION.CHARGE, e, x, y, 0);
            }
          } else if (s === STATE.CHARGE) {
            Look.flash[e] = (tick & 3) < 2 ? 0.05 : 0;
            Foe.t1[e] -= edt;
            if (Foe.t1[e] <= 0) {
              Foe.state[e] = STATE.DASH;
              Foe.t1[e] = P.dashTime[type];
              sim.events.push(EV.ENEMY_ACTION, ENEMY_ACTION.DASH, e, x, y, 0);
            }
          } else if (s === STATE.DASH) {
            vx = Foe.tx[e] * P.dashSpeed[type] * slowed;
            vy = Foe.ty[e] * P.dashSpeed[type] * slowed;
            contact = 1.25;
            Foe.t1[e] -= edt;
            if (Foe.t1[e] <= 0) {
              Foe.state[e] = STATE.RECOVER;
              Foe.t1[e] = P.recover[type];
            }
          } else {
            vx = dx * speed * 0.3;
            vy = dy * speed * 0.3;
            Foe.t1[e] -= edt;
            if (Foe.t1[e] <= 0) {
              Foe.state[e] = STATE.MOVE;
              Foe.t0[e] = P.chargeCooldown[type] * sim.rng.ai.range(0.85, 1.15);
            }
          }
          break;
        }
        case BEHAVIOR.mortar: {
          const range = P.range[type];
          keep = range;
          Foe.t0[e] -= edt;
          if (Foe.t0[e] <= 0 && d < range * 1.35 && !blind) {
            Foe.t0[e] = P.fireCooldown[type] * sim.rng.ai.range(0.85, 1.15);
            launchShell(sim, e, type, x, y);
          }
          break;
        }
        case BEHAVIOR.turret: {
          if (d > TURRET_HOLD) {
            vx = dx * speed;
            vy = dy * speed;
          }
          Foe.face[e] += 0.5 * edt;
          if (Foe.state[e] === STATE.MOVE) {
            Foe.t0[e] -= edt;
            if (Foe.t0[e] <= 0 && d < 720) {
              Foe.state[e] = STATE.CHARGE;
              Foe.t1[e] = P.telegraph[type] || 0.4;
              sim.events.push(EV.TELEGRAPH, TELEGRAPH_KIND.VOLLEY, e, x, y, Foe.t1[e], 0, true);
            }
          } else {
            Look.flash[e] = (tick & 3) < 2 ? 0.05 : 0;
            Foe.t1[e] -= edt;
            if (Foe.t1[e] <= 0) {
              Foe.t2[e] += P.spin[type];
              radialBullets(
                sim,
                x,
                y,
                P.count[type],
                Foe.face[e] + Foe.t2[e],
                P.bulletSpeed[type],
                P.bulletDamage[type],
                P.bulletRadius[type] || 6,
                ENEMY_COLOR[type],
                P.slow[type],
                P.slowTime[type],
              );
              sim.events.push(EV.ENEMY_ACTION, ENEMY_ACTION.VOLLEY, e, x, y, 0);
              Foe.state[e] = STATE.MOVE;
              Foe.t0[e] = P.fireCooldown[type] * sim.rng.ai.range(0.9, 1.1);
            }
          }
          break;
        }
        case BEHAVIOR.support: {
          keep = SUPPORT_RANGE;
          Foe.t0[e] -= edt;
          if (Foe.t0[e] <= 0) {
            Foe.t0[e] = P.pulse[type];
            supportPulse(sim, e, type, x, y);
          }
          break;
        }
        case BEHAVIOR.burrower: {
          const s = Foe.state[e];
          if (s === STATE.MOVE) {
            vx = dx * speed;
            vy = dy * speed;
            Foe.t0[e] -= edt;
            if (Foe.t0[e] <= 0 && d < 560 && !blind) {
              Foe.state[e] = STATE.DIG;
              Foe.t1[e] = DIG_TIME;
              sim.events.push(EV.ENEMY_ACTION, ENEMY_ACTION.BURROW, e, x, y, 0);
            }
          } else if (s === STATE.DIG) {
            Foe.t1[e] -= edt;
            Look.alpha[e] = Math.max(0.2, Foe.t1[e] / DIG_TIME);
            if (Foe.t1[e] <= 0) {
              Foe.state[e] = STATE.UNDER;
              Foe.t1[e] = P.burrowTime[type];
              Foe.hidden[e] = 1;
              Look.frame[e] = FRAME.MOUND;
              Look.alpha[e] = 1;
            }
          } else if (s === STATE.UNDER) {
            vx = dx * P.digSpeed[type] * slowed;
            vy = dy * P.digSpeed[type] * slowed;
            Foe.t1[e] -= edt;
            if (d < 24 || Foe.t1[e] <= 0) {
              Foe.state[e] = STATE.EMERGE;
              Foe.t1[e] = P.telegraph[type];
              spawnWarn(sim, x, y, P.emergeRadius[type], P.telegraph[type], ENEMY_COLOR[type]);
            }
          } else {
            Foe.t1[e] -= edt;
            if (Foe.t1[e] <= 0) {
              Foe.hidden[e] = 0;
              Look.frame[e] = FRAME.ENEMY_BASE + type;
              const r = P.emergeRadius[type];
              if (d < r + PLAYER.radius) damagePlayer(sim, P.emergeDamage[type]);
              sim.events.push(EV.EXPLOSION, 7, 0, x, y, r, 255);
              sim.events.push(EV.ENEMY_ACTION, ENEMY_ACTION.EMERGE, e, x, y, r);
              Foe.state[e] = STATE.MOVE;
              Foe.t0[e] = P.burrowCooldown[type] * sim.rng.ai.range(0.85, 1.15);
            }
          }
          break;
        }
        case BEHAVIOR.stampede: {
          vx = Foe.tx[e] * speed;
          vy = Foe.ty[e] * speed;
          Foe.t1[e] -= edt;
          if (Foe.t1[e] <= 0) {
            vanish(e);
            continue;
          }
          break;
        }
        default:
          vx = dx * speed;
          vy = dy * speed;
      }

      // Garder ses distances : s'approcher, reculer ou tourner autour du joueur. Écrit sur
      // place (pas d'appel : les doubles passés à une fonction non inlinée sont alloués).
      if (keep > 0) {
        if (d > keep * 0.95) {
          vx = dx * speed;
          vy = dy * speed;
        } else if (d < keep * 0.55) {
          vx = -dx * speed;
          vy = -dy * speed;
        } else {
          const side = e & 1 ? 0.6 : -0.6;
          vx = -dy * speed * side;
          vy = dx * speed * side;
        }
      }

      // Traits de déplacement (hors attaques).
      if (Foe.state[e] === STATE.MOVE) {
        const wave = P.wave[type];
        if (wave > 0) {
          const s = Math.sin(time * P.waveFreq[type] * TAU + e * 1.3) * wave * speed;
          vx -= dy * s;
          vy += dx * s;
        }
        const hopOn = P.hopOn[type];
        if (hopOn > 0) {
          const phase = (time + e * 0.37) % (hopOn + P.hopOff[type]);
          const k = phase < hopOn ? P.hopBoost[type] : 0.1;
          vx *= k;
          vy *= k;
        }
      }
      const trail = P.trailEvery[type];
      if (trail > 0 && Foe.hidden[e] === 0) {
        Foe.t2[e] -= edt;
        if (Foe.t2[e] <= 0) {
          Foe.t2[e] = trail;
          spawnHazard(
            sim,
            x,
            y,
            P.trailRadius[type],
            P.trailDps[type],
            P.trailTime[type],
            ENEMY_ELEMENT[type],
            ENEMY_COLOR[type],
          );
        }
      }
    }
    if (Foe.affix[e] !== 0 && updateAffixes(sim, e, d, frozen, edt)) continue;
    if (Foe.guardT[e] > 0) Foe.guardT[e] -= DT;

    // Recul (amorti), déplacement.
    vx += Status.kx[e];
    vy += Status.ky[e];
    Status.kx[e] *= 0.82;
    Status.ky[e] *= 0.82;
    Vel.x[e] = vx;
    Vel.y[e] = vy;
    let nx = x + vx * edt;
    let ny = y + vy * edt;

    // Les ennemis ne traversent pas le boss.
    if (bossAlive && Foe.hidden[e] === 0) {
      const bx = nx - Pos.x[boss];
      const by = ny - Pos.y[boss];
      const rr = Body.r[boss] + Body.r[e];
      const d2 = bx * bx + by * by;
      if (d2 < rr * rr && d2 > 1e-6) {
        const k = rr / Math.sqrt(d2);
        nx = Pos.x[boss] + bx * k;
        ny = Pos.y[boss] + by * k;
      }
    }
    Pos.x[e] = nx;
    Pos.y[e] = ny;
    // Orientation du sprite : garde ou tourelle, visée, face au joueur à distance, sinon
    // direction du déplacement.
    if (beh === BEHAVIOR.shield || beh === BEHAVIOR.turret) Look.rot[e] = Foe.face[e];
    else if (Foe.state[e] === STATE.CHARGE && beh === BEHAVIOR.shooter) Look.rot[e] = Foe.face[e];
    else if (keep > 0) Look.rot[e] = Math.atan2(dy, dx);
    else if (vx * vx + vy * vy > 4) Look.rot[e] = Math.atan2(vy, vx);
    if (Look.flash[e] > 0) Look.flash[e] -= DT;

    // Contact avec le joueur.
    if (!frozen && Foe.hidden[e] === 0 && Foe.dmg[e] > 0 && d < Body.r[e] + PLAYER.radius) {
      damagePlayer(sim, Foe.dmg[e] * contact);
    }

    // Trop loin : replacé devant le joueur (la densité reste constante) ; une ruée disparaît.
    if (d > RELOCATE_DISTANCE) {
      if (beh === BEHAVIOR.stampede) {
        vanish(e);
        continue;
      }
      sim.spawnPoint(50, 150);
      Pos.x[e] = sim.point.x;
      Pos.y[e] = sim.point.y;
      Pos.px[e] = Pos.x[e];
      Pos.py[e] = Pos.y[e];
    }
  }
}

/**
 * Séparation des foules : répulsion positionnelle entre ennemis qui se chevauchent
 * (au plus 10 voisins). Au-delà de 400 ennemis, chacun n'est traité qu'un tick sur deux.
 * Les fouisseurs enfouis ne sont pas dans la grille et ne poussent personne.
 */
export function separateEnemies(sim: RunSim): void {
  const pool = sim.world.enemies;
  const n = pool.count;
  const stagger = n > 400;
  const parity = sim.state.tick & 1;
  const factor = stagger ? 0.5 : 0.35;
  const out = sim.scratch;
  const reach = MAX_ENEMY_RADIUS;
  for (let i = 0; i < n; i++) {
    if (stagger && (i & 1) !== parity) continue;
    const e = pool.active[i];
    if (Foe.hidden[e] !== 0) continue;
    const x = Pos.x[e];
    const y = Pos.y[e];
    const r = Body.r[e];
    const count = sim.grid.query(x, y, r + reach, out);
    let pushX = 0;
    let pushY = 0;
    let k = 0;
    for (let j = 0; j < count && k < 10; j++) {
      const o = out[j];
      if (o === e) continue;
      const dx = x - Pos.x[o];
      const dy = y - Pos.y[o];
      const rr = r + Body.r[o];
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      k++;
      if (d2 < 1e-6) {
        pushX += e < o ? 0.5 : -0.5;
        continue;
      }
      const d = Math.sqrt(d2);
      const w = Body.mass[o] / (Body.mass[e] + Body.mass[o]);
      pushX += (dx / d) * (rr - d) * w;
      pushY += (dy / d) * (rr - d) * w;
    }
    Pos.x[e] = x + pushX * factor;
    Pos.y[e] = y + pushY * factor;
  }
}
