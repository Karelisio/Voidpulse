/**
 * Importe une piste composée hors du projet (FL Studio…) dans assets/audio/music :
 * conversion en Ogg Opus 48 kHz, normalisation du mix à -14 LUFS (gain commun à tous les
 * stems, crête vraie ≤ -1 dBTP), tempo détecté ou fourni et recalé sur la boucle, points de
 * boucle suggérés, entrée de tracks.json écrite (gainDb manuel conservé) et liaisons.
 *
 * Deux formes d'export (voir README, « Remplacer une musique ») :
 *  - split (recommandé) : <couche>.wav = la boucle seule exportée en « Wrap remainder »,
 *    <couche>.intro.wav (facultatif) = l'intro depuis 0, queue comprise, et --intro-bars N ;
 *  - single (--single) : <couche>.wav = le morceau complet ; boucle [--loop-start, --loop-end[
 *    en secondes (sinon suggérée sur la grille des mesures), queue repliée sur le début.
 *
 * npm run track:prepare -- --id stage2-calm --src ~/exports/stage2-calm [--title …] [--bpm 110]
 *   [--key "Ré mineur"] [--group stage2] [--sig 4/4] [--enter lead=2,fx=3] [--single]
 *   [--intro-bars 4] [--loop-start 9.6 --loop-end 86.4] [--bind stage:2:calm] [--dry-run]
 * Formats d'entrée : tout ce que lit ffmpeg (wav, flac, aiff, mp3…).
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { parseManifest } from '../../src/audio/music/manifest';
import { encodeOpus, measureLoudness, runFfmpeg } from '../lib/ffmpeg';
import {
  applyGainDb,
  foldTail,
  frameCount,
  mixDown,
  overlay,
  readWav,
  trimTrailingSilence,
  writeWav,
  type PcmAudio,
} from '../lib/wav';
import { defaultEnterAt, detectBpm, snapBpmToLoop, suggestLoop } from './analysis';

const RATE = 48000;
const TARGET_LUFS = -14;
const MAX_TRUE_PEAK = -1;
const MUSIC = path.join(import.meta.dirname, '..', '..', 'assets', 'audio', 'music');
const TRACKS_JSON = path.join(MUSIC, 'tracks.json');
const AUDIO_EXT = /\.(wav|flac|aiff?|mp3|ogg|opus|m4a)$/i;

const { values: opt } = parseArgs({
  options: {
    id: { type: 'string' },
    src: { type: 'string' },
    title: { type: 'string' },
    bpm: { type: 'string' },
    key: { type: 'string' },
    group: { type: 'string' },
    sig: { type: 'string', default: '4/4' },
    enter: { type: 'string' },
    single: { type: 'boolean', default: false },
    'loop-start': { type: 'string' },
    'loop-end': { type: 'string' },
    'intro-bars': { type: 'string' },
    bind: { type: 'string', multiple: true },
    'dry-run': { type: 'boolean', default: false },
  },
});

function die(msg: string): never {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

const id = opt.id ?? die('--id requis (ex. stage2-calm)');
if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) die('--id : minuscules, chiffres et tirets');
const src = path.resolve(opt.src ?? die('--src requis (dossier des stems exportés)'));
if (!existsSync(src)) die(`dossier introuvable : ${src}`);
const [beats, unit] = opt.sig.split('/').map(Number);
if (!beats || !unit) die('--sig attendu sous la forme 4/4');
const enterOverrides = new Map(
  (opt.enter ?? '')
    .split(',')
    .filter(Boolean)
    .map((p) => {
      const [layer, n] = p.split('=');
      const v = Number(n);
      if (!layer || !Number.isInteger(v) || v < 0 || v > 3) die(`--enter invalide : ${p}`);
      return [layer, v] as const;
    }),
);

const tmp = mkdtempSync(path.join(tmpdir(), 'voidpulse-track-'));

/** Décode n'importe quel format en WAV float 48 kHz stéréo. */
function load(file: string): PcmAudio {
  const out = path.join(tmp, `${path.basename(file)}.wav`);
  runFfmpeg(['-y', '-i', file, '-ar', String(RATE), '-ac', '2', '-c:a', 'pcm_f32le', out]);
  return readWav(out);
}

function tmpWav(name: string, audio: PcmAudio): string {
  const p = path.join(tmp, `${name}.wav`);
  writeWav(p, audio);
  return p;
}

const pad = (a: PcmAudio, frames: number): PcmAudio => ({
  sampleRate: a.sampleRate,
  channels: a.channels.map((ch) => {
    const out = new Float32Array(frames);
    out.set(ch.subarray(0, frames));
    return out;
  }),
});

// --- Lecture des stems -------------------------------------------------------------------

