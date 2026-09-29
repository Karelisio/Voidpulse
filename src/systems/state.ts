/**
 * État d'une run hors composants ECS : joueur, armes, passifs, Résonance, director, boss,
 * montée de niveau et statistiques. Structures créées une fois par run (aucune allocation
 * en cours de partie, hormis les cartes de level-up, hors boucle chaude).
 */
import type { BossDef, PassiveDef, StageDef, WeaponDef, WeaponStats } from '../content/data';

export type RunStatus = 'running' | 'levelup' | 'chest' | 'dead' | 'victory';

export interface SimInput {
  /** Direction de déplacement (norme ≤ 1). */
  moveX: number;
  moveY: number;
  /** Demande de dash (front montant, consommée par la simulation). */
  dash: boolean;
  /** Visée : automatique (ennemi le plus proche) ou dans la direction de déplacement. */
  aim: 'auto' | 'direction';
}

export interface PlayerStats {
  maxHp: number;
  speed: number;
  pickupRadius: number;
  cooldownMult: number;
  damageMult: number;
  areaMult: number;
  armor: number;
  regen: number;
  critChance: number;
  critMult: number;
  projectileSpeed: number;
  durationMult: number;
  amount: number;
  luck: number;
  growth: number;
  greed: number;
  dashCooldownMult: number;
  statusMult: number;
  gaugeMult: number;
  /** Multiplicateur de dégâts par élément (noyaux). */
  elementMult: Float32Array;
}

/** Paramètres d'archétype complets (valeurs par défaut appliquées, forme fixe). */
export interface WeaponParamsN {
  spread: number;
  pattern: number;
  explode: number;
  split: number;
  turn: number;
  sweep: number;
  track: number;
  tick: number;
  pull: number;
  knock: number;
  strike: number;
  pool: number;
  arm: number;
  fork: number;
  arcs: number;
  heal: number;
  critBonus: number;
}

export interface PlayerState {
  eid: number;
  hp: number;
  level: number;
  xp: number;
  xpNext: number;
  pendingLevels: number;
  iFrames: number;
  dashT: number;
  dashCd: number;
  dashX: number;
  dashY: number;
  faceX: number;
  faceY: number;
  stats: PlayerStats;
}

export interface WeaponInstance {
  def: WeaponDef;
  defIndex: number;
  slot: number;
  level: number;
  element: number;
  stats: WeaponStats;
  cd: number;
  angle: number;
  /** Éclats actifs (armes orbitales). */
  shards: number;
  params: WeaponParamsN;
  evolved: boolean;
  /** Impulsions de nova restantes et délai avant la suivante. */
  pulses: number;
  pulseT: number;
  /** Limite la fréquence des sons des armes continues (orbite, aura). */
  fxT: number;
}

export interface PassiveInstance {
  def: PassiveDef;
  defIndex: number;
  level: number;
}

export interface ResonanceState {
  gauge: number;
  eveilT: number;
  novaT: number;
  novaElement: number;
  lastReaction: number;
  repeat: number;
  /** Réactions récentes (anneau) : identifiants et instants. */
  recentIds: Int8Array;
  recentTimes: Float32Array;
  recentHead: number;
  countById: Int32Array;
  eveils: number;
  /** Réaction dominante de l'Éveil en cours (forme de l'ultime), -1 sinon. */
  dominant: number;
}

export interface DirectorState {
  eventIndex: number;
  bossSpawned: boolean;
  densityMult: number;
  /** Délai avant la prochaine élite (s). */
  eliteT: number;
}

export type BossPhaseState = 'enter' | 'idle' | 'telegraph' | 'execute' | 'recover' | 'dying';

export interface BossState {
  eid: number;
  def: BossDef | null;
  defIndex: number;
  phase: number;
  state: BossPhaseState;
  timer: number;
  pattern: number;
  patternCursor: number;
  sub: number;
  subT: number;
  angle: number;
  dirX: number;
  dirY: number;
  invulnT: number;
}

export type ChoiceKind = 'weapon-new' | 'weapon-up' | 'passive-new' | 'passive-up' | 'heal';

export interface LevelUpChoice {
  kind: ChoiceKind;
  /** Index dans WEAPONS ou PASSIVES (-1 pour le soin). */
  index: number;
  /** Niveau obtenu si la carte est choisie. */
  level: number;
}

export type ChestRewardKind = 'evolution' | 'weapon-up' | 'passive-up' | 'heal' | 'gold';

export interface ChestReward {
  kind: ChestRewardKind;
  /** Index dans WEAPONS ou PASSIVES (-1 pour soin et fragments). */
  index: number;
  /** Niveau atteint, PV rendus ou fragments gagnés. */
  value: number;
}

export interface ChestState {
  rewards: ChestReward[];
}

export interface LevelUpState {
  choices: LevelUpChoice[];
  rerolls: number;
  banishes: number;
  locks: number;
  locked: LevelUpChoice | null;
  banished: Set<string>;
}

export interface RunStats {
  kills: number;
  killsByType: Int32Array;
  /** Dégâts par emplacement d'arme (0-5), réactions (6), Éveil (7). */
  damageBySlot: Float64Array;
  damageTaken: number;
  xpCollected: number;
  peakEnemies: number;
  bossKilled: boolean;
  elitesKilled: number;
  chests: number;
  evolutions: number;
  /** Fragments (monnaie méta) ramassés. */
  fragments: number;
}

export interface RunState {
  tick: number;
  time: number;
  status: RunStatus;
  stage: StageDef;
  player: PlayerState;
  weapons: WeaponInstance[];
  passives: PassiveInstance[];
  resonance: ResonanceState;
  director: DirectorState;
  boss: BossState;
  levelUp: LevelUpState;
  chest: ChestState | null;
  stats: RunStats;
  debug: { invincible: boolean };
}
