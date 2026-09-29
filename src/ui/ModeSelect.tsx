/** Choix du mode : cartes des 7 modes, fiche du mode choisi (défis du moment, records). */
import { useMemo, useState } from 'react';
import { audio } from '../audio';
import { uiSound } from '../audio/bridge';
import { CAMPAIGN, MODES, type ModeId } from '../content/data';
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
  const data = useSave((s) => s.data);
  const m = data.modes;
  const now = useMemo(() => new Date(), []);
  switch (mode) {
    case 'campaign':
      return (
        <p className="mode-stat">
          Secteurs terminés : <b>{data.profile.cleared.length}</b> / {CAMPAIGN.length}
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
        <p className="mode-stat">Classement vide : à vous d’ouvrir la marche.</p>
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
            <p className="muted">Pactes : {c.pacts.map((p) => p.name).join(', ') || 'aucun'}</p>
            <p className="mode-stat">
              {done
                ? today
                  ? `Essai du jour : ${today.score.toLocaleString('fr-FR')} pts (${formatTime(today.time)})`
                  : 'Essai du jour utilisé : les suivants sont hors classement.'
                : 'Essai compté disponible.'}
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
            <p className="muted">Boss : {c.bosses.map(bossName).join(', ')}</p>
          )}
          <p className="mode-stat">
            {best > 0
              ? `Record de la semaine : ${best.toLocaleString('fr-FR')} pts`
              : 'Pas encore tenté cette semaine.'}
          </p>
        </div>
      );
    }
    case 'bossrush':
      return (
        <p className="mode-stat">
          {bossRushQueue().length} boss · build de {MODES.bossRush.weapons} armes et{' '}
          {MODES.bossRush.passives} passifs.{' '}
          {m.bossRush.bestTime > 0
            ? `Meilleur temps : ${formatTime(m.bossRush.bestTime)}.`
            : `Record : ${String(m.bossRush.bestBosses)} boss vaincus.`}
        </p>
      );
    case 'hardcore':
      return (
        <p className="mode-stat">
          Victoires : <b>{m.hardcore.victories}</b> · meilleur score{' '}
          {m.hardcore.bestScore.toLocaleString('fr-FR')}
        </p>
      );
    case 'training':
      return <p className="mode-stat">Parties non comptées, aucune récompense.</p>;
  }
}

export function ModeSelect({
  onPick,
  onBack,
}: {
  onPick: (mode: ModeId) => void;
  onBack: () => void;
}) {
  const data = useSave((s) => s.data);
  const [selected, setSelected] = useState<ModeId>(() => {
    const last = MODES.modes.find((x) => x.id === data.profile.mode);
    return last?.id ?? 'campaign';
  });
  const info = MODE_INFO[selected];
  return (
    <main className="select">
      <h2>Mode</h2>
      <p className="wallet" aria-label="Fragments">
        ◆ {data.wallet.fragments.toLocaleString('fr-FR')} fragments
      </p>
      <div className="mode-list" role="listbox" aria-label="Modes de jeu">
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
          Continuer
        </button>
        <button
          className="btn-ghost"
          onClick={() => {
            uiSound(audio(), 'ui.back');
            onBack();
          }}
        >
          Retour
        </button>
      </div>
    </main>
  );
}
