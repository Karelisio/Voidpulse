/** Surcouches des événements de run : marchand ambulant et autel de sacrifice. */
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
  return (
    <div className="overlay merchant" role="dialog" aria-label="Marchand ambulant">
      <h2>Marchand</h2>
      <p className="gold-line">
        <span className="coin" aria-hidden="true" /> {view.gold} or
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
              {o.sold ? 'Vendu' : `${String(o.price)} or`}
            </button>
          </div>
        ))}
      </div>
      <button className="btn-primary" id="merchant-leave" onClick={onLeave}>
        Partir
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
  return (
    <div className="overlay altar" role="dialog" aria-label="Autel de sacrifice">
      <h2>Autel de sacrifice</h2>
      {result === null ? (
        <>
          <p className="muted">Une offrande, un don. Ou rien.</p>
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
            Refuser
          </button>
        </>
      ) : (
        <>
          <p className="altar-result">{result}</p>
          <button className="btn-primary" id="altar-continue" onClick={onClose}>
            Continuer
          </button>
        </>
      )}
    </div>
  );
}
