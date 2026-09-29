/** Rapport HTML autonome : tableau de synthèse et courbes SVG (aucune dépendance). */
export interface Series {
  name: string;
  points: [number, number][];
}

export interface Chart {
  title: string;
  xLabel: string;
  series: Series[];
}

const COLORS = [
  '#3ee6ff',
  '#ff3ec8',
  '#9d6bff',
  '#ffb13d',
  '#7dff9a',
  '#ff6b6b',
  '#cfd8e6',
  '#2fa4ff',
];
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${String(c.charCodeAt(0))};`);

function chart(c: Chart): string {
  const W = 640;
  const H = 260;
  const L = 48;
  const B = 34;
  const all = c.series.flatMap((s) => s.points);
  const xMax = Math.max(1e-9, ...all.map((p) => p[0]));
  const yMax = Math.max(1e-9, ...all.map((p) => p[1]));
  const x = (v: number): number => L + (v / xMax) * (W - L - 12);
  const y = (v: number): number => H - B - (v / yMax) * (H - B - 12);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const grid = ticks
    .map(
      (t) =>
        `<line x1="${String(L)}" x2="${String(W - 12)}" y1="${y(t * yMax).toFixed(1)}" y2="${y(t * yMax).toFixed(1)}" class="g"/><text x="${String(L - 6)}" y="${(y(t * yMax) + 4).toFixed(1)}" text-anchor="end">${(t * yMax).toPrecision(3).replace(/\.?0+$/, '')}</text><text x="${x(t * xMax).toFixed(1)}" y="${String(H - B + 16)}" text-anchor="middle">${(t * xMax).toPrecision(3).replace(/\.?0+$/, '')}</text>`,
    )
    .join('');
  const lines = c.series
    .map(
      (s, i) =>
        `<polyline fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="2" points="${s.points.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')}"/>`,
    )
    .join('');
  const legend = c.series
    .map(
      (s, i) =>
        `<span><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(s.name)}</span>`,
    )
    .join('');
  return `<section><h2>${esc(c.title)}</h2><svg viewBox="0 0 ${String(W)} ${String(H)}">${grid}${lines}<text x="${String(W / 2)}" y="${String(H - 4)}" text-anchor="middle">${esc(c.xLabel)}</text></svg><p class="legend">${legend}</p></section>`;
}

export function renderReport(
  title: string,
  rows: Record<string, unknown>[],
  charts: Chart[],
): string {
  const head = Object.keys(rows[0] ?? {});
  const table = `<table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows
    .map((r) => `<tr>${head.map((h) => `<td>${esc(String(r[h]))}</td>`).join('')}</tr>`)
    .join('')}</table>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voidpulse — équilibrage</title><style>
body{margin:0;padding:24px 16px;background:#0b0618;color:#e8e2ff;font:14px system-ui,sans-serif}
h1{font-size:22px}h2{font-size:15px;margin:24px 0 8px}table{border-collapse:collapse;font-variant-numeric:tabular-nums}
td,th{border-bottom:1px solid #2d2248;padding:6px 10px;text-align:left}svg{width:100%;max-width:720px;background:#120a26;border-radius:8px}
svg text{fill:#a99ccf;font-size:11px}.g{stroke:#2d2248}.legend span{margin-right:14px;white-space:nowrap}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
</style></head><body><h1>${esc(title)}</h1><div style="overflow-x:auto">${table}</div>${charts.map(chart).join('')}</body></html>`;
}
