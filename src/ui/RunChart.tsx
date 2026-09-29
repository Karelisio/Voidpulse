/**
 * Graphique de fin de partie : dégâts par seconde et PV au fil du temps, en deux petits
 * graphiques superposés (échelles différentes : jamais deux axes sur un même graphique) qui
 * partagent l'axe du temps. Réticule au survol ou au doigt, tableau des relevés en option.
 */
import { useState, type PointerEvent } from 'react';
import { locale, num, t, useLang } from '../i18n';
import { formatTime } from './summary';

export interface ChartData {
  /** Pas entre deux relevés (s). */
  step: number;
  dps: number[];
  /** PV en proportion (0 → 1). */
  hp: number[];
}

const W = 400;
const PAD_L = 44;
const PAD_R = 10;
const PLOT_H = 78;
const GAP = 30;
const TOP = 18;
const AXIS_H = 20;
const H = TOP + PLOT_H + GAP + PLOT_H + AXIS_H;
/** Couleurs des séries, validées sur la surface sombre (contraste, daltonisme). */
const DPS_COLOR = '#2a98d8';
const HP_COLOR = '#f0507e';

/** Maximum « rond » au-dessus de v (1, 2, 5 × 10^k). */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

const compact = (v: number): string =>
  v.toLocaleString(locale(), { notation: 'compact', maximumFractionDigits: 1 });

/** Pas des graduations de temps (s) : environ 4 à 6 graduations. */
function timeStep(total: number): number {
  for (const s of [30, 60, 120, 300, 600, 900, 1800, 3600]) if (total / s <= 6) return s;
  return 7200;
}

export function RunChart({ data }: { data: ChartData }) {
  useLang();
  const n = data.dps.length;
  const [hover, setHover] = useState<number | null>(null);
  if (n < 2) return null;
  const total = n * data.step;
  const x = (i: number): number => PAD_L + (((i + 1) * data.step) / total) * (W - PAD_L - PAD_R);
  const maxDps = niceMax(Math.max(...data.dps));
  const yDps = (v: number): number => TOP + PLOT_H - (v / maxDps) * PLOT_H;
  const hpTop = TOP + PLOT_H + GAP;
  const yHp = (v: number): number => hpTop + PLOT_H - v * PLOT_H;
  const path = (vals: number[], y: (v: number) => number): string =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const dpsLine = path(data.dps, yDps);
  const dpsArea = `${dpsLine}L${x(n - 1).toFixed(1)},${String(TOP + PLOT_H)}L${x(0).toFixed(1)},${String(TOP + PLOT_H)}Z`;
  const hpLine = path(data.hp, yHp);
  const ts = timeStep(total);
  const ticks: number[] = [];
  for (let t = ts; t <= total; t += ts) ticks.push(t);

  const onMove = (e: PointerEvent<SVGSVGElement>): void => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const f = (px - PAD_L) / (W - PAD_L - PAD_R);
    setHover(Math.max(0, Math.min(n - 1, Math.round(f * (total / data.step)) - 1)));
  };

  const h = hover;
  const tipLeft = h !== null && x(h) > W * 0.6;

  return (
    <figure className="run-chart">
      <div className="run-chart-plot">
        <svg
          viewBox={`0 0 ${String(W)} ${String(H)}`}
          role="img"
          aria-label={t('end.chartAria')}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => {
            setHover(null);
          }}
        >
          {/* Dégâts par seconde */}
          <text className="rc-title" x={PAD_L} y={TOP - 6}>
            {t('end.dpsTitle')}
          </text>
          {[0, 0.5, 1].map((k) => (
            <g key={`d${String(k)}`}>
              <line
                className="rc-grid"
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yDps(maxDps * k)}
                y2={yDps(maxDps * k)}
              />
              <text className="rc-tick" x={PAD_L - 6} y={yDps(maxDps * k) + 4} textAnchor="end">
                {compact(maxDps * k)}
              </text>
            </g>
          ))}
          <path d={dpsArea} fill={DPS_COLOR} opacity={0.1} />
          <path
            d={dpsLine}
            fill="none"
            stroke={DPS_COLOR}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* PV */}
          <text className="rc-title" x={PAD_L} y={hpTop - 6}>
            {t('end.hp')}
          </text>
          {[0, 0.5, 1].map((k) => (
            <g key={`h${String(k)}`}>
              <line className="rc-grid" x1={PAD_L} x2={W - PAD_R} y1={yHp(k)} y2={yHp(k)} />
              <text className="rc-tick" x={PAD_L - 6} y={yHp(k) + 4} textAnchor="end">
                {t('end.axisPct', { n: Math.round(k * 100) })}
              </text>
            </g>
          ))}
          <path
            d={hpLine}
            fill="none"
            stroke={HP_COLOR}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Axe du temps, commun */}
          {ticks.map((t) => {
            const tx = PAD_L + (t / total) * (W - PAD_L - PAD_R);
            return (
              <text key={t} className="rc-tick" x={tx} y={H - 4} textAnchor="middle">
                {formatTime(t)}
              </text>
            );
          })}
          {h !== null && (
            <g>
              <line className="rc-cross" x1={x(h)} x2={x(h)} y1={TOP} y2={hpTop + PLOT_H} />
              <circle cx={x(h)} cy={yDps(data.dps[h])} r={4} fill={DPS_COLOR} className="rc-dot" />
              <circle cx={x(h)} cy={yHp(data.hp[h])} r={4} fill={HP_COLOR} className="rc-dot" />
            </g>
          )}
        </svg>
        {h !== null && (
          <div
            className="rc-tip"
            style={{
              left: `${String((x(h) / W) * 100)}%`,
              transform: tipLeft ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
            }}
          >
            <b>{formatTime((h + 1) * data.step)}</b>
            <span>
              <i style={{ background: DPS_COLOR }} />
              {t('end.tipDps', { n: Math.round(data.dps[h]) })}
            </span>
            <span>
              <i style={{ background: HP_COLOR }} />
              {t('end.tipHp', { n: Math.round(data.hp[h] * 100) })}
            </span>
          </div>
        )}
      </div>
      <details className="rc-table">
        <summary>{t('end.tableSummary')}</summary>
        <table>
          <thead>
            <tr>
              <th>{t('end.time')}</th>
              <th>{t('end.colDps')}</th>
              <th>{t('end.hp')}</th>
            </tr>
          </thead>
          <tbody>
            {data.dps.map((v, i) => (
              <tr key={i}>
                <td>{formatTime((i + 1) * data.step)}</td>
                <td>{num(Math.round(v))}</td>
                <td>{t('end.axisPct', { n: Math.round(data.hp[i] * 100) })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
