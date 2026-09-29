/**
 * Composants SoA (tableaux typés indexés par eid), enregistrés dans le monde bitecs.
 * Chaque objet est une « référence de composant » bitecs ; ses champs sont les colonnes.
 */
import { MAX_ENTITIES } from './constants';

const N = MAX_ENTITIES;
const f32 = (): Float32Array => new Float32Array(N);
const i32 = (): Int32Array => new Int32Array(N);
const u8 = (): Uint8Array => new Uint8Array(N);
const u16 = (): Uint16Array => new Uint16Array(N);
const u32 = (): Uint32Array => new Uint32Array(N);

/** Position courante et position au tick précédent (interpolation du rendu). */
export const Pos = { x: f32(), y: f32(), px: f32(), py: f32() };
export const Vel = { x: f32(), y: f32() };
/** Rayon de collision et masse (séparation des foules, recul). */
export const Body = { r: f32(), mass: f32() };
export const Life = { hp: f32(), max: f32() };

/** Indications de rendu : image de l'atlas, échelle, rotation, teinte, opacité, flash. */
export const Look = {
  frame: u16(),
  scale: f32(),
  rot: f32(),
  tint: u32(),
  alpha: f32(),
  flash: f32(),
};

/** Ennemi : type (index de config), machine à états, minuteurs, cible. */
export const Foe = {
  type: u8(),
  state: u8(),
  t0: f32(),
  t1: f32(),
  speed: f32(),
  dmg: f32(),
  xp: f32(),
  kbRes: f32(),
  tx: f32(),
  ty: f32(),
  elite: u8(),
};

export const MARK_SLOTS = 6;

/** Statuts élémentaires, marques de Résonance et recul. */
export const Status = {
  burnDps: f32(),
  burnT: f32(),
  chill: f32(),
  freezeT: f32(),
  shockT: f32(),
  stunT: f32(),
  blindT: f32(),
  brittleT: f32(),
  /** Bitmask des éléments marqués (bit = index d'élément). */
  marks: u8(),
  /** Minuteurs des marques : markT[eid * MARK_SLOTS + élément]. */
  markT: new Float32Array(N * MARK_SLOTS),
  reactCd: f32(),
  kx: f32(),
  ky: f32(),
};

export const SHOT_HIT_MEMORY = 4;

/** Projectile du joueur. */
export const Shot = {
  weapon: u8(),
  element: u8(),
  dmg: f32(),
  pierce: i32(),
  ttl: f32(),
  r: f32(),
  /** Derniers ennemis touchés (évite de retoucher le même en traversant). */
  hits: new Int32Array(N * SHOT_HIT_MEMORY),
  hitN: u8(),
};

/** Projectile ennemi. */
export const Bullet = { dmg: f32(), ttl: f32(), r: f32() };

/** Gemme d'XP. */
export const Gem = { value: f32(), pull: u8() };

/** Zone au sol : nuage de réaction, télégraphe de boss, mine… */
export const Zone = {
  kind: u8(),
  r: f32(),
  w: f32(),
  h: f32(),
  rot: f32(),
  t: f32(),
  dur: f32(),
  dmg: f32(),
  param: f32(),
};

/** Éclat en orbite (arme orbitale). */
export const Orbit = { slot: u8(), index: u8() };

export const WEAPON_SLOTS = 6;

/** Recharge de touche par arme sur chaque ennemi : hitCd[eid * WEAPON_SLOTS + emplacement]. */
export const WeaponHit = { cd: new Float32Array(N * WEAPON_SLOTS) };

// Étiquettes d'archétype (composants sans données).
export const PlayerTag = {};
export const EnemyTag = {};
export const BossTag = {};
export const ShotTag = {};
export const BulletTag = {};
export const GemTag = {};
export const ZoneTag = {};
export const OrbitTag = {};

export const ALL_COMPONENTS = [
  Pos,
  Vel,
  Body,
  Life,
  Look,
  Foe,
  Status,
  Shot,
  Bullet,
  Gem,
  Zone,
  Orbit,
] as const;

type Column = Float32Array | Int32Array | Uint8Array | Uint16Array | Uint32Array;

/** Colonnes « une valeur par entité », collectées une fois (remise à zéro sans allocation). */
const COLUMNS: Column[] = [];
for (const c of ALL_COMPONENTS) {
  for (const col of Object.values(c) as Column[]) if (col.length === N) COLUMNS.push(col);
}

/** Remet à zéro les colonnes d'une entité à la réactivation (pas d'état résiduel). */
export function resetEntity(eid: number): void {
  for (let i = 0; i < COLUMNS.length; i++) COLUMNS[i][eid] = 0;
  const m = eid * MARK_SLOTS;
  for (let i = 0; i < MARK_SLOTS; i++) Status.markT[m + i] = 0;
  const h = eid * SHOT_HIT_MEMORY;
  for (let i = 0; i < SHOT_HIT_MEMORY; i++) Shot.hits[h + i] = -1;
  const w = eid * WEAPON_SLOTS;
  for (let i = 0; i < WEAPON_SLOTS; i++) WeaponHit.cd[w + i] = 0;
  Look.scale[eid] = 1;
  Look.alpha[eid] = 1;
  Look.tint[eid] = 0xffffff;
}