interface Stem {
  layer: string;
  loop: PcmAudio;
  intro?: PcmAudio;
}

const files = readdirSync(src)
  .filter((f) => AUDIO_EXT.test(f))
  .sort();
if (files.length === 0) die(`aucun fichier audio dans ${src}`);
const stems: Stem[] = [];
for (const f of files) {
  const base = f.replace(AUDIO_EXT, '');
  if (base.endsWith('.intro')) continue;
  const layer = base.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const introFile = files.find((g) => g.replace(AUDIO_EXT, '') === `${base}.intro`);
  if (introFile && opt.single) die(`${introFile} : pas de fichier intro en mode --single`);
  stems.push({
    layer,
    loop: load(path.join(src, f)),
    intro: introFile ? load(path.join(src, introFile)) : undefined,
  });
  console.log(`  ${layer}${introFile ? ' (+ intro)' : ''}`);
}
if (stems.length === 0) die('aucune boucle (<couche>.wav) trouvée');

// --- Tempo et points de boucle -------------------------------------------------------------

const seconds = (frames: number) => frames / RATE;
const bpmHint = opt.bpm ? Number(opt.bpm) : null;
if (opt.bpm && !(bpmHint && bpmHint > 0)) die('--bpm invalide');

let loopStart: number;
let loopEnd: number;
let bpm: number;
const fullMix = mixDown(stems.map((s) => s.loop));

if (!opt.single) {
  const lengths = stems.map((s) => frameCount(s.loop));
  const loopFrames = Math.max(...lengths);
  if (Math.max(...lengths) - Math.min(...lengths) > RATE * 0.01)
    console.warn('  ⚠ boucles de longueurs différentes : complétées par du silence');
  const detected = bpmHint ?? detectBpm(fullMix) ?? die('tempo introuvable : précisez --bpm');
  const snapped = snapBpmToLoop(detected, seconds(loopFrames), beats);
  bpm = snapped.bpm;
  const bar = (60 * beats) / bpm;
  // Intro : sa longueur en mesures est donnée (sa queue et ses échos débordent sur la boucle,
  // aucune détection n'est fiable).
  const hasIntro = stems.some((st) => st.intro);
  const nIntro = hasIntro ? Number(opt['intro-bars']) : 0;
  if (hasIntro && !opt['loop-start'] && !(Number.isInteger(nIntro) && nIntro > 0))
    die('fichiers intro présents : précisez --intro-bars N (longueur de l’intro en mesures)');
  loopStart = opt['loop-start'] ? Number(opt['loop-start']) : nIntro * bar;
  loopEnd = loopStart + seconds(loopFrames);
  for (const s of stems) s.loop = pad(s.loop, loopFrames);
  console.log(
    `  tempo ${bpmHint ? 'fourni' : 'détecté'} ${detected.toFixed(2)} → ${bpm.toFixed(3)} BPM, boucle de ${String(snapped.bars)} mesures, intro de ${String(nIntro)} mesure(s)`,
  );
} else {
  const content = seconds(frameCount(trimTrailingSilence(fullMix)));
  bpm = bpmHint ?? detectBpm(fullMix) ?? die('tempo introuvable : précisez --bpm');
  // Tempo détecté : les DAW travaillent presque toujours en BPM entiers.
  if (!bpmHint && Math.abs(bpm - Math.round(bpm)) < 0.3) bpm = Math.round(bpm);
  if (opt['loop-start'] && opt['loop-end']) {
    loopStart = Number(opt['loop-start']);
    loopEnd = Number(opt['loop-end']);
  } else {
    const s = suggestLoop(content, bpm, beats, 1);
    loopStart = s.loopStart;
    loopEnd = s.loopEnd;
    console.log(
      `  ⚠ points de boucle suggérés (${String(s.bars)} mesures) : --loop-start ${loopStart.toFixed(3)} --loop-end ${loopEnd.toFixed(3)} — vérifiez à l'écoute`,
    );
  }
  const a = Math.round(loopStart * RATE);
  const b = Math.round(loopEnd * RATE);
  for (const s of stems) s.loop = foldTail(s.loop, a, b);
  console.log(
    `  tempo ${bpm.toFixed(2)} BPM, boucle [${loopStart.toFixed(3)} s, ${loopEnd.toFixed(3)} s[`,
  );
}
if (!(loopStart >= 0 && loopEnd > loopStart)) die('points de boucle invalides');

// --- Loudness : gain commun, mesuré sur la boucle (et sur l'intro enchaînée) --------------

const loopMix = mixDown(stems.map((s) => s.loop));
const firstPass = opt.single
  ? loopMix
  : overlay(
      mixDown(
        stems.map(
          (s) =>
            s.intro ?? { sampleRate: RATE, channels: [new Float32Array(0), new Float32Array(0)] },
        ),
      ),
      loopMix,
      Math.round(loopStart * RATE),
    );
