/**
 * Listes de clés partagées par les schémas (zod) et le jeu : ce module n'importe pas zod, le
 * bundle peut donc l'embarquer.
 */
export const BEHAVIORS = [
  'swarm',
  'tank',
  'shooter',
  'kamikaze',
  'teleporter',
  'summoner',
  'shield',
  'charger',
  'mortar',
  'turret',
  'support',
  'burrower',
  'stampede',
] as const;
export type BehaviorId = (typeof BEHAVIORS)[number];

/** Biomes (un par stage) : regroupent les ennemis dans le codex ; « event » = horde dorée. */
export const BIOMES = [
  'forest',
  'desert',
  'sunken',
  'volcano',
  'station',
  'tundra',
  'swamp',
  'cathedral',
  'event',
] as const;

/**
 * Paramètres d'ennemi (tous optionnels, en secondes, px, px/s, rad ou fractions).
 * Tir : range, fireCooldown, bulletSpeed, bulletDamage, bulletRadius, count, spread (éventail),
 * telegraph, sniper (1 : ligne de visée). Kamikaze : triggerRange, fuse, blastRadius, blastDamage,
 * deathBullets (épines à l'explosion). Téléporteur : blinkCooldown, blinkRange. Invocateur :
 * summonCooldown, summonCount, cast (+ minion). Bouclier : arc (demi-angle), shield (PV du
 * bouclier en fraction des PV), turnRate. Chargeur : chargeRange, windup, dashSpeed, dashTime,
 * recover, chargeCooldown. Mortier : flight (vol de l'obus). Tourelle : spin (décalage angulaire
 * entre deux salves). Soutien : auraRadius, pulse, guard (multiplicateur de dégâts subis) ou heal
 * (fraction des PV max par impulsion). Fouisseur : burrowCooldown, burrowTime, digSpeed,
 * emergeRadius, emergeDamage. Traits communs : wave/waveFreq (ondulation latérale), hopOn/hopOff/
 * hopBoost (déplacement par bonds), trailEvery/trailRadius/trailDps/trailTime (traînée),
 * splitCount (+ minion : fission à la mort), poolRadius/poolDps/poolTime (flaque à l'impact ou à
 * l'explosion), poolOnDeath (1 : aussi quand il est abattu), slow/slowTime (ralentit le joueur),
 * coins (or lâché).
 */
export const ENEMY_PARAMS = [
  'range',
  'fireCooldown',
  'bulletSpeed',
  'bulletDamage',
  'bulletRadius',
  'count',
  'spread',
  'telegraph',
  'sniper',
  'triggerRange',
  'fuse',
  'blastRadius',
  'blastDamage',
  'deathBullets',
  'blinkCooldown',
  'blinkRange',
  'summonCooldown',
  'summonCount',
  'cast',
  'arc',
  'shield',
  'turnRate',
  'chargeRange',
  'windup',
  'dashSpeed',
  'dashTime',
  'recover',
  'chargeCooldown',
  'flight',
  'spin',
  'auraRadius',
  'pulse',
  'guard',
  'heal',
  'burrowCooldown',
  'burrowTime',
  'digSpeed',
  'emergeRadius',
  'emergeDamage',
  'wave',
  'waveFreq',
  'hopOn',
  'hopOff',
  'hopBoost',
  'trailEvery',
  'trailRadius',
  'trailDps',
  'trailTime',
  'splitCount',
  'poolRadius',
  'poolDps',
  'poolTime',
  'poolOnDeath',
  'slow',
  'slowTime',
  'coins',
] as const;
export type EnemyParam = (typeof ENEMY_PARAMS)[number];

export const RUN_EVENTS = ['merchant', 'altar', 'horde', 'rift'] as const;
export type RunEventId = (typeof RUN_EVENTS)[number];

/** Dashs des personnages (effet au départ ou à l'arrivée, voir systems/player.ts). */
export const DASH_KINDS = [
  'standard',
  'blink',
  'lightning',
  'cloud',
  'phase',
  'rift',
  'charge',
  'double',
  'heal',
  'mine',
  'glide',
  'stasis',
] as const;
export type DashKind = (typeof DASH_KINDS)[number];

/** Statistiques propres aux personnages (en plus de celles des passifs). */
export const CHARACTER_EXTRAS = [
  /** Dégâts subis en plus par les ennemis gelés. */
  'frozenBonus',
  /** Dégâts de foudre subis en plus par les électrisés. */
  'shockBonus',
  /** Charges de toxines supplémentaires. */
  'toxinMax',
  /** Soins reçus en plus (fraction). */
  'healMult',
  'rerolls',
  'banishes',
  'locks',
] as const;
export type CharacterExtra = (typeof CHARACTER_EXTRAS)[number];

/** Conditions de déblocage des personnages (statistiques de carrière). */
export const UNLOCK_KINDS = [
  'default',
  'runs',
  'kills',
  'victories',
  'bestTime',
  'bestLevel',
  'elites',
  'rank',
] as const;

/**
 * Modificateurs de run (pactes). Multiplicateurs (1 par défaut) : vitesse, PV et dégâts des
 * ennemis, densité, intervalle des élites, vitesse des projectiles ennemis, et côté joueur XP,
 * dégâts, or, vitesse, PV max, zone, rayon de ramassage.
 */
export const RUN_MOD_MULT = [
  'enemySpeed',
  'enemyHp',
  'enemyDamage',
  'density',
  'eliteRate',
  'bulletSpeed',
  'xp',
  'damage',
  'gold',
  'speed',
  'maxHp',
  'area',
  'pickup',
] as const;
/** Additifs (0 par défaut) : affixes d'élite, chance, récompenses de coffre, quantité, critique ; drapeaux 0/1 : boss enragé, aucun soin, pas de dash. */
export const RUN_MOD_ADD = [
  'eliteAffixes',
  'luck',
  'chestRewards',
  'amount',
  'critChance',
  'bossRage',
  'noHeal',
  'noDash',
] as const;
export type RunModKey = (typeof RUN_MOD_MULT)[number] | (typeof RUN_MOD_ADD)[number];

/** Modes de jeu (config/modes.json, src/modes/). */
export const MODE_IDS = [
  'campaign',
  'endless',
  'daily',
  'weekly',
  'bossrush',
  'hardcore',
  'training',
] as const;
export type ModeId = (typeof MODE_IDS)[number];

/** Effets propres à la méta (talents) : résurrections, bonus de fragments et d'XP de compte. */
export const META_EXTRAS = ['revives', 'fragments', 'accountXp'] as const;
export type MetaExtra = (typeof META_EXTRAS)[number];

/** Déblocages liés au niveau de compte. */
export const ACCOUNT_UNLOCKS = ['forge', 'relicSlot', 'ascension'] as const;
