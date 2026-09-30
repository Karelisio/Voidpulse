/**
 * Modes de jeu (module pur, testé) : chaque mode traduit le choix du joueur (pilote, secteur,
 * build) en options de run et en règles génériques pour la simulation, qui ignore les modes.
 * Les défis du jour et de la semaine sont tirés d'une graine datée : identiques pour tous.
 */
import {
  BOSSES,
  CAMPAIGN,
  CHARACTERS,
  MODES,
  PACTS,
  PASSIVES,
  STAGES,
  WEAPONS,
  bossIndex,
  type CharacterDef,
  type ModeId,
  type PactDef,
  type RunModKey,
  type StageDef,
  type WeeklyRulesetDef,
} from '../content/data';
import { Rng } from '../engine/rng';
import { t } from '../i18n';
import { ascensionMods, MAX_ASCENSION } from '../meta/ascension';
import type { RunOptions } from '../systems/sim';
import type { RunMods, RunRules } from '../systems/state';
import type { Difficulty } from '../save/schema';

export type ModeInfo = ModesDefMode;
type ModesDefMode = (typeof MODES.modes)[number];

export const MODE_INFO = Object.fromEntries(MODES.modes.map((m) => [m.id, m])) as Record<
  ModeId,
  ModeInfo
>;

const pad = (n: number): string => String(n).padStart(2, '0');