const loud = measureLoudness(tmpWav('loop-mix', loopMix));
const peak = measureLoudness(tmpWav('first-pass', firstPass)).truePeak;
if (!Number.isFinite(loud.integrated)) die('boucle silencieuse');
let gain = TARGET_LUFS - loud.integrated;
if (peak + gain > MAX_TRUE_PEAK) {
  const cut = peak + gain - MAX_TRUE_PEAK;
  gain -= cut;
  console.warn(
    `  ⚠ crête vraie : gain réduit de ${cut.toFixed(1)} dB (loudness finale ${(TARGET_LUFS - cut).toFixed(1)} LUFS) — limitez le master dans FL Studio pour atteindre -14 LUFS`,
  );
}
console.log(
  `  loudness ${loud.integrated.toFixed(1)} LUFS, crête ${peak.toFixed(1)} dBTP → gain ${gain >= 0 ? '+' : ''}${gain.toFixed(2)} dB`,
);

// --- Écriture ------------------------------------------------------------------------------

interface TrackEntry {
  id: string;
  title: string;
  layout: 'split' | 'single';
  bpm: number;
  timeSignature: [number, number];
  key?: string;
  gainDb: number;
  loopStart: number;
  loopEnd: number;
  group?: string;
  stems: { layer: string; file: string; intro?: string; enterAt: number }[];
  loudness: { integrated: number; truePeak: number };
}
interface TracksFile {
  version: 1;
  tracks: TrackEntry[];
  bindings: {
    stages: Record<string, { calm: string; intense: string }>;
    [k: string]: unknown;
  };
}

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const manifest = JSON.parse(readFileSync(TRACKS_JSON, 'utf8')) as TracksFile;
const previous = manifest.tracks.find((t) => t.id === id);
const outDir = path.join(MUSIC, id);
const layout = opt.single ? 'single' : 'split';

const entry: TrackEntry = {
  id,
  title: opt.title ?? previous?.title ?? id,
  layout,
  bpm: round(bpm),
  timeSignature: [beats, unit],
  ...((opt.key ?? previous?.key) ? { key: opt.key ?? previous?.key } : {}),
  gainDb: previous?.gainDb ?? 0,
  loopStart: round(loopStart, 4),
  loopEnd: round(loopEnd, 4),
  ...((opt.group ?? previous?.group) ? { group: opt.group ?? previous?.group } : {}),
  stems: stems.map((s) => ({
    layer: s.layer,
    file: `${id}/${s.layer}.ogg`,
    ...(s.intro ? { intro: `${id}/${s.layer}.intro.ogg` } : {}),
    enterAt:
      enterOverrides.get(s.layer) ??
      previous?.stems.find((p) => p.layer === s.layer)?.enterAt ??
      defaultEnterAt(s.layer),
  })),
  loudness: { integrated: round(loud.integrated + gain, 1), truePeak: round(peak + gain, 1) },
};

const i = manifest.tracks.findIndex((t) => t.id === id);
if (i >= 0) manifest.tracks[i] = entry;
else manifest.tracks.push(entry);

for (const b of opt.bind ?? []) {
  const [kind, n, mood] = b.split(':');
  if (kind === 'stage' && n && (mood === 'calm' || mood === 'intense')) {
    const cur = manifest.bindings.stages[n] ?? { calm: id, intense: id };
    manifest.bindings.stages[n] = { ...cur, [mood]: id };
  } else if (kind === 'menu' || kind === 'boss') manifest.bindings[kind] = id;
  else if (kind === 'final-boss') manifest.bindings.finalBoss = id;
  else if (kind === 'end') manifest.bindings.endOfRun = id;
  else die(`--bind inconnu : ${b} (menu, boss, final-boss, end, stage:N:calm|intense)`);
}

parseManifest(manifest); // même validation que le jeu

if (opt['dry-run']) {
  console.log(JSON.stringify(entry, null, 2));
} else {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const s of stems) {
    encodeOpus(
      tmpWav(`${s.layer}-out`, applyGainDb(s.loop, gain)),
      path.join(outDir, `${s.layer}.ogg`),
    );
    if (s.intro) {
      encodeOpus(
        tmpWav(`${s.layer}-intro-out`, applyGainDb(s.intro, gain)),
        path.join(outDir, `${s.layer}.intro.ogg`),
      );
    }
  }
  writeFileSync(TRACKS_JSON, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `✔ ${id} : ${String(stems.length)} stem(s) dans assets/audio/music/${id}, tracks.json à jour`,
  );
}
rmSync(tmp, { recursive: true, force: true });
