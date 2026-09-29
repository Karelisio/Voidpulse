/** Joueur : déplacement, dash (recharge, invulnérabilité), ralentissement, dégâts subis. */
import { PLAYER } from '../content/data';
import { Body, Life, Look, Pos, Vel } from '../engine/components';
import { DT } from '../engine/constants';
import { FRAME } from '../content/frames';
import { EV } from './events';
import type { RunSim } from './sim';

export function spawnPlayer(sim: RunSim): number {
  const eid = sim.spawnIn(sim.world.player);
  Body.r[eid] = PLAYER.radius;
  Body.mass[eid] = 1;
  Life.hp[eid] = PLAYER.maxHp;
  Life.max[eid] = PLAYER.maxHp;
  Look.frame[eid] = FRAME.PLAYER;
  return eid;
}

export function updatePlayer(sim: RunSim): void {
  const p = sim.state.player;
  const eid = p.eid;
  const input = sim.input;

  if (p.iFrames > 0) p.iFrames -= DT;
  if (p.dashCd > 0) p.dashCd -= DT;
  if (p.slowT > 0) {
    p.slowT -= DT;
    if (p.slowT <= 0) p.slowAmt = 0;
  }
  if (p.stats.regen > 0 && p.hp < p.stats.maxHp && p.hp > 0) {
    p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.regen * DT);
    Life.hp[eid] = p.hp;
  }

  let mx = input.moveX;
  let my = input.moveY;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  if (len > 0.05) {
    p.faceX = mx / Math.max(len, 1e-6);
    p.faceY = my / Math.max(len, 1e-6);
  }

  // Dash : direction du déplacement (ou du regard), invulnérabilité brève.
  if (input.dash) {
    input.dash = false;
    if (p.dashCd <= 0 && p.dashT <= 0) {
      p.dashT = PLAYER.dash.duration;
      p.dashCd = PLAYER.dash.cooldown * p.stats.dashCooldownMult;
      p.dashX = len > 0.05 ? mx / Math.max(len, 1e-6) : p.faceX;
      p.dashY = len > 0.05 ? my / Math.max(len, 1e-6) : p.faceY;
      p.iFrames = Math.max(p.iFrames, PLAYER.dash.iFrames);
      sim.events.push(EV.DASH, 0, 0, Pos.x[eid], Pos.y[eid], p.dashX, p.dashY);
    }
  }

  if (p.dashT > 0) {
    p.dashT -= DT;
    const speed = PLAYER.dash.distance / PLAYER.dash.duration;
    Vel.x[eid] = p.dashX * speed;
    Vel.y[eid] = p.dashY * speed;
  } else {
    const speed = p.stats.speed * (1 - p.slowAmt);
    Vel.x[eid] = mx * speed;
    Vel.y[eid] = my * speed;
  }
  Pos.x[eid] += Vel.x[eid] * DT;
  Pos.y[eid] += Vel.y[eid] * DT;
  Look.alpha[eid] = p.iFrames > 0 && p.dashT <= 0 ? (sim.state.tick % 6 < 3 ? 0.45 : 1) : 1;
  Look.rot[eid] = Math.atan2(p.faceY, p.faceX);
}

/** Dégâts au joueur (ignorés pendant l'invulnérabilité). Renvoie true s'ils ont porté. */
export function damagePlayer(sim: RunSim, amount: number): boolean {
  const p = sim.state.player;
  if (p.iFrames > 0 || sim.state.debug.invincible || sim.state.status !== 'running') return false;
  // Armure : réduction fixe, au plus 75 % du coup.
  amount = Math.max(amount * 0.25, amount - p.stats.armor);
  p.hp -= amount;
  p.iFrames = PLAYER.iFrames;
  sim.state.stats.damageTaken += amount;
  Life.hp[p.eid] = p.hp;
  Look.flash[p.eid] = 0.12;
  sim.events.push(
    EV.PLAYER_HURT,
    Math.max(0, Math.ceil(p.hp)),
    0,
    Pos.x[p.eid],
    Pos.y[p.eid],
    amount,
  );
  if (p.hp <= 0) {
    p.hp = 0;
    sim.state.status = 'dead';
    sim.events.push(EV.PLAYER_DEATH, 0, 0, Pos.x[p.eid], Pos.y[p.eid], 0);
    sim.events.push(EV.RUN_END, 0, 0, 0, 0, 0);
  }
  return true;
}

/**
 * Ralentit le joueur (givre ennemi) : la plus forte intensité en cours l'emporte, la durée
 * est prolongée. Signalé au rendu seulement au début du ralentissement.
 */
export function slowPlayer(sim: RunSim, amount: number, seconds: number): void {
  const p = sim.state.player;
  if (sim.state.debug.invincible) return;
  if (p.slowT <= 0) {
    p.slowAmt = amount;
    sim.events.push(EV.PLAYER_SLOWED, 0, 0, Pos.x[p.eid], Pos.y[p.eid], amount);
  } else if (amount > p.slowAmt) p.slowAmt = amount;
  if (seconds > p.slowT) p.slowT = seconds;
}

export function healPlayer(sim: RunSim, amount: number): void {
  const p = sim.state.player;
  p.hp = Math.min(p.stats.maxHp, p.hp + amount);
  Life.hp[p.eid] = p.hp;
}
