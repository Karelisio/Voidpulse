import { t, useLang } from '../i18n';
import type { LevelUpView } from '../state/ui';
import { ELEMENT_LABEL } from './cards';

interface Props {
  view: LevelUpView;
  onChoose: (i: number) => void;
  onReroll: () => void;
  onBanish: (i: number) => void;
  onLock: (i: number) => void;
}

export function LevelUpOverlay({ view, onChoose, onReroll, onBanish, onLock }: Props) {
  useLang();
  return (
    <div className="overlay levelup" role="dialog" aria-label={t('core.level', { n: view.level })}>
      <h2>
        {t('run.levelLabel')} <span>{view.level}</span>
      </h2>
      <div className="cards">
        {view.cards.map((c, i) => (
          <div className={`card kind-${c.kind}`} key={c.key}>
            <button
              className="card-main"
              id={`card-${i}`}
              onClick={() => {
                onChoose(i);
              }}
            >
              {c.icon && <img src={c.icon} alt="" width={56} height={56} />}
              <span className="card-text">
                <span className="card-badge">{c.badge}</span>
                <span className="card-title">{c.title}</span>
                {c.element && (
                  <span className={`card-element el-${c.element}`}>{ELEMENT_LABEL[c.element]}</span>
                )}
                {c.lines.map((l) => (
                  <span className="card-line" key={l}>
                    {l}
                  </span>
                ))}
                {c.hint && <span className="card-hint">{c.hint}</span>}
              </span>
            </button>
            <div className="card-tools">
              <button
                disabled={view.banishes <= 0 || c.kind === 'heal'}
                onClick={() => {
                  onBanish(i);
                }}
              >
                {t('run.banish')}
              </button>
              <button
                disabled={view.locks <= 0 || c.kind === 'heal'}
                aria-pressed={view.locked === c.key}
                onClick={() => {
                  onLock(i);
                }}
              >
                {view.locked === c.key ? t('run.lockedCard') : t('run.lock')}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="levelup-tools">
        <button className="btn-ghost" disabled={view.rerolls <= 0} onClick={onReroll}>
          {t('run.reroll', { n: view.rerolls })}
        </button>
        <span className="muted">
          {t('run.toolsCount', { banishes: view.banishes, locks: view.locks })}
        </span>
      </div>
    </div>
  );
}
