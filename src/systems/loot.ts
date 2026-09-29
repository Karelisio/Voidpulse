/**
 * Coffres d'élite : tirage déterministe (graine de la run) appliqué à l'ouverture, affiché
 * ensuite par l'interface (tirage animé). Priorité à l'évolution d'une arme éligible, puis
 * montées de niveau d'armes et de passifs, sinon soin ou fragments. La chance augmente le
 * nombre de récompenses (1, 3 ou 5).
 */
import { EV } from './events';
import { healPlayer } from './player';
import { openLevelUp, refreshStats } from './progression';
import type { RunSim } from './sim';
import type { ChestReward } from './state';
import { canEvolve, evolveWeapon, levelUpWeapon, maxWeaponLevel } from './weapons';

const FRAGMENTS_PER_REWARD = 25;
const HEAL_PER_REWARD = 30;

/** Nombre de récompenses d'un coffre selon la chance. */
export function chestSize(roll: number, luck: number): number {
  if (roll < 0.06 + luck * 0.4) return 5;
  if (roll < 0.28 + luck) return 3;
  return 1;
}

/** Tire et applique une récompense. */
function drawReward(sim: RunSim): ChestReward {
  const st = sim.state;
  // 1. Évolution d'une arme éligible (la plus ancienne d'abord).
  for (const w of st.weapons) {
    if (canEvolve(sim, w)) {
      evolveWeapon(sim, w);
      return { kind: 'evolution', index: w.defIndex, value: w.level };
    }
  }
  // 2. Montée de niveau au hasard parmi armes et passifs améliorables.
  const rng = sim.rng.loot;
  let options = 0;
  for (const w of st.weapons) if (!w.evolved && w.level < maxWeaponLevel(w.def)) options++;
  for (const p of st.passives) if (p.level < p.def.maxLevel) options++;
  if (options > 0) {
    let pick = Math.floor(rng.next() * options);
    for (const w of st.weapons) {
      if (w.evolved || w.level >= maxWeaponLevel(w.def)) continue;
      if (pick-- === 0) {
        levelUpWeapon(w);
        return { kind: 'weapon-up', index: w.defIndex, value: w.level };
      }
    }
    for (const p of st.passives) {
      if (p.level >= p.def.maxLevel) continue;
      if (pick-- === 0) {
        p.level++;
        refreshStats(sim);
        return { kind: 'passive-up', index: p.defIndex, value: p.level };
      }
    }
  }
  // 3. Rien à améliorer : soin si blessé, sinon fragments.
  const p = st.player;
  if (p.hp < p.stats.maxHp * 0.7) {
    healPlayer(sim, HEAL_PER_REWARD);
    return { kind: 'heal', index: -1, value: HEAL_PER_REWARD };
  }
  const gold = Math.round(FRAGMENTS_PER_REWARD * p.stats.greed);
  st.stats.fragments += gold;
  return { kind: 'gold', index: -1, value: gold };
}

/**
 * Ouvre un coffre : tirage, application, puis pause de la run pour l'animation. `size` impose
 * le nombre de récompenses (autel de sacrifice), sinon il dépend de la chance.
 */
export function openChest(sim: RunSim, size = 0): void {
  const st = sim.state;
  const n =
    (size > 0 ? size : chestSize(sim.rng.loot.next(), st.player.stats.luck)) +
    st.pacts.mods.chestRewards;
  const rewards: ChestReward[] = [];
  for (let i = 0; i < n; i++) rewards.push(drawReward(sim));
  st.chest = { rewards };
  st.stats.chests++;
  st.status = 'chest';
  sim.events.push(EV.CHEST_OPEN, n, 0, 0, 0, 0);
}

/** Fin de l'animation du coffre : reprise (ou cartes de niveau en attente). */
export function closeChest(sim: RunSim): void {
  const st = sim.state;
  if (st.status !== 'chest') return;
  st.chest = null;
  st.status = 'running';
  if (st.player.pendingLevels > 0) openLevelUp(sim);
}
