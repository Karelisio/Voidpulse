/** Modèles d'affichage des cartes de montée de niveau et des récompenses de coffre. */
import { EVOLUTION_PASSIVE, PASSIVES, WEAPONS, type WeaponDef } from '../content/data';
import { t, type TKey } from '../i18n';
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

type Archetype = WeaponDef['archetype'];

export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  get projectile() {
    return t('run.archProjectile');
  },
  get orbit() {
    return t('run.archOrbit');
  },
  get beam() {
    return t('run.archBeam');
  },
  get nova() {
    return t('run.archNova');
  },
  get boomerang() {
    return t('run.archBoomerang');
  },
  get chain() {
    return t('run.archChain');
  },
  get aura() {
    return t('run.archAura');
  },
  get mines() {
    return t('run.archMines');
  },
  get homing() {
    return t('run.archHoming');
  },
  get zone() {
    return t('run.archZone');
  },
};

/** Unité de dénombrement (singulier, pluriel) de chaque archétype. */
const COUNT_UNIT: Record<Archetype, [TKey, TKey]> = {
  projectile: ['run.unitProjectileOne', 'run.unitProjectileMany'],
  orbit: ['run.unitOrbitOne', 'run.unitOrbitMany'],
  beam: ['run.unitBeamOne', 'run.unitBeamMany'],
  nova: ['run.unitNovaOne', 'run.unitNovaMany'],
  boomerang: ['run.unitBoomerangOne', 'run.unitBoomerangMany'],
  chain: ['run.unitChainOne', 'run.unitChainMany'],
  aura: ['run.unitAuraOne', 'run.unitAuraMany'],
  mines: ['run.unitMinesOne', 'run.unitMinesMany'],
  homing: ['run.unitHomingOne', 'run.unitHomingMany'],
  zone: ['run.unitZoneOne', 'run.unitZoneMany'],
};

const RANGE_LABEL: Record<Archetype, TKey> = {
  projectile: 'run.rangeReach',
  orbit: 'run.rangeOrbit',
  beam: 'run.rangeLength',
  nova: 'run.rangeRadius',
  boomerang: 'run.rangeReach',
  chain: 'run.rangeReach',
  aura: 'run.rangeRadius',
  mines: 'run.rangeBlast',
  homing: 'run.rangeReach',
  zone: 'run.rangeRadius',
};

const STATUS_LABEL: Partial<Record<string, TKey>> = {
  fire: 'run.statusFire',
  frost: 'run.statusFrost',
  lightning: 'run.statusLightning',
  poison: 'run.statusPoison',
  arcane: 'run.statusArcane',
  void: 'run.statusVoid',
};

function weaponDelta(def: WeaponDef, level: number): string[] {
  const d = def.levels[level - 2] as WeaponDef['levels'][number] | undefined;
  if (!d) return [];
  const out: string[] = [];
  const unit = COUNT_UNIT[def.archetype];
  if (d.damage) out.push(t('run.deltaDamage', { n: d.damage }));
  if (d.count) {
    out.push(t('run.deltaCount', { n: d.count, unit: t(d.count > 1 ? unit[1] : unit[0]) }));
  }
  if (d.pierce) out.push(t('run.deltaPierce', { n: d.pierce }));
  if (d.cooldown) out.push(t('run.deltaCooldown', { n: d.cooldown }));
  if (d.range) {
    out.push(t('run.deltaRange', { n: d.range, label: t(RANGE_LABEL[def.archetype]) }));
  }
  if (d.speed) out.push(t(def.archetype === 'orbit' ? 'run.deltaSpinFaster' : 'run.deltaFaster'));
  if (d.size) out.push(t(def.archetype === 'beam' ? 'run.deltaWiderBeam' : 'run.deltaBigger'));
  if (d.duration) out.push(t('run.deltaDuration', { n: d.duration }));
  if (d.status) out.push(t(STATUS_LABEL[def.element] ?? 'run.statusDefault'));
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
      title: t('run.healTitle'),
      badge: t('run.healBadge'),
      lines: [t('run.healLine', { n: 30 })],
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
          ? t('run.newWeaponBadge', { type: ARCHETYPE_LABEL[def.archetype].toUpperCase() })
          : t('run.levelBadge', { n: c.level }),
      lines: c.kind === 'weapon-new' ? [def.description] : weaponDelta(def, c.level),
      icon: icons[def.id] ?? '',
      element: def.element,
      kind: 'weapon',
      hint: t('run.evolvesWith', { passive: passive.name }),
    };
  }
  const def = PASSIVES[c.index];
  const evolves = owned.filter((w) => !w.evolved && EVOLUTION_PASSIVE[w.defIndex] === c.index);
  return {
    key: `p:${def.id}`,
    title: def.name,
    badge:
      c.kind === 'passive-new' ? t('run.newPassiveBadge') : t('run.levelBadge', { n: c.level }),
    lines: [def.description],
    icon: icons[def.id] ?? '',
    element: null,
    kind: 'passive',
    hint:
      evolves.length > 0
        ? t('run.evolvesList', { list: evolves.map((w) => WEAPONS[w.defIndex].name).join(', ') })
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
        badge: t('run.evolutionBadge'),
        lines: [def.evolution.description],
        icon: icons[def.evolution.id] ?? '',
        element: def.element,
        kind: 'evolution',
        hint: t('run.hasEvolved', { name: def.name }),
      };
    }
    case 'weapon-up': {
      const def = WEAPONS[r.index];
      return {
        key: `r${i}`,
        title: def.name,
        badge: t('run.levelBadge', { n: r.value }),
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
        badge: t('run.levelBadge', { n: r.value }),
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
        title: t('run.healTitle'),
        badge: t('run.healBadge'),
        lines: [t('run.healLine', { n: r.value })],
        icon: icons.heal ?? '',
        element: null,
        kind: 'heal',
        hint: null,
      };
    case 'gold':
      return {
        key: `r${i}`,
        title: t('run.goldTitle'),
        badge: t('run.goldBadge'),
        lines: [t('run.goldLine', { n: r.value })],
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
  get fire() {
    return t('run.elFire');
  },
  get frost() {
    return t('run.elFrost');
  },
  get lightning() {
    return t('run.elLightning');
  },
  get poison() {
    return t('run.elPoison');
  },
  get arcane() {
    return t('run.elArcane');
  },
  get void() {
    return t('run.elVoid');
  },
};
