/**
 * Coffre d'élite : tirage animé. Chaque emplacement fait défiler des icônes puis révèle sa
 * récompense (déjà tirée et appliquée par la simulation) ; un appui accélère la révélation.
 */
import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio';
import { uiSound } from '../audio/bridge';
import { t, useLang } from '../i18n';
import type { CardView } from './cards';
import { ELEMENT_LABEL } from './cards';

export interface ChestView {
  cards: CardView[];
  roulette: string[];
}

const SPIN_MS = 900;
const STAGGER_MS = 420;
const TICK_MS = 70;

export function ChestOverlay({ view, onDone }: { view: ChestView; onDone: () => void }) {
  useLang();
  const [revealed, setRevealed] = useState(0);
  const [spin, setSpin] = useState(0);
  const start = useRef(0);
  const total = view.cards.length;

  useEffect(() => {
    audio()?.sfx.play('chest.open');
    start.current = performance.now();
    let shown = 0;
    const id = window.setInterval(() => {
      const elapsed = performance.now() - start.current;
      const n =
        elapsed < SPIN_MS ? 0 : Math.min(total, Math.floor((elapsed - SPIN_MS) / STAGGER_MS) + 1);
      if (n > shown) {
        shown = n;
        const card = view.cards[n - 1];
        audio()?.sfx.play(card.kind === 'evolution' ? 'evolution' : 'chest.reveal');
        setRevealed(n);
      }
      setSpin((s) => s + 1);
      if (n >= total) window.clearInterval(id);
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [total, view.cards]);

  const done = revealed >= total;
  const skip = (): void => {
    if (!done) {
      start.current = performance.now() - SPIN_MS - STAGGER_MS * total;
    }
  };

  return (
    <div className="overlay chest" role="dialog" aria-label={t('run.chestTitle')} onClick={skip}>
      <h2>{t('run.chestTitle')}</h2>
      <div className={`chest-slots n${String(total)}`}>
        {view.cards.map((c, i) => {
          const shown = i < revealed;
          const rollIcon = view.roulette[(spin * 7 + i * 13) % Math.max(1, view.roulette.length)];
          return (
            <div
              className={`chest-slot ${shown ? `shown kind-${c.kind}` : 'spinning'}`}
              key={c.key}
            >
              <div className="chest-icon">
                {shown
                  ? c.icon && <img src={c.icon} alt="" width={64} height={64} />
                  : rollIcon && <img src={rollIcon} alt="" width={64} height={64} />}
              </div>
              {shown && (
                <div className="chest-text">
                  <span className="card-badge">{c.badge}</span>
                  <span className="card-title">{c.title}</span>
                  {c.element && (
                    <span className={`card-element el-${c.element}`}>
                      {ELEMENT_LABEL[c.element]}
                    </span>
                  )}
                  {c.lines.map((l) => (
                    <span className="card-line" key={l}>
                      {l}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button
        className="btn-primary"
        id="chest-continue"
        disabled={!done}
        onClick={(e) => {
          e.stopPropagation();
          uiSound(audio(), 'ui.confirm');
          onDone();
        }}
      >
        {t('core.continue')}
      </button>
    </div>
  );
}
