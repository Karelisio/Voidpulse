import { readFileSync, writeFileSync } from 'node:fs';

/** Audio multicanal en float 32 bits (un tableau par canal). */
export interface PcmAudio {
  sampleRate: number;
  channels: Float32Array[];
}

export function frameCount(audio: PcmAudio): number {
  return audio.channels[0]?.length ?? 0;
}

/** Lit un WAV float 32 bits (format 3) ou PCM 16/24 bits. */
export function readWav(path: string): PcmAudio {
  const buf = readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`WAV invalide : ${path}`);
  }
  let offset = 12;
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataStart = -1;
  let dataLen = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = buf.readUInt16LE(body);
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      bits = buf.readUInt16LE(body + 14);
      if (format === 0xfffe) format = buf.readUInt16LE(body + 24); // WAVE_FORMAT_EXTENSIBLE
    } else if (id === 'data') {
      dataStart = body;
      dataLen = Math.min(size, buf.length - body);
      break;
    }
    offset = body + size + (size % 2);
  }
  if (dataStart < 0) throw new Error(`Chunk data absent : ${path}`);
  const bytesPerSample = bits / 8;
  const frames = Math.floor(dataLen / (bytesPerSample * channels));
  const out: Float32Array[] = [];
  for (let c = 0; c < channels; c++) out.push(new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const p = dataStart + (i * channels + c) * bytesPerSample;
      let v: number;
      if (format === 3 && bits === 32) v = buf.readFloatLE(p);
      else if (format === 1 && bits === 16) v = buf.readInt16LE(p) / 32768;
      else if (format === 1 && bits === 24) v = buf.readIntLE(p, 3) / 8388608;
      else throw new Error(`Format WAV non géré (format ${format}, ${bits} bits) : ${path}`);
      out[c][i] = v;
    }
  }
  return { sampleRate, channels: out };
}

/** Écrit un WAV float 32 bits entrelacé. */
export function writeWav(path: string, audio: PcmAudio): void {
  const channels = audio.channels.length;
  const frames = frameCount(audio);
  const dataBytes = frames * channels * 4;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(audio.sampleRate, 24);
  buf.writeUInt32LE(audio.sampleRate * channels * 4, 28);
  buf.writeUInt16LE(channels * 4, 32);
  buf.writeUInt16LE(32, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  let p = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      buf.writeFloatLE(audio.channels[c][i], p);
      p += 4;
    }
  }
  writeFileSync(path, buf);
}

/**
 * Boucle sans couture : la queue rendue après `loopEnd` (réverbs, delays, relâchements)
 * est ajoutée au début de la boucle, puis le fichier est coupé à `loopEnd`.
 */
export function foldTail(audio: PcmAudio, loopStart: number, loopEnd: number): PcmAudio {
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((ch) => {
      const out = ch.slice(0, loopEnd);
      const tail = ch.subarray(loopEnd);
      const n = Math.min(tail.length, loopEnd - loopStart);
      for (let i = 0; i < n; i++) out[loopStart + i] += tail[i];
      return out;
    }),
  };
}

export function applyGainDb(audio: PcmAudio, db: number): PcmAudio {
  const g = 10 ** (db / 20);
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((ch) => ch.map((v) => v * g)),
  };
}

/** Somme de plusieurs pistes de même format. */
export function mixDown(tracks: readonly PcmAudio[]): PcmAudio {
  if (tracks.length === 0) throw new Error('mixDown : aucune piste');
  const first = tracks[0];
  const frames = Math.max(...tracks.map(frameCount));
  const channels = first.channels.map(() => new Float32Array(frames));
  for (const t of tracks) {
    t.channels.forEach((ch, c) => {
      const out = channels[c];
      for (let i = 0; i < ch.length; i++) out[i] += ch[i];
    });
  }
  return { sampleRate: first.sampleRate, channels };
}

export function samplePeak(audio: PcmAudio): number {
  let peak = 0;
  for (const ch of audio.channels)
    for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  return peak;
}

/** Copie de [start, end) (les échantillons hors du signal valent 0). */
export function sliceAudio(audio: PcmAudio, start: number, end: number): PcmAudio {
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((ch) => {
      const out = new Float32Array(Math.max(0, end - start));
      out.set(ch.subarray(Math.max(0, start), Math.min(ch.length, end)), Math.max(0, -start));
      return out;
    }),
  };
}

/** Superpose `b` à partir de l'échantillon `offset` de `a` (résultat assez long pour les deux). */
export function overlay(a: PcmAudio, b: PcmAudio, offset: number): PcmAudio {
  const len = Math.max(frameCount(a), offset + frameCount(b));
  return {
    sampleRate: a.sampleRate,
    channels: a.channels.map((ch, c) => {
      const out = new Float32Array(len);
      out.set(ch);
      const src = b.channels[c];
      for (let i = 0; i < src.length; i++) out[offset + i] += src[i];
      return out;
    }),
  };
}

/** Coupe le silence final (sous `thresholdDb`), en gardant `padFrames` de marge. */
export function trimTrailingSilence(
  audio: PcmAudio,
  thresholdDb = -90,
  padFrames = 2400,
): PcmAudio {
  const th = 10 ** (thresholdDb / 20);
  let last = 0;
  for (const ch of audio.channels) {
    for (let i = ch.length - 1; i > last; i--) {
      if (Math.abs(ch[i]) > th) {
        last = i;
        break;
      }
    }
  }
  return sliceAudio(audio, 0, Math.min(frameCount(audio), last + padFrames));
}
