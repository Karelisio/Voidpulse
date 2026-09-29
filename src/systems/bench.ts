/**
 * Scénario de charge (menu debug et mesure des performances) : maintient N ennemis coriaces
 * et M projectiles du joueur autour de lui, en plus des armes normales.
 */
import { FRAME } from '../content/frames';
import { Life, Look, Pos, Shot, SHOT_HIT_MEMORY, Vel } from '../engine/components';
import { spawnEnemy } from './enemies';
import { FIRE } from './combat';
import type { RunSim } from './sim';

export interface BenchConfig {
  enemies: number;
  shots: number;
}

export function setupBench(sim: RunSim, cfg: BenchConfig): void {
  sim.state.debug.invincible = true;
  sim.state.director.densityMult = 0;
  topUp(sim, cfg);
}

/** À appeler à chaque tick : complète ennemis et projectiles. */
export function benchTick(sim: RunSim, cfg: BenchConfig): void {
  topUp(sim, cfg);
}

function topUp(sim: RunSim, cfg: BenchConfig): void {
  const p = sim.state.player.eid;
  const px = Pos.x[p];
  const py = Pos.y[p];
  const rng = sim.rng.spawn;
  let guard = 0;
  while (sim.world.enemies.count < cfg.enemies && guard++ < 200) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(120, 700);
    const e = spawnEnemy(sim, rng.int(3), px + Math.cos(a) * r, py + Math.sin(a) * r, 40);
    if (e < 0) break;
    Life.hp[e] = Life.max[e];
  }
  guard = 0;
  while (sim.world.shots.count < cfg.shots && guard++ < 200) {
    const s = sim.spawnIn(sim.world.shots);
    if (s < 0) break;
    const a = rng.range(0, Math.PI * 2);
    Pos.x[s] = px;
    Pos.y[s] = py;
    Pos.px[s] = px;
    Pos.py[s] = py;
    Vel.x[s] = Math.cos(a) * 300;
    Vel.y[s] = Math.sin(a) * 300;
    Shot.weapon[s] = 0;
    Shot.element[s] = FIRE;
    Shot.dmg[s] = 1;
    Shot.pierce[s] = 3;
    Shot.ttl[s] = 2.5;
    Shot.r[s] = 6;
    for (let h = 0; h < SHOT_HIT_MEMORY; h++) Shot.hits[s * SHOT_HIT_MEMORY + h] = -1;
    Look.frame[s] = FRAME.SHOT_FIRE;
    Look.rot[s] = a;
  }
}
