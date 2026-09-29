/**
 * Joueur automatique pour le simulateur d'équilibrage : champ de potentiel (fuite des ennemis,
 * des projectiles et des zones dangereuses, attrait des gemmes et des coffres, orbite pour ne
 * pas se laisser acculer), dash de secours, choix de montée de niveau par priorités.
 * `skill` (0-1) règle la lecture du danger et la qualité des choix : 0,35 ≈ débutant,
 * 0,6 ≈ joueur moyen, 0,85 ≈ joueur confirmé. Le bot reste plus faible qu'un humain attentif
 * (il ne lit pas les télégraphes de boss) : les cibles d'équilibrage en tiennent compte.
 */
import { Body, Pos, Zone } from '../../src/engine/components';
import { Rng } from '../../src/engine/rng';
import { PROGRESSION } from '../../src/content/data';
import type { RunSim } from '../../src/systems/sim';
import type { LevelUpChoice } from '../../src/systems/state';

/** Zones ennemies à fuir (voir systems/zones.ts). */
const HOSTILE_ZONES = new Set([1, 2, 3, 4, 11, 12, 14]);
/** Télégraphe rectangulaire (visée du tireur d'élite, ruée des chargeurs). */
const LINE_ZONE = 3;

export class Bot {
  private readonly rng: Rng;
  private orbit = 1;
  private orbitTimer = 0;
  private dashCooldown = 0;

  constructor(
    readonly skill: number,
    seed: string,
  ) {
    this.rng = new Rng(`bot:${seed}`);
  }

