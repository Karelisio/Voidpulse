/** Modèles d'affichage des cartes de montée de niveau et des récompenses de coffre. */
import { EVOLUTION_PASSIVE, PASSIVES, WEAPONS, type WeaponDef } from '../content/data';
import type { ChestReward, LevelUpChoice } from '../systems/state';

export interface CardView {
  key: string;
  title: string;
  badge: string;
  lines: string[];
  icon: string;
  element: string | null;
  kind: 'weapon' | 'passive' | 'heal' | 'gold' | 'evolution';
  /** Indication d'évolution (arme ↔ passif requis). */
  hint: string | null;
}

/** Armes possédées : indices d'évolution sur les cartes. */
export interface OwnedWeapon {
  defIndex: number;
  evolved: boolean;
}

type Icons = Readonly<Partial<Record<string, string>>>;

const fmt = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace('.', ',');

export const ARCHETYPE_LABEL: Record<WeaponDef['archetype'], string> = {
  projectile: 'Projectile',
  orbit: 'Orbite',
  beam: 'Rayon',
  nova: 'Nova',
  boomerang: 'Boomerang',
  chain: 'Chaîne',
  aura: 'Aura',
  mines: 'Mines',
  homing: 'Tête chercheuse',
  zone: 'Zone',
};

const COUNT_UNIT: Record<WeaponDef['archetype'], [string, string]> = {
  projectile: ['projectile', 'projectiles'],
  orbit: ['éclat', 'éclats'],
  beam: ['rayon', 'rayons'],
  nova: ['impulsion', 'impulsions'],
  boomerang: ['lame', 'lames'],
  chain: ['rebond', 'rebonds'],
  aura: ['aura', 'auras'],
  mines: ['mine', 'mines'],
  homing: ['missile', 'missiles'],
  zone: ['zone', 'zones'],
};

const RANGE_LABEL: Record<WeaponDef['archetype'], string> = {
  projectile: 'de portée',
  orbit: "de rayon d'orbite",
  beam: 'de longueur',
  nova: 'de rayon',
  boomerang: 'de portée',
  chain: 'de portée',
  aura: 'de rayon',
  mines: "de rayon d'explosion",
  homing: 'de portée',
  zone: 'de rayon',
};

const STATUS_LABEL: Record<string, string> = {
  fire: 'brûlure plus forte',
  frost: 'gel plus rapide',
  lightning: 'électrisation plus longue',
  poison: 'toxines plus nombreuses',
  arcane: 'exposition accrue',
  void: 'entropie accrue',
};

function weaponDelta(def: WeaponDef, level: number): string[] {
  const d = def.levels[level - 2] as WeaponDef['levels'][number] | undefined;
  if (!d) return [];
  const out: string[] = [];
  const unit = COUNT_UNIT[def.archetype];
  if (d.damage) out.push(`+${fmt(d.damage)} dégâts`);
  if (d.count) out.push(`+${d.count} ${d.count > 1 ? unit[1] : unit[0]}`);
  if (d.pierce) out.push(`+${d.pierce} perforation`);
  if (d.cooldown) out.push(`${fmt(d.cooldown)} s de recharge`);
  if (d.range) out.push(`+${fmt(d.range)} ${RANGE_LABEL[def.archetype]}`);
  if (d.speed) out.push(def.archetype === 'orbit' ? 'rotation plus rapide' : 'plus rapide');
  if (d.size) out.push(def.archetype === 'beam' ? 'rayon plus large' : 'plus gros');
  if (d.duration) out.push(`+${fmt(d.duration)} s de durée`);
  if (d.status) out.push(STATUS_LABEL[def.element] ?? 'statut renforcé');
  return out;
}

