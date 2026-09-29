/**
 * État d'une run hors composants ECS : joueur, armes, passifs, Résonance, director, boss,
 * montée de niveau et statistiques. Structures créées une fois par run (aucune allocation
 * en cours de partie, hormis les cartes de level-up, hors boucle chaude).
 */
import type {
  BossDef,
  CharacterDef,
  CharacterStats,
  DashDef,
  PactDef,
  PassiveDef,
  RunModKey,
  StageDef,
  WeaponDef,
  WeaponStats,
} from '../content/data';
import type { Timeline } from './timeline';

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
  /** Résurrections restantes (méta). */
  revives: number;
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
  /**
   * Terrain sous le joueur (calculé par la mécanique du stage, appliqué au tick suivant) :
   * ralentissement, inertie (accélération, 0 = aucune), dégâts par seconde.
   */
  terrainSlow: number;
  terrainInertia: number;
  terrainDps: number;
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
  /** Prochaine apparition de mini-boss (index dans stage.miniAt). */
  miniIndex: number;
  bossSpawned: boolean;
  densityMult: number;
  /** Délai avant la prochaine élite (s). */
  eliteT: number;
  /** Multiplicateur des dégâts des ennemis qui apparaissent (partie sans fin). */
  dmgScale: number;
  /** Décalage des vagues scénarisées (rejouées en boucle dans une partie sans fin). */
  waveBase: number;
  /** Boss déjà appelés (partie sans fin, file de boss) ; répit avant le prochain de la file. */
  bossCount: number;
  restT: number;
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
  /** Destination d'une téléportation. */
  tx: number;
  ty: number;
  invulnT: number;
  /** Apparitions de ce boss dans la run (mini-boss : la deuxième est plus solide). */
  appearances: number;
  /** Sa mort termine la run (victoire) ; il lâche un coffre. */
  ends: boolean;
  chest: boolean;
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
  minibosses: number;
  /** Index des boss vaincus pendant la run (récompenses de carrière). */
  bossesDefeated: number[];
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
  /** Modificateurs de base (règles du mode), puis cumul avec les pactes. */
  base: Partial<RunMods>;
  mods: RunMods;
}

/** Mécanique du stage : cycle des vagues (brume, tempête, blizzard, coulées, puits). */
export interface MechanicState {
  /** Temps avant la prochaine vague, durée restante de la vague en cours. */
  cycleT: number;
  activeT: number;
  /** Minuterie secondaire (impacts de la tempête, coulée en attente). */
  subT: number;
  /** Coulée de lave annoncée : origine, angle, délai. */
  flowX: number;
  flowY: number;
  flowA: number;
  flowT: number;
  dotT: number;
}

/**
 * Règles de run génériques, posées par les modes de jeu (la simulation ne connaît pas les
 * modes) : durée sans fin, boss enchaînés, bac à sable, build de départ, éléments permis…
 */
export interface RunRules {
  /** Modificateurs de base (mêmes clés que les pactes), cumulés avec eux, sans chaleur. */
  mods: Partial<RunMods>;
  /**
   * Partie sans fin : le calendrier du stage est remplacé par un boss toutes les `bossEvery` s
   * (PV +`bossHpStep` par apparition), et au-delà de la fin prévue du stage, PV, dégâts et
   * densité des ennemis montent sans limite (densité plafonnée).
   */
  endless: {
    bossEvery: number;
    bossHpStep: number;
    hpPerMin: number;
    damagePerMin: number;
    densityPerMin: number;
    densityCap: number;
  } | null;
  /** Boss enchaînés (index dans BOSSES), sans ennemis ordinaires : victoire après le dernier. */
  bossQueue: readonly number[];
  /** Répit entre deux boss de la file (s), PV des boss de la file, soin à chaque boss vaincu. */
  bossRest: number;
  bossHp: number;
  healOnBoss: number;
  /** Bac à sable : aucun spawn automatique, jamais de fin. */
  sandbox: boolean;
  /** Pas d'événements de run (marchand, autel, horde, faille). */
  noRunEvents: boolean;
  /** Éléments permis pour les armes proposées (vide : tous). */
  elements: readonly string[];
  /** PV max imposés (0 : libres). */
  fixedMaxHp: number;
  /** Build de départ : armes et passifs (index), avec niveaux. */
  loadout: {
    weapons: readonly { index: number; level: number }[];
    passives: readonly { index: number; level: number }[];
  };
}

/** Bonus permanents (méta) apportés à la run : talents, Paragon, reliques, maîtrise. */
export interface MetaRunBonus {
  stats: CharacterStats;
  /** Résurrections (à la mort : moitié des PV, brève invulnérabilité). */
  revives: number;
  /** Multiplicateur de dégâts par arme (index WEAPONS), teinte d'apparence (0 : d'origine). */
  weaponDamage: readonly number[];
  weaponTint: readonly number[];
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
  mechanic: MechanicState;
  rules: RunRules;
  /** Chronologie (graphique de fin). */
  timeline: Timeline;
  /** Bonus permanents de la méta. */
  meta: MetaRunBonus;
  stats: RunStats;
  debug: { invincible: boolean };
}
