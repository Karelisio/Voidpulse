import { num, t, useLang } from '../i18n';
import type { RunSummary } from '../state/ui';
import { RunChart } from './RunChart';
import { formatTime } from './summary';

interface Props {
  summary: RunSummary;
  onAgain: () => void;
  onMenu: () => void;
}

export function EndOverlay({ summary, onAgain, onMenu }: Props) {
  useLang();
  const total =
    summary.weapons.reduce((s, w) => s + w.damage, 0) +
      summary.reactionDamage +
      summary.eveilDamage +
      summary.dashDamage || 1;
  const rows = [
    ...summary.weapons.map((w) => ({
      name: w.name,
      damage: w.damage,
      icon: w.icon,
      cls: `el-${w.element}`,
    })),
    { name: t('end.reactions'), damage: summary.reactionDamage, icon: '', cls: 'el-reaction' },
    { name: t('end.awakening'), damage: summary.eveilDamage, icon: '', cls: 'el-eveil' },
    { name: t('end.dash'), damage: summary.dashDamage, icon: '', cls: 'el-dash' },
  ].filter((r) => r.damage > 0);
  return (
    <div className="overlay end" role="dialog" aria-label={t('end.aria')}>
      <h2 className={summary.victory ? 'win' : 'loss'}>
        {summary.victory ? t('end.victory') : t('end.defeat')}
      </h2>
      <div className="end-rank">
        <span className={`rank rank-${summary.rank}`}>{summary.rank}</span>
        <span>
          <b>{num(summary.score)}</b> {t('end.points')}
          {summary.bestScore && <em> · {t('end.record')}</em>}
          <small>
            {summary.mode} · {summary.modeDetail} · {summary.character}
            {summary.pacts.length > 0 ? ` · ${summary.pacts.join(', ')}` : ` · ${t('end.noPact')}`}
          </small>
        </span>
      </div>
      {summary.unlocked.length > 0 && (
        <p className="end-unlock">{t('end.newPilot', { list: summary.unlocked.join(', ') })}</p>
      )}
      {summary.modeLines.length > 0 && (
        <ul className="end-lines">
          {summary.modeLines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {summary.newStages.length > 0 && (
        <p className="end-unlock">{t('end.newSector', { list: summary.newStages.join(', ') })}</p>
      )}
      {summary.newBosses.length > 0 && (
        <p className="end-boss">{t('end.firstTriumph', { list: summary.newBosses.join(', ') })}</p>
      )}
      <dl className="end-stats">
        <div>
          <dt>{t('end.time')}</dt>
          <dd>{formatTime(summary.time)}</dd>
        </div>
        <div>
          <dt>{t('end.kills')}</dt>
          <dd>{summary.kills}</dd>
        </div>
        <div>
          <dt>{t('end.level')}</dt>
          <dd>{summary.level}</dd>
        </div>
        <div>
          <dt>{t('end.awakenings')}</dt>
          <dd>{summary.eveils}</dd>
        </div>
        <div>
          <dt>{t('end.damageTaken')}</dt>
          <dd>{num(Math.round(summary.damageTaken))}</dd>
        </div>
        <div>
          <dt>{t('end.avgDps')}</dt>
          <dd>{num(Math.round(total / Math.max(1, summary.time)))}</dd>
        </div>
      </dl>
      <RunChart data={summary.timeline} />
      <h3>{t('end.damageHeading')}</h3>
      <ul className="dmg">
        {rows.map((r) => (
          <li key={r.name}>
            <span className="dmg-name">
              {r.icon && <img src={r.icon} alt="" width={22} height={22} />}
              {r.name}
            </span>
            <span className="dmg-bar">
              <i className={r.cls} style={{ width: `${Math.max(2, (r.damage / total) * 100)}%` }} />
            </span>
            <span className="dmg-val">
              {num(Math.round(r.damage))}
              <small>{num(Math.round(r.damage / Math.max(1, summary.time)))}/s</small>
            </span>
          </li>
        ))}
      </ul>
      {summary.reactions.length > 0 && (
        <>
          <h3>{t('end.reactionsTriggered')}</h3>
          <ul className="chips">
            {summary.reactions.map((r) => (
              <li key={r.name} style={{ borderColor: r.color, color: r.color }}>
                {r.name} × {r.count}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="end-actions end-sticky">
        <button className="btn-primary" id="again" onClick={onAgain}>
          {t('end.again')}
        </button>
        <button className="btn-ghost" onClick={onMenu}>
          {t('end.menu')}
        </button>
      </div>
    </div>
  );
}
