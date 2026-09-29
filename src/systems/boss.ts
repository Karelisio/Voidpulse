/**
 * Boss : machine à états (entrée → attente → télégraphe → exécution → récupération) avec
 * phases selon les PV (la dernière est la rage). Motifs lisibles : salves circulaires,
 * spirale, invocation, charge télégraphiée, mines au sol.
 */
import { BOSSES, PLAYER, enemyIndex } from '../content/data';
import { FRAME } from '../content/frames';
import { Body, Foe, Life, Look, Pos, Status, Vel } from '../engine/components';
import { DT } from '../engine/constants';
import { fireBullet, spawnEnemy } from './enemies';
import { EV, TELEGRAPH_KIND } from './events';
import { dropGem, magnetizeAll } from './pickups';
import { damagePlayer } from './player';
import type { RunSim } from './sim';
import type { BossState } from './state';
import { spawnLineZone, spawnZone, ZONE } from './zones';

export const BOSS_PATTERNS = ['radial', 'spiral', 'summon', 'charge', 'mines'] as const;
const P = { RADIAL: 0, SPIRAL: 1, SUMMON: 2, CHARGE: 3, MINES: 4 } as const;
const TELEGRAPH_TIME = [0.7, 0.6, 0.6, 0.9, 0.35];
const CHARGE_SPEED = 640;
const CHARGE_TIME = 0.6;

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
    invulnT: 0,
  };
}

export function spawnBoss(sim: RunSim, index: number): void {
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
  Life.hp[e] = def.hp;
  Life.max[e] = def.hp;
  Foe.speed[e] = def.speed;
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
  sim.events.push(EV.BOSS_SPAWN, index, 0, Pos.x[e], Pos.y[e], 0);
}

function phaseFor(b: BossState, ratio: number): number {
  const phases = b.def!.phases;
  for (let i = 0; i < phases.length; i++) if (ratio > phases[i].threshold) return i;
  return phases.length - 1;
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
      sim.state.status = 'victory';
      sim.events.push(EV.RUN_END, 1, 0, 0, 0, 0);
    }
    return;
  }
  if (Life.hp[e] <= 0) {
    b.state = 'dying';
    b.timer = 2;
    sim.state.stats.bossKilled = true;
    sim.state.stats.kills++;
    sim.events.push(EV.BOSS_DEATH, b.defIndex, 0, x, y, def.radius);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      dropGem(sim, x + Math.cos(a) * 40, y + Math.sin(a) * 40, 10);
    }
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
  const speed = def.speed * ph.speedMult * (1 - 0.3 * Math.min(1, Status.chill[e] * 2));

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
      vx = dx * speed * 0.15;
      vy = dy * speed * 0.15;
      b.timer -= DT;
      if (b.timer <= 0) beginExecute(sim, b);
      break;
    case 'execute':
      if (b.pattern === P.CHARGE) {
        vx = b.dirX * CHARGE_SPEED;
        vy = b.dirY * CHARGE_SPEED;
      }
      executePattern(sim, b, x, y);
      break;
  }
  Vel.x[e] = vx;
  Vel.y[e] = vy;
  Pos.x[e] = x + vx * DT;
  Pos.y[e] = y + vy * DT;
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
  let index = BOSS_PATTERNS.indexOf(pick);
  if (index === b.pattern && patterns.length > 1) {
    pick = patterns[b.patternCursor % patterns.length];
    b.patternCursor++;
    index = BOSS_PATTERNS.indexOf(pick);
  }
  b.pattern = index;
  b.state = 'telegraph';
  b.timer = TELEGRAPH_TIME[index] * (def.phases[b.phase].rage ? 0.8 : 1);
  b.dirX = dx;
  b.dirY = dy;
  const e = b.eid;
  if (index === P.CHARGE) {
    const rot = Math.atan2(dy, dx);
    spawnLineZone(
      sim,
      Pos.x[e],
      Pos.y[e],
      CHARGE_SPEED * CHARGE_TIME + def.radius,
      def.radius * 2,
      rot,
      b.timer,
    );
  }
  sim.events.push(EV.BOSS_PATTERN, index, 0, Pos.x[e], Pos.y[e], b.timer);
  sim.events.push(EV.TELEGRAPH, TELEGRAPH_KIND.BOSS, e, Pos.x[e], Pos.y[e], b.timer);
}

function beginExecute(sim: RunSim, b: BossState): void {
  const e = b.eid;
  const def = b.def!;
  const rage = def.phases[b.phase].rage;
  b.state = 'execute';
  switch (b.pattern) {
    case P.RADIAL:
      b.sub = 3;
      b.subT = 0;
      break;
    case P.SPIRAL:
      b.timer = 3;
      b.subT = 0;
      break;
    case P.SUMMON: {
      const n = rage ? 12 : 8;
      const mite = enemyIndex(def.summon);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        spawnEnemy(sim, mite, Pos.x[e] + Math.cos(a) * 90, Pos.y[e] + Math.sin(a) * 90, 1.5);
      }
      b.timer = 0;
      break;
    }
    case P.CHARGE:
      b.timer = CHARGE_TIME;
      break;
    case P.MINES: {
      const player = sim.state.player.eid;
      const n = rage ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const a = sim.rng.ai.range(0, Math.PI * 2);
        const r = i === 0 ? 0 : sim.rng.ai.range(40, 170);
        spawnZone(
          sim,
          ZONE.MINE,
          Pos.x[player] + Math.cos(a) * r,
          Pos.y[player] + Math.sin(a) * r,
          68,
          1.25,
          20,
          0,
        );
      }
      b.timer = 0;
      break;
    }
  }
}

function executePattern(sim: RunSim, b: BossState, x: number, y: number): void {
  const def = b.def!;
  const rage = def.phases[b.phase].rage;
  let done = false;
  switch (b.pattern) {
    case P.RADIAL:
      b.subT -= DT;
      if (b.subT <= 0) {
        const n = rage ? 24 : 18;
        for (let i = 0; i < n; i++) {
          const a = b.angle + (i / n) * Math.PI * 2;
          fireBullet(sim, x, y, Math.cos(a), Math.sin(a), def.bulletSpeed, def.bulletDamage);
        }
        sim.events.push(EV.ENEMY_SHOT, b.eid, 1, x, y, 0);
        b.angle += 0.17;
        b.sub--;
        b.subT = 0.45;
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
    default:
      done = true;
  }
  if (done) {
    b.state = 'recover';
    b.timer = b.pattern === P.CHARGE ? 0.9 : 0.6;
  }
}
