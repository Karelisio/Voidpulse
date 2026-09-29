/**
 * Pactes : malus contre bonus, choisis au départ (0 à 3 parmi une offre) puis à certains
 * paliers (au plus un de plus). Leurs modificateurs se cumulent (multiplicateurs multipliés,
 * additifs sommés) ; la somme des chaleurs donne le rang de la run (C → SSS) et le
 * multiplicateur de score.
 */
import { PACTS, RUN_MOD_ADD, RUN_MOD_MULT } from '../content/data';
import { EV } from './events';
import { refreshStats } from './progression';
import type { RunSim } from './sim';
import type { PactState, RunMods, RunState } from './state';

export function neutralMods(): RunMods {
  const m = {} as RunMods;
  for (const k of RUN_MOD_MULT) m[k] = 1;
  for (const k of RUN_MOD_ADD) m[k] = 0;
  return m;
}

export function createPacts(enabled: boolean, base: Partial<RunMods> = {}): PactState {
  const pacts: PactState = {
    taken: [],
    offer: [],
    picks: 0,
    milestone: 0,
    enabled,
    base,
    mods: neutralMods(),
  };
  recomputeMods(pacts);
  return pacts;
}

/** Recalcule les modificateurs cumulés : base du mode, puis pactes scellés. */
export function recomputeMods(pacts: PactState): void {
  const m = neutralMods();
  const mult = new Set<string>(RUN_MOD_MULT);
  for (const mods of [pacts.base, ...pacts.taken.map((p) => p.mods)]) {
    for (const [k, v] of Object.entries(mods) as [keyof RunMods, number][]) {
      if (mult.has(k)) m[k] *= v;
      else m[k] += v;
    }
  }
  pacts.mods = m;
}

/** Scelle des pactes par identifiant (défis imposés, tests). */
export function imposePacts(sim: RunSim, ids: readonly string[]): void {
  const st = sim.state;
  for (const id of ids) {
    const def = PACTS.pacts.find((p) => p.id === id);
    if (!def) throw new Error(`Pacte inconnu : ${id}`);
    if (!st.pacts.taken.includes(def)) st.pacts.taken.push(def);
  }
  recomputeMods(st.pacts);
  refreshStats(sim);
}

/** Propose `count` pactes non encore scellés ; la run se met en pause (statut « pact »). */
export function offerPacts(sim: RunSim, count: number, picks: number): void {
  const st = sim.state;
  const free: number[] = [];
  PACTS.pacts.forEach((p, i) => {
    if (!st.pacts.taken.includes(p)) free.push(i);
  });
  const rng = sim.rng.pact;
  const offer: number[] = [];
  while (offer.length < count && free.length > 0) {
    offer.push(free.splice(Math.floor(rng.next() * free.length), 1)[0]);
  }
  if (offer.length === 0) return;
  st.pacts.offer = offer;
  st.pacts.picks = Math.min(picks, PACTS.maxTotal - st.pacts.taken.length);
  if (st.pacts.picks <= 0) return;
  st.status = 'pact';
}

/** Choix du joueur : positions dans l'offre (au plus `picks`), puis reprise. */
export function sealPacts(sim: RunSim, choices: readonly number[]): void {
  const st = sim.state;
  if (st.status !== 'pact') return;
  const chosen = [...new Set(choices)].slice(0, st.pacts.picks);
  for (const i of chosen) {
    const index = st.pacts.offer[i] as number | undefined;
    if (index !== undefined) st.pacts.taken.push(PACTS.pacts[index]);
  }
  st.pacts.offer = [];
  st.pacts.picks = 0;
  st.status = 'running';
  if (chosen.length > 0) {
    recomputeMods(st.pacts);
    refreshStats(sim);
    sim.events.push(EV.PACT, chosen.length, heat(st), 0, 0, 0);
  }
}

/** Paliers : un pacte de plus proposé (appelé par le director). */
export function updatePactMilestones(sim: RunSim): void {
  const st = sim.state;
  const p = st.pacts;
  if (!p.enabled || p.milestone >= PACTS.milestones.length) return;
  if (st.time < PACTS.milestones[p.milestone] || st.status !== 'running') return;
  p.milestone++;
  if (p.taken.length < PACTS.maxTotal) offerPacts(sim, PACTS.milestoneOffer, 1);
}

export function heat(st: RunState): number {
  let h = 0;
  for (const p of st.pacts.taken) h += p.heat;
  return h;
}

/** Rang de la run (index dans PACTS.ranks) selon la chaleur. */
export function rankIndex(h: number): number {
  let r = 0;
  for (let i = 0; i < PACTS.ranks.length; i++) if (h >= PACTS.ranks[i][1]) r = i;
  return r;
}

export function rankOf(h: number): string {
  return PACTS.ranks[rankIndex(h)][0];
}

/**
 * Score de fin de run : éliminations, élites, boss, temps survécu et victoire, multiplié par
 * la chaleur des pactes.
 */
export function runScore(st: RunState): number {
  const s = st.stats;
  const base =
    s.kills +
    40 * s.elitesKilled +
    (s.bossKilled ? 500 : 0) +
    2 * st.time +
    (st.status === 'victory' ? 1500 : 0);
  return Math.floor(base * (1 + heat(st) * PACTS.scorePerHeat));
}
