/**
 * Boss et mini-boss : machine à états (entrée → attente → télégraphe → exécution →
 * récupération) avec phases selon les PV (la dernière est la rage). Motifs lisibles et
 * télégraphiés : salves circulaires, spirale, invocation, charge, mines, pluie d'impacts,
 * mur de projectiles à brèche, laser balayé, éventail visé, téléportation, flaques. Un
 * mini-boss vaincu lâche un coffre ; le boss final vaincu termine la run.
 */
import { BOSSES, ELEMENTS, PLAYER, colorOf, enemyIndex } from '../content/data';
import { FRAME } from '../content/frames';
import { Body, Foe, Life, Look, Pos, Status, Vel } from '../engine/components';
import { DT } from '../engine/constants';
import { fireBullet, spawnEnemy } from './enemies';
import { EV, TELEGRAPH_KIND } from './events';
import { dropChest, dropGem, magnetizeAll } from './pickups';
import { damagePlayer } from './player';
import type { RunSim } from './sim';
import type { BossState } from './state';
import { spawnHazard, spawnLineZone, spawnZone, ZONE } from './zones';

export const BOSS_PATTERNS = [
  'radial',
  'spiral',
  'summon',
  'charge',
  'mines',
  'rain',
  'wall',
  'laser',
  'fan',
  'blink',
  'hazard',
] as const;
const P = {
  RADIAL: 0,
  SPIRAL: 1,
  SUMMON: 2,
  CHARGE: 3,
  MINES: 4,
  RAIN: 5,
  WALL: 6,
  LASER: 7,
  FAN: 8,
  BLINK: 9,
  HAZARD: 10,
} as const;
/** Durée du télégraphe de chaque motif (s). */
const TELEGRAPH_TIME = [0.7, 0.6, 0.6, 0.9, 0.35, 0.5, 0.6, 1, 0.55, 0.7, 0.5];
const CHARGE_SPEED = 640;
const CHARGE_TIME = 0.6;
const LASER_LENGTH = 1000;
const LASER_WIDTH = 26;
const LASER_TIME = 0.55;
/** Un mini-boss réapparaît plus solide. */
const MINI_REPEAT_HP = 1.6;
const TAU = Math.PI * 2;

export function createBossState(): BossState {
  return {
    eid: -1,
    def: null,
    defIndex: -1,
    phase: 0,
    state: 'enter',
    timer: 0,
    pattern: 0,
    patternCursor: 0,
    sub: 0,
    subT: 0,
    angle: 0,
    dirX: 1,
    dirY: 0,
    tx: 0,
    ty: 0,
    invulnT: 0,
    appearances: 0,
  };
}

/** Apparition d'un boss (`repeat` : nombre d'apparitions précédentes de ce mini-boss). */
export function spawnBoss(sim: RunSim, index: number, repeat = 0): void {
  const e = sim.spawnIn(sim.world.boss);
  if (e < 0) return;
  const def = BOSSES[index];
  sim.spawnPoint(80, 120);
  Pos.x[e] = sim.point.x;
  Pos.y[e] = sim.point.y;
  Pos.px[e] = Pos.x[e];
  Pos.py[e] = Pos.y[e];
  Body.r[e] = def.radius;
  Body.mass[e] = 50;
  // Pactes : PV des ennemis ; « Colère du gardien » : boss enragé d'emblée (PV et vitesse +25 %).
  const mods = sim.state.pacts.mods;
  const rage = mods.bossRage > 0 ? 1.25 : 1;
  Life.hp[e] = def.hp * mods.enemyHp * rage * (repeat > 0 ? MINI_REPEAT_HP : 1);
  Life.max[e] = Life.hp[e];
  Foe.speed[e] = def.speed * rage;
  Foe.dmg[e] = def.contactDamage;
  Look.frame[e] = FRAME.BOSS_BASE + index;
  const b = sim.state.boss;
  b.eid = e;
  b.def = def;
  b.defIndex = index;
  b.phase = 0;
  b.state = 'enter';
  b.timer = 1.6;
  b.invulnT = 1.6;
  b.patternCursor = 0;
  b.appearances = repeat + 1;
  sim.events.push(EV.BOSS_SPAWN, index, def.kind === 'mini' ? 1 : 0, Pos.x[e], Pos.y[e], 0);
}

export function bossAlive(sim: RunSim): boolean {
  const e = sim.state.boss.eid;
  return e >= 0 && sim.world.boss.isActive(e);
}

function phaseFor(b: BossState, ratio: number): number {
  const phases = b.def!.phases;
  for (let i = 0; i < phases.length; i++) if (ratio > phases[i].threshold) return i;
  return phases.length - 1;
}

