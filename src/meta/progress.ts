/**
 * Bilan de méta d'une partie (hors entraînement) : codex, maîtrise des armes, reliques
 * (première défaite d'un mini-boss : sa relique, sinon chance sur chaque boss), Ascension,
 * XP de compte et niveaux. Renvoie les lignes de l'écran de fin.
 */
import { BOSSES, META, WEAPONS, type ModeId } from '../content/data';
import { Rng } from '../engine/rng';
import type { SaveData } from '../save/schema';
import { addAccountXp } from './account';
import { ascensionReward, recordAscension } from './ascension';
import { claimCodex, discover } from './codex';
import { addMastery } from './mastery';
import { grantRelic, rarityOf, relicBase } from './relics';

export interface RunMetaInput {
  mode: ModeId;
  stage: string;
  stageName: string;
  victory: boolean;
  score: number;
  ascension: number;
  seed: string;
  /** Dégâts par arme (identifiant de l'arme de base). */
  weapons: { id: string; damage: number }[];
  enemies: string[];
  evolutions: string[];
  reactions: string[];
  /** Boss vaincus (identifiants, dans l'ordre). */
  bosses: string[];
  /** Multiplicateur d'XP de compte (talents). */
  xpMult: number;
}

export interface RunMetaResult {
  lines: string[];
  xp: number;
}

export function applyRunMeta(d: SaveData, r: RunMetaInput): RunMetaResult {
  const out: RunMetaResult = { lines: [], xp: 0 };
  if (r.mode === 'training') return out;

  // Codex.
  const fresh = {
    enemies: discover(d, 'enemies', r.enemies),
    weapons: discover(
      d,
      'weapons',
      r.weapons.map((w) => w.id),
    ),
    evolutions: discover(d, 'evolutions', r.evolutions),
    reactions: discover(d, 'reactions', r.reactions),
    bosses: discover(d, 'bosses', r.bosses),
  };
  const found = Object.values(fresh).reduce((s, l) => s + l.length, 0);
  if (found > 0)
    out.lines.push(
      `Codex : ${String(found)} nouvelle${found > 1 ? 's' : ''} entrée${found > 1 ? 's' : ''}`,
    );
  const codex = claimCodex(d).reduce((s, c) => s + c.fragments, 0);
  if (codex > 0) out.lines.push(`Codex : palier atteint, +${String(codex)} fragments`);

  // Maîtrise.
  for (const w of r.weapons) {
    const rank = addMastery(d, w.id, w.damage);
    if (rank === null) continue;
    const name = WEAPONS.find((x) => x.id === w.id)?.name ?? w.id;
    const skin = META.mastery.skins.find((s) => s.rank === rank);
    out.lines.push(
      `Maîtrise : ${name} rang ${String(rank)}${skin ? ` (apparence « ${skin.name} »)` : ''}`,
    );
  }

  // Reliques : mini-boss vaincu pour la première fois → sa relique (rare au moins).
  const rng = new Rng(`${r.seed}:reliques:${String(d.meta.relics.nextUid)}`);
  for (const id of r.bosses) {
    const first = fresh.bosses.includes(id);
    const def = BOSSES.find((b) => b.id === id);
    const tied = META.relics.bases.find((b) => b.boss === id);
    const guaranteed = first && def?.kind === 'mini' && tied !== undefined;
    if (!guaranteed && !rng.chance(META.relics.bossDropChance)) continue;
    const item = guaranteed ? grantRelic(d, rng, tied.id, 1) : grantRelic(d, rng);
    out.lines.push(
      item
        ? `Relique : ${relicBase(item.base)?.name ?? item.base} (${rarityOf(item).name})`
        : 'Relique perdue : inventaire plein.',
    );
  }

  // Ascension : victoire en Campagne ou Hardcore.
  const campaign = r.mode === 'campaign' || r.mode === 'hardcore';
  if (campaign && r.victory) {
    const tier = recordAscension(d, r.stage, r.ascension);
    if (tier !== null) out.lines.push(`Ascension ${String(tier)} ouverte : ${r.stageName}`);
  }

  // XP de compte.
  out.xp = Math.floor(r.score * META.account.scoreXp * r.xpMult * ascensionReward(r.ascension));
  const gain = addAccountXp(d, out.xp);
  out.lines.push(`XP de compte : +${out.xp.toLocaleString('fr-FR')}`);
  if (gain.levels.length > 0) {
    out.lines.push(
      `Niveau de compte ${String(gain.levels[gain.levels.length - 1])} ! +${String(gain.fragments)} fragments`,
    );
  }
  if (gain.paragon > 0) out.lines.push(`Paragon +${String(gain.paragon)} (point à placer)`);
  for (const u of gain.unlocks) out.lines.push(`Débloqué : ${u}`);
  return out;
}
