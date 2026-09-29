/**
 * Statistiques de méta (talents, Paragon, reliques) : cumul, libellés et icônes pour les
 * écrans. Mêmes clés que les passifs et personnages, plus résurrections et bonus de fin de run.
 */
import type { MetaStatKey, MetaStats } from '../content/data';
import { language, num, t, type TKey } from '../i18n';

/** Ajoute `n` fois `src` à `into` (valeurs additives, comme les passifs par niveau). */
export function addStats(into: MetaStats, src: MetaStats, n = 1): void {
  for (const [k, v] of Object.entries(src) as [MetaStatKey, number][]) {
    into[k] = (into[k] ?? 0) + v * n;
  }
}

interface StatLabel {
  /** Affichage : pourcentage, valeur brute, ou points de pourcentage. */
  kind: 'pct' | 'flat' | 'points';
  /** Icône de passif associée (atlas d'icônes). */
  icon: string;
}

const LABELS: Record<MetaStatKey, StatLabel> = {
  maxHp: { kind: 'flat', icon: 'vitality' },
  speed: { kind: 'pct', icon: 'swiftness' },
  pickupRadius: { kind: 'pct', icon: 'magnet' },
  cooldown: { kind: 'pct', icon: 'capacitor' },
  damage: { kind: 'pct', icon: 'amplifier' },
  area: { kind: 'pct', icon: 'lens' },
  armor: { kind: 'flat', icon: 'plating' },
  regen: { kind: 'flat', icon: 'nanites' },
  critChance: { kind: 'points', icon: 'scope' },
  critMult: { kind: 'pct', icon: 'overclock' },
  projectileSpeed: { kind: 'pct', icon: 'accelerator' },
  duration: { kind: 'pct', icon: 'persistence' },
  amount: { kind: 'flat', icon: 'multiplier' },
  luck: { kind: 'pct', icon: 'clover' },
  growth: { kind: 'pct', icon: 'growth' },
  greed: { kind: 'pct', icon: 'greed' },
  dashCooldown: { kind: 'pct', icon: 'phase' },
  status: { kind: 'pct', icon: 'focus' },
  gauge: { kind: 'pct', icon: 'resonator' },
  fire: { kind: 'pct', icon: 'pyro' },
  frost: { kind: 'pct', icon: 'cryo' },
  lightning: { kind: 'pct', icon: 'electro' },
  poison: { kind: 'pct', icon: 'toxo' },
  arcane: { kind: 'pct', icon: 'arcano' },
  void: { kind: 'pct', icon: 'entropo' },
  frozenBonus: { kind: 'pct', icon: 'cryo' },
  shockBonus: { kind: 'pct', icon: 'electro' },
  toxinMax: { kind: 'flat', icon: 'toxo' },
  healMult: { kind: 'pct', icon: 'nanites' },
  rerolls: { kind: 'flat', icon: 'clover' },
  banishes: { kind: 'flat', icon: 'clover' },
  locks: { kind: 'flat', icon: 'clover' },
  revives: { kind: 'flat', icon: 'vitality' },
  fragments: { kind: 'pct', icon: 'greed' },
  accountXp: { kind: 'pct', icon: 'growth' },
};

const LOOKUP: Partial<Record<string, StatLabel>> = LABELS;

export function statLabel(key: string): StatLabel & { name: string } {
  const l = LOOKUP[key] ?? { kind: 'flat', icon: 'amplifier' };
  return { ...l, name: LOOKUP[key] ? t(`stats.${key}` as TKey) : key };
}

const trim = (v: number, digits: number): string => num(v, digits);

/** « +12 % Dégâts », « +8 PV max », « +2,5 pts Chance de critique ». */
export function formatStat(key: string, value: number): string {
  const l = statLabel(key);
  const sign = value < 0 ? '−' : '+';
  const v = Math.abs(value);
  const pct = language() === 'fr' ? ' %' : '%';
  if (l.kind === 'pct') return `${sign}${trim(v * 100, 1)}${pct} ${l.name}`;
  if (l.kind === 'points') return `${sign}${trim(v * 100, 1)} ${t('stats.pts')} ${l.name}`;
  return `${sign}${trim(v, 2)} ${l.name}`;
}

export function formatStats(stats: MetaStats): string[] {
  return (Object.entries(stats) as [MetaStatKey, number][]).map(([k, v]) => formatStat(k, v));
}
