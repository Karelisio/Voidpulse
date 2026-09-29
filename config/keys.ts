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
