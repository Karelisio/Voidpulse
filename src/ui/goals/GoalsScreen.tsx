/** Objectifs : quêtes du jour et de la semaine, passe de saison, succès. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ACHIEVEMENTS, type AchievementDef } from '../../content/data';
import { t, useLang, type TKey } from '../../i18n';
import { evaluateAchievements } from '../../meta/achievements';
import { readNow, safeNow } from '../../meta/clock';
import { questsReady, refreshQuests } from '../../meta/quests';
import { seasonInfo, seasonTier, syncSeason } from '../../meta/season';
import { dayKey, weekKey } from '../../modes/modes';
import type { SaveData } from '../../save/schema';
import { useSave } from '../../state/save';
import { fmt, mutate, sfx } from '../meta/common';
import '../meta/meta.css';
import { AchievementsTab } from './AchievementsTab';
import { type Act } from './format';
import './goals.css';
import { QuestsTab } from './QuestsTab';
import { SeasonTab } from './SeasonTab';

const TABS = [
  { id: 'quests', label: 'goals.tabQuests' },
  { id: 'season', label: 'goals.tabSeason' },
  { id: 'achievements', label: 'goals.tabAchievements' },
] as const satisfies readonly { id: string; label: TKey }[];

type TabId = (typeof TABS)[number]['id'];

/** Quêtes et saison à jour pour l'instant donné. */
const sync = (d: SaveData, now: number): void => {
  refreshQuests(d, now);
  syncSeason(d, now);
};

/** Le jour, la semaine ou la saison a changé depuis la dernière mise à jour. */
function stale(d: SaveData, now: number): boolean {
  const q = d.retention.quests;
  const date = new Date(now);
  return (
    q.day !== dayKey(date) ||
    q.week !== weekKey(date) ||
    d.retention.season.id !== seasonInfo(now).index
  );
}

function run<T>(fn: (d: SaveData, now: number) => T): { result: T; unlocked: AchievementDef[] } {
  const box: { result?: T; unlocked: AchievementDef[] } = { unlocked: [] };
  mutate((d) => {
    box.result = fn(d, safeNow(d));
    box.unlocked = evaluateAchievements(d);
  });
  return { result: box.result as T, unlocked: box.unlocked };
}

export function GoalsScreen({ onBack }: { onBack: () => void }) {
  useLang();
  const data = useSave((s) => s.data);
  const [tab, setTab] = useState<TabId>('quests');
  const [clock, setClock] = useState(() => Date.now());
  const [toast, setToast] = useState('');
  const [fresh, setFresh] = useState<AchievementDef[]>([]);
  const timer = useRef(0);

  /** Modifie la sauvegarde, puis débloque les succès nouvellement atteints. */
  const act = useCallback<Act>((fn) => {
    const { result, unlocked } = run(fn);
    if (unlocked.length > 0) setFresh((f) => [...f, ...unlocked]);
    return result;
  }, []);

  const notify = useCallback((text: string) => {
    window.clearTimeout(timer.current);
    setToast(text);
    timer.current = window.setTimeout(() => {
      setToast('');
    }, 2800);
  }, []);

  // Entrée : renouvelle quêtes et saison, débloque les succès atteints.
  useEffect(() => {
    const id = window.setTimeout(() => {
      act(sync);
    }, 0);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(timer.current);
    };
  }, [act]);

  // Une fois par seconde : compte à rebours, et renouvellement si minuit est passé.
  useEffect(() => {
    const id = window.setInterval(() => {
      setClock(Date.now());
      const d = useSave.getState().data;
      if (stale(d, readNow(d))) act(sync);
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [act]);

  const now = readNow(data, clock);
  const ready = questsReady(data);
  const claimed = new Set(data.retention.season.claimed);
  let open = 0;
  for (let t = 1; t <= seasonTier(data); t++) if (!claimed.has(t)) open++;
  const done = data.retention.achievements.length;
  const badges: Record<TabId, number> = { quests: ready, season: open, achievements: 0 };

  return (
    <main className="select meta goals">
      <header className="meta-head">
        <div className="meta-title">
          <h2>{t('goals.title')}</h2>
          <span className="meta-wallet" aria-label={t('goals.wallet')}>
            <b>◆</b> {fmt(data.wallet.fragments)} <small>{t('goals.walletUnit')}</small>
          </span>
        </div>
        <nav className="meta-tabs goals-tabs" role="tablist" aria-label={t('goals.sections')}>
          {TABS.map((tb) => (
            <button
              key={tb.id}
              id={`tab-${tb.id}`}
              role="tab"
              aria-selected={tab === tb.id}
              className={tab === tb.id ? 'on' : ''}
              onClick={() => {
                sfx('ui.click');
                setTab(tb.id);
              }}
            >
              {t(tb.label)}
              {tb.id === 'achievements' ? (
                <small className="goals-sub">
                  {done}/{ACHIEVEMENTS.length}
                </small>
              ) : (
                badges[tb.id] > 0 && (
                  <span
                    className="goals-count"
                    aria-label={t('goals.toClaim', { n: badges[tb.id] })}
                  >
                    {badges[tb.id]}
                  </span>
                )
              )}
            </button>
          ))}
        </nav>
      </header>
      {fresh.length > 0 && (
        <section className="goals-unlocked" aria-live="polite">
          <h3>
            {t('goals.unlockedTitle', {
              n: fresh.length,
              frags: fmt(fresh.reduce((n, a) => n + a.reward, 0)),
            })}
          </h3>
          <ul>
            {fresh.slice(0, 4).map((a) => (
              <li key={a.id}>
                <span>✓ {a.name}</span>
                <b>+{fmt(a.reward)} ◆</b>
              </li>
            ))}
            {fresh.length > 4 && <li>{t('goals.andMore', { n: fresh.length - 4 })}</li>}
          </ul>
          <button
            className="btn-ghost"
            onClick={() => {
              sfx('ui.click');
              setFresh([]);
            }}
          >
            {t('core.ok')}
          </button>
        </section>
      )}
      <div className="meta-body" role="tabpanel">
        {tab === 'quests' && <QuestsTab data={data} now={now} act={act} notify={notify} />}
        {tab === 'season' && <SeasonTab data={data} now={now} act={act} notify={notify} />}
        {tab === 'achievements' && <AchievementsTab data={data} />}
      </div>
      <button
        className="btn-ghost meta-back"
        onClick={() => {
          sfx('ui.back');
          onBack();
        }}
      >
        {t('core.back')}
      </button>
      {toast !== '' && (
        <div className="goals-toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}
