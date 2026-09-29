/**
 * Progression de run : courbe d'XP, statistiques du joueur (passifs), cartes de montée de
 * niveau (3 choix, reroll / bannir / verrouiller limités). Hors boucle chaude.
 */
import {
  ELEMENTS,
  EVOLUTION_PASSIVE,
  type CharacterStats,
  PASSIVES,
  PLAYER,
  PROGRESSION,
  WEAPONS,
} from '../content/data';
import { Life } from '../engine/components';
import { EV } from './events';
import { healPlayer } from './player';
import type { RunSim } from './sim';
import type { LevelUpChoice, PlayerStats } from './state';
import { addWeapon, levelUpWeapon, maxWeaponLevel } from './weapons';

export function xpToNext(level: number): number {
  const { a, b, c } = PROGRESSION.xpCurve;
  return Math.round(a * level ** b + c);
}

/** Statistiques de base du joueur (sans passif). */
export function baseStats(): PlayerStats {
  return {
    maxHp: PLAYER.maxHp,
    speed: PLAYER.speed,
    pickupRadius: PLAYER.pickupRadius,
    cooldownMult: 1,
    damageMult: 1,
    areaMult: 1,
    armor: 0,
    regen: 0,
    critChance: PLAYER.critChance,
    critMult: PLAYER.critMult,
    projectileSpeed: 1,
    durationMult: 1,
    amount: 0,
    luck: 0,
    growth: 1,
    greed: 1,
    dashCooldownMult: 1,
    statusMult: 1,
    gaugeMult: 1,
    elementMult: new Float32Array(ELEMENTS.length).fill(1),
    frozenBonus: 0,
    shockBonus: 0,
    toxinMax: 0,
    healMult: 1,
  };
}

/** Applique `n` fois les statistiques `per` (passif par niveau, ou personnage avec n = 1). */
function applyStats(stats: PlayerStats, per: CharacterStats, n: number): void {
  stats.maxHp += (per.maxHp ?? 0) * n;
  stats.speed *= 1 + (per.speed ?? 0) * n;
  stats.pickupRadius *= 1 + (per.pickupRadius ?? 0) * n;
  stats.cooldownMult *= Math.max(0.3, 1 - (per.cooldown ?? 0) * n);
  stats.damageMult *= 1 + (per.damage ?? 0) * n;
  stats.areaMult *= 1 + (per.area ?? 0) * n;
  stats.armor += (per.armor ?? 0) * n;
  stats.regen += (per.regen ?? 0) * n;
  stats.critChance += (per.critChance ?? 0) * n;
  stats.critMult += (per.critMult ?? 0) * n;
  stats.projectileSpeed *= 1 + (per.projectileSpeed ?? 0) * n;
  stats.durationMult *= 1 + (per.duration ?? 0) * n;
  stats.amount += (per.amount ?? 0) * n;
  stats.luck += (per.luck ?? 0) * n;
  stats.growth *= 1 + (per.growth ?? 0) * n;
  stats.greed *= 1 + (per.greed ?? 0) * n;
  stats.dashCooldownMult *= Math.max(0.3, 1 - (per.dashCooldown ?? 0) * n);
  stats.statusMult *= 1 + (per.status ?? 0) * n;
  stats.gaugeMult *= 1 + (per.gauge ?? 0) * n;
  for (let k = 0; k < ELEMENTS.length; k++) {
    stats.elementMult[k] *= 1 + (per[ELEMENTS[k]] ?? 0) * n;
  }
  stats.frozenBonus += (per.frozenBonus ?? 0) * n;
  stats.shockBonus += (per.shockBonus ?? 0) * n;
  stats.toxinMax += (per.toxinMax ?? 0) * n;
  stats.healMult += (per.healMult ?? 0) * n;
}

export function computeStats(sim: RunSim): PlayerStats {
  const st = sim.state;
  const stats = baseStats();
  applyStats(stats, st.character.passive.stats, 1);
  for (const p of st.passives) applyStats(stats, p.def.perLevel, p.level);
  // Bonus de la run (autel, marchand), puis pactes.
  const bonus = st.bonus;
  stats.maxHp = Math.max(10, stats.maxHp + bonus.maxHp);
  stats.damageMult *= 1 + bonus.damage;
  const m = st.pacts.mods;
  stats.maxHp = Math.max(10, Math.round(stats.maxHp * m.maxHp));
  stats.damageMult *= m.damage;
  stats.growth *= m.xp;
  stats.greed *= m.gold;
  stats.speed *= m.speed;
  stats.areaMult *= m.area;
  stats.pickupRadius *= m.pickup;
  stats.luck += m.luck;
  stats.amount += m.amount;
  stats.critChance += m.critChance;
  if (st.rules.fixedMaxHp > 0) stats.maxHp = st.rules.fixedMaxHp;
  return stats;
}

export function refreshStats(sim: RunSim): void {
  const p = sim.state.player;
  const before = p.stats.maxHp;
  p.stats = computeStats(sim);
  // Un gain de PV max soigne d'autant.
  if (p.stats.maxHp > before) p.hp += p.stats.maxHp - before;
  p.hp = Math.min(p.hp, p.stats.maxHp);
  Life.max[p.eid] = p.stats.maxHp;
  Life.hp[p.eid] = p.hp;
}

export function gainLevel(sim: RunSim): void {
  const p = sim.state.player;
  p.level++;
  p.xpNext = xpToNext(p.level);
  p.pendingLevels++;
  sim.events.push(EV.LEVEL_UP, p.level, 0, 0, 0, 0);
  if (sim.state.status === 'running') openLevelUp(sim);
}

