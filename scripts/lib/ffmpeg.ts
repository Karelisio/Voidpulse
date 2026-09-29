import { spawnSync } from 'node:child_process';

export const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';

export function runFfmpeg(args: readonly string[]): string {
  const res = spawnSync(FFMPEG, ['-hide_banner', '-nostdin', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) throw new Error(`ffmpeg introuvable (${FFMPEG}) : ${res.error.message}`);
  if (res.status !== 0) throw new Error(`ffmpeg a échoué :\n${res.stderr.slice(-2000)}`);
  return res.stderr;
}

export interface Loudness {
  integrated: number; // LUFS (-Infinity si silence)
  truePeak: number; // dBTP
  range: number; // LU
}

/** Mesure EBU R128 (loudness intégrée, true peak, plage) via le filtre ebur128. */
export function measureLoudness(path: string): Loudness {
  const log = runFfmpeg([
    '-i',
    path,
    '-filter_complex',
    'ebur128=peak=true:framelog=quiet',
    '-f',
    'null',
    '-',
  ]);
  const summary = log.slice(log.lastIndexOf('Summary:'));
  const num = (re: RegExp): number => {
    const m = re.exec(summary);
    if (!m) return -Infinity;
    const v = Number(m[1]);
    return Number.isFinite(v) ? v : -Infinity;
  };
  return {
    integrated: num(/I:\s+(-?[\d.]+|-inf) LUFS/),
    truePeak: num(/Peak:\s+(-?[\d.]+|-inf) dBFS/),
    range: num(/LRA:\s+(-?[\d.]+) LU/),
  };
}

/** Encode en Ogg Opus 48 kHz, VBR contraint (le débit reste proche de la cible). */
export function encodeOpus(input: string, output: string, bitrateKbps = 128): void {
  runFfmpeg([
    '-y',
    '-i',
    input,
    '-map_metadata',
    '-1',
    // Numéro de série Ogg et en-têtes fixes : ré-encoder un même rendu donne le même fichier.
    '-fflags',
    '+bitexact',
    '-flags:a',
    '+bitexact',
    '-c:a',
    'libopus',
    '-b:a',
    `${bitrateKbps}k`,
    '-vbr',
    'constrained',
    '-compression_level',
    '10',
    '-application',
    'audio',
    '-ar',
    '48000',
    output,
  ]);
}

/** Spectrogramme PNG (contrôle visuel du mix). */
export function spectrogram(input: string, output: string, width = 1600, height = 600): void {
  runFfmpeg([
    '-y',
    '-i',
    input,
    '-lavfi',
    `showspectrumpic=s=${width}x${height}:legend=1:scale=log`,
    output,
  ]);
}
