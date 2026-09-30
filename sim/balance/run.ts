/**
 * Une partie jouée par le bot, du lancement à la fin (ou à la limite de temps), avec les
 * mêmes options que le jeu (mode, personnage, stage, bonus de méta de la sauvegarde).
 */
import { BOSSES, type ModeId } from '../../src/content/data';
import { ascensionOpen } from '../../src/meta/account';
import { ascensionSelected } from '../../src/meta/ascension';
import { metaBonus, type MetaBonus } from '../../src/meta/bonus';
import { buildRun, type ModeRun } from '../../src/modes/modes';
import { defaultSave, type Difficulty, type SaveData } from '../../src/save/schema';
import { DT } from '../../src/engine/constants';
import { RunSim } from '../../src/systems/sim';
import { Bot } from './bot';

export interface RunSetupSim {
  mode?: ModeId;
  stage: string;
  character: string;
  skill: number;
  seed: string;
  /** Sauvegarde dont on applique les bonus permanents (aucun si absente). */
  save?: SaveData;
  /** Limite de temps de jeu simulé (s). */
  maxSeconds?: number;
  /** Difficulté (Normal par défaut). */
  difficulty?: Difficulty;
}

export interface RunOutcome {
  victory: boolean;
  dead: boolean;
  time: number;
  level: number;
  kills: number;
  bosses: string[];
  damageTaken: number;
  /** Dégâts totaux par seconde de jeu. */
  dps: number;
  fragments: number;
  /** PV restants / PV max à la fin. */
  hpLeft: number;
}

export interface PlayedRun {
  sim: RunSim;
  run: ModeRun;
  meta: MetaBonus;
  outcome: RunOutcome;
}

export function playRun(setup: RunSetupSim): PlayedRun {
  const mode = setup.mode ?? 'campaign';
  const save = setup.save;
  const run = buildRun({
    mode,
    character: setup.character,
    stage: setup.stage,
    loadout: { weapons: [], passives: [] },
    ascension: save && ascensionOpen(save) ? ascensionSelected(save, setup.stage) : 0,
    now: new Date(0),
    nonce: setup.seed,
    difficulty: setup.difficulty,
  });
  const meta = metaBonus(save ?? defaultSave());
  const sim = new RunSim({
    seed: run.seed,
    ...run.options,
    pactChoice: false,
    ...(save ? { meta: meta.run } : {}),
  });
  const bot = new Bot(setup.skill, setup.seed);
  const limit = Math.round((setup.maxSeconds ?? 1500) / DT);
  const st = sim.state;
  for (let i = 0; i < limit; i++) {
    bot.act(sim, DT);
    if (st.status === 'victory' || st.status === 'dead') break;
    sim.step();
    sim.events.clear();
  }
  const damage = st.stats.damageBySlot.reduce((a, b) => a + b, 0);
  return {
    sim,
    run,
    meta,
    outcome: {
      victory: st.status === 'victory',
      dead: st.status === 'dead',
      time: st.time,
      level: st.player.level,
      kills: st.stats.kills,
      bosses: st.stats.bossesDefeated.map((b) => BOSSES[b].id),
      damageTaken: st.stats.damageTaken,
      dps: damage / Math.max(1, st.time),
      fragments: st.stats.fragments,
      hpLeft: st.player.hp / Math.max(1, st.player.stats.maxHp),
    },
  };
}
