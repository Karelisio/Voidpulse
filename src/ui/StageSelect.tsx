/** Choix du stage de la campagne : biome, mécanique, boss, records ; ouverts boss après boss. */
import { useState } from 'react';
import { audio } from '../audio';
import { uiSound } from '../audio/bridge';
import { BOSSES, CAMPAIGN, PACTS } from '../content/data';
import { stageUnlocked } from '../meta/stages';
import { useSave } from '../state/save';
import { formatTime } from './summary';
import { bossPortrait } from './portraits';

function bossName(id: string | undefined): string {
  return BOSSES.find((b) => b.id === id)?.name ?? '';
}

export function StageSelect({
  onStart,
  onBack,
  forceUnlocked,
}: {
  onStart: () => void;
  onBack: () => void;
  /** Menu debug : tous les stages jouables. */
  forceUnlocked: boolean;
}) {
  const data = useSave((s) => s.data);
  const update = useSave((s) => s.update);
  const open = (i: number): boolean => forceUnlocked || stageUnlocked(data, i);
  const [selected, setSelected] = useState(() => {
    const i = CAMPAIGN.findIndex((s) => s.id === data.profile.stage);
    return i >= 0 && open(i) ? i : 0;
  });
  const s = CAMPAIGN[selected];
  const best = data.profile.stageBest[s.id] as (typeof data.profile.stageBest)[string] | undefined;
  const cleared = data.profile.cleared.includes(s.id);
  const style = {
    '--stage': s.palette.grid,
    '--stage-2': s.palette.accent,
    '--stage-bg': s.palette.base,
  } as React.CSSProperties;
  const prev = selected > 0 ? CAMPAIGN[selected - 1] : null;

  return (
    <main className="select">
      <h2>Secteur</h2>
      <div className="stage-list" role="listbox" aria-label="Stages">
        {CAMPAIGN.map((st, i) => (
          <button
            key={st.id}
            id={`stage-${st.id}`}
            role="option"
            aria-selected={i === selected}
            className={`stage-cell ${i === selected ? 'on' : ''} ${open(i) ? '' : 'locked'}`}
            style={
              { '--stage': st.palette.grid, '--stage-bg': st.palette.base } as React.CSSProperties
            }
            onClick={() => {
              uiSound(audio(), 'ui.click');
              setSelected(i);
            }}
          >
            <b>{String(st.order)}</b>
            <span>{open(i) ? st.name : '???'}</span>
            {data.profile.cleared.includes(st.id) && <i aria-label="terminé">✓</i>}
          </button>
        ))}
      </div>
      <section className="stage-sheet" style={style}>
        <h3>
          {open(selected) ? s.name : 'Secteur verrouillé'}{' '}
          <small>{String(s.duration / 60)} min</small>
        </h3>
        {open(selected) ? (
          <>
            <p className="muted">{s.description}</p>
            <p className="stage-mech">{s.mechanic.description}</p>
            <div className="stage-bosses">
              {s.miniBoss && (
                <figure>
                  <img src={bossPortrait(s.miniBoss)} alt="" width={64} height={64} />
                  <figcaption>
                    {bossName(s.miniBoss)}
                    <small>Mini-boss · {s.miniAt.map((t) => formatTime(t)).join(' et ')}</small>
                  </figcaption>
                </figure>
              )}
              <figure>
                <img src={bossPortrait(s.boss)} alt="" width={64} height={64} />
                <figcaption>
                  {bossName(s.boss)}
                  <small>Boss final · {formatTime(s.bossAt)}</small>
                </figcaption>
              </figure>
            </div>
            <p className="stage-best">
              {best
                ? `Record : ${formatTime(best.time)} · ${best.score.toLocaleString('fr-FR')} pts${
                    best.rank >= 0 ? ` · rang ${PACTS.ranks[best.rank][0]}` : ''
                  }${cleared ? ' · terminé' : ''}`
                : 'Jamais exploré'}
            </p>
          </>
        ) : (
          <p className="muted">
            Vaincre {bossName(prev?.boss)} ({prev?.name}) pour l’ouvrir.
          </p>
        )}
      </section>
      <div className="end-actions">
        <button
          className="btn-primary"
          id="start-stage"
          disabled={!open(selected)}
          onClick={() => {
            uiSound(audio(), 'ui.confirm');
            update((d) => {
              d.profile.stage = s.id;
            });
            onStart();
          }}
        >
          Lancer
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