function raging(sim: RunSim, b: BossState): boolean {
  return b.def!.phases[b.phase].rage || sim.state.pacts.mods.bossRage > 0;
}

export function updateBoss(sim: RunSim): void {
  const b = sim.state.boss;
  const e = b.eid;
  if (e < 0 || !sim.world.boss.isActive(e) || !b.def) return;
  const def = b.def;
  const player = sim.state.player.eid;
  const px = Pos.x[player];
  const py = Pos.y[player];
  const x = Pos.x[e];
  const y = Pos.y[e];
  let dx = px - x;
  let dy = py - y;
  const d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
  dx /= d;
  dy /= d;
  if (Look.flash[e] > 0) Look.flash[e] -= DT;
  if (b.invulnT > 0) b.invulnT -= DT;

  if (b.state === 'dying') {
    b.timer -= DT;
    Look.alpha[e] = Math.max(0, b.timer / 2);
    if (b.timer <= 0) {
      sim.world.boss.despawn(e);
      b.eid = -1;
      if (def.kind === 'final') {
        sim.state.status = 'victory';
        sim.events.push(EV.RUN_END, 1, 0, 0, 0, 0);
      }
    }
    return;
  }
  if (Life.hp[e] <= 0) {
    const mini = def.kind === 'mini';
    b.state = 'dying';
    b.timer = mini ? 1.2 : 2;
    if (mini) sim.state.stats.minibosses++;
    else sim.state.stats.bossKilled = true;
    sim.state.stats.kills++;
    sim.state.stats.bossesDefeated.push(b.defIndex);
    sim.events.push(EV.BOSS_DEATH, b.defIndex, mini ? 1 : 0, x, y, def.radius);
    const n = mini ? 12 : 24;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      dropGem(sim, x + Math.cos(a) * 40, y + Math.sin(a) * 40, 10);
    }
    if (mini) dropChest(sim, x, y);
    magnetizeAll(sim);
    return;
  }

  // Changement de phase : bref répit invulnérable, motif interrompu.
  const phase = phaseFor(b, Life.hp[e] / Life.max[e]);
  if (phase !== b.phase && b.state !== 'enter') {
    b.phase = phase;
    b.state = 'recover';
    b.timer = 1.1;
    b.invulnT = 1;
    sim.events.push(EV.BOSS_PHASE, phase, def.phases[phase].rage ? 1 : 0, x, y, 0);
  }
  const ph = def.phases[b.phase];
  const speed = Foe.speed[e] * ph.speedMult * (1 - 0.3 * Math.min(1, Status.chill[e] * 2));

  let vx = 0;
  let vy = 0;
  switch (b.state) {
    case 'enter':
      vx = dx * speed * 1.4;
      vy = dy * speed * 1.4;
      b.timer -= DT;
      if (b.timer <= 0) {
        b.state = 'idle';
        b.timer = 0.8;
      }
      break;
    case 'idle':
    case 'recover': {
      // Garde une distance de combat en tournant autour du joueur.
      const toward = d > 250 ? 1 : d < 170 ? -0.8 : 0;
      vx = (dx * toward - dy * 0.45) * speed;
      vy = (dy * toward + dx * 0.45) * speed;
      b.timer -= DT;
      if (b.timer <= 0) {
        if (b.state === 'recover') {
          b.state = 'idle';
          b.timer = def.patternGap * ph.cooldownMult;
        } else beginPattern(sim, b, dx, dy);
      }
      break;
    }
    case 'telegraph':
      // Le laser se fige pendant sa visée ; les autres motifs avancent à peine.
      if (b.pattern !== P.LASER) {
        vx = dx * speed * 0.15;
        vy = dy * speed * 0.15;
      }
      b.timer -= DT;
      if (b.timer <= 0) beginExecute(sim, b);
      break;
    case 'execute':
      if (b.pattern === P.CHARGE) {
        vx = b.dirX * CHARGE_SPEED;
        vy = b.dirY * CHARGE_SPEED;
      }
      executePattern(sim, b, x, y, px, py);
      break;
  }
  if (b.eid < 0) return;
  Vel.x[e] = vx;
  Vel.y[e] = vy;
  Pos.x[e] += vx * DT;
  Pos.y[e] += vy * DT;
  if (vx * vx + vy * vy > 4) Look.rot[e] = Math.atan2(vy, vx);

  const charging = b.state === 'execute' && b.pattern === P.CHARGE;
  if (d < def.radius + PLAYER.radius) damagePlayer(sim, def.contactDamage * (charging ? 1.3 : 1));
}

