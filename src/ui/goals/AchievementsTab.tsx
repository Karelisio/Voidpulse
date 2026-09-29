/** Succès : bilan, filtres et liste des 200 succès. */
import { useMemo, useState } from 'react';
import { ACHIEVEMENTS, type AchievementDef } from '../../content/data';
import { t, useLang, type TKey } from '../../i18n';
import { achievementProgress } from '../../meta/achievements';
import type { SaveData } from '../../save/schema';
import { fmt, pct, sfx } from '../meta/common';
import { fmtValue, isDecimal } from './format';

type Filter = 'all' | 'done' | 'todo';

const FILTERS: { id: Filter; label: TKey }[] = [
  { id: 'all', label: 'goals.filterAll' },
  { id: 'done', label: 'goals.filterDone' },
  { id: 'todo', label: 'goals.filterTodo' },
];

interface Row {
  a: AchievementDef;
  value: number;
  target: number;
  done: boolean;
}

function Card({ row }: { row: Row }) {
  useLang();
  const { a, value, target, done } = row;
  const ratio = Math.min(1, value / target);
  return (
    <li className={`goals-ach${done ? ' done' : ''}`}>
      <span className="goals-ach-mark" aria-hidden="true">
        {done ? '✓' : pct(ratio)}
      </span>
      <div className="goals-ach-body">
        <h4>{a.name}</h4>
        <p>{a.description}</p>
        <div className="goals-progress">
          <div className="goals-bar thin">
            <i style={{ width: `${String(Math.floor(ratio * 100))}%` }} />
          </div>
          <span className="goals-num">
            {fmtValue(value, target, isDecimal(a.metric))} /{' '}
            {fmtValue(target, target, isDecimal(a.metric))}
          </span>
        </div>
      </div>
      <b className="goals-ach-reward">
        +{fmt(a.reward)} <span>◆</span>
      </b>
    </li>
  );
}

export function AchievementsTab({ data }: { data: SaveData }) {
  useLang();
  const [filter, setFilter] = useState<Filter>('todo');
  const unlocked = data.retention.achievements;

  const rows = useMemo<Row[]>(() => {
    const got = new Set(unlocked);
    return ACHIEVEMENTS.map((a) => {
      const [value, target] = achievementProgress(data, a);
      return { a, value, target, done: got.has(a.id) };
    });
  }, [data, unlocked]);

  const doneRows = rows.filter((r) => r.done);
  const todoRows = rows
    .filter((r) => !r.done)
    .sort((x, y) => y.value / y.target - x.value / x.target);
  const shown = filter === 'all' ? rows : filter === 'done' ? doneRows : todoRows;
  const earned = doneRows.reduce((sum, r) => sum + r.a.reward, 0);
  const pending = todoRows.reduce((sum, r) => sum + r.a.reward, 0);
  const counts: Record<Filter, number> = {
    all: rows.length,
    done: doneRows.length,
    todo: todoRows.length,
  };

  return (
    <>
      <section className="meta-panel">
        <h3>{t('goals.summary', { done: doneRows.length, total: rows.length })}</h3>
        <div className="meta-bar">
          <i style={{ width: `${String(Math.floor((doneRows.length / rows.length) * 100))}%` }} />
        </div>
        <p className="goals-summary">
          <span>
            {t('goals.earned')} <b>{fmt(earned)} ◆</b>
          </span>
          <span>
            {t('goals.pending')} <b>{fmt(pending)} ◆</b>
          </span>
        </p>
      </section>
      <div className="goals-chips" role="group" aria-label={t('goals.filterAria')}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            id={`filter-${f.id}`}
            aria-pressed={filter === f.id}
            className={filter === f.id ? 'on' : ''}
            onClick={() => {
              sfx('ui.click');
              setFilter(f.id);
            }}
          >
            {t(f.label)} <small>{counts[f.id]}</small>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="meta-intro goals-empty">
          {filter === 'done' ? t('goals.emptyDone') : t('goals.allDone')}
        </p>
      ) : (
        <ul className="goals-list">
          {shown.map((r) => (
            <Card key={r.a.id} row={r} />
          ))}
        </ul>
      )}
    </>
  );
}
