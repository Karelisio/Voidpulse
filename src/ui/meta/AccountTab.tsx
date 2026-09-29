/** Compte : niveau, XP, déblocages à venir, bonus cumulés, points Paragon. */
import { META } from '../../content/data';
import {
  paragonFree,
  paragonSpent,
  resetParagon,
  spendParagon,
  xpForLevel,
} from '../../meta/account';
import { metaTotals } from '../../meta/bonus';
import { formatStat, statLabel } from '../../meta/stats';
import { useSave } from '../../state/save';
import { fmt, mutate, sfx } from './common';
import { iconUrl } from '../portraits';

const A = META.account;

function Paragon() {
  const data = useSave((s) => s.data);
  const free = paragonFree(data);
  const spent = data.meta.account.spent;
  const buy = (stat: string, n: number): void => {
    sfx(n > 0 ? 'ui.click' : 'ui.back');
    mutate((d) => {
      spendParagon(d, stat, n);
    });
  };
  return (
    <section className="meta-panel" aria-label="Paragon">
      <h3>
        Paragon{' '}
        <span className="meta-badge gold">
          {fmt(free)} libre{free > 1 ? 's' : ''}
        </span>
      </h3>
      <p className="muted">
        Chaque niveau au-delà de {String(A.maxLevel)} donne un point à placer.{' '}
        {fmt(paragonSpent(data))} placé{paragonSpent(data) > 1 ? 's' : ''} sur{' '}
        {fmt(data.meta.account.paragon)}.
      </p>
      <ul className="meta-paragon">
        {META.paragon.map((p) => {
          const pts = Math.min(p.cap, spent[p.stat] ?? 0);
          return (
            <li key={p.stat} id={`paragon-${p.stat}`}>
              <img src={iconUrl(statLabel(p.stat).icon)} alt="" width={28} height={28} />
              <div className="meta-paragon-info">
                <b>{p.name}</b>
                <small>
                  <span className="num">
                    {fmt(pts)} / {fmt(p.cap)}
                  </span>{' '}
                  · {formatStat(p.stat, pts * p.per)}
                </small>
              </div>
              <div className="meta-steps">
                <button
                  className="btn-ghost"
                  aria-label={`Retirer un point de ${p.name}`}
                  disabled={pts <= 0}
                  onClick={() => {
                    buy(p.stat, -1);
                  }}
                >
                  −
                </button>
                <button
                  className="btn-ghost"
                  aria-label={`Ajouter un point à ${p.name}`}
                  disabled={free <= 0 || pts >= p.cap}
                  onClick={() => {
                    buy(p.stat, 1);
                  }}
                >
                  +
                </button>
                <button
                  className="btn-ghost"
                  aria-label={`Ajouter dix points à ${p.name}`}
                  disabled={free <= 0 || pts >= p.cap}
                  onClick={() => {
                    buy(p.stat, 10);
                  }}
                >
                  +10
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        className="btn-ghost"
        id="paragon-reset"
        disabled={paragonSpent(data) === 0}
        onClick={() => {
          sfx('ui.back');
          mutate(resetParagon);
        }}
      >
        Réinitialiser
      </button>
    </section>
  );
}

export function AccountTab() {
  const data = useSave((s) => s.data);
  const a = data.meta.account;
  const maxed = a.level >= A.maxLevel;
  const need = xpForLevel(a.level + a.paragon);
  const ratio = Math.min(1, a.xp / need);
  const upcoming = A.unlocks.filter((u) => u.level > a.level);
  const totals = Object.entries(metaTotals(data)).filter(([, v]) => v !== 0);

  return (
    <>
      <section className="meta-panel meta-level" aria-label="Niveau de compte">
        <div className="meta-level-num">
          <small>{maxed ? 'Niveau max' : 'Niveau'}</small>
          <b className="num" id="account-level">
            {String(a.level)}
          </b>
          {a.paragon > 0 && <span className="meta-badge gold">Paragon {String(a.paragon)}</span>}
        </div>
        <div className="meta-level-xp">
          <div
            className="meta-bar"
            role="progressbar"
            aria-valuenow={Math.round(ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${String(ratio * 100)}%` }} />
          </div>
          <small className="muted num">
            {fmt(a.xp)} / {fmt(need)} XP{' '}
            {maxed ? '· prochain niveau Paragon' : `· niveau ${String(a.level + 1)}`}
          </small>
        </div>
      </section>

      <section className="meta-panel" aria-label="Déblocages">
        <h3>Prochains déblocages</h3>
        {upcoming.length > 0 ? (
          <ul className="meta-list">
            {upcoming.map((u) => (
              <li key={`${String(u.level)}-${u.unlock}`}>
                <span className="meta-badge">Niv. {String(u.level)}</span> {u.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Tous les déblocages du compte sont acquis.</p>
        )}
      </section>

      <section className="meta-panel" aria-label="Bonus cumulés">
        <h3>Bonus permanents</h3>
        {totals.length > 0 ? (
          <ul className="meta-list meta-stats">
            {totals.map(([k, v]) => (
              <li key={k}>
                <img src={iconUrl(statLabel(k).icon)} alt="" width={22} height={22} />
                {formatStat(k, v)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            Aucun bonus pour l’instant : achetez des talents, équipez des reliques.
          </p>
        )}
      </section>

      {(a.paragon > 0 || maxed) && <Paragon />}
    </>
  );
}
