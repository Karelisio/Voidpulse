import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import {
  ARCHETYPES,
  BossDef,
  ELEMENTS,
  EnemyDef,
  PassiveDef,
  PlayerDef,
  ProgressionDef,
  ReactionDef,
  ResonanceDef,
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
      for (const ev of stage.events) expect(enemies.has(ev.enemy)).toBe(true);
    }
  });
});
