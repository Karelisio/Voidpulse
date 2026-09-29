/** Fiche d'une entrée du codex : nom, image, description, faits chiffrés. */
import { BOSSES, CAMPAIGN, ENEMIES, PASSIVES, REACTIONS, WEAPONS } from '../../content/data';
import type { CodexCategory } from '../../meta/codex';
import { bossPortrait, iconUrl } from '../portraits';
import { enemyPortrait } from './art';
import { fmt } from './common';

export interface CodexInfo {
  name: string;
  /** Image (data URL) ; absente : pastille colorée (réactions). */
  img?: string;
  color: string;
  description: string;
  facts: [string, string][];
  /** Éléments à afficher en badges. */
  elements: string[];
}

function biomeName(biome: string): string {
  if (biome === 'event') return 'Événement';
  return CAMPAIGN.find((s) => s.biome === biome)?.name ?? biome;
}

export function codexInfo(cat: CodexCategory, id: string): CodexInfo | null {
  switch (cat) {
    case 'enemies': {
      const e = ENEMIES.find((x) => x.id === id);
      if (!e) return null;
      return {
        name: e.name,
        img: enemyPortrait(e),
        color: e.color,
        description: e.description,
        facts: [
          ['Biome', biomeName(e.biome)],
          ['PV', fmt(e.hp)],
          ['Dégâts', fmt(e.damage)],
          ['Vitesse', fmt(e.speed)],
        ],
        elements: e.element ? [e.element] : [],
      };
    }
    case 'weapons': {
      const w = WEAPONS.find((x) => x.id === id);
      if (!w) return null;
      return {
        name: w.name,
        img: iconUrl(w.id),
        color: w.color,
        description: w.description,
        facts: [['Niveaux', String(w.levels.length + 1)]],
        elements: [w.element],
      };
    }
    case 'evolutions': {
      const w = WEAPONS.find((x) => x.evolution.id === id);
      if (!w) return null;
      return {
        name: w.evolution.name,
        img: iconUrl(id),
        color: w.color,
        description: w.evolution.description,
        facts: [
          ['Arme', w.name],
          [
            'Passif requis',
            PASSIVES.find((p) => p.id === w.evolution.passive)?.name ?? w.evolution.passive,
          ],
        ],
        elements: [w.element],
      };
    }
    case 'reactions': {
      const r = REACTIONS.find((x) => x.id === id);
      if (!r) return null;
      return {
        name: r.name,
        color: r.color,
        description: r.description,
        facts: [],
        elements: [...r.elements],
      };
    }
    case 'bosses': {
      const b = BOSSES.find((x) => x.id === id);
      if (!b) return null;
      return {
        name: b.name,
        img: bossPortrait(b.id),
        color: b.color,
        description: '',
        facts: [
          ['Type', b.kind === 'mini' ? 'Mini-boss' : 'Boss final'],
          ['Biome', biomeName(b.biome)],
          ['PV', fmt(b.hp)],
          ['Contact', fmt(b.contactDamage)],
        ],
        elements: b.element ? [b.element] : [],
      };
    }
  }
}
