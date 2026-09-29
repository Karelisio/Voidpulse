import type { RunSummary } from '../state/ui';
import { formatTime } from './summary';

interface Props {
  summary: RunSummary;
  onAgain: () => void;
  onMenu: () => void;
}

export function EndOverlay({ summary, onAgain, onMenu }: Props) {
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
    { name: 'Réactions', damage: summary.reactionDamage, icon: '', cls: 'el-reaction' },
    { name: 'Éveil', damage: summary.eveilDamage, icon: '', cls: 'el-eveil' },
    { name: 'Dash', damage: summary.dashDamage, icon: '', cls: 'el-dash' },
  ].filter((r) => r.damage > 0);
  return (
    <div className="overlay end" role="dialog" aria-label="Fin de la partie">
      <h2 className={summary.victory ? 'win' : 'loss'}>
        {summary.victory ? 'Victoire' : 'Signal perdu'}
      </h2>
      <div className="end-rank">
        <span className={`rank rank-${summary.rank}`}>{summary.rank}</span>
        <span>
          <b>{summary.score.toLocaleString('fr-FR')}</b> points
          {summary.bestScore && <em> · record !</em>}
          <small>
            {summary.character}
            {summary.pacts.length > 0 ? ` · ${summary.pacts.join(', ')}` : ' · sans pacte'}
          </small>
        </span>
      </div>
      {summary.unlocked.length > 0 && (
        <p className="end-unlock">Nouveau pilote : {summary.unlocked.join(', ')} !</p>
      )}
      <dl className="end-stats">
        <div>
          <dt>Temps</dt>
          <dd>{formatTime(summary.time)}</dd>
        </div>
        <div>
          <dt>Éliminations</dt>
          <dd>{summary.kills}</dd>
        </div>
        <div>
          <dt>Niveau</dt>
          <dd>{summary.level}</dd>
        </div>
        <div>
          <dt>Éveils</dt>
          <dd>{summary.eveils}</dd>
        </div>
      </dl>
      <h3>Dégâts</h3>
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
            <span className="dmg-val">{Math.round(r.damage).toLocaleString('fr-FR')}</span>
          </li>
        ))}
      </ul>
      {summary.reactions.length > 0 && (
        <>
          <h3>Réactions déclenchées</h3>
          <ul className="chips">
            {summary.reactions.map((r) => (
              <li key={r.name} style={{ borderColor: r.color, color: r.color }}>
                {r.name} × {r.count}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="end-actions">
        <button className="btn-primary" id="again" onClick={onAgain}>
          Encore une partie
        </button>
        <button className="btn-ghost" onClick={onMenu}>
          Menu
        </button>
      </div>
    </div>
  );
}
