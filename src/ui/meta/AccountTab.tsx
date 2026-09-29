/** Compte : niveau, XP, déblocages à venir, bonus cumulés, points Paragon. */
import { META } from '../../content/data';
import { t, useLang } from '../../i18n';
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
  useLang();
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
    <section className="meta-panel" aria-label={t('meta.paragon')}>
      <h3>
        {t('meta.paragon')}{' '}
        <span className="meta-badge gold">
          {t(free > 1 ? 'meta.paragonFreeMany' : 'meta.paragonFreeOne', { n: fmt(free) })}
        </span>
      </h3>
      <p className="muted">
        {t('meta.paragonIntro', { max: A.maxLevel })}{' '}
        {t(paragonSpent(data) > 1 ? 'meta.paragonPlacedMany' : 'meta.paragonPlacedOne', {
          spent: fmt(paragonSpent(data)),
          total: fmt(data.meta.account.paragon),
        })}
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
                  aria-label={t('meta.paragonRemove', { name: p.name })}
                  disabled={pts <= 0}
                  onClick={() => {
                    buy(p.stat, -1);
                  }}
                >
                  −
                </button>
                <button
                  className="btn-ghost"
                  aria-label={t('meta.paragonAdd', { name: p.name })}
                  disabled={free <= 0 || pts >= p.cap}
                  onClick={() => {
                    buy(p.stat, 1);
                  }}
                >
                  +
                </button>
                <button
                  className="btn-ghost"
                  aria-label={t('meta.paragonAddTen', { name: p.name })}
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
        {t('meta.paragonReset')}
      </button>
    </section>
  );
}

export function AccountTab() {
  useLang();
  const data = useSave((s) => s.data);
  const a = data.meta.account;
  const maxed = a.level >= A.maxLevel;
  const need = xpForLevel(a.level + a.paragon);
  const ratio = Math.min(1, a.xp / need);
  const upcoming = A.unlocks.filter((u) => u.level > a.level);
  const totals = Object.entries(metaTotals(data)).filter(([, v]) => v !== 0);

  return (
    <>
      <section className="meta-panel meta-level" aria-label={t('meta.accountLevel')}>
        <div className="meta-level-num">
          <small>{maxed ? t('meta.levelMax') : t('meta.levelLabel')}</small>
          <b className="num" id="account-level">
            {String(a.level)}
          </b>
          {a.paragon > 0 && (
            <span className="meta-badge gold">{t('meta.paragonBadge', { n: a.paragon })}</span>
          )}
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
            {maxed
              ? t('meta.xpToParagon', { xp: fmt(a.xp), need: fmt(need) })
              : t('meta.xpToLevel', { xp: fmt(a.xp), need: fmt(need), level: a.level + 1 })}
          </small>
        </div>
      </section>

      <section className="meta-panel" aria-label={t('meta.unlocks')}>
        <h3>{t('meta.unlocksTitle')}</h3>
        {upcoming.length > 0 ? (
          <ul className="meta-list">
            {upcoming.map((u) => (
              <li key={`${String(u.level)}-${u.unlock}`}>
                <span className="meta-badge">{t('meta.levelShort', { n: u.level })}</span> {u.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t('meta.unlocksDone')}</p>
        )}
      </section>

      <section className="meta-panel" aria-label={t('meta.totals')}>
        <h3>{t('meta.totalsTitle')}</h3>
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
          <p className="muted">{t('meta.totalsEmpty')}</p>
        )}
      </section>

      {(a.paragon > 0 || maxed) && <Paragon />}
    </>
  );
}
