/**
 * Mesure du coût CPU de la simulation seule (Node) dans le scénario de charge.
 *   npx tsx sim/bench-sim.ts [ennemis] [projectiles] [secondes] [mix]
 */
import { weaponIndex } from '../src/content/data';
import { benchTick, setupBench } from '../src/systems/bench';
import { RunSim } from '../src/systems/sim';

const enemies = Number(process.argv[2] ?? 650);
const shots = Number(process.argv[3] ?? 1100);
const seconds = Number(process.argv[4] ?? 20);
const cfg = { enemies, shots, mix: process.argv[5] === 'mix' };
const sim = new RunSim({ seed: 'bench' });
for (const index of [weaponIndex('frost'), weaponIndex('arc')]) {
  sim.state.status = 'levelup';
  sim.state.player.pendingLevels = 1;
  sim.state.levelUp.choices = [{ kind: 'weapon-new', index, level: 1 }];
  sim.choose(0);
}
setupBench(sim, cfg);
const times: number[] = [];
const ticks = seconds * 60;
for (let t = 0; t < ticks; t++) {
  sim.input.moveX = Math.cos(t / 90);
  sim.input.moveY = Math.sin(t / 110);
  sim.resolvePrompt();
  benchTick(sim, cfg);
  const t0 = performance.now();
  sim.step();
  times.push(performance.now() - t0);
  sim.events.clear();
}
const warm = times.slice(120).sort((a, b) => a - b);
const pct = (p: number): string => warm[Math.floor(p * (warm.length - 1))].toFixed(3);
const mean = warm.reduce((a, b) => a + b, 0) / warm.length;
console.log(
  `ennemis ${sim.world.enemies.count}, projectiles ${sim.world.shots.count}, réactions ${Array.from(sim.state.resonance.countById).reduce((a, b) => a + b, 0)}`,
);
console.log(`ms/tick : moyenne ${mean.toFixed(3)} · p50 ${pct(0.5)} · p95 ${pct(0.95)} · p99 ${pct(0.99)} · max ${pct(1)}`);
