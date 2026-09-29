/**
 * Point d'entrée navigateur du rendu musical (servi par scripts/render-music, jamais embarqué).
 * `?list` : métadonnées de toutes les pistes ; `?track=id&layer=nom` : rend une couche et la
 * renvoie au serveur en WAV float 32 bits.
 */
import { TRACK_LIST, TRACKS } from '../index';
import { encodeWavFloat32, renderLayer, type Section } from '../lib/render';
import { LAYERS, type LayerName, trackMeta, type TrackMeta } from '../lib/types';

type RenderResult =
  | { ok: true; metas: TrackMeta[] }
  | { ok: true; seconds: number; peak: number }
  | { ok: false; error: string };

declare global {
  interface Window {
    __renderDone?: RenderResult;
  }
}

async function main(): Promise<RenderResult> {
  const params = new URLSearchParams(location.search);
  if (params.has('list')) return { ok: true, metas: TRACK_LIST.map(trackMeta) };

  const id = params.get('track') ?? '';
  const layer = params.get('layer') as LayerName | null;
  const section = params.get('section') === 'intro' ? 'intro' : ('loop' as Section);
  const def = TRACKS[id];
  if (!def) throw new Error(`Piste inconnue : ${id}`);
  if (!layer || !LAYERS.includes(layer)) throw new Error(`Couche inconnue : ${String(layer)}`);

  const started = performance.now();
  const audio = await renderLayer(def, layer, section);
  let peak = 0;
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const d = audio.getChannelData(c);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  const res = await fetch(
    `/__render/save?track=${encodeURIComponent(id)}&layer=${layer}&section=${section}`,
    {
      method: 'POST',
      body: encodeWavFloat32(audio),
    },
  );
  if (!res.ok) throw new Error(`Échec de l'envoi du rendu : HTTP ${res.status}`);
  return { ok: true, seconds: (performance.now() - started) / 1000, peak };
}

main().then(
  (r) => {
    window.__renderDone = r;
  },
  (e: unknown) => {
    window.__renderDone = {
      ok: false,
      error: e instanceof Error ? (e.stack ?? e.message) : String(e),
    };
  },
);
