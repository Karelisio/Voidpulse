import * as Tone from 'tone';
import { Rng } from '../../../engine/rng';
import { resetRenderWindow, setRenderWindow } from './section';
import { Grid } from './time';
import type { LayerName, TrackDef } from './types';

export const RENDER_SAMPLE_RATE = 48000;

export type Section = 'intro' | 'loop';

/** Fenêtre (s) des événements d'une section et durée rendue (queue comprise). */
export function sectionSpan(
  def: TrackDef,
  section: Section,
): { from: number; to: number; duration: number } {
  const grid = new Grid(def.bpm, 16, def.swing ?? 0);
  const loopStart = grid.t(def.introBars);
  const loopEnd = grid.t(def.introBars + def.loopBars);
  return section === 'intro'
    ? { from: 0, to: loopStart, duration: loopStart + def.tailSeconds }
    : { from: loopStart, to: loopEnd, duration: loopEnd + def.tailSeconds };
}

/**
 * Rend une section (intro ou boucle) d'une couche seule, hors ligne (Tone.Offline) :
 * seuls les événements de la section sont joués, la queue est rendue au-delà.
 */
export async function renderLayer(
  def: TrackDef,
  layer: LayerName,
  section: Section,
): Promise<AudioBuffer> {
  const grid = new Grid(def.bpm, 16, def.swing ?? 0);
  const span = sectionSpan(def, section);
  setRenderWindow(span.from, span.to);
  let buffer: Tone.ToneAudioBuffer;
  try {
    buffer = await Tone.Offline(
      async () => {
        const out = new Tone.Gain(1).toDestination();
        const rng = new Rng(`${def.id}/${layer}`);
        await def.layers[layer].build({ grid, out, rng, duration: span.duration });
      },
      span.duration,
      2,
      RENDER_SAMPLE_RATE,
    );
  } finally {
    resetRenderWindow();
  }
  const audio = buffer.get();
  if (!audio) throw new Error(`Rendu vide : ${def.id}/${layer}`);
  return audio;
}

/** Encode un AudioBuffer en WAV float 32 bits entrelacé. */
export function encodeWavFloat32(audio: AudioBuffer): ArrayBuffer {
  const channels = audio.numberOfChannels;
  const frames = audio.length;
  const dataBytes = frames * channels * 4;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const writeStr = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true); // IEEE float
  view.setUint16(22, channels, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * channels * 4, true);
  view.setUint16(32, channels * 4, true);
  view.setUint16(34, 32, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);
  const out = new Float32Array(buf, 44);
  const data: Float32Array[] = [];
  for (let c = 0; c < channels; c++) data.push(audio.getChannelData(c));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) out[i * channels + c] = data[c][i]!;
  }
  return buf;
}
