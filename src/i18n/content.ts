/**
 * Traduction des données de jeu (config/*.json, rédigées en français) : chaque champ textuel
 * a une clé stable (« weapon.ember.name »). À chaque changement de langue, les champs sont
 * réécrits en place depuis la table de la langue, ou restaurés en français (instantané pris
 * au premier appel) ; une clé absente garde le français. La simulation n'utilise aucun texte.
 */
import {
  ACHIEVEMENTS,
  AFFIXES,
  BOSSES,
  CHARACTERS,
  ENEMIES,
  META,
  MODES,
  PACTS,
  PASSIVES,
  REACTIONS,
  RETENTION,
  STAGES,
  TALENTS,
  WEAPONS,
} from '../content/data';
import en from './content-en.json';

interface Field {
  key: string;
  get: () => string;
  set: (v: string) => void;
}

type Rec = Record<string, unknown>;

/** Champ `prop` de l'objet `obj`, sous la clé `key`. */
function f(out: Field[], key: string, obj: object, prop: string): void {
  const o = obj as Rec;
  if (typeof o[prop] !== 'string') return;
  out.push({
    key,
    get: () => o[prop] as string,
    set: (v) => {
      o[prop] = v;
    },
  });
}

/** Tous les champs traduisibles des données, dans un ordre stable. */
export function contentFields(): Field[] {
  const out: Field[] = [];
  for (const w of WEAPONS) {
    f(out, `weapon.${w.id}.name`, w, 'name');
    f(out, `weapon.${w.id}.description`, w, 'description');
    f(out, `evolution.${w.evolution.id}.name`, w.evolution, 'name');
    f(out, `evolution.${w.evolution.id}.description`, w.evolution, 'description');
  }
  for (const p of PASSIVES) {
    f(out, `passive.${p.id}.name`, p, 'name');
    f(out, `passive.${p.id}.description`, p, 'description');
  }
  for (const e of ENEMIES) {
    f(out, `enemy.${e.id}.name`, e, 'name');
    f(out, `enemy.${e.id}.description`, e, 'description');
  }
  for (const b of BOSSES) f(out, `boss.${b.id}.name`, b, 'name');
  for (const r of REACTIONS) {
    f(out, `reaction.${r.id}.name`, r, 'name');
    f(out, `reaction.${r.id}.description`, r, 'description');
  }
  for (const a of AFFIXES) {
    f(out, `affix.${a.id}.name`, a, 'name');
    f(out, `affix.${a.id}.description`, a, 'description');
  }
  for (const c of CHARACTERS) {
    const k = `character.${c.id}`;
    f(out, `${k}.name`, c, 'name');
    f(out, `${k}.title`, c, 'title');
    f(out, `${k}.description`, c, 'description');
    f(out, `${k}.passive.name`, c.passive, 'name');
    f(out, `${k}.passive.description`, c.passive, 'description');
    f(out, `${k}.dash.name`, c.dash, 'name');
    f(out, `${k}.dash.description`, c.dash, 'description');
    f(out, `${k}.unlock.hint`, c.unlock, 'hint');
  }
  for (const p of PACTS.pacts) {
    f(out, `pact.${p.id}.name`, p, 'name');
    f(out, `pact.${p.id}.malus`, p, 'malus');
    f(out, `pact.${p.id}.bonus`, p, 'bonus');
  }
  for (const s of Object.values(STAGES)) {
    if (!s) continue;
    f(out, `stage.${s.id}.name`, s, 'name');
    f(out, `stage.${s.id}.description`, s, 'description');
    f(out, `stage.${s.id}.mechanic`, s.mechanic, 'description');
  }
  for (const m of MODES.modes) {
    f(out, `mode.${m.id}.name`, m, 'name');
    f(out, `mode.${m.id}.tagline`, m, 'tagline');
    f(out, `mode.${m.id}.description`, m, 'description');
  }
  for (const r of MODES.weekly.rulesets) {
    f(out, `weekly.${r.id}.name`, r, 'name');
    f(out, `weekly.${r.id}.description`, r, 'description');
  }
  for (const b of TALENTS.branches) f(out, `talentBranch.${b.id}.name`, b, 'name');
  for (const n of TALENTS.nodes) f(out, `talent.${n.id}.name`, n, 'name');
  for (const u of META.account.unlocks) {
    f(out, `unlock.${u.unlock}.${String(u.level)}`, u, 'name');
  }
  for (const p of META.paragon) f(out, `paragon.${p.stat}.name`, p, 'name');
  for (const t of META.ascension.tiers) f(out, `ascension.${String(t.tier)}`, t, 'description');
  for (const r of META.relics.rarities) f(out, `rarity.${r.id}.name`, r, 'name');
  for (const b of META.relics.bases) f(out, `relic.${b.id}.name`, b, 'name');
  for (const s of META.mastery.skins) f(out, `skin.${String(s.rank)}.name`, s, 'name');
  for (const c of META.codex.categories) f(out, `codex.${c.id}.name`, c, 'name');
  for (const q of RETENTION.quests.templates) f(out, `quest.${q.id}.name`, q, 'name');
  for (const th of RETENTION.season.themes) {
    f(out, `season.${th.id}.name`, th, 'name');
    f(out, `season.${th.id}.description`, th, 'description');
  }
  for (const a of ACHIEVEMENTS) {
    f(out, `achievement.${a.id}.name`, a, 'name');
    f(out, `achievement.${a.id}.description`, a, 'description');
  }
  return out;
}

let fields: Field[] | null = null;
let french: string[] = [];

export function applyContentLanguage(lang: 'fr' | 'en'): void {
  if (!fields) {
    fields = contentFields();
    french = fields.map((x) => x.get());
  }
  const table: Partial<Record<string, string>> = en;
  // Une valeur peut citer un autre champ : « {stage.forest.name} » (succès générés).
  const resolve = (v: string): string =>
    v.replace(/\{([a-zA-Z]+\.[^{}]+)\}/g, (all, ref: string) => table[ref] ?? all);
  fields.forEach((x, i) => {
    const v = table[x.key];
    x.set(lang === 'fr' || v === undefined ? french[i] : resolve(v));
  });
}
