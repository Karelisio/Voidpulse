/** Surcouches des événements de run : marchand ambulant et autel de sacrifice. */
import { t, useLang } from '../i18n';
import type { AltarOfferKind } from '../systems/state';
import type { MerchantView, SacrificeView } from './events';

export function MerchantOverlay({
  view,
  onBuy,
  onLeave,
}: {
  view: MerchantView;
  onBuy: (i: number) => void;
  onLeave: () => void;
}) {
  useLang();
  return (
    <div className="overlay merchant" role="dialog" aria-label={t('run.merchantAria')}>
      <h2>{t('run.merchantTitle')}</h2>
      <p className="gold-line">
        <span className="coin" aria-hidden="true" /> {t('run.goldAmount', { n: view.gold })}
      </p>
      <div className="cards">
        {view.offers.map((o, i) => (
          <div className={`card offer ${o.sold ? 'sold' : ''}`} key={o.title}>
            <div className="card-main">
              {o.icon ? <img src={o.icon} alt="" width={56} height={56} /> : <span />}
              <span className="card-text">
                <span className="card-title">{o.title}</span>
                <span className="card-line">{o.detail}</span>
              </span>
            </div>
            <button
              className="price"
              id={`offer-${String(i)}`}
              disabled={o.sold || !o.affordable}
              onClick={() => {
                onBuy(i);
              }}
            >
              {o.sold ? t('run.sold') : t('run.goldAmount', { n: o.price })}
            </button>
          </div>
        ))}
      </div>
      <button className="btn-primary" id="merchant-leave" onClick={onLeave}>
        {t('run.leave')}
      </button>
    </div>
  );
}

export function AltarOverlay({
  offers,
  result,
  onChoose,
  onClose,
}: {
  offers: SacrificeView[];
  /** Résultat de l'offrande (null tant qu'aucune n'est faite). */
  result: string | null;
  onChoose: (kind: AltarOfferKind) => void;
  onClose: () => void;
}) {
  useLang();
  return (
    <div className="overlay altar" role="dialog" aria-label={t('run.altarTitle')}>
      <h2>{t('run.altarTitle')}</h2>
      {result === null ? (
        <>
          <p className="muted">{t('run.altarIntro')}</p>
          <div className="cards">
            {offers.map((o) => (
              <button
                className="card sacrifice"
                id={`sacrifice-${o.kind}`}
                key={o.kind}
                disabled={!o.available}
                onClick={() => {
                  onChoose(o.kind);
                }}
              >
                <span className="card-title">{o.title}</span>
                <span className="card-line cost">{o.cost}</span>
                <span className="card-line gift">{o.available ? o.gift : o.reason}</span>
              </button>
            ))}
          </div>
          <button className="btn-ghost" id="altar-refuse" onClick={onClose}>
            {t('run.refuse')}
          </button>
        </>
      ) : (
        <>
          <p className="altar-result">{result}</p>
          <button className="btn-primary" id="altar-continue" onClick={onClose}>
            {t('core.continue')}
          </button>
        </>
      )}
    </div>
  );
}
