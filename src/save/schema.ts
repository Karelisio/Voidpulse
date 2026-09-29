/**
 * Format de la sauvegarde (versionné). Les champs ajoutés plus tard prennent leur valeur par
 * défaut au chargement (fusion avec `defaultSave`) ; seules les transformations (renommage,
 * changement d'unité) demandent une migration (migrate.ts).
 */

export const SAVE_VERSION = 1;

export type ThemeId = 'arcade' | 'material' | 'light' | 'dark';
export type Language = 'fr' | 'en';

export interface AudioPrefs {
  master: number;
  music: number;
  sfx: number;
  ui: number;
  ambience: number;
  bassDb: number;
  trebleDb: number;
  headphones: boolean;
  muted: boolean;
}

export interface ControlPrefs {
  sensitivity: number;
  leftHanded: boolean;
  aim: 'auto' | 'direction';
  haptics: boolean;
}

export interface DisplayPrefs {
  /** Préréglage de qualité (bas, moyen, haut) ou personnalisé. */
  preset: 'low' | 'medium' | 'high' | 'custom';
  resolution: number;
  particles: number;
  damageNumbers: boolean;
  shake: number;
  reduceFlashes: boolean;
  fpsCap: 30 | 60;
  hudScale: number;
  theme: ThemeId;
  language: Language;
  /** Palette adaptée au daltonisme (couleurs des éléments en jeu et dans les menus). */
  colorblind: ColorblindMode;
  /** Couleur d'accent de Material You quand l'appareil n'en fournit pas (graine de la palette). */
  accent: string;
  /** Le HUD prend la couleur d'accent de Material You. */
  hudAccent: boolean;
  /** Orientation de l'écran (portrait par défaut). */
  orientation: 'portrait' | 'landscape' | 'auto';
}

export type ColorblindMode = 'off' | 'deuteranopia' | 'protanopia' | 'tritanopia';

export interface LifetimeStats {
  runs: number;
  victories: number;
  kills: number;
  bestTime: number;
  bestLevel: number;
  playSeconds: number;
  /** Élites abattues (déblocages). */
  elites: number;
  /** Boss et mini-boss vaincus, Éveils, réactions, fragments ramassés, coffres ouverts. */
  bosses: number;
  eveils: number;
  reactions: number;
  gold: number;
  chests: number;
  /** Parties du défi du jour et de la semaine. */
  daily: number;
  weekly: number;
  /** Victoires par pilote. */
  charWins: Record<string, number>;
}

/** Profil : personnage choisi, personnages débloqués, meilleurs rang et score. */
export interface ProfileData {
  character: string;
  unlocked: string[];
  /** Index du meilleur rang atteint (PACTS.ranks), -1 si aucun. */
  bestRank: number;
  bestScore: number;
  /** Dernier stage choisi. */
  stage: string;
  /** Stages terminés (boss final vaincu) : chacun ouvre le suivant. */
  cleared: string[];
  /** Boss vaincus au moins une fois (identifiants). */
  bosses: string[];
  /** Records par stage. */
  stageBest: Record<string, StageRecord>;
  /** Dernier mode joué, dernier build du Boss Rush. */
  mode: string;
  loadout: { weapons: string[]; passives: string[] };
}

export interface StageRecord {
  score: number;
  /** Temps survécu (s). */
  time: number;
  /** Index du meilleur rang en victoire, -1 si aucun. */
  rank: number;
}

/** Entrée du classement local de l'Infini. */
export interface EndlessEntry {
  time: number;
  score: number;
  character: string;
  stage: string;
  /** Horodatage (ms). */
  at: number;
}

/** Records des modes de jeu. */
export interface ModesData {
  endless: { board: EndlessEntry[] };
  /** Défi du jour : jour du dernier essai compté (AAAA-MM-JJ), son résultat, historique. */
  daily: {
    day: string;
    history: { day: string; score: number; time: number; victory: boolean }[];
  };
  /** Défi de la semaine (AAAA-Www) : meilleur score de la semaine en cours. */
  weekly: { week: string; best: number; runs: number };
  /** Boss Rush : meilleur temps de victoire (0 si aucune), record de boss vaincus. */
  bossRush: { bestTime: number; bestBosses: number };
  hardcore: { victories: number; bestScore: number };
}

/** Relique possédée : base, rareté (index), niveau, statistiques secondaires tirées. */
export interface RelicItem {
  uid: number;
  base: string;
  rarity: number;
  level: number;
  stats: { stat: string; value: number }[];
}

/** Progression permanente. */
export interface MetaData {
  /** Rang de chaque talent acheté. */
  talents: Record<string, number>;
  /** Niveau de compte, XP dans le niveau en cours, niveaux Paragon, points Paragon placés. */
  account: { level: number; xp: number; paragon: number; spent: Record<string, number> };
  /** Ascension par stage : palier le plus haut ouvert, palier choisi, plus haut palier gagné. */
  ascension: Record<string, { unlocked: number; selected: number; won?: number }>;
  /** Reliques : inventaire, uid équipés par emplacement (0 : vide), prochain uid. */
  relics: { items: RelicItem[]; equipped: number[]; nextUid: number };
  /** XP de maîtrise par arme, apparence choisie (index de skin, -1 : d'origine). */
  mastery: Record<string, number>;
  skins: Record<string, number>;
  /** Codex : entrées découvertes par catégorie, paliers de récompense déjà versés. */
  codex: {
    enemies: string[];
    weapons: string[];
    evolutions: string[];
    reactions: string[];
    bosses: string[];
    claimed: Record<string, number>;
  };
}