/** Jour local (AAAA-MM-JJ) : le défi change à minuit, heure de l'appareil. */
export function dayKey(d: Date): string {
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Semaine ISO 8601 (AAAA-Www), du lundi au dimanche, heure de l'appareil. */
export function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${String(year)}-W${pad(week)}`;
}

export interface DailyChallenge {
  day: string;
  seed: string;
  character: CharacterDef;
  stage: StageDef;
  pacts: PactDef[];
}

export function dailyChallenge(day: string): DailyChallenge {
  const rng = new Rng(`daily:${day}`);
  const character = rng.pick(CHARACTERS);
  const stage = rng.pick(CAMPAIGN);
  const free = [...PACTS.pacts];
  const pacts: PactDef[] = [];
  while (pacts.length < MODES.daily.pacts && free.length > 0) {
    pacts.push(free.splice(rng.int(free.length), 1)[0]);
  }
  return { day, seed: `daily-${day}`, character, stage, pacts };
}

export interface WeeklyChallenge {
  week: string;
  seed: string;
  ruleset: WeeklyRulesetDef;
  stage: StageDef;
  /** File de boss (règle « boss uniquement »), index dans BOSSES. */
  bosses: number[];
}

export function weeklyChallenge(week: string): WeeklyChallenge {
  const rng = new Rng(`weekly:${week}`);
  const rulesets = MODES.weekly.rulesets;
  const ruleset = rulesets[rng.int(rulesets.length)];
  const stage = rng.pick(CAMPAIGN);
  const bosses: number[] = [];
  if (ruleset.bossOnly) {
    if (stage.miniBoss) bosses.push(bossIndex(stage.miniBoss));
    const finals = CAMPAIGN.filter((s) => s.id !== stage.id).map((s) => bossIndex(s.boss));
    while (bosses.length < 1 + MODES.weekly.bossCount && finals.length > 0) {
      bosses.push(finals.splice(rng.int(finals.length), 1)[0]);
    }
    bosses.push(bossIndex(stage.boss));
  }
  return { week, seed: `weekly-${week}`, ruleset, stage, bosses };
}

/** Build choisi pour le Boss Rush (identifiants d'armes et de passifs). */
export interface Loadout {
  weapons: string[];
  passives: string[];
}

export interface RunSetup {
  mode: ModeId;
  /** Pilote et secteur choisis (ignorés quand le mode les impose). */
  character: string;
  stage: string;
  loadout?: Loadout;
  /** Palier d'Ascension choisi (Campagne, Hardcore). */
  ascension?: number;
  now: Date;
  /** Graine des parties libres. */
  nonce: string;
  /** Difficulté choisie (Normal par défaut) : ignorée par les défis et le Hardcore. */
  difficulty?: Difficulty;
}

/** Modes où la difficulté s'applique (les défis et le Hardcore sont les mêmes pour tous). */
const DIFFICULTY_MODES: readonly ModeId[] = ['campaign', 'endless', 'bossrush'];

/** Ajoute les multiplicateurs de la difficulté « Détente » aux règles de la partie. */
function applyDifficulty(run: ModeRun, setup: RunSetup): ModeRun {
  if (setup.difficulty !== 'relaxed' || !DIFFICULTY_MODES.includes(setup.mode)) return run;
  const rules = run.options.rules ?? {};
  const mods: Partial<RunMods> = { ...rules.mods };
  for (const [k, v] of Object.entries(MODES.difficulty.relaxed) as [RunModKey, number][]) {
    mods[k] = (mods[k] ?? 1) * v;
  }
  return { ...run, options: { ...run.options, rules: { ...rules, mods } } };
}

export interface ModeRun {
  seed: string;
  options: Omit<RunOptions, 'seed'>;
  /** Titre court de la partie (écran de fin), détail (règle du défi…). */
  label: string;
  detail: string;
  /** Défi du jour / de la semaine : clé de période. */
  period: string;
  /** Palier d'Ascension appliqué (0 : aucun). */
  ascension: number;
}

/** Tous les boss, secteur par secteur : le mini-boss puis le boss final. */
export function bossRushQueue(): number[] {
  return CAMPAIGN.flatMap((s) => [
    ...(s.miniBoss ? [bossIndex(s.miniBoss)] : []),
    bossIndex(s.boss),
  ]);
}

/** Arme de départ du pilote, ou la première arme permise si le défi impose des éléments. */
function startingWeapon(character: CharacterDef, elements: readonly string[]): string {
  if (elements.length === 0) return character.weapon;
  const own = WEAPONS.find((w) => w.id === character.weapon);
  if (own && elements.includes(own.element)) return own.id;
  return WEAPONS.find((w) => elements.includes(w.element))?.id ?? character.weapon;
}

export function buildRun(setup: RunSetup): ModeRun {
  return applyDifficulty(buildModeRun(setup), setup);
}

function buildModeRun(setup: RunSetup): ModeRun {
  const info = MODE_INFO[setup.mode];
  const character = CHARACTERS.find((c) => c.id === setup.character) ?? CHARACTERS[0];
  const stage = STAGES[setup.stage] ?? CAMPAIGN[0];
  const free = {
    seed: setup.nonce,
    label: info.name,
    detail: stage.name,
    period: '',
    ascension: 0,
  };
  switch (setup.mode) {
    case 'campaign':
    case 'hardcore': {
      const tier = Math.max(0, Math.min(MAX_ASCENSION, setup.ascension ?? 0));
      return {
        ...free,
        ascension: tier,
        detail: tier > 0 ? t('lines.ascensionDetail', { stage: stage.name, n: tier }) : stage.name,
        options: {
          character: character.id,
          stage: stage.id,
          pactChoice: true,
          rules: tier > 0 ? { mods: ascensionMods(tier) } : undefined,
        },
      };
    }
    case 'endless': {
      const e = MODES.endless;
      const rules: Partial<RunRules> = {
        endless: {
          bossEvery: e.bossEvery,
          bossHpStep: e.bossHpStep,
          hpPerMin: e.hpPerMin,
          damagePerMin: e.damagePerMin,
          densityPerMin: e.densityPerMin,
          densityCap: e.densityCap,
        },
      };
      return {
        ...free,
        options: { character: character.id, stage: stage.id, pactChoice: true, rules },
      };
    }
    case 'daily': {
      const c = dailyChallenge(dayKey(setup.now));
      return {
        seed: c.seed,
        label: info.name,
        detail: `${c.day} · ${c.stage.name}`,
        period: c.day,
        ascension: 0,
        options: {
          character: c.character.id,
          stage: c.stage.id,
          pacts: c.pacts.map((p) => p.id),
          pactChoice: false,
        },
      };
    }
    case 'weekly': {
      const c = weeklyChallenge(weekKey(setup.now));
      const r = c.ruleset;
      const rules: Partial<RunRules> = {
        mods: r.mods,
        elements: r.elements,
        fixedMaxHp: r.fixedMaxHp,
        noRunEvents: r.noRunEvents,
      };
      if (r.bossOnly) {
        rules.bossQueue = c.bosses;
        rules.bossRest = MODES.weekly.bossRest;
      }
      return {
        seed: c.seed,
        label: info.name,
        detail: `${r.name} · ${c.stage.name}`,
        period: c.week,
        ascension: 0,
        options: {
          character: character.id,
          stage: c.stage.id,
          weapon: startingWeapon(character, r.elements),
          pactChoice: !r.bossOnly,
          rules,
        },
      };
    }
    case 'bossrush': {
      const b = MODES.bossRush;
      const lo = setup.loadout ?? { weapons: [], passives: [] };
      const weapons = lo.weapons
        .slice(0, b.weapons)
        .map((id) => WEAPONS.findIndex((w) => w.id === id))
        .filter((i) => i >= 0);
      const passives = lo.passives
        .slice(0, b.passives)
        .map((id) => PASSIVES.findIndex((p) => p.id === id))
        .filter((i) => i >= 0);
      const first = weapons.length > 0 ? WEAPONS[weapons[0]].id : character.weapon;
      return {
        ...free,
        detail: t('lines.bossCount', { n: bossRushQueue().length }),
        options: {
          character: character.id,
          stage: b.stage,
          weapon: first,
          pactChoice: false,
          rules: {
            bossQueue: bossRushQueue(),
            bossRest: b.rest,
            bossHp: b.bossHp,
            healOnBoss: b.heal,
            noRunEvents: true,
            loadout: {
              weapons: weapons.map((index) => ({ index, level: b.weaponLevel })),
              passives: passives.map((index) => ({ index, level: b.passiveLevel })),
            },
          },
        },
      };
    }
    case 'training':
      return {
        ...free,
        detail: t('lines.sandbox'),
        options: {
          character: character.id,
          stage: MODES.training.stage,
          pactChoice: false,
          rules: { sandbox: true, noRunEvents: true },
        },
      };
  }
}

/** Le mode choisit-il le pilote ? le secteur ? un build ? */
export function modeNeeds(mode: ModeId): { character: boolean; stage: boolean; build: boolean } {
  return {
    character: mode !== 'daily',
    stage: mode === 'campaign' || mode === 'hardcore' || mode === 'endless',
    build: mode === 'bossrush',
  };
}

/** Nom d'un boss (écrans des modes). */
export function bossName(index: number): string {
  return BOSSES[index]?.name ?? '';
}
