/** Pactes : offre de malus/bonus, sélection limitée, aperçu de la chaleur et du rang. */
import { useState } from 'react';
import { PACTS } from '../content/data';
import { rankOf } from '../systems/pacts';

export interface PactView {
  /** Index dans PACTS.pacts des pactes proposés. */
  offer: number[];
  picks: number;
  /** Chaleur déjà scellée (paliers). */
  heat: number;
  /** Offre de départ ou palier. */
  start: boolean;
}

export function PactOverlay({
  view,
  onSeal,
}: {
  view: PactView;
  onSeal: (choices: number[]) => void;
}) {
  const [chosen, setChosen] = useState<number[]>([]);
  const heat = view.heat + chosen.reduce((h, i) => h + PACTS.pacts[view.offer[i]].heat, 0);
  const toggle = (i: number): void => {
    setChosen((c) =>
      c.includes(i) ? c.filter((x) => x !== i) : c.length < view.picks ? [...c, i] : c,
    );
  };
  return (
    <div className="overlay pact" role="dialog" aria-label="Pactes">
      <h2>{view.start ? 'Pactes' : 'Nouveau pacte'}</h2>
      <p className="muted">
        {view.start
          ? `Scellez jusqu'à ${String(view.picks)} pactes : un malus contre un bonus.`
          : 'Un pacte de plus, ou aucun.'}
      </p>
      <p className="pact-rank">
        Chaleur <b>{heat}</b> · Rang <b className={`rank rank-${rankOf(heat)}`}>{rankOf(heat)}</b>
      </p>
      <div className="cards">
        {view.offer.map((index, i) => {
          const p = PACTS.pacts[index];
          const on = chosen.includes(i);
          return (
            <button
              key={p.id}
              id={`pact-${String(i)}`}
              className={`card pact-card ${on ? 'on' : ''}`}
              aria-pressed={on}
              disabled={!on && chosen.length >= view.picks}
              onClick={() => {
                toggle(i);
              }}
            >
              <span className="card-title">
                {p.name} <span className="heat">{'◆'.repeat(p.heat)}</span>
              </span>
              <span className="card-line cost">{p.malus}</span>
              <span className="card-line gift">{p.bonus}</span>
            </button>
          );
        })}
      </div>
      <button
        className="btn-primary"
        id="pact-seal"
        onClick={() => {
          onSeal(chosen);
        }}
      >
        {chosen.length > 0 ? 'Sceller' : 'Aucun pacte'}
      </button>
    </div>
  );
}