function beginPattern(sim: RunSim, b: BossState, dx: number, dy: number): void {
  const def = b.def!;
  const patterns = def.phases[b.phase].patterns;
  // Parcours cyclique mélangé : jamais deux fois le même motif de suite.
  let pick = patterns[b.patternCursor % patterns.length];
  b.patternCursor += 1 + (sim.rng.ai.next() < 0.35 ? 1 : 0);
  let index: number = BOSS_PATTERNS.indexOf(pick);
  if (index === b.pattern && patterns.length > 1) {
    pick = patterns[b.patternCursor % patterns.length];
    b.patternCursor++;
    index = BOSS_PATTERNS.indexOf(pick);
  }
  b.pattern = index;
  b.state = 'telegraph';
  b.timer = TELEGRAPH_TIME[index] * (raging(sim, b) ? 0.8 : 1);
  b.dirX = dx;
  b.dirY = dy;
  const e = b.eid;
  const rot = Math.atan2(dy, dx);
  const tint = colorOf(def.color);
  if (index === P.CHARGE) {
    const z = spawnLineZone(
      sim,
      Pos.x[e],
      Pos.y[e],
      CHARGE_SPEED * CHARGE_TIME + def.radius,
      def.radius * 2,
      rot,
      b.timer,
    );
    if (z >= 0) Look.tint[z] = 0xff3e5e;
  } else if (index === P.LASER) {
    const z = spawnLineZone(sim, Pos.x[e], Pos.y[e], LASER_LENGTH, LASER_WIDTH, rot, b.timer);
    if (z >= 0) Look.tint[z] = tint;
  } else if (index === P.BLINK) {
    // Destination marquée près du joueur.
    const p = sim.state.player.eid;
    const a = sim.rng.ai.range(0, TAU);
    b.tx = Pos.x[p] + Math.cos(a) * 170;
    b.ty = Pos.y[p] + Math.sin(a) * 170;
    const z = spawnZone(sim, ZONE.BLINK_MARK, b.tx, b.ty, def.radius, b.timer, 0, 0);
    if (z >= 0) Look.tint[z] = tint;
  }
  sim.events.push(EV.BOSS_PATTERN, index, 0, Pos.x[e], Pos.y[e], b.timer);
  sim.events.push(EV.TELEGRAPH, TELEGRAPH_KIND.BOSS, e, Pos.x[e], Pos.y[e], b.timer);
}

function beginExecute(sim: RunSim, b: BossState): void {
  const e = b.eid;
  const def = b.def!;
  const rage = raging(sim, b);
  const player = sim.state.player.eid;
  b.state = 'execute';
  b.subT = 0;
  switch (b.pattern) {
    case P.RADIAL:
    case P.FAN:
      b.sub = 3;
      break;
    case P.WALL:
      b.sub = rage ? 3 : 2;
      break;
    case P.SPIRAL:
      b.timer = 3;
      break;
    case P.SUMMON: {
      const n = rage ? 12 : 8;
      const minion = enemyIndex(def.summon);
      const hp = sim.state.director.hpScale;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        spawnEnemy(sim, minion, Pos.x[e] + Math.cos(a) * 90, Pos.y[e] + Math.sin(a) * 90, hp);
      }
      b.timer = 0;
      break;
    }
    case P.CHARGE:
      b.timer = CHARGE_TIME;
      break;
    case P.LASER:
      b.timer = LASER_TIME;
      break;
    case P.MINES:
    case P.RAIN: {
      // Mines (explosion à retardement) ou pluie d'impacts annoncés autour du joueur.
      const rain = b.pattern === P.RAIN;
      const n = rain ? (rage ? 9 : 6) : rage ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const a = sim.rng.ai.range(0, TAU);
        const r = i === 0 ? 0 : sim.rng.ai.range(40, 190);
        const x = Pos.x[player] + Math.cos(a) * r;
        const y = Pos.y[player] + Math.sin(a) * r;
        if (rain) {
          const z = spawnZone(
            sim,
            ZONE.VOLATILE,
            x,
            y,
            58,
            0.9 + i * 0.07,
            def.bulletDamage * 1.6,
            0,
          );
          if (z >= 0) Look.tint[z] = colorOf(def.color);
        } else spawnZone(sim, ZONE.MINE, x, y, 68, 1.25, 20, 0);
      }
      b.timer = 0;
      break;
    }
    case P.BLINK: {
      sim.events.push(EV.BLINK, e, 0, Pos.x[e], Pos.y[e], b.tx, b.ty);
      Pos.x[e] = b.tx;
      Pos.y[e] = b.ty;
      Pos.px[e] = b.tx;
      Pos.py[e] = b.ty;
      const n = rage ? 16 : 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        fireBullet(
          sim,
          b.tx,
          b.ty,
          Math.cos(a),
          Math.sin(a),
          def.bulletSpeed * 0.8,
          def.bulletDamage,
        );
      }
      b.timer = 0;
      break;
    }
    case P.HAZARD: {
      const n = rage ? 7 : 5;
      const el = def.element ? ELEMENTS.indexOf(def.element) : 255;
      const tint = colorOf(def.color);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + sim.rng.ai.range(0, 1);
        const r = i === 0 ? 30 : sim.rng.ai.range(90, 220);
        spawnHazard(
          sim,
          Pos.x[player] + Math.cos(a) * r,
          Pos.y[player] + Math.sin(a) * r,
          72,
          def.bulletDamage * 0.9,
          6,
          el,
          tint,
        );
      }
      b.timer = 0;
      break;
    }
  }
}

