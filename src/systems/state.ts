/**
 * État d'une run hors composants ECS : joueur, armes, passifs, Résonance, director, boss,
 * montée de niveau et statistiques. Structures créées une fois par run (aucune allocation
 * en cours de partie, hormis les cartes de level-up, hors boucle chaude).
 */
import type { BossDef, PassiveDef, StageDef, WeaponDef, WeaponStats } from '../content/data';

export type RunStatus = 'running' | 'levelup' | 'dead' | 'victory';

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
}

export interface DirectorState {
  eventIndex: number;
  bossSpawned: boolean;
  densityMult: number;
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
  stats: RunStats;
  debug: { invincible: boolean };
}
