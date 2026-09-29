/** Maîtrise : rang de chacune des armes, bonus de dégâts et apparences à débloquer. */
import { useState } from 'react';
import { META, WEAPONS } from '../../content/data';
import { t, useLang } from '../../i18n';
import { masteryProgress, masteryRank, selectSkin, skinsUnlocked } from '../../meta/mastery';
import { useSave } from '../../state/save';
import { ELEMENT_LABEL } from '../cards';
import { iconUrl } from '../portraits';
import { fmt, mutate, sfx, tone } from './common';

const M = META.mastery;
const MAX = M.ranks.length;

const bonus = (rank: number): string =>
  t('meta.bonusPct', { n: Math.round(M.damagePerRank * rank * 100) });

export function MasteryTab() {
  useLang();
  const data = useSave((s) => s.data);
  const [selected, setSelected] = useState<string | null>(null);
  const w = WEAPONS.find((x) => x.id === selected);
  const xpOf = (id: string): number => data.meta.mastery[id] ?? 0;
  const skinOf = (id: string): number => data.meta.skins[id] ?? -1;
  const total = WEAPONS.reduce((s, x) => s + masteryRank(xpOf(x.id)), 0);

  const detail = (id: string) => {
    const def = WEAPONS.find((x) => x.id === id);
    if (!def) return null;
    const xp = xpOf(id);
    const rank = masteryRank(xp);
    const unlocked = skinsUnlocked(rank);
    const skin = skinOf(id);
    const next = rank < MAX ? M.ranks[rank] : null;
    return (
      <section className="meta-sheet" style={tone(def.color)} aria-label={def.name}>
        <div className="meta-sheet-head">
          <img src={iconUrl(id)} alt="" width={44} height={44} />
          <div>
            <h3>
              {def.name}{' '}
              <small className={`card-element el-${def.element}`}>
                {ELEMENT_LABEL[def.element]}
              </small>
            </h3>
            <small className="num muted">
              {t('meta.rankBonus', { rank, max: MAX, bonus: bonus(rank) })}
            </small>
          </div>
        </div>
        <div className="meta-bar" aria-hidden="true">
          <i style={{ width: `${String(masteryProgress(xp) * 100)}%` }} />
        </div>
        <small className="muted num">
          {next === null
            ? t('meta.xpMaxed', { xp: fmt(xp) })
            : t('meta.xpProgress', { xp: fmt(xp), next: fmt(next) })}
        </small>
        <h4>{t('meta.skins')}</h4>
        <div className="meta-skins">
          <button
            id="skin-origin"
            className={`meta-skin ${skin < 0 ? 'on' : ''}`}
            aria-pressed={skin < 0}
            onClick={() => {
              sfx('ui.click');
              mutate((d) => {
                selectSkin(d, id, -1);
              });
            }}
          >
            <i style={{ background: def.color }} />
            <b>{t('meta.skinOrigin')}</b>
            <small className="muted">{t('meta.skinAlways')}</small>
          </button>
          {M.skins.map((s, i) => {
            const open = unlocked.includes(i);
            return (
              <button
                key={s.name}
                id={`skin-${String(i)}`}
                className={`meta-skin ${skin === i ? 'on' : ''} ${open ? '' : 'locked'}`}
                aria-pressed={skin === i}
                disabled={!open}
                onClick={() => {
                  sfx('ui.click');
                  mutate((d) => {
                    selectSkin(d, id, i);
                  });
                }}
              >
                <i style={{ background: s.color }} />
                <b>{s.name}</b>
                <small className="muted">
                  {open ? t('meta.skinUnlocked') : t('meta.skinRank', { n: s.rank })}
                </small>
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <>
      <p className="muted meta-intro">
        {t('meta.masteryIntro', { n: Math.round(M.damagePerRank * 100) })}{' '}
        <b className="num">
          {String(total)} / {String(WEAPONS.length * MAX)}
        </b>
      </p>
      <section className="meta-grid" aria-label={t('meta.weapons')}>
        {WEAPONS.map((x) => {
          const xp = xpOf(x.id);
          const rank = masteryRank(xp);
          const skin = skinOf(x.id);
          return (
            <button
              key={x.id}
              id={`mastery-${x.id}`}
              className={`meta-cell mastery ${x.id === selected ? 'sel' : ''} ${rank === MAX ? 'maxed' : ''} ${rank === 0 ? 'dim' : ''}`}
              style={tone(x.color)}
              aria-pressed={x.id === selected}
              onClick={() => {
                sfx('ui.card');
                setSelected(x.id);
              }}
            >
              <img src={iconUrl(x.id)} alt="" width={36} height={36} />
              <span className="meta-cell-name">{x.name}</span>
              <small className="num">
                {t('meta.masteryRank', { rank, max: MAX })}{' '}
                <span className="muted">{bonus(rank)}</span>
              </small>
              <div className="meta-bar thin" aria-hidden="true">
                <i style={{ width: `${String(masteryProgress(xp) * 100)}%` }} />
              </div>
              {skin >= 0 && (
                <i
                  className="meta-skin-dot"
                  style={{ background: M.skins[skin].color }}
                  title={M.skins[skin].name}
                />
              )}
            </button>
          );
        })}
      </section>
      {w && detail(w.id)}
    </>
  );
}
