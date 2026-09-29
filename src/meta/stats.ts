/**
 * Statistiques de méta (talents, Paragon, reliques) : cumul, libellés et icônes pour les
 * écrans. Mêmes clés que les passifs et personnages, plus résurrections et bonus de fin de run.
 */
import type { MetaStatKey, MetaStats } from '../content/data';

/** Ajoute `n` fois `src` à `into` (valeurs additives, comme les passifs par niveau). */
export function addStats(into: MetaStats, src: MetaStats, n = 1): void {
  for (const [k, v] of Object.entries(src) as [MetaStatKey, number][]) {
    into[k] = (into[k] ?? 0) + v * n;
  }
}

interface StatLabel {
  name: string;
  /** Affichage : pourcentage, valeur brute, ou points de pourcentage. */
  kind: 'pct' | 'flat' | 'points';
  /** Icône de passif associée (atlas d'icônes). */
  icon: string;
}

const LABELS: Record<MetaStatKey, StatLabel> = {
  maxHp: { name: 'PV max', kind: 'flat', icon: 'vitality' },
  speed: { name: 'Vitesse', kind: 'pct', icon: 'swiftness' },
  pickupRadius: { name: 'Ramassage', kind: 'pct', icon: 'magnet' },
  cooldown: { name: 'Recharge', kind: 'pct', icon: 'capacitor' },
  damage: { name: 'Dégâts', kind: 'pct', icon: 'amplifier' },
  area: { name: 'Zone', kind: 'pct', icon: 'lens' },
  armor: { name: 'Armure', kind: 'flat', icon: 'plating' },
  regen: { name: 'Régénération (PV/s)', kind: 'flat', icon: 'nanites' },
  critChance: { name: 'Chance de critique', kind: 'points', icon: 'scope' },
  critMult: { name: 'Dégâts critiques', kind: 'pct', icon: 'overclock' },
  projectileSpeed: { name: 'Vitesse des projectiles', kind: 'pct', icon: 'accelerator' },
  duration: { name: 'Durée', kind: 'pct', icon: 'persistence' },
  amount: { name: 'Projectiles', kind: 'flat', icon: 'multiplier' },
  luck: { name: 'Chance', kind: 'pct', icon: 'clover' },
  growth: { name: 'XP', kind: 'pct', icon: 'growth' },
  greed: { name: 'Or', kind: 'pct', icon: 'greed' },
  dashCooldown: { name: 'Recharge du dash', kind: 'pct', icon: 'phase' },
  status: { name: 'Puissance des statuts', kind: 'pct', icon: 'focus' },
  gauge: { name: 'Jauge de Résonance', kind: 'pct', icon: 'resonator' },
  fire: { name: 'Dégâts de feu', kind: 'pct', icon: 'pyro' },
  frost: { name: 'Dégâts de givre', kind: 'pct', icon: 'cryo' },
  lightning: { name: 'Dégâts de foudre', kind: 'pct', icon: 'electro' },
  poison: { name: 'Dégâts de poison', kind: 'pct', icon: 'toxo' },
  arcane: { name: 'Dégâts arcaniques', kind: 'pct', icon: 'arcano' },
  void: { name: 'Dégâts du vide', kind: 'pct', icon: 'entropo' },
  frozenBonus: { name: 'Dégâts sur les gelés', kind: 'pct', icon: 'cryo' },
  shockBonus: { name: 'Foudre sur les électrisés', kind: 'pct', icon: 'electro' },
  toxinMax: { name: 'Charges de toxines', kind: 'flat', icon: 'toxo' },
  healMult: { name: 'Soins reçus', kind: 'pct', icon: 'nanites' },
  rerolls: { name: 'Relances', kind: 'flat', icon: 'clover' },
  banishes: { name: 'Bannissements', kind: 'flat', icon: 'clover' },
  locks: { name: 'Verrous', kind: 'flat', icon: 'clover' },
  revives: { name: 'Résurrection', kind: 'flat', icon: 'vitality' },
  fragments: { name: 'Fragments ramenés', kind: 'pct', icon: 'greed' },
  accountXp: { name: 'XP de compte', kind: 'pct', icon: 'growth' },
};

const LOOKUP: Partial<Record<string, StatLabel>> = LABELS;

export function statLabel(key: string): StatLabel {
  return LOOKUP[key] ?? { name: key, kind: 'flat', icon: 'amplifier' };
}

const trim = (v: number, digits: number): string =>
  v.toLocaleString('fr-FR', { maximumFractionDigits: digits });

/** « +12 % Dégâts », « +8 PV max », « +2,5 pts Chance de critique ». */
export function formatStat(key: string, value: number): string {
  const l = statLabel(key);
  const sign = value < 0 ? '−' : '+';
  const v = Math.abs(value);
  if (l.kind === 'pct') return `${sign}${trim(v * 100, 1)} % ${l.name}`;
  if (l.kind === 'points') return `${sign}${trim(v * 100, 1)} pts ${l.name}`;
  return `${sign}${trim(v, 2)} ${l.name}`;
}

export function formatStats(stats: MetaStats): string[] {
  return (Object.entries(stats) as [MetaStatKey, number][]).map(([k, v]) => formatStat(k, v));
}
