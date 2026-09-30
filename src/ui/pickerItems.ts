/** Éléments des sélecteurs de l'atelier et du menu debug. */
import { BOSSES, CAMPAIGN, ENEMIES, PASSIVES, WEAPONS } from '../content/data';
import { t } from '../i18n';
import type { PickerItem } from './Picker';

/** Secteur de campagne d'un biome (ennemis et boss groupés par secteur). */
function biomeGroup(biome: string): string {
  return CAMPAIGN.find((s) => s.biome === biome)?.name ?? t('training.groupEvents');
}

export function weaponItems(iconUrls: Record<string, string>): PickerItem[] {
  return WEAPONS.map((w, i) => ({ value: i, name: w.name, icon: iconUrls[w.id] }));
}

export function passiveItems(iconUrls: Record<string, string>): PickerItem[] {
  return PASSIVES.map((p, i) => ({ value: i, name: p.name, icon: iconUrls[p.id] }));
}

export function enemyItems(): PickerItem[] {
  const order = (biome: string): number => {
    const i = CAMPAIGN.findIndex((s) => s.biome === biome);
    return i < 0 ? CAMPAIGN.length : i;
  };
  return ENEMIES.map((e, i) => ({
    value: i,
    name: e.name,
    color: e.color,
    group: biomeGroup(e.biome),
  }))
    .map((item, i) => ({ item, key: order(ENEMIES[i].biome) }))
    .sort((a, b) => a.key - b.key || a.item.value - b.item.value)
    .map((x) => x.item);
}

export function bossItems(): PickerItem[] {
  return BOSSES.map((b, i) => ({
    value: i,
    name: b.name,
    color: b.color,
    group: biomeGroup(b.biome),
  }));
}
