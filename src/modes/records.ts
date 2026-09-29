/**
 * Résultats des modes (module pur, testé) : classement de l'Infini, essai compté du défi du
 * jour, meilleur score de la semaine, records du Boss Rush et du Hardcore, fragments ramenés.
 */
import { num, t } from '../i18n';
import { MODES, type ModeId } from '../content/data';
import type { SaveData } from '../save/schema';

/** Défi du jour : le premier essai de la journée compte ; les suivants sont hors classement. */
export function beginDaily(d: SaveData, day: string): boolean {
  if (d.modes.daily.day === day) return false;
  d.modes.daily.day = day;
  return true;
}

export interface ModeResult {
  mode: ModeId;
  stage: string;
  character: string;
  victory: boolean;
  score: number;
  time: number;
  /** Boss vaincus pendant la partie. */
  bosses: number;
  /** Fragments nets de la partie (ramassés moins dépensés). */
  fragments: number;
  /** Défi du jour ou de la semaine : clé de période ; essai du jour compté. */
  period: string;
  counted: boolean;
  at: number;
}

export interface ModeRecord {
  /** Fragments versés au portefeuille. */
  fragments: number;
  /** Lignes d'information pour l'écran de fin. */
  lines: string[];
}

/** `fragMult` : bonus de fragments de la méta (talents, Ascension). */
export function recordMode(d: SaveData, r: ModeResult, fragMult = 1): ModeRecord {
  const out: ModeRecord = { fragments: 0, lines: [] };
  if (r.mode === 'training') {
    out.lines.push(t('lines.trainingNotCounted'));
    return out;
  }
  const m = d.modes;
  switch (r.mode) {
    case 'endless': {
      const board = m.endless.board;
      const entry = {
        time: r.time,
        score: r.score,
        character: r.character,
        stage: r.stage,
        at: r.at,
      };
      board.push(entry);
      board.sort((a, b) => b.time - a.time || b.score - a.score);
      board.length = Math.min(board.length, MODES.endless.leaderboard);
      const rank = board.indexOf(entry);
      out.lines.push(
        rank >= 0
          ? rank === 0
            ? t('lines.endlessRankFirst')
            : t('lines.endlessRank', { n: rank + 1 })
          : t('lines.endlessOut'),
      );
      break;
    }
    case 'daily': {
      if (!r.counted) {
        out.lines.push(t('lines.dailyPractice'));
        break;
      }
      const h = m.daily.history.filter((x) => x.day !== r.period);
      h.unshift({ day: r.period, score: r.score, time: r.time, victory: r.victory });
      m.daily.history = h.slice(0, MODES.daily.history);
      out.lines.push(t('lines.dailyCounted'));
      break;
    }
    case 'weekly': {
      if (m.weekly.week !== r.period) {
        m.weekly.week = r.period;
        m.weekly.best = 0;
        m.weekly.runs = 0;
      }
      m.weekly.runs++;
      if (r.score > m.weekly.best) {
        m.weekly.best = r.score;
        out.lines.push(t('lines.weeklyRecord'));
      }
      break;
    }
    case 'bossrush': {
      const b = m.bossRush;
      if (r.bosses > b.bestBosses) b.bestBosses = r.bosses;
      if (r.victory && (b.bestTime === 0 || r.time < b.bestTime)) {
        b.bestTime = r.time;
        out.lines.push(t('lines.bossRushBest'));
      }
      break;
    }
    case 'hardcore':
      if (r.victory) m.hardcore.victories++;
      m.hardcore.bestScore = Math.max(m.hardcore.bestScore, r.score);
      break;
    default:
  }
  // Fragments ramenés : doublés en Hardcore, dont la moitié perdue à la mort.
  let mult = fragMult;
  if (r.mode === 'hardcore') {
    const h = MODES.hardcore;
    mult *= h.rewardMult * (r.victory ? 1 : h.deathKeep);
  }
  out.fragments = Math.max(0, Math.floor(r.fragments * mult));
  d.wallet.fragments += out.fragments;
  if (out.fragments > 0) {
    out.lines.push(
      mult !== 1
        ? t('lines.fragmentsMult', { n: out.fragments, m: num(mult, 2) })
        : t('lines.fragments', { n: out.fragments }),
    );
  }
  return out;
}
