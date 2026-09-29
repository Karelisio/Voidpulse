/**
 * Morts des ennemis : butin (XP, pièces d'or, coffre d'élite), effets de mort (fission des
 * golems, flaques, affixes d'élite), propagation de la flamme noire et de la peste.
 */
import { ENEMY_ELEMENT, ENEMY_MINION, ENEMY_PARAM, RUN_EVENTS } from '../content/data';
import { Body, FOE_FLAG, Foe, Life, Pos, Status } from '../engine/components';
import { spreadBlackflame, spreadPlague } from './combat';
import { onEliteDeath } from './elites';
import { ENEMY_COLOR, STATE, spawnEnemy } from './enemies';
import { ENEMY_ACTION, EV } from './events';
import { dropChest, dropCoins, dropGem } from './pickups';
import type { RunSim } from './sim';
import { spawnHazard } from './zones';

const P = ENEMY_PARAM;
const TAU = Math.PI * 2;

export function processDeaths(sim: RunSim): void {
  const pool = sim.world.enemies;
  const xpMult = sim.state.events.riftT > 0 ? RUN_EVENTS.rift.xp : 1;
  for (let i = pool.count - 1; i >= 0; i--) {
    const e = pool.active[i];
    if (Life.hp[e] > 0) continue;
    // Kamikazes explosés et ruées sorties du champ : pas de mort créditée.
    const s = Foe.state[e];
    if (s !== STATE.EXPLODED && s !== STATE.GONE) onKilled(sim, e, xpMult);
    if (Status.blackT[e] > 0.3) spreadBlackflame(sim, e);
    if (Status.plagueT[e] > 0) spreadPlague(sim, e);
    pool.despawn(e);
  }
}

function onKilled(sim: RunSim, e: number, xpMult: number): void {
  const stats = sim.state.stats;
  const type = Foe.type[e];
  const x = Pos.x[e];
  const y = Pos.y[e];
  stats.kills++;
  stats.killsByType[type]++;
  dropGem(sim, x, y, Foe.xp[e] * xpMult);
  sim.events.push(EV.KILL, e, type, x, y, Foe.xp[e]);

  // Or : horde dorée, élites, sinon au hasard (jamais sur les créatures invoquées).
  const coins = P.coins[type];
  if (coins > 0) dropCoins(sim, x, y, coins);
  else if (Foe.elite[e] !== 0) dropCoins(sim, x, y, RUN_EVENTS.eliteCoins);
  else if (
    (Foe.flags[e] & FOE_FLAG.SUMMONED) === 0 &&
    sim.rng.loot.next() < RUN_EVENTS.coinChance
  ) {
    dropCoins(sim, x, y, 1);
  }

  // Fission : le golem libère ses créatures.
  const split = P.splitCount[type];
  const minion = ENEMY_MINION[type];
  if (split > 0 && minion >= 0) {
    const r = Body.r[e];
    const hpScale = sim.state.director.hpScale;
    for (let k = 0; k < split; k++) {
      const a = (k / split) * TAU + 0.3;
      if (spawnEnemy(sim, minion, x + Math.cos(a) * r, y + Math.sin(a) * r, hpScale) < 0) break;
    }
    sim.events.push(EV.ENEMY_ACTION, ENEMY_ACTION.SPLIT, e, x, y, r);
  }
  if (P.poolOnDeath[type] > 0) {
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
  if (Foe.elite[e] !== 0) {
    stats.elitesKilled++;
    dropChest(sim, x, y);
    onEliteDeath(sim, e);
  }
}
