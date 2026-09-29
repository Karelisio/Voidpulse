import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import {
  AffixDef,
  ARCHETYPES,
  BIOMES,
  BossDef,
  CharacterDef,
  ELEMENTS,
  EnemyDef,
  type EnemyParam,
  PassiveDef,
  PlayerDef,
  PactsDef,
  ProgressionDef,
  ReactionDef,
  ResonanceDef,
  RunEventsDef,
  StageDef,
  StatusDef,
  WeaponDef,
} from './schema';

const dir = path.dirname(new URL(import.meta.url).pathname);
const load = (file: string): unknown => JSON.parse(readFileSync(path.join(dir, file), 'utf8'));

function check<T>(schema: ZodType<T>, file: string): T {
  const res = schema.safeParse(load(file));
  if (!res.success) throw new Error(`${file} invalide :\n${res.error.message}`);
  return res.data;
}

describe('données de /config', () => {
  it('valident leurs schémas', () => {
    check(PlayerDef, 'player.json');
    check(ResonanceDef, 'resonance.json');
    check(StatusDef, 'status.json');
    check(ProgressionDef, 'progression.json');
    check(WeaponDef.array(), 'weapons.json');
    check(PassiveDef.array(), 'passives.json');
    check(EnemyDef.array(), 'enemies.json');
    check(BossDef.array(), 'bosses.json');
    check(AffixDef.array(), 'affixes.json');
    check(RunEventsDef, 'runevents.json');
    check(CharacterDef.array(), 'characters.json');
    check(PactsDef, 'pacts.json');
    for (const f of readdirSync(path.join(dir, 'stages'))) check(StageDef, `stages/${f}`);
  });

  it('définissent les 15 réactions, une par paire d’éléments', () => {
    const reactions = check(ReactionDef.array(), 'reactions.json');
    expect(reactions).toHaveLength(15);
    const pairs = new Set(reactions.map((r) => [...r.elements].sort().join('+')));
    expect(pairs.size).toBe(15);
    for (let i = 0; i < ELEMENTS.length; i++) {
      for (let j = i + 1; j < ELEMENTS.length; j++) {
        expect(pairs.has([ELEMENTS[i], ELEMENTS[j]].sort().join('+'))).toBe(true);
      }
    }
  });

  it('offrent 30 armes (5 par élément, 3 par archétype) et 25 passifs', () => {
    const weapons = check(WeaponDef.array(), 'weapons.json');
    const passives = check(PassiveDef.array(), 'passives.json');
    expect(weapons).toHaveLength(30);
    expect(passives).toHaveLength(25);
    for (const el of ELEMENTS) expect(weapons.filter((w) => w.element === el)).toHaveLength(5);
    for (const a of ARCHETYPES) expect(weapons.filter((w) => w.archetype === a)).toHaveLength(3);
    const ids = [...weapons.flatMap((w) => [w.id, w.evolution.id]), ...passives.map((p) => p.id)];
    expect(new Set(ids).size).toBe(ids.length);
    const passiveIds = new Set(passives.map((p) => p.id));
    for (const w of weapons) {
      expect(passiveIds.has(w.evolution.passive)).toBe(true);
      expect(w.levels).toHaveLength(7);
    }
    // Chaque passif sert au moins une évolution.
    for (const p of passives) expect(weapons.some((w) => w.evolution.passive === p.id)).toBe(true);
  });

  it('référencent des identifiants existants', () => {
    const enemies = new Set(check(EnemyDef.array(), 'enemies.json').map((e) => e.id));
    const bosses = check(BossDef.array(), 'bosses.json');
    for (const b of bosses) expect(enemies.has(b.summon)).toBe(true);
    for (const f of readdirSync(path.join(dir, 'stages'))) {
      const stage = check(StageDef, `stages/${f}`);
      expect(bosses.some((b) => b.id === stage.boss)).toBe(true);
      for (const [, mix] of stage.mix)
        for (const id of Object.keys(mix)) expect(enemies.has(id)).toBe(true);
      for (const w of stage.waves) {
        expect(enemies.has(w.enemy)).toBe(true);
        if (w.minion !== undefined) expect(enemies.has(w.minion)).toBe(true);
        if (w.kind === 'escort') expect(w.minion).toBeDefined();
      }
    }
    const events = check(RunEventsDef, 'runevents.json');
    expect(enemies.has(events.horde.enemy)).toBe(true);
  });

  it('offrent 40 ennemis (5 par biome) aux paramètres complets', () => {
    const enemies = check(EnemyDef.array(), 'enemies.json');
    const regular = enemies.filter((e) => e.biome !== 'event');
    expect(regular).toHaveLength(40);
    for (const b of BIOMES.filter((x) => x !== 'event')) {
      expect(regular.filter((e) => e.biome === b)).toHaveLength(5);
    }
    const ids = new Set(enemies.map((e) => e.id));
    expect(ids.size).toBe(enemies.length);
    // Chaque famille demandée par la spec est représentée.
    for (const b of ['swarm', 'tank', 'shooter', 'summoner', 'kamikaze', 'shield', 'teleporter']) {
      expect(regular.some((e) => e.behavior === b)).toBe(true);
    }
    const required: Partial<Record<EnemyDef['behavior'], EnemyParam[]>> = {
      shooter: ['range', 'fireCooldown', 'bulletSpeed', 'bulletDamage'],
      kamikaze: ['triggerRange', 'fuse', 'blastRadius', 'blastDamage'],
      teleporter: ['blinkCooldown', 'telegraph', 'blinkRange'],
      summoner: ['range', 'summonCooldown', 'summonCount', 'cast'],
      shield: ['arc', 'shield', 'turnRate'],
      charger: ['chargeRange', 'windup', 'dashSpeed', 'dashTime', 'recover', 'chargeCooldown'],
      mortar: ['range', 'fireCooldown', 'flight', 'blastRadius', 'blastDamage'],
      turret: ['fireCooldown', 'count', 'bulletSpeed', 'bulletDamage', 'spin'],
      support: ['auraRadius', 'pulse'],
      burrower: [
        'burrowCooldown',
        'burrowTime',
        'digSpeed',
        'telegraph',
        'emergeRadius',
        'emergeDamage',
      ],
      stampede: ['coins'],
    };
    for (const e of enemies) {
      for (const k of required[e.behavior] ?? []) {
        expect(e.params[k], `${e.id}.${k}`).toBeGreaterThan(0);
      }
      if (e.behavior === 'summoner' || e.params.splitCount) {
        expect(e.minion && ids.has(e.minion), `${e.id}.minion`).toBe(true);
      }
      if (e.behavior === 'support')
        expect((e.params.guard ?? 0) + (e.params.heal ?? 0)).toBeGreaterThan(0);
      if (e.params.poolTime) expect(e.params.poolRadius && e.params.poolDps).toBeTruthy();
      if (e.params.trailEvery) expect(e.params.trailRadius && e.params.trailDps).toBeTruthy();
    }
    const affixes = check(AffixDef.array(), 'affixes.json');
    expect(affixes.length).toBeGreaterThanOrEqual(10);
    expect(new Set(affixes.map((a) => a.id)).size).toBe(affixes.length);
  });

  it('offrent 12 personnages aux armes existantes et aux dashs distincts', () => {
    const chars = check(CharacterDef.array(), 'characters.json');
    const weapons = new Set(check(WeaponDef.array(), 'weapons.json').map((w) => w.id));
    expect(chars).toHaveLength(12);
    expect(new Set(chars.map((c) => c.id)).size).toBe(12);
    expect(new Set(chars.map((c) => c.dash.kind)).size).toBe(12);
    for (const c of chars) expect(weapons.has(c.weapon), c.id).toBe(true);
    expect(chars[0].unlock.kind).toBe('default');
    for (const c of chars)
      if (c.unlock.kind !== 'default') expect(c.unlock.hint.length).toBeGreaterThan(0);
  });

  it('définissent des pactes et des rangs cohérents', () => {
    const p = check(PactsDef, 'pacts.json');
    expect(new Set(p.pacts.map((x) => x.id)).size).toBe(p.pacts.length);
    expect(p.pacts.length).toBeGreaterThanOrEqual(p.offer);
    expect(p.ranks[0][1]).toBe(0);
    for (let i = 1; i < p.ranks.length; i++)
      expect(p.ranks[i][1]).toBeGreaterThan(p.ranks[i - 1][1]);
    expect(p.ranks.map((r) => r[0]).join(',')).toBe('C,B,A,S,SS,SSS');
  });
});
