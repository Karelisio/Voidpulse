/** Joueur : déplacement, dash (recharge, invulnérabilité), ralentissement, dégâts subis. */
import { CHARACTERS, PLAYER } from '../content/data';
import { Body, Life, Look, Pos, Vel } from '../engine/components';
import { DT } from '../engine/constants';
import { FRAME } from '../content/frames';
import { dashEnd, dashStart } from './dash';
import { EV } from './events';
import type { RunSim } from './sim';

export function spawnPlayer(sim: RunSim): number {
  const eid = sim.spawnIn(sim.world.player);
  Body.r[eid] = PLAYER.radius;
  Body.mass[eid] = 1;
  Life.hp[eid] = PLAYER.maxHp;
  Life.max[eid] = PLAYER.maxHp;
  Look.frame[eid] = FRAME.PLAYER_BASE + CHARACTERS.indexOf(sim.state.character);
  return eid;
}

export function updatePlayer(sim: RunSim): void {
  const p = sim.state.player;
  const eid = p.eid;
  const input = sim.input;

  if (p.iFrames > 0) p.iFrames -= DT;
  // Recharge du dash : une charge à la fois.
  const dash = p.dash;
  if (p.dashCharges < dash.charges) {
    p.dashCd -= DT;
    if (p.dashCd <= 0) {
      p.dashCharges++;
      p.dashCd = p.dashCharges < dash.charges ? dash.cooldown * p.stats.dashCooldownMult : 0;
    }
  }
  if (p.slowT > 0) {
    p.slowT -= DT;
    if (p.slowT <= 0) p.slowAmt = 0;
  }
  const noHeal = sim.state.pacts.mods.noHeal > 0;
  if (p.stats.regen > 0 && !noHeal && p.hp < p.stats.maxHp && p.hp > 0) {
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

  // Dash : direction du déplacement (ou du regard), invulnérabilité brève, effet du personnage.
  if (input.dash) {
    input.dash = false;
    if (p.dashCharges > 0 && p.dashT <= 0 && sim.state.pacts.mods.noDash <= 0) {
      if (p.dashCharges === dash.charges) p.dashCd = dash.cooldown * p.stats.dashCooldownMult;
      p.dashCharges--;
      p.dashT = dash.duration;
      p.dashX = len > 0.05 ? mx / Math.max(len, 1e-6) : p.faceX;
      p.dashY = len > 0.05 ? my / Math.max(len, 1e-6) : p.faceY;
      p.dashFromX = Pos.x[eid];
      p.dashFromY = Pos.y[eid];
      p.iFrames = Math.max(p.iFrames, dash.iFrames);
      sim.events.push(EV.DASH, p.dashKind, 0, Pos.x[eid], Pos.y[eid], p.dashX, p.dashY);
      // Téléportation : pas de trajet, l'effet d'arrivée a lieu tout de suite.
      if (dashStart(sim, p.dashFromX, p.dashFromY, p.dashX, p.dashY)) {
        p.dashT = 0;
        dashEnd(sim, Pos.x[eid], Pos.y[eid]);
      }
    }
  }

  if (p.dashT > 0) {
    p.dashT -= DT;
    const speed = dash.distance / dash.duration;
    Vel.x[eid] = p.dashX * speed;
    Vel.y[eid] = p.dashY * speed;
    if (p.dashT <= 0) {
      Pos.x[eid] += Vel.x[eid] * DT;
      Pos.y[eid] += Vel.y[eid] * DT;
      dashEnd(sim, Pos.x[eid], Pos.y[eid]);
      Vel.x[eid] = 0;
      Vel.y[eid] = 0;
    }
  } else {
    const speed = p.stats.speed * (1 - p.slowAmt) * (1 - p.terrainSlow);
    if (p.terrainInertia > 0) {
      // Apesanteur, glace : la vitesse rejoint la commande progressivement (élan, glissade).
      const k = Math.min(1, p.terrainInertia * DT);
      Vel.x[eid] += (mx * speed - Vel.x[eid]) * k;
      Vel.y[eid] += (my * speed - Vel.y[eid]) * k;
    } else {
      Vel.x[eid] = mx * speed;
      Vel.y[eid] = my * speed;
    }
  }
  Pos.x[eid] += Vel.x[eid] * DT;
  Pos.y[eid] += Vel.y[eid] * DT;
  Look.alpha[eid] = p.iFrames > 0 && p.dashT <= 0 ? (sim.state.tick % 6 < 3 ? 0.45 : 1) : 1;
  Look.rot[eid] = Math.atan2(p.faceY, p.faceX);
}

/** Invulnérabilité après une résurrection (s). */
const REVIVE_IFRAMES = 2.5;

/** Dégâts au joueur (ignorés pendant l'invulnérabilité). Renvoie true s'ils ont porté. */
export function damagePlayer(sim: RunSim, amount: number): boolean {
  const p = sim.state.player;
  if (p.iFrames > 0 || sim.state.debug.invincible || sim.state.status !== 'running') return false;
  // Pactes (Fureur), puis armure : réduction fixe, au plus 75 % du coup.
  amount *= sim.state.pacts.mods.enemyDamage;
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
  if (p.hp <= 0 && p.revives > 0) {
    // Résurrection (méta) : moitié des PV, longue invulnérabilité.
    p.revives--;
    p.hp = p.stats.maxHp * 0.5;
    p.iFrames = REVIVE_IFRAMES;
    Life.hp[p.eid] = p.hp;
    sim.events.push(EV.PLAYER_REVIVE, p.revives, 0, Pos.x[p.eid], Pos.y[p.eid], 0);
    return true;
  }
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

/** Soin (multiplié par les soins reçus du personnage ; aucun sous le pacte Jeûne). */
export function healPlayer(sim: RunSim, amount: number): void {
  const p = sim.state.player;
  if (sim.state.pacts.mods.noHeal > 0) return;
  p.hp = Math.min(p.stats.maxHp, p.hp + amount * p.stats.healMult);
  Life.hp[p.eid] = p.hp;
}
