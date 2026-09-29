/** Ennemis : apparition, comportements (5 archétypes), séparation des foules, contact. */
import { ENEMIES, PLAYER } from '../content/data';
import { FRAME } from '../content/frames';
import { Body, Bullet, Foe, Life, Look, Pos, Status, Vel } from '../engine/components';
import { DT } from '../engine/constants';
import { EV, TELEGRAPH_KIND } from './events';
import { damagePlayer } from './player';
import type { RunSim } from './sim';
import { spawnZone, ZONE } from './zones';

export const BEHAVIOR = { swarm: 0, tank: 1, shooter: 2, kamikaze: 3, teleporter: 4 } as const;
/** Comportement de chaque type d'ennemi (index de config). */
export const BEHAVIOR_OF = Uint8Array.from(ENEMIES.map((e) => BEHAVIOR[e.behavior]));
/** Plus grand rayon d'ennemi ordinaire (marge des requêtes de grille). */
export const MAX_ENEMY_RADIUS = Math.max(...ENEMIES.map((e) => e.radius));

const STATE = { MOVE: 0, CHARGE: 1, EXPLODED: 2 } as const;
/** Au-delà de cette distance au joueur, un ennemi est replacé devant lui. */
const RELOCATE_DISTANCE = 1500;

const param = (type: number, key: string): number => ENEMIES[type].params[key] ?? 0;

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
  Life.hp[e] = def.hp * hpScale;
  Life.max[e] = def.hp * hpScale;
  Foe.type[e] = type;
  Foe.state[e] = STATE.MOVE;
  Foe.speed[e] = def.speed * sim.rng.spawn.range(0.9, 1.1);
  Foe.dmg[e] = def.damage;
  Foe.xp[e] = def.xp;
  Foe.kbRes[e] = def.knockbackRes;
  const beh = BEHAVIOR_OF[type];
  if (beh === BEHAVIOR.shooter) Foe.t0[e] = sim.rng.spawn.range(0.6, param(type, 'fireCooldown'));
  if (beh === BEHAVIOR.teleporter) Foe.t0[e] = sim.rng.spawn.range(1, param(type, 'blinkCooldown'));
  Look.frame[e] = FRAME.ENEMY_BASE + type;
  const stats = sim.state.stats;
  if (sim.world.enemies.count > stats.peakEnemies) stats.peakEnemies = sim.world.enemies.count;
  return e;
}

function fireBullet(
  sim: RunSim,
  x: number,
  y: number,
  dx: number,
  dy: number,
  speed: number,
  dmg: number,
): void {
  const b = sim.spawnIn(sim.world.bullets);
  if (b < 0) return;
  Pos.x[b] = x;
  Pos.y[b] = y;
  Pos.px[b] = x;
  Pos.py[b] = y;
  Vel.x[b] = dx * speed;
  Vel.y[b] = dy * speed;
  Bullet.dmg[b] = dmg;
  Bullet.ttl[b] = 6;
  Bullet.r[b] = 6;
  Look.frame[b] = FRAME.BULLET;
}

export { fireBullet };