/** Quête en cours : modèle, objectif, progression, récompense réclamée. */
export interface QuestSlot {
  id: string;
  target: number;
  progress: number;
  claimed: boolean;
}

/** Rétention : horloge protégée, quêtes, série, saison, coffre hors ligne, succès. */
export interface RetentionData {
  /** Plus grand instant vu (ms) : un retour en arrière de l'horloge ne fait rien gagner. */
  clock: { max: number };
  quests: {
    day: string;
    daily: QuestSlot[];
    rerolls: number;
    week: string;
    weekly: QuestSlot[];
    /** Quêtes terminées et réclamées (succès). */
    done: number;
  };
  /** Série de connexion : dernier jour, jours en cours, meilleure série. */
  streak: { last: string; count: number; best: number };
  /** Passe de saison : index de saison, XP, paliers réclamés, meilleur palier atteint. */
  season: { id: number; xp: number; claimed: number[]; best: number };
  /** Coffre hors ligne : dernier relevé (ms, 0 : pas encore commencé). */
  chest: { last: number };
  /** Succès débloqués. */
  achievements: string[];
  /** Notifications locales (facultatives, désactivées par défaut). */
  notifications: { enabled: boolean; quests: boolean; chest: boolean; challenge: boolean };
}

/** Mises à jour in-app (version GitHub uniquement). */
export interface UpdatePrefs {
  /** Vérification automatique au lancement (au plus une fois par jour). */
  auto: boolean;
  /** Proposer aussi les préversions. */
  prerelease: boolean;
  /** Dernière vérification (ms). */
  lastCheck: number;
  /** Version que le joueur a choisi d'ignorer. */
  ignored: string;
}

export interface SaveData {
  version: number;
  /** Horodatage (ms) de création et de dernière écriture. */
  createdAt: number;
  updatedAt: number;
  audio: AudioPrefs;
  controls: ControlPrefs;
  display: DisplayPrefs;
  stats: LifetimeStats;
  profile: ProfileData;
  modes: ModesData;
  /** Monnaies de méta (fragments ramenés des parties). */
  wallet: { fragments: number };
  meta: MetaData;
  retention: RetentionData;
  update: UpdatePrefs;
}

export function defaultSave(now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    audio: {
      master: 0.9,
      music: 0.75,
      sfx: 0.9,
      ui: 0.8,
      ambience: 0.7,
      bassDb: 0,
      trebleDb: 0,
      headphones: false,
      muted: false,
    },
    controls: { sensitivity: 1, leftHanded: false, aim: 'auto', haptics: true },
    display: {
      preset: 'high',
      resolution: 1,
      particles: 1,
      damageNumbers: true,
      shake: 1,
      reduceFlashes: false,
      fpsCap: 60,
      hudScale: 1,
      theme: 'arcade',
      language: 'fr',
      colorblind: 'off',
      accent: '#7c5cff',
      hudAccent: false,
      orientation: 'portrait',
    },
    stats: {
      runs: 0,
      victories: 0,
      kills: 0,
      bestTime: 0,
      bestLevel: 0,
      playSeconds: 0,
      elites: 0,
      bosses: 0,
      eveils: 0,
      reactions: 0,
      gold: 0,
      chests: 0,
      daily: 0,
      weekly: 0,
      charWins: {},
    },
    profile: {
      character: 'vex',
      unlocked: ['vex', 'nova', 'volt', 'toxa'],
      bestRank: -1,
      bestScore: 0,
      stage: 'forest',
      cleared: [],
      bosses: [],
      stageBest: {},
      mode: 'campaign',
      loadout: { weapons: [], passives: [] },
    },
    modes: {
      endless: { board: [] },
      daily: { day: '', history: [] },
      weekly: { week: '', best: 0, runs: 0 },
      bossRush: { bestTime: 0, bestBosses: 0 },
      hardcore: { victories: 0, bestScore: 0 },
    },
    wallet: { fragments: 0 },
    meta: {
      talents: {},
      account: { level: 1, xp: 0, paragon: 0, spent: {} },
      ascension: {},
      relics: { items: [], equipped: [0, 0, 0], nextUid: 1 },
      mastery: {},
      skins: {},
      codex: { enemies: [], weapons: [], evolutions: [], reactions: [], bosses: [], claimed: {} },
    },
    retention: {
      clock: { max: 0 },
      quests: { day: '', daily: [], rerolls: 0, week: '', weekly: [], done: 0 },
      streak: { last: '', count: 0, best: 0 },
      season: { id: -1, xp: 0, claimed: [], best: 0 },
      chest: { last: 0 },
      achievements: [],
      notifications: { enabled: false, quests: true, chest: true, challenge: true },
    },
    update: { auto: true, prerelease: false, lastCheck: 0, ignored: '' },
  };
}

/** Préréglages de qualité d'affichage. */
export const QUALITY_PRESETS: Record<
  'low' | 'medium' | 'high',
  Pick<DisplayPrefs, 'resolution' | 'particles' | 'fpsCap'>
> = {
  low: { resolution: 0.6, particles: 0.35, fpsCap: 30 },
  medium: { resolution: 0.8, particles: 0.65, fpsCap: 60 },
  high: { resolution: 1, particles: 1, fpsCap: 60 },
};