export function cardView(
  c: LevelUpChoice,
  icons: Icons,
  owned: readonly OwnedWeapon[] = [],
): CardView {
  if (c.kind === 'heal') {
    return {
      key: 'heal',
      title: 'Réparation',
      badge: 'SOIN',
      lines: ['Rend 30 PV.'],
      icon: icons.heal ?? '',
      element: null,
      kind: 'heal',
      hint: null,
    };
  }
  if (c.kind === 'weapon-new' || c.kind === 'weapon-up') {
    const def = WEAPONS[c.index];
    const passive = PASSIVES[EVOLUTION_PASSIVE[c.index]];
    return {
      key: `w:${def.id}`,
      title: def.name,
      badge:
        c.kind === 'weapon-new'
          ? `NOUVELLE ARME · ${ARCHETYPE_LABEL[def.archetype].toUpperCase()}`
          : `NIVEAU ${c.level}`,
      lines: c.kind === 'weapon-new' ? [def.description] : weaponDelta(def, c.level),
      icon: icons[def.id] ?? '',
      element: def.element,
      kind: 'weapon',
      hint: `Évolue avec ${passive.name}`,
    };
  }
  const def = PASSIVES[c.index];
  const evolves = owned.filter((w) => !w.evolved && EVOLUTION_PASSIVE[w.defIndex] === c.index);
  return {
    key: `p:${def.id}`,
    title: def.name,
    badge: c.kind === 'passive-new' ? 'NOUVEAU PASSIF' : `NIVEAU ${c.level}`,
    lines: [def.description],
    icon: icons[def.id] ?? '',
    element: null,
    kind: 'passive',
    hint:
      evolves.length > 0
        ? `Fait évoluer : ${evolves.map((w) => WEAPONS[w.defIndex].name).join(', ')}`
        : null,
  };
}

/** Récompense de coffre → carte révélée par le tirage animé. */
export function rewardView(r: ChestReward, icons: Icons, i: number): CardView {
  switch (r.kind) {
    case 'evolution': {
      const def = WEAPONS[r.index];
      return {
        key: `r${i}`,
        title: def.evolution.name,
        badge: 'ÉVOLUTION',
        lines: [def.evolution.description],
        icon: icons[def.evolution.id] ?? '',
        element: def.element,
        kind: 'evolution',
        hint: `${def.name} a évolué`,
      };
    }
    case 'weapon-up': {
      const def = WEAPONS[r.index];
      return {
        key: `r${i}`,
        title: def.name,
        badge: `NIVEAU ${r.value}`,
        lines: weaponDelta(def, r.value),
        icon: icons[def.id] ?? '',
        element: def.element,
        kind: 'weapon',
        hint: null,
      };
    }
    case 'passive-up': {
      const def = PASSIVES[r.index];
      return {
        key: `r${i}`,
        title: def.name,
        badge: `NIVEAU ${r.value}`,
        lines: [def.description],
        icon: icons[def.id] ?? '',
        element: null,
        kind: 'passive',
        hint: null,
      };
    }
    case 'heal':
      return {
        key: `r${i}`,
        title: 'Réparation',
        badge: 'SOIN',
        lines: [`Rend ${r.value} PV.`],
        icon: icons.heal ?? '',
        element: null,
        kind: 'heal',
        hint: null,
      };
    case 'gold':
      return {
        key: `r${i}`,
        title: 'Fragments',
        badge: 'BUTIN',
        lines: [`+${r.value} fragments.`],
        icon: icons.gold ?? '',
        element: null,
        kind: 'gold',
        hint: null,
      };
  }
}

/** Icônes tirées au hasard pour le défilement du tirage (cosmétique). */
export function rouletteIcons(icons: Icons): string[] {
  const ids = [...WEAPONS.map((w) => w.id), ...PASSIVES.map((p) => p.id)];
  return ids.map((id) => icons[id] ?? '').filter((u) => u.length > 0);
}

export const ELEMENT_LABEL: Record<string, string> = {
  fire: 'Feu',
  frost: 'Givre',
  lightning: 'Foudre',
  poison: 'Poison',
  arcane: 'Arcane',
  void: 'Vide',
};