  /** Décide de l'entrée du pas suivant et règle les menus en attente. */
  act(sim: RunSim, dt: number): void {
    this.resolveMenus(sim);
    const st = sim.state;
    if (st.status !== 'running') return;
    const w = sim.world;
    const p = st.player.eid;
    const px = Pos.x[p];
    const py = Pos.y[p];
    // Lecture du champ : ennemi le plus proche, barycentre de la horde, danger immédiat.
    const panic = 55 + 45 * this.skill;
    let fx = 0;
    let fy = 0;
    let closest = Infinity;
    let hx = 0;
    let hy = 0;
    let hn = 0;
    let crowd = 0;
    const repel = (x: number, y: number, radius: number, range: number, weight: number): void => {
      const dx = px - x;
      const dy = py - y;
      const n = Math.hypot(dx, dy) || 1;
      const d = n - radius;
      if (d > range) return;
      const k = weight * (1 - Math.max(0, d) / range) ** 2;
      fx += (dx / n) * k;
      fy += (dy / n) * k;
    };
    const enemies = w.enemies;
    for (let i = 0; i < enemies.count; i++) {
      const e = enemies.active[i];
      const d = Math.hypot(Pos.x[e] - px, Pos.y[e] - py) - Body.r[e];
      if (d < closest) closest = d;
      if (d < 420) {
        hx += Pos.x[e];
        hy += Pos.y[e];
        hn++;
      }
      if (d < 150) crowd++;
      repel(Pos.x[e], Pos.y[e], Body.r[e], panic, 1);
    }
    const bosses = w.boss;
    for (let i = 0; i < bosses.count; i++) {
      const b = bosses.active[i];
      const d = Math.hypot(Pos.x[b] - px, Pos.y[b] - py) - Body.r[b];
      if (d < closest) closest = d;
      repel(Pos.x[b], Pos.y[b], Body.r[b], panic + 120, 3);
    }
    const bullets = w.bullets;
    for (let i = 0; i < bullets.count; i++) {
      const b = bullets.active[i];
      repel(Pos.x[b], Pos.y[b], 0, 30 + 70 * this.skill, 0.5 + 2 * this.skill);
    }
    const zones = w.zones;
    for (let i = 0; i < zones.count; i++) {
      const z = zones.active[i];
      if (!HOSTILE_ZONES.has(Zone.kind[z])) continue;
      if (Zone.kind[z] === LINE_ZONE) {
        // Ligne de visée ou de charge : on s'écarte perpendiculairement à la ligne.
        const ux = Math.cos(Zone.rot[z]);
        const uy = Math.sin(Zone.rot[z]);
        const rx = px - Pos.x[z];
        const ry = py - Pos.y[z];
        const along = rx * ux + ry * uy;
        const side = rx * -uy + ry * ux;
        const margin = Zone.h[z] / 2 + 16 + 40 * this.skill;
        if (along > -20 && along < Zone.w[z] + 20 && Math.abs(side) < margin) {
          const k = (2 + 6 * this.skill) * (1 - Math.abs(side) / margin);
          const sgn = side >= 0 ? 1 : -1;
          fx += -uy * sgn * k;
          fy += ux * sgn * k;
        }
        continue;
      }
      const r = Math.max(Zone.r[z], Math.max(Zone.w[z], Zone.h[z]) / 2);
      repel(Pos.x[z], Pos.y[z], r, 25 + 55 * this.skill, 1 + 4 * this.skill);
    }
    const danger = Math.hypot(fx, fy);

    let mx = 0;
    let my = 0;
    // Orbite autour de la horde à distance de confort : les armes tuent ce qui approche.
    this.orbitTimer -= dt;
    if (this.orbitTimer <= 0) {
      this.orbitTimer = 5 + this.rng.next() * 8;
      if (this.rng.chance(0.35)) this.orbit = -this.orbit;
    }
    if (hn > 0) {
      const ox = hx / hn - px;
      const oy = hy / hn - py;
      const n = Math.hypot(ox, oy) || 1;
      const comfort = 140 - 30 * this.skill;
      const radial = closest < comfort - 30 ? -0.6 : closest > comfort + 60 ? 0.35 : 0;
      mx += (-oy / n) * this.orbit + (ox / n) * radial;
      my += (ox / n) * this.orbit + (oy / n) * radial;
    }
    // Gemmes et coffres proches : on va les chercher quand la voie est libre.
    let gx = 0;
    let gy = 0;
    let gd = Infinity;
    const gems = w.gems;
    for (let i = 0; i < gems.count; i++) {
      const g = gems.active[i];
      const d = Math.hypot(Pos.x[g] - px, Pos.y[g] - py);
      if (d < gd) {
        gd = d;
        gx = Pos.x[g];
        gy = Pos.y[g];
      }
    }
    const chests = w.chests;
    for (let i = 0; i < chests.count; i++) {
      const c = chests.active[i];
      const d = Math.hypot(Pos.x[c] - px, Pos.y[c] - py) * 0.5;
      if (d < gd) {
        gd = d;
        gx = Pos.x[c];
        gy = Pos.y[c];
      }
    }
    if (gd < 600) {
      const pull = ((0.6 + 0.8 * this.skill) * (hn === 0 ? 2 : 1)) / (1 + danger * 4);
      mx += ((gx - px) / Math.max(1, gd)) * pull;
      my += ((gy - py) / Math.max(1, gd)) * pull;
    }
    // Danger immédiat : priorité absolue.
    mx += fx * 6;
    my += fy * 6;
    // Imprécision d'un joueur humain.
    const noise = (1 - this.skill) * 0.5;
    mx += (this.rng.next() * 2 - 1) * noise;
    my += (this.rng.next() * 2 - 1) * noise;
    const m = Math.hypot(mx, my);
    sim.input.moveX = m > 1e-9 ? mx / m : 0;
    sim.input.moveY = m > 1e-9 ? my / m : 0;
    const threat = danger;

    // Dash de secours : encerclé ou ennemi au contact.
    this.dashCooldown -= dt;
    const pressed = closest < 20 || crowd > 18 - 6 * this.skill || threat > 3;
    sim.input.dash = false;
    if (pressed && this.dashCooldown <= 0 && this.rng.chance(0.3 + 0.6 * this.skill)) {
      sim.input.dash = true;
      this.dashCooldown = 0.6;
    }
  }

  private resolveMenus(sim: RunSim): void {
    switch (sim.state.status) {
      case 'levelup':
        sim.choose(this.pick(sim, sim.state.levelUp.choices));
        break;
      case 'chest':
        sim.closeChest();
        break;
      case 'merchant':
        sim.closeMerchant();
        break;
      case 'altar':
        sim.closeAltar();
        break;
      case 'pact':
        sim.sealPacts([]);
        break;
      default:
    }
  }

  /** Priorités d'un joueur qui construit un build : armes possédées, nouvelles armes, passifs. */
  private pick(sim: RunSim, choices: readonly LevelUpChoice[]): number {
    const st = sim.state;
    const slots = st.weapons.length < PROGRESSION.maxWeapons;
    let best = 0;
    let bestScore = -Infinity;
    choices.forEach((c, i) => {
      let score: number;
      switch (c.kind) {
        case 'weapon-up':
          score = 3 + c.level * 0.2;
          break;
        case 'weapon-new':
          score = slots ? (st.weapons.length < 3 ? 3.4 : 2.4) : 0;
          break;
        case 'passive-up':
          score = 2 + c.level * 0.1;
          break;
        case 'passive-new':
          score = 1.8;
          break;
        case 'heal':
          score = st.player.hp < st.player.stats.maxHp * 0.4 ? 2.5 : 0.1;
          break;
      }
      score += (this.rng.next() - 0.5) * 3 * (1 - this.skill);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  }
}
