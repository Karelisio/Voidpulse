/**
 * Instantané d'une partie (reprise après une fermeture de l'application) : état de la run
 * (références aux définitions de config remplacées par leur identifiant), générateurs
 * aléatoires, pools d'entités (actives et pile libre) et colonnes des composants de toutes
 * leurs entités. Restaurée dans une RunSim neuve créée avec les mêmes options, la partie se
 * poursuit exactement comme l'originale (vérifié en test).
 */
import {
  BOSSES,
  CHARACTERS,
  ENEMIES,
  PACTS,
  PASSIVES,
  REACTIONS,
  STAGES,
  WEAPONS,
} from '../content/data';
import { ALL_COMPONENTS, WeaponHit, type Column } from '../engine/components';
import { MAX_ENTITIES } from '../engine/constants';
import { ARCHETYPES, type GameWorld } from '../engine/world';
import { COMBAT_COLUMNS } from './combat';
import { RunSim, type RunOptions } from './sim';

export const SNAPSHOT_VERSION = 1;

export interface RunSnapshot {
  version: number;
  /** Options de la run (encodées comme l'état : valeurs non finies possibles). */
  options: RunOptions;
  state: unknown;
  rng: Record<string, number[]>;
  weaponTint: number[];
  skinned: number[];
  /** Entités actives de chaque pool, dans l'ordre, et pile de ses entités libres. */
  pools: Record<string, number[]>;
  free: Record<string, number[]>;
  /**
   * Par pool : chaque colonne de son archétype en binaire (base64), pour toutes ses entités
   * (actives puis libres) — certains systèmes relisent les colonnes d'entités désactivées.
   */
  columns: Record<string, string[]>;
}

// --- Références aux définitions de config ---------------------------------------------------

/** Objets de config référencés par l'état : identité ↔ clé stable. */
let registry: { byObject: Map<object, string>; byKey: Map<string, object> } | null = null;

function defs(): NonNullable<typeof registry> {
  if (registry) return registry;
  const byObject = new Map<object, string>();
  const byKey = new Map<string, object>();
  const add = (key: string, o: unknown): void => {
    if (typeof o !== 'object' || o === null || byObject.has(o)) return;
    byObject.set(o, key);
    byKey.set(key, o);
  };
  for (const [id, s] of Object.entries(STAGES)) add(`stage:${id}`, s);
  for (const c of CHARACTERS) {
    add(`character:${c.id}`, c);
    add(`dash:${c.id}`, c.dash);
    add(`cpassive:${c.id}`, c.passive);
  }
  for (const w of WEAPONS) {
    add(`weapon:${w.id}`, w);
    add(`evolution:${w.id}`, w.evolution);
  }
  for (const p of PASSIVES) add(`passive:${p.id}`, p);
  for (const b of BOSSES) add(`boss:${b.id}`, b);
  for (const e of ENEMIES) add(`enemy:${e.id}`, e);
  for (const r of REACTIONS) add(`reaction:${r.id}`, r);
  PACTS.pacts.forEach((p) => {
    add(`pact:${p.id}`, p);
  });
  registry = { byObject, byKey };
  return registry;
}

export type Encoded = null | boolean | number | string | Encoded[] | { [k: string]: Encoded };

const TYPED = {
  Float32Array,
  Float64Array,
  Int8Array,
  Int16Array,
  Int32Array,
  Uint8Array,
  Uint16Array,
  Uint32Array,
} as const;
type TypedName = keyof typeof TYPED;

export function encode(v: unknown): Encoded {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : { $num: String(v) };
  if (typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v !== 'object') throw new Error(`Instantané : type non pris en charge (${typeof v})`);
  const ref = defs().byObject.get(v);
  if (ref) return { $def: ref };
  if (ArrayBuffer.isView(v)) {
    const name = v.constructor.name as TypedName;
    if (!(name in TYPED)) throw new Error(`Instantané : tableau ${name} non pris en charge`);
    return { $ta: name, d: Array.from(v as unknown as ArrayLike<number>) };
  }
  if (v instanceof Set) return { $set: [...(v as Set<unknown>)].map(encode) };
  if (v instanceof Map) {
    return { $map: [...(v as Map<unknown, unknown>)].map(([k, x]) => [encode(k), encode(x)]) };
  }
  if (Array.isArray(v)) return v.map(encode);
  const out: Record<string, Encoded> = {};
  for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = encode(x);
  return out;
}