function executePattern(
  sim: RunSim,
  b: BossState,
  x: number,
  y: number,
  px: number,
  py: number,
): void {
  const def = b.def!;
  const rage = raging(sim, b);
  let done = false;
  switch (b.pattern) {
    case P.RADIAL:
      b.subT -= DT;
      if (b.subT <= 0) {
        const n = rage ? 24 : 18;
        for (let i = 0; i < n; i++) {
          const a = b.angle + (i / n) * TAU;
          fireBullet(sim, x, y, Math.cos(a), Math.sin(a), def.bulletSpeed, def.bulletDamage);
        }
        sim.events.push(EV.ENEMY_SHOT, b.eid, 1, x, y, 0);
        b.angle += 0.17;
        b.sub--;
        b.subT = 0.45;
        done = b.sub <= 0;
      }
      break;
    case P.FAN:
      // Éventail visé sur le joueur, trois fois.
      b.subT -= DT;
      if (b.subT <= 0) {
        const n = rage ? 9 : 7;
        const aim = Math.atan2(py - y, px - x);
        for (let i = 0; i < n; i++) {
          const a = aim + (i / (n - 1) - 0.5) * 1.1;
          fireBullet(sim, x, y, Math.cos(a), Math.sin(a), def.bulletSpeed * 1.15, def.bulletDamage);
        }
        sim.events.push(EV.ENEMY_SHOT, b.eid, 1, x, y, 0);
        b.sub--;
        b.subT = 0.35;
        done = b.sub <= 0;
      }
      break;
    case P.WALL:
      // Mur de projectiles perpendiculaire, avec une brèche à trouver.
      b.subT -= DT;
      if (b.subT <= 0) {
        const aim = Math.atan2(py - y, px - x);
        const ca = Math.cos(aim);
        const sa = Math.sin(aim);
        const n = 26;
        const gap = Math.floor(sim.rng.ai.range(4, n - 7));
        for (let i = 0; i < n; i++) {
          if (i >= gap && i < gap + 3) continue;
          const o = (i - (n - 1) / 2) * 26;
          fireBullet(sim, x - sa * o, y + ca * o, ca, sa, def.bulletSpeed * 0.85, def.bulletDamage);
        }
        sim.events.push(EV.ENEMY_SHOT, b.eid, 1, x, y, 0);
        b.sub--;
        b.subT = 0.7;
        done = b.sub <= 0;
      }
      break;
    case P.SPIRAL:
      b.timer -= DT;
      b.subT -= DT;
      if (b.subT <= 0) {
        b.subT = rage ? 0.06 : 0.08;
        for (let k = 0; k < 2; k++) {
          const a = b.angle + k * Math.PI;
          fireBullet(sim, x, y, Math.cos(a), Math.sin(a), def.bulletSpeed * 0.9, def.bulletDamage);
        }
        b.angle += 0.33;
      }
      done = b.timer <= 0;
      break;
    case P.CHARGE:
      b.timer -= DT;
      if (b.timer <= 0) {
        sim.events.push(EV.BOSS_SLAM, b.eid, 0, x, y, def.radius * 2);
        done = true;
      }
      break;
    case P.LASER: {
      // Rayon le long de la ligne annoncée : blesse le joueur qui y reste.
      b.timer -= DT;
      const ex = x + b.dirX * LASER_LENGTH;
      const ey = y + b.dirY * LASER_LENGTH;
      const t = Math.max(0, Math.min(1, ((px - x) * b.dirX + (py - y) * b.dirY) / LASER_LENGTH));
      const cx = x + b.dirX * LASER_LENGTH * t - px;
      const cy = y + b.dirY * LASER_LENGTH * t - py;
      const reach = LASER_WIDTH / 2 + PLAYER.radius;
      if (cx * cx + cy * cy < reach * reach) damagePlayer(sim, def.bulletDamage * 1.5);
      if ((sim.state.tick & 1) === 0) sim.events.push(EV.BEAM, 6, 255, x, y, ex, ey);
      done = b.timer <= 0;
      break;
    }
    default:
      done = true;
  }
  if (done) {
    b.state = 'recover';
    b.timer = b.pattern === P.CHARGE ? 0.9 : 0.6;
  }
}