const choiceKey = (c: LevelUpChoice): string =>
  c.kind === 'heal' ? 'heal' : `${c.kind.startsWith('weapon') ? 'w' : 'p'}:${c.index}`;

function candidates(sim: RunSim): { choice: LevelUpChoice; weight: number }[] {
  const st = sim.state;
  const out: { choice: LevelUpChoice; weight: number }[] = [];
  const banned = st.levelUp.banished;
  const elements = st.rules.elements;
  WEAPONS.forEach((def, index) => {
    const owned = st.weapons.find((w) => w.defIndex === index);
    // Défi à éléments imposés : les autres armes ne sont pas proposées.
    if (!owned && elements.length > 0 && !elements.includes(def.element)) return;
    const choice: LevelUpChoice | null = owned
      ? owned.level < maxWeaponLevel(def) && !owned.evolved
        ? { kind: 'weapon-up', index, level: owned.level + 1 }
        : null
      : st.weapons.length < PROGRESSION.maxWeapons
        ? { kind: 'weapon-new', index, level: 1 }
        : null;
    // Les premières armes sont favorisées : la Résonance demande au moins deux éléments.
    // Un élément encore absent de l'arsenal est privilégié (nouvelles réactions possibles).
    let weight = owned ? 1.3 : st.weapons.length < 3 ? 2.6 : 1.1;
    if (!owned && !st.weapons.some((w) => w.def.element === def.element)) weight *= 1.3;
    if (choice && !banned.has(choiceKey(choice))) out.push({ choice, weight });
  });
  PASSIVES.forEach((def, index) => {
    const owned = st.passives.find((p) => p.defIndex === index);
    const choice: LevelUpChoice | null = owned
      ? owned.level < def.maxLevel
        ? { kind: 'passive-up', index, level: owned.level + 1 }
        : null
      : st.passives.length < PROGRESSION.maxPassives
        ? { kind: 'passive-new', index, level: 1 }
        : null;
    // Passif requis par l'évolution d'une arme possédée : mis en avant.
    const evolves = st.weapons.some((w) => !w.evolved && EVOLUTION_PASSIVE[w.defIndex] === index);
    const weight = (owned ? 1 : 0.8) * (evolves ? 1.8 : 1);
    if (choice && !banned.has(choiceKey(choice))) out.push({ choice, weight });
  });
  return out;
}

export function rollChoices(sim: RunSim): LevelUpChoice[] {
  const lu = sim.state.levelUp;
  const pool = candidates(sim);
  const picked: LevelUpChoice[] = [];
  if (lu.locked) {
    const key = choiceKey(lu.locked);
    const still = pool.find((c) => choiceKey(c.choice) === key);
    if (still) picked.push(still.choice);
    lu.locked = null;
  }
  const rng = sim.rng.levelup;
  while (picked.length < 3) {
    const remaining = pool.filter((c) => !picked.some((p) => choiceKey(p) === choiceKey(c.choice)));
    if (remaining.length === 0) break;
    const total = remaining.reduce((s, c) => s + c.weight, 0);
    let roll = rng.next() * total;
    let chosen = remaining[remaining.length - 1];
    for (const c of remaining) {
      roll -= c.weight;
      if (roll <= 0) {
        chosen = c;
        break;
      }
    }
    picked.push(chosen.choice);
  }
  if (picked.length === 0) picked.push({ kind: 'heal', index: -1, level: 0 });
  return picked;
}

export function openLevelUp(sim: RunSim): void {
  sim.state.status = 'levelup';
  sim.state.levelUp.choices = rollChoices(sim);
}

export function applyChoice(sim: RunSim, i: number): void {
  const st = sim.state;
  if (st.status !== 'levelup') return;
  const c = st.levelUp.choices[i] as LevelUpChoice | undefined;
  if (!c) return;
  switch (c.kind) {
    case 'weapon-new':
      addWeapon(sim, c.index);
      break;
    case 'weapon-up': {
      const w = st.weapons.find((x) => x.defIndex === c.index);
      if (w) levelUpWeapon(w);
      break;
    }
    case 'passive-new':
      st.passives.push({ def: PASSIVES[c.index], defIndex: c.index, level: 1 });
      refreshStats(sim);
      break;
    case 'passive-up': {
      const p = st.passives.find((x) => x.defIndex === c.index);
      if (p) p.level = Math.min(p.def.maxLevel, p.level + 1);
      refreshStats(sim);
      break;
    }
    case 'heal':
      healPlayer(sim, 30);
      break;
  }
  st.player.pendingLevels--;
  if (st.player.pendingLevels > 0) st.levelUp.choices = rollChoices(sim);
  else {
    st.levelUp.choices = [];
    st.status = 'running';
  }
}

export function reroll(sim: RunSim): boolean {
  const lu = sim.state.levelUp;
  if (sim.state.status !== 'levelup' || lu.rerolls <= 0) return false;
  lu.rerolls--;
  lu.choices = rollChoices(sim);
  return true;
}

export function banish(sim: RunSim, i: number): boolean {
  const lu = sim.state.levelUp;
  const c = lu.choices[i] as LevelUpChoice | undefined;
  if (sim.state.status !== 'levelup' || lu.banishes <= 0 || !c || c.kind === 'heal') return false;
  lu.banishes--;
  lu.banished.add(choiceKey(c));
  lu.choices = rollChoices(sim);
  return true;
}

export function lock(sim: RunSim, i: number): boolean {
  const lu = sim.state.levelUp;
  const c = lu.choices[i] as LevelUpChoice | undefined;
  if (sim.state.status !== 'levelup' || lu.locks <= 0 || !c || c.kind === 'heal') return false;
  lu.locks--;
  lu.locked = c;
  return true;
}
