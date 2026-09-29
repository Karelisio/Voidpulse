/**
 * Point d'entrée navigateur du rendu des effets sonores (servi par scripts/render-sfx, jamais
 * embarqué). `?list` : métadonnées ; `?sound=id&variant=k` : rend une variante et l'envoie au
 * serveur en WAV float 32 bits.
 */
import * as Tone from 'tone';
import { Rng } from '../../../engine/rng';
import { encodeWavFloat32 } from '../../compositions/lib/render';
import type { SoundMeta } from '../meta';
import { SOUNDS } from '../sounds';

type Result = { ok: true; metas?: SoundMeta[]; peak?: number } | { ok: false; error: string };

declare global {
  interface Window {
    __sfxDone?: Result;
  }
}

async function main(): Promise<Result> {
  const params = new URLSearchParams(location.search);
  if (params.has('list')) {
    return {
      ok: true,
      metas: Object.entries(SOUNDS).map(([id, d]) => ({
        id,
        variants: d.variants,
        stereo: d.stereo ?? false,
        bus: d.bus ?? 'sfx',
        gainDb: d.gainDb,
        pitchVar: d.pitchVar ?? 0.03,
        volVar: d.volVar ?? 0.08,
        maxVoices: d.maxVoices ?? 4,
        priority: d.priority ?? 0,
        cooldownMs: d.cooldownMs ?? 0,
      })),
    };
  }
  const id = params.get('sound') ?? '';
  const v = Number(params.get('variant') ?? 0);
  const design = SOUNDS[id] as (typeof SOUNDS)[string] | undefined;
  if (!design) throw new Error(`Son inconnu : ${id}`);
  const buffer = await Tone.Offline(
    async () => {
      const out = new Tone.Gain(1).toDestination();
      await design.build({ out, rng: new Rng(`${id}/${v}`), v });
    },
    design.duration,
    design.stereo ? 2 : 1,
    48000,
  );
  const audio = buffer.get();
  if (!audio) throw new Error(`Rendu vide : ${id}`);
  let peak = 0;
  for (let c = 0; c < audio.numberOfChannels; c++) {
    for (const x of audio.getChannelData(c)) peak = Math.max(peak, Math.abs(x));
  }
  const res = await fetch(`/__sfx/save?sound=${encodeURIComponent(id)}&variant=${v}`, {
    method: 'POST',
    body: encodeWavFloat32(audio),
  });
  if (!res.ok) throw new Error(`Échec de l'envoi : HTTP ${res.status}`);
  return { ok: true, peak };
}

main().then(
  (r) => {
    window.__sfxDone = r;
  },
  (e: unknown) => {
    window.__sfxDone = {
      ok: false,
      error: e instanceof Error ? (e.stack ?? e.message) : String(e),
    };
  },
);
