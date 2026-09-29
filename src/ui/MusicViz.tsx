/**
 * Visualiseur de l'intensité musicale (menu debug) : mesure brute et lissée avec les seuils
 * des paliers, palier appliqué, couches ciblées et niveau réel de chaque stem.
 */
import { useEffect, useState } from 'react';
import { audio } from '../audio';
import { TIER_DOWN, TIER_UP } from '../audio/music/intensity';
import type { MusicDebug } from '../audio/music/director';

export function MusicViz() {
  const [d, setD] = useState<MusicDebug | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      setD(audio()?.music?.debug() ?? null);
    }, 100);
    return () => {
      window.clearInterval(id);
    };
  }, []);
  if (!d) return <div className="viz">Musique : moteur non prêt</div>;
  const pct = (v: number): string => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
  return (
    <div className="viz">
      <div className="viz-head">
        <span>♪ {d.scene ?? '—'}</span>
        <span>
          palier {d.tier} → appliqué {d.appliedTier}
        </span>
        <span className={d.underruns > 0 ? 'viz-bad' : ''}>
          {d.streaming ? 'stream' : 'repli'} · sous-alim. {d.underruns}
        </span>
      </div>
      <div className="viz-meter" aria-label="Intensité">
        {TIER_UP.map((t) => (
          <i key={`u${t}`} className="viz-up" style={{ left: pct(t) }} />
        ))}
        {TIER_DOWN.map((t) => (
          <i key={`d${t}`} className="viz-down" style={{ left: pct(t) }} />
        ))}
        <b className="viz-raw" style={{ width: pct(d.raw) }} />
        <b className="viz-value" style={{ width: pct(d.value) }} />
      </div>
      <div className="viz-layers">
        {d.layers.map((name, i) => (
          <div key={`${name}${String(i)}`} className={d.targets[i] > 0 ? 'on' : ''}>
            <span>{name}</span>
            <b style={{ width: pct((d.levels[i] ?? 0) * 5) }} />
          </div>
        ))}
      </div>
    </div>
  );
}