export function updateEnemies(sim: RunSim): void {
  const pool = sim.world.enemies;
  const player = sim.state.player.eid;
  const px = Pos.x[player];
  const py = Pos.y[player];
  const time = sim.state.time;
  const boss = sim.state.boss.eid;
  const bossAlive = boss >= 0 && sim.world.boss.isActive(boss);

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
    let speed = Foe.speed[e] * (1 - 0.55 * Status.chill[e]);
    const blind = Status.blindT[e] > 0;
    if (blind) {
      // Aveuglé (vapeur) : erre dans une direction pseudo-aléatoire stable.
      const a = e * 1.7 + time * 1.3;
      dx = Math.cos(a);
      dy = Math.sin(a);
      speed *= 0.5;
    }

    let vx = 0;
    let vy = 0;
    if (!frozen) {
      switch (beh) {
        case BEHAVIOR.shooter: {
          const range = param(type, 'range');
          if (Foe.state[e] === STATE.MOVE) {
            if (d > range * 0.95) {
              vx = dx * speed;
              vy = dy * speed;
            } else if (d < range * 0.55) {
              vx = -dx * speed;
              vy = -dy * speed;
            } else {
              const side = e & 1 ? 1 : -1;
              vx = -dy * speed * 0.6 * side;
              vy = dx * speed * 0.6 * side;
            }
            Foe.t0[e] -= DT;
            if (Foe.t0[e] <= 0 && d < range * 1.3 && !blind) {
              Foe.state[e] = STATE.CHARGE;
              Foe.t1[e] = 0.35;
              sim.events.push(EV.TELEGRAPH, TELEGRAPH_KIND.SHOOTER, e, x, y, 0.35, 0, true);
            }
          } else {
            Look.flash[e] = 0.05;
            Foe.t1[e] -= DT;
            if (Foe.t1[e] <= 0) {
              fireBullet(
                sim,
                x,
                y,
                dx,
                dy,
                param(type, 'bulletSpeed'),
                param(type, 'bulletDamage'),
              );
              sim.events.push(EV.ENEMY_SHOT, e, 0, x, y, 0, 0, true);
              Foe.state[e] = STATE.MOVE;
              Foe.t0[e] = param(type, 'fireCooldown') * sim.rng.ai.range(0.85, 1.15);
            }
          }
          break;
        }
        case BEHAVIOR.kamikaze: {
          if (Foe.state[e] === STATE.MOVE) {
            vx = dx * speed;
            vy = dy * speed;
            if (d < param(type, 'triggerRange') && !blind) {
              Foe.state[e] = STATE.CHARGE;
              Foe.t0[e] = param(type, 'fuse');
              sim.events.push(EV.TELEGRAPH, TELEGRAPH_KIND.KAMIKAZE, e, x, y, Foe.t0[e]);
            }
          } else {
            Look.flash[e] = sim.state.tick % 8 < 4 ? 0.06 : 0;
            Foe.t0[e] -= DT;
            if (Foe.t0[e] <= 0) {
              const radius = param(type, 'blastRadius');
              if (d < radius + PLAYER.radius) damagePlayer(sim, param(type, 'blastDamage'));
              sim.events.push(EV.EXPLOSION, 0, 0, x, y, radius);
              Foe.state[e] = STATE.EXPLODED;
              Life.hp[e] = 0;
              continue;
            }
          }
          break;
        }
        case BEHAVIOR.teleporter: {
          if (Foe.state[e] === STATE.MOVE) {
            vx = dx * speed;
            vy = dy * speed;
            Foe.t0[e] -= DT;
            if (Foe.t0[e] <= 0 && d < 650 && !blind) {
              const telegraph = param(type, 'telegraph');
              const a = sim.rng.ai.range(0, Math.PI * 2);
              const r = param(type, 'blinkRange');
              Foe.tx[e] = px + Math.cos(a) * r;
              Foe.ty[e] = py + Math.sin(a) * r;
              Foe.state[e] = STATE.CHARGE;
              Foe.t1[e] = telegraph;
              spawnZone(sim, ZONE.BLINK_MARK, Foe.tx[e], Foe.ty[e], 24, telegraph, 0, 0);
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
            Foe.t1[e] -= DT;
            Look.alpha[e] = 0.4 + 0.6 * Math.max(0, Foe.t1[e] / param(type, 'telegraph'));
            if (Foe.t1[e] <= 0) {
              sim.events.push(EV.BLINK, e, 0, x, y, Foe.tx[e], Foe.ty[e]);
              Pos.x[e] = Foe.tx[e];
              Pos.y[e] = Foe.ty[e];
              Pos.px[e] = Pos.x[e];
              Pos.py[e] = Pos.y[e];
              Look.alpha[e] = 1;
              Foe.state[e] = STATE.MOVE;
              Foe.t0[e] = param(type, 'blinkCooldown') * sim.rng.ai.range(0.85, 1.15);
              continue;
            }
          }
          break;
        }
        default:
          vx = dx * speed;
          vy = dy * speed;
      }
    }

    // Recul (amorti), déplacement.
    vx += Status.kx[e];
    vy += Status.ky[e];
    Status.kx[e] *= 0.82;
    Status.ky[e] *= 0.82;
    Vel.x[e] = vx;
    Vel.y[e] = vy;
    let nx = x + vx * DT;
    let ny = y + vy * DT;

    // Les ennemis ne traversent pas le boss.
    if (bossAlive) {
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
    if (vx * vx + vy * vy > 4) Look.rot[e] = Math.atan2(vy, vx);
    if (Look.flash[e] > 0) Look.flash[e] -= DT;

    // Contact avec le joueur.
    if (!frozen && Foe.dmg[e] > 0 && d < Body.r[e] + PLAYER.radius) damagePlayer(sim, Foe.dmg[e]);

    // Trop loin : replacé devant le joueur (la densité reste constante).
    if (d > RELOCATE_DISTANCE) {
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
