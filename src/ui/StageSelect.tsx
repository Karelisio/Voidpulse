/** Choix du stage de la campagne : biome, mécanique, boss, records ; ouverts boss après boss. */
import { useState } from 'react';
import { audio } from '../audio';
import { uiSound } from '../audio/bridge';
import { BOSSES, CAMPAIGN, META, PACTS } from '../content/data';
import { num, t, useLang } from '../i18n';
import { ascensionOpen } from '../meta/account';
import {
  ascensionReward,
  ascensionSelected,
  ascensionUnlocked,
  selectAscension,
} from '../meta/ascension';
import { stageUnlocked } from '../meta/stages';
import { useUi } from '../state/ui';
import { useSave } from '../state/save';
import { formatTime } from './summary';
import { bossPortrait } from './portraits';

function bossName(id: string | undefined): string {
  return BOSSES.find((b) => b.id === id)?.name ?? '';
}

/** Palier d'Ascension du secteur : ouvert palier après palier, en gagnant au plus haut. */
function AscensionPicker({ stage }: { stage: string }) {
  useLang();
  const data = useSave((s) => s.data);
  const update = useSave((s) => s.update);
  const max = ascensionUnlocked(data, stage);
  const tier = ascensionSelected(data, stage);
  const set = (n: number): void => {
    uiSound(audio(), 'ui.click');
    update((d) => {
      selectAscension(d, stage, n);
    });
  };
  const reward = ascensionReward(tier);
  return (
    <div className="ascension">
      <div className="ascension-row">
        <b>{t('select.ascension')}</b>
        <button
          aria-label={t('select.tierDown')}
          disabled={tier <= 0}
          onClick={() => {
            set(tier - 1);
          }}
        >
          −
        </button>
        <span id="ascension-tier">
          {tier} / {max}
        </span>
        <button
          aria-label={t('select.tierUp')}
          disabled={tier >= max}
          onClick={() => {
            set(tier + 1);
          }}
        >
          +
        </button>
        <small>{t('select.ascensionRewards', { n: reward })}</small>
      </div>
      {tier > 0 && (
        <ol className="ascension-list">
          {META.ascension.tiers.slice(0, tier).map((row) => (
            <li key={row.tier}>{row.description}</li>
          ))}
        </ol>
      )}
    </div>
  );
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
  useLang();
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
  const mode = useUi((st) => st.mode);
  const ascension =
    (mode === 'campaign' || mode === 'hardcore') &&
    ascensionOpen(data) &&
    ascensionUnlocked(data, s.id) > 0;
  const style = {
    '--stage': s.palette.grid,
    '--stage-2': s.palette.accent,
    '--stage-bg': s.palette.base,
  } as React.CSSProperties;
  const prev = selected > 0 ? CAMPAIGN[selected - 1] : null;

  return (
    <main className="select">
      <h2>{t('select.sectorTitle')}</h2>
      <div className="stage-list" role="listbox" aria-label={t('select.sectorListAria')}>
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
            {data.profile.cleared.includes(st.id) && <i aria-label={t('select.clearedAria')}>✓</i>}
          </button>
        ))}
      </div>
      <section className="stage-sheet" style={style}>
        <h3>
          {open(selected) ? s.name : t('select.sectorLocked')}{' '}
          <small>{t('core.minutes', { n: s.duration / 60 })}</small>
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
                    <small>
                      {t('select.miniBossAt', {
                        times: s.miniAt.map((x) => formatTime(x)).join(t('select.timesJoin')),
                      })}
                    </small>
                  </figcaption>
                </figure>
              )}
              <figure>
                <img src={bossPortrait(s.boss)} alt="" width={64} height={64} />
                <figcaption>
                  {bossName(s.boss)}
                  <small>{t('select.finalBossAt', { time: formatTime(s.bossAt) })}</small>
                </figcaption>
              </figure>
            </div>
            <p className="stage-best">
              {best
                ? t('select.stageBest', { time: formatTime(best.time), score: num(best.score) }) +
                  (best.rank >= 0
                    ? t('select.stageRank', { rank: PACTS.ranks[best.rank][0] })
                    : '') +
                  (cleared ? t('select.stageCleared') : '')
                : t('select.neverExplored')}
            </p>
            {ascension && <AscensionPicker stage={s.id} />}
          </>
        ) : (
          <p className="muted">
            {t('select.unlockHint', { boss: bossName(prev?.boss), stage: prev?.name ?? '' })}
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
          {t('select.launch')}
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
