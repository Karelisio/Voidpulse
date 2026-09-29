/** Choix du mode : cartes des 7 modes, fiche du mode choisi (défis du moment, records). */
import { useMemo, useState } from 'react';
import { audio } from '../audio';
import { uiSound } from '../audio/bridge';
import { CAMPAIGN, MODES, type ModeId } from '../content/data';
import { num, t, useLang } from '../i18n';
import {
  MODE_INFO,
  bossName,
  bossRushQueue,
  dailyChallenge,
  dayKey,
  weekKey,
  weeklyChallenge,
} from '../modes/modes';
import { useSave } from '../state/save';
import { formatTime } from './summary';
import { shipPortrait } from './portraits';

function ModeDetail({ mode }: { mode: ModeId }) {
  useLang();
  const data = useSave((s) => s.data);
  const m = data.modes;
  const now = useMemo(() => new Date(), []);
  switch (mode) {
    case 'campaign':
      return (
        <p className="mode-stat">
          {t('modes.clearedLabel')} <b>{data.profile.cleared.length}</b> / {CAMPAIGN.length}
        </p>
      );
    case 'endless':
      return m.endless.board.length > 0 ? (
        <ol className="mode-board">
          {m.endless.board.slice(0, 5).map((e) => (
            <li key={e.at}>
              <b>{formatTime(e.time)}</b> <span>{e.character}</span> <small>{e.stage}</small>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mode-stat">{t('modes.boardEmpty')}</p>
      );
    case 'daily': {
      const c = dailyChallenge(dayKey(now));
      const done = m.daily.day === c.day;
      const today = m.daily.history.find((h) => h.day === c.day);
      return (
        <div className="mode-daily">
          <img src={shipPortrait(c.character.id)} alt="" width={56} height={56} />
          <div>
            <p>
              <b>{c.character.name}</b> · {c.stage.name}
            </p>
            <p className="muted">
              {t('modes.pacts', {
                list: c.pacts.map((p) => p.name).join(', ') || t('core.none'),
              })}
            </p>
            <p className="mode-stat">
              {done
                ? today
                  ? t('modes.dailyScore', { score: num(today.score), time: formatTime(today.time) })
                  : t('modes.dailyUsed')
                : t('modes.dailyAvailable')}
            </p>
          </div>
        </div>
      );
    }
    case 'weekly': {
      const week = weekKey(now);
      const c = weeklyChallenge(week);
      const best = m.weekly.week === week ? m.weekly.best : 0;
      return (
        <div>
          <p>
            <b>{c.ruleset.name}</b> · {c.stage.name}
          </p>
          <p className="muted">{c.ruleset.description}</p>
          {c.bosses.length > 0 && (
            <p className="muted">
              {t('modes.weeklyBosses', { list: c.bosses.map(bossName).join(', ') })}
            </p>
          )}
          <p className="mode-stat">
            {best > 0 ? t('modes.weeklyBest', { score: num(best) }) : t('modes.weeklyNone')}
          </p>
        </div>
      );
    }
    case 'bossrush':
      return (
        <p className="mode-stat">
          {t('modes.bossRushInfo', {
            n: bossRushQueue().length,
            weapons: MODES.bossRush.weapons,
            passives: MODES.bossRush.passives,
          })}{' '}
          {m.bossRush.bestTime > 0
            ? t('modes.bossRushTime', { time: formatTime(m.bossRush.bestTime) })
            : t('modes.bossRushRecord', { n: m.bossRush.bestBosses })}
        </p>
      );
    case 'hardcore':
      return (
        <p className="mode-stat">
          {t('modes.winsLabel')} <b>{m.hardcore.victories}</b> ·{' '}
          {t('modes.bestScore', { score: num(m.hardcore.bestScore) })}
        </p>
      );
    case 'training':
      return <p className="mode-stat">{t('modes.training')}</p>;
  }
}

export function ModeSelect({
  onPick,
  onBack,
}: {
  onPick: (mode: ModeId) => void;
  onBack: () => void;
}) {
  useLang();
  const data = useSave((s) => s.data);
  const [selected, setSelected] = useState<ModeId>(() => {
    const last = MODES.modes.find((x) => x.id === data.profile.mode);
    return last?.id ?? 'campaign';
  });
  const info = MODE_INFO[selected];
  return (
    <main className="select">
      <h2>{t('modes.title')}</h2>
      <p className="wallet" aria-label={t('modes.walletAria')}>
        ◆ {t('core.fragments', { n: data.wallet.fragments })}
      </p>
      <div className="mode-list" role="listbox" aria-label={t('modes.listAria')}>
        {MODES.modes.map((m) => (
          <button
            key={m.id}
            id={`mode-${m.id}`}
            role="option"
            aria-selected={m.id === selected}
            className={`mode-cell ${m.id === selected ? 'on' : ''}`}
            style={{ '--mode': m.color } as React.CSSProperties}
            onClick={() => {
              uiSound(audio(), 'ui.click');
              setSelected(m.id);
            }}
          >
            <b>{m.name}</b>
            <span>{m.tagline}</span>
          </button>
        ))}
      </div>
      <section className="mode-sheet" style={{ '--mode': info.color } as React.CSSProperties}>
        <h3>{info.name}</h3>
        <p className="muted">{info.description}</p>
        <ModeDetail mode={selected} />
      </section>
      <div className="end-actions">
        <button
          className="btn-primary"
          id="pick-mode"
          onClick={() => {
            uiSound(audio(), 'ui.confirm');
            onPick(selected);
          }}
        >
          {t('core.continue')}
        </button>
        <button
          className="btn-ghost"
          onClick={() => {
            uiSound(audio(), 'ui.back');
            onBack();
          }}
        >
          {t('core.back')}
        </button>
      </div>
    </main>
  );
}
