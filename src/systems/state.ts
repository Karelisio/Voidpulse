/**
 * État d'une run hors composants ECS : joueur, armes, passifs, Résonance, director, boss,
 * montée de niveau et statistiques. Structures créées une fois par run (aucune allocation
 * en cours de partie, hormis les cartes de level-up, hors boucle chaude).
 */
import type {
  BossDef,
  CharacterDef,
  DashDef,
  PactDef,
  PassiveDef,
  RunModKey,
  StageDef,
  WeaponDef,
  WeaponStats,
} from '../content/data';

export type RunStatus =
  'running' | 'levelup' | 'chest' | 'merchant' | 'altar' | 'pact' | 'dead' | 'victory';

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
  /** Personnage : dégâts en plus sur les gelés, sur les électrisés (foudre), charges de toxines. */
  frozenBonus: number;
  shockBonus: number;
  toxinMax: number;
  /** Multiplicateur des soins reçus. */
  healMult: number;
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
  /** Ralentissement (givre ennemi) : durée restante et intensité (fraction de vitesse ôtée). */
  slowT: number;
  slowAmt: number;
  /** Dash du personnage : définition, index du type (DASH_KINDS), charges disponibles. */
  dash: DashDef;
  dashKind: number;
  dashCharges: number;
  /** Départ du dash en cours (effets d'arrivée). */
  dashFromX: number;
  dashFromY: number;
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
  /** Prochaine vague scénarisée (index dans stage.waves). */
  waveIndex: number;
  /** Densité visée ce tick (plafond des invocations). */
  target: number;
  /** Multiplicateur de PV des ennemis ce tick (invocations, fissions). */
  hpScale: number;
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

export type RunEventKind = 'merchant' | 'altar' | 'horde' | 'rift';

/** Événements de run : calendrier et effets en cours. */
export interface RunEventsState {
  /** Instant du prochain événement tiré au hasard (s). */
  nextAt: number;
  /** Types déjà tirés dans le cycle en cours (masque) : tous passent avant une répétition. */
  bag: number;
  /** Prochain événement imposé par le stage (index dans stage.runEvents). */
  index: number;
  /** Horde dorée : temps restant et délai avant la prochaine ligne. */
  hordeT: number;
  hordeSpawnT: number;
  /** Faille temporelle : temps suspendu restant. */
  riftT: number;
  /** Autel : progression de l'invocation (s passées dans le cercle). */
  altarProgress: number;
  /** Nombre d'événements déclenchés (statistiques, quêtes). */
  count: number;
  /** Coffres achetés chez le marchand, posés à son départ. */
  pendingChests: number;
  /** Coffre promis par l'autel (nombre de récompenses), ouvert à sa fermeture. */
  pendingChestSize: number;
}

export type MerchantItem = 'heal' | 'weapon' | 'passive' | 'maxhp' | 'reroll' | 'chest';

export interface MerchantOffer {
  item: MerchantItem;
  /** Arme ou passif concerné (index de config), -1 sinon. */
  index: number;
  /** Niveau obtenu, PV ou relances gagnés. */
  value: number;
  price: number;
  sold: boolean;
}

export interface MerchantState {
  offers: MerchantOffer[];
}

export type AltarOfferKind = 'blood' | 'flesh' | 'gold';

export interface AltarOffer {
  kind: AltarOfferKind;
  available: boolean;
}

/** Résultat d'une offrande (mis en forme par l'interface). */
export interface AltarResult {
  kind: 'chest' | 'damage' | 'evolution' | 'levels' | 'heal';
  /** Armes évoluées ou améliorées (index de config). */
  weapons: number[];
  /** Taille du coffre ou bonus de dégâts. */
  value: number;
}

export interface AltarState {
  offers: AltarOffer[];
  /** Offrande choisie, null avant le choix. */
  chosen: AltarOfferKind | null;
  result: AltarResult | null;
}

/** Bonus permanents de la run (autel, marchand). */
export interface RunBonus {
  damage: number;
  maxHp: number;
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
  /** Fragments (or de la run, monnaie méta) ramassés, moins les achats. */
  fragments: number;
  /** Or dépensé chez le marchand et sur l'autel. */
  spent: number;
  runEvents: number;
}

/** Modificateurs de run cumulés des pactes (multiplicateurs à 1, additifs et drapeaux à 0). */
export type RunMods = Record<RunModKey, number>;

export interface PactState {
  /** Pactes scellés (dans l'ordre). */
  taken: PactDef[];
  /** Offre en cours (index dans PACTS.pacts) et nombre de pactes qu'elle permet de prendre. */
  offer: number[];
  picks: number;
  /** Paliers déjà passés ; paliers actifs seulement si la run propose des pactes. */
  milestone: number;
  enabled: boolean;
  mods: RunMods;
}

export interface RunState {
  tick: number;
  time: number;
  status: RunStatus;
  stage: StageDef;
  character: CharacterDef;
  player: PlayerState;
  weapons: WeaponInstance[];
  passives: PassiveInstance[];
  resonance: ResonanceState;
  director: DirectorState;
  boss: BossState;
  levelUp: LevelUpState;
  chest: ChestState | null;
  events: RunEventsState;
  merchant: MerchantState | null;
  altar: AltarState | null;
  bonus: RunBonus;
  pacts: PactState;
  stats: RunStats;
  debug: { invincible: boolean };
}
