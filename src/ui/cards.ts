/** Modèles d'affichage des cartes de montée de niveau (texte français, icônes de l'atlas). */
import { PASSIVES, WEAPONS, type WeaponDef } from '../content/data';
import type { LevelUpChoice } from '../systems/state';

export interface CardView {
  key: string;
  title: string;
  badge: string;
  lines: string[];
  icon: string;
  element: string | null;
  kind: 'weapon' | 'passive' | 'heal';
}

const fmt = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace('.', ',');

function countLabel(def: WeaponDef, n: number): string {
  const unit =
    def.archetype === 'orbit' ? 'éclat' : def.archetype === 'chain' ? 'rebond' : 'projectile';
  return `+${n} ${unit}${n > 1 ? 's' : ''}`;
}

function weaponDelta(def: WeaponDef, level: number): string[] {
  const d = def.levels[level - 2] as WeaponDef['levels'][number] | undefined;
  if (!d) return [];
  const out: string[] = [];
  if (d.damage) out.push(`+${fmt(d.damage)} dégâts`);
  if (d.count) out.push(countLabel(def, d.count));
  if (d.pierce) out.push(`+${d.pierce} perforation`);
  if (d.cooldown) out.push(`${fmt(d.cooldown)} s de recharge`);
  if (d.range)
    out.push(
      def.archetype === 'orbit' ? `+${fmt(d.range)} de rayon` : `+${fmt(d.range)} de portée`,
    );
  if (d.speed)
    out.push(def.archetype === 'orbit' ? `rotation plus rapide` : `projectiles plus rapides`);
  if (d.status) {
    out.push(
      def.element === 'fire'
        ? 'brûlure plus forte'
        : def.element === 'frost'
          ? 'gel plus rapide'
          : 'électrisation plus longue',
    );
  }
  return out;
}

export function cardView(
  c: LevelUpChoice,
  iconUrls: Readonly<Partial<Record<string, string>>>,
): CardView {
  if (c.kind === 'heal') {
    return {
      key: 'heal',
      title: 'Réparation',
      badge: 'SOIN',
      lines: ['Rend 30 PV.'],
      icon: iconUrls.heal ?? '',
      element: null,
      kind: 'heal',
    };
  }
  if (c.kind === 'weapon-new' || c.kind === 'weapon-up') {
    const def = WEAPONS[c.index];
    return {
      key: `w:${def.id}`,
      title: def.name,
      badge: c.kind === 'weapon-new' ? 'NOUVELLE ARME' : `NIVEAU ${c.level}`,
      lines: c.kind === 'weapon-new' ? [def.description] : weaponDelta(def, c.level),
      icon: iconUrls[def.id] ?? '',
      element: def.element,
      kind: 'weapon',
    };
  }
  const def = PASSIVES[c.index];
  return {
    key: `p:${def.id}`,
    title: def.name,
    badge: c.kind === 'passive-new' ? 'NOUVEAU PASSIF' : `NIVEAU ${c.level}`,
    lines: [def.description],
    icon: iconUrls[def.id] ?? '',
    element: null,
    kind: 'passive',
  };
}

export const ELEMENT_LABEL: Record<string, string> = {
  fire: 'Feu',
  frost: 'Givre',
  lightning: 'Foudre',
  poison: 'Poison',
  arcane: 'Arcane',
  void: 'Vide',
};