export function decode(v: Encoded): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(decode);
  if ('$def' in v) {
    const o = defs().byKey.get(v.$def as string);
    if (!o) throw new Error(`Instantané : définition inconnue ${JSON.stringify(v.$def)}`);
    return o;
  }
  if ('$num' in v) return Number(v.$num);
  if ('$ta' in v) return TYPED[v.$ta as TypedName].from(v.d as number[]);
  if ('$set' in v) return new Set((v.$set as Encoded[]).map(decode));
  if ('$map' in v)
    return new Map((v.$map as [Encoded, Encoded][]).map(([k, x]) => [decode(k), decode(x)]));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) out[k] = decode(x);
  return out;
}

// --- Colonnes des composants ----------------------------------------------------------------

/** Colonnes d'un archétype, avec leur pas (valeurs par entité). */
function poolColumns(pool: keyof typeof ARCHETYPES): { col: Column; stride: number }[] {
  const out: { col: Column; stride: number }[] = [];
  // Recharges de touche par arme : indexées par ennemi (boss compris), hors archétypes.
  const extra = pool === 'enemies' || pool === 'boss' ? [WeaponHit] : [];
  for (const c of [...ARCHETYPES[pool], ...extra]) {
    if (c !== WeaponHit && !(ALL_COMPONENTS as readonly object[]).includes(c)) continue;
    for (const col of Object.values(c) as Column[]) {
      out.push({ col, stride: Math.round(col.length / MAX_ENTITIES) });
    }
  }
  return out;
}

const poolNames = (world: GameWorld): (keyof typeof ARCHETYPES)[] =>
  (Object.keys(ARCHETYPES) as (keyof typeof ARCHETYPES)[]).filter((k) => k in world);

// --- Binaire compact -----------------------------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function fromBase64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Colonnes par entité hors composants (emplacement crédité des dégâts sur la durée). */
const EXTRA_COLUMNS: Column[] = [COMBAT_COLUMNS.burnSlot, COMBAT_COLUMNS.toxSlot];

function columnsFor(pool: keyof typeof ARCHETYPES): { col: Column; stride: number }[] {
  const cols = poolColumns(pool);
  if (pool === 'enemies' || pool === 'boss') {
    for (const col of EXTRA_COLUMNS) cols.push({ col, stride: 1 });
  }
  return cols;
}

// --- API ------------------------------------------------------------------------------------

export function snapshotSim(sim: RunSim, options: RunOptions): RunSnapshot {
  const pools: Record<string, number[]> = {};
  const free: Record<string, number[]> = {};
  const columns: Record<string, string[]> = {};
  for (const name of poolNames(sim.world)) {
    const pool = sim.world[name];
    const active = Array.from(pool.active.subarray(0, pool.count));
    const idle = Array.from(pool.freeStack());
    pools[name] = active;
    free[name] = idle;
    const all = [...active, ...idle];
    columns[name] = columnsFor(name).map(({ col, stride }) => {
      const Ctor = col.constructor as new (n: number) => Column;
      const out = new Ctor(all.length * stride);
      all.forEach((eid, j) => {
        for (let k = 0; k < stride; k++) out[j * stride + k] = col[eid * stride + k];
      });
      return toBase64(new Uint8Array(out.buffer));
    });
  }
  return {
    version: SNAPSHOT_VERSION,
    options: encode(options) as unknown as RunOptions,
    state: encode(sim.state),
    rng: Object.fromEntries(Object.entries(sim.rng).map(([k, r]) => [k, Array.from(r.state)])),
    weaponTint: Array.from(sim.weaponTint),
    skinned: Array.from(sim.skinned),
    pools,
    free,
    columns,
  };
}

/** Recrée la partie d'un instantané (erreur si l'instantané est d'une autre version). */
export function restoreSim(snap: RunSnapshot): RunSim {
  if (snap.version !== SNAPSHOT_VERSION) throw new Error('Instantané : version différente');
  const sim = new RunSim(decode(snap.options as unknown as Encoded) as RunOptions);
  const state = decode(snap.state as Encoded) as RunSim['state'];
  Object.assign(sim.state, state);
  for (const [k, r] of Object.entries(sim.rng)) r.state.set(snap.rng[k]);
  sim.weaponTint.set(snap.weaponTint);
  sim.skinned.set(snap.skinned);
  for (const name of poolNames(sim.world)) {
    const pool = sim.world[name];
    const active = snap.pools[name] ?? [];
    const idle = snap.free[name] ?? [];
    pool.restore(active, idle);
    const all = [...active, ...idle];
    const data = snap.columns[name] ?? [];
    columnsFor(name).forEach(({ col, stride }, c) => {
      const Ctor = col.constructor as new (b: ArrayBuffer) => Column;
      const bytes = fromBase64(data[c]);
      const values = new Ctor(bytes.buffer as ArrayBuffer);
      all.forEach((eid, j) => {
        for (let k = 0; k < stride; k++) col[eid * stride + k] = values[j * stride + k];
      });
    });
  }
  return sim;
}
