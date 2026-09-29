/**
 * Pré-rendu de la musique : compositions Tone.js → stems Ogg Opus + tracks.json.
 *
 *   npm run music:render                        # toutes les pistes
 *   npm run music:render -- menu boss           # pistes choisies
 *   options : --jobs=4  --layers=drums,pads  --post-only  --spectro
 *
 * Chaîne : Chromium headless (Playwright) rend chaque couche seule avec Tone.Offline, en deux
 * sections (intro, boucle), chacune avec sa queue → la queue de la boucle est repliée sur son
 * début (boucle sans couture), celle de l'intro chevauche le début de la boucle → mix
 * automatique (loudness cible par stem) → mastering de la SOMME (-14 LUFS, limiteur commun à
 * tous les stems, crête ≤ -1 dBTP) → Opus 128 kbps → assets/audio/music/<piste>/.
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { createServer, type Plugin } from 'vite';
import type { LayerName, TrackMeta } from '../../src/audio/compositions/lib/types';
import { cyrb128 } from '../../src/engine/rng';
import { encodeOpus, measureLoudness, spectrogram } from '../lib/ffmpeg';
import { applyEnvelope, limiterEnvelope, periodicLimiterEnvelope } from '../lib/limiter';
import { formatBands, octaveBands } from '../lib/spectrum';
import {
  applyGainDb,
  foldTail,
  frameCount,
  mixDown,
  overlay,
  readWav,
  samplePeak,
  sliceAudio,
  trimTrailingSilence,
  writeWav,
  type PcmAudio,
} from '../lib/wav';

const ROOT = process.cwd();
const CACHE = path.join(ROOT, '.cache', 'music');
const OUT = path.join(ROOT, 'assets', 'audio', 'music');
const TRACKS_JSON = path.join(OUT, 'tracks.json');
const SAMPLE_RATE = 48000;
const TARGET_LUFS = -14;
/** Plafond échantillon du limiteur de mastering (marge pour les crêtes inter-échantillons). */
const CEILING_DB = -1.8;
const MAX_LIMITING_DB = 3;
const SILENCE_DB = -80;
/** Avance maximale d'une note humanisée sur la frontière intro/boucle (≥ tolérance de section). */
const PRE_ROLL_SECONDS = 0.03;
const SAFE_NAME = /^[a-z0-9-]+$/;
const SECTIONS = ['intro', 'loop'] as const;

const argv = process.argv.slice(2);
const flags = new Map(
  argv
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const eq = a.indexOf('=');
      return eq < 0
        ? ([a.slice(2), 'true'] as const)
        : ([a.slice(2, eq), a.slice(eq + 1)] as const);
    }),
);
const only = argv.filter((a) => !a.startsWith('--'));
const jobs = Math.max(1, Number(flags.get('jobs') ?? 3));
const onlyLayers = flags.get('layers')?.split(',') ?? null;

function renderPlugin(): Plugin {
  return {
    name: 'voidpulse-render',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname === '/favicon.ico') {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (url.pathname === '/__render/page') {
          const key = `${url.searchParams.get('track') ?? 'list'}/${url.searchParams.get('layer') ?? ''}`;
          const seed = cyrb128(key)[0];
          // Math.random seedé AVANT le chargement de Tone : rendus reproductibles à l'identique.
          const html = `<!doctype html><meta charset="utf-8"><title>render ${key}</title>
<script>(function(){var s=${seed}>>>0;Math.random=function(){s=(s+0x6D2B79F5)>>>0;var t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};})();</script>
<script type="module" src="/src/audio/compositions/render/entry.ts"></script>`;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
          return;
        }
        if (url.pathname === '/__render/save' && req.method === 'POST') {
          const track = url.searchParams.get('track') ?? '';
          const layer = url.searchParams.get('layer') ?? '';
          const section = url.searchParams.get('section') ?? '';
          if (!SAFE_NAME.test(track) || !SAFE_NAME.test(layer) || !SAFE_NAME.test(section)) {
            res.statusCode = 400;
            res.end('nom invalide');
            return;
          }
          const dir = path.join(CACHE, track, 'raw');
          mkdirSync(dir, { recursive: true });
          const ws = createWriteStream(path.join(dir, `${layer}.${section}.wav`));
          req.pipe(ws);
          ws.on('finish', () => res.end('ok'));
          ws.on('error', (e) => {
            res.statusCode = 500;
            res.end(String(e));
          });
          return;
        }
        next();
      });
    },
  };
}

function findChromium(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  for (const dir of readdirSync(root)
    .filter((d) => d.startsWith('chromium-'))
    .sort()
    .reverse()) {
    const exe = path.join(root, dir, 'chrome-linux', 'chrome');
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

interface PageResult {
  ok: boolean;
  error?: string;
  metas?: TrackMeta[];
  seconds?: number;
  peak?: number;
}

async function runPage(page: Page, url: string): Promise<PageResult> {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction('window.__renderDone !== undefined', undefined, {
    timeout: 30 * 60_000,
    polling: 250,
  });
  const res = await page.evaluate<PageResult>('window.__renderDone');
  if (!res.ok) throw new Error(res.error ?? 'échec du rendu');
  return res;
}

interface StemEntry {
  layer: LayerName;
  file: string;
  intro?: string;
  enterAt: number;
}

interface TrackEntry {
  id: string;
  title: string;
  layout: 'split' | 'single';
  bpm: number;
  timeSignature: [number, number];
  key: string;
  gainDb: number;
  loopStart: number;
  loopEnd: number;
  group?: string;
  stems: StemEntry[];
  loudness: { integrated: number; truePeak: number };
}

const round = (x: number, d = 2): number => Math.round(x * 10 ** d) / 10 ** d;
const dbfs = (x: number): number => 20 * Math.log10(x || 1e-9);

function tmpWav(dir: string, name: string, audio: PcmAudio): string {
  const p = path.join(dir, `${name}.wav`);
  writeWav(p, audio);
  return p;
}

/** Ajoute `b` dans `a` à partir de `offset`, sans rallonger `a`. */
function overlayInPlace(a: PcmAudio, b: PcmAudio, offset: number): PcmAudio {
  const out = overlay(a, b, offset);
  return sliceAudio(out, 0, frameCount(a));
}

/** Saut à la jointure de boucle, rapporté à la pente maximale locale (≈1 ou moins = continu). */
function seamRatio(loop: PcmAudio): number {
  let worst = 0;
  for (const ch of loop.channels) {
    const n = ch.length;
    const jump = Math.abs(ch[0] - ch[n - 1]);
    let slope = 1e-6;
    for (let i = n - 480; i < n - 1; i++) slope = Math.max(slope, Math.abs(ch[i + 1] - ch[i]));
    for (let i = 0; i < 480; i++) slope = Math.max(slope, Math.abs(ch[i + 1] - ch[i]));
    worst = Math.max(worst, jump / slope);
  }
  return worst;
}

interface Stem {
  layer: LayerName;
  intro: PcmAudio; // débute à 0, queue comprise (chevauche la boucle)
  loop: PcmAudio; // débute à loopStart, queue repliée sur son début
}

function postProcess(meta: TrackMeta, spectro: boolean): TrackEntry {
  const barSec = (60 / meta.bpm) * 4;
  const loopStart = Math.round(meta.introBars * barSec * SAMPLE_RATE);
  const loopLen = Math.round(meta.loopBars * barSec * SAMPLE_RATE);
  const work = path.join(CACHE, meta.id, 'work');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const layers = Object.keys(meta.enterAt) as LayerName[];

  const preRoll = Math.round(PRE_ROLL_SECONDS * SAMPLE_RATE);
  const stems: Stem[] = layers.map((layer) => {
    const loopRaw = readWav(path.join(CACHE, meta.id, 'raw', `${layer}.loop.wav`));
    const loop = foldTail(sliceAudio(loopRaw, loopStart, frameCount(loopRaw)), 0, loopLen);
    // Pré-roll : une note de boucle humanisée peut commencer quelques ms avant la frontière.
    // Ce début est replié en fin de boucle (bouclage) et en fin d'intro (première écoute).
    const pre = sliceAudio(loopRaw, loopStart - preRoll, loopStart);
    let intro = readWav(path.join(CACHE, meta.id, 'raw', `${layer}.intro.wav`));
    intro = overlay(intro, pre, loopStart - preRoll);
    return {
      layer,
      intro: trimTrailingSilence(intro),
      loop: overlayInPlace(loop, pre, loopLen - preRoll),
    };
  });
  /** Première écoute : intro puis boucle, la queue de l'intro chevauchant la boucle. */
  const timelineOf = (s: Stem): PcmAudio => overlay(s.intro, s.loop, loopStart);

  // Mix automatique : chaque stem vise sa loudness relative au mix complet.
  const rows: Record<string, number | string>[] = [];
  const gains = stems.map((s) => {
    const l = measureLoudness(tmpWav(work, `${s.layer}.timeline`, timelineOf(s)));
    const g = Number.isFinite(l.integrated) ? TARGET_LUFS + meta.mix[s.layer] - l.integrated : 0;
    rows.push({ couche: s.layer, 'brut LUFS': round(l.integrated), 'gain dB': round(g) });
    return g;
  });
  const mixed: Stem[] = stems.map((s, i) => ({
    layer: s.layer,
    intro: applyGainDb(s.intro, gains[i]),
    loop: applyGainDb(s.loop, gains[i]),
  }));

  // Mastering : gain commun + limiteur à anticipation calculé sur la SOMME, appliqué à
  // l'identique à chaque stem (la somme des stems reste le mix limité). La boucle, jouée en
  // régime permanent, est normalisée à -14 LUFS avec une enveloppe périodique (continue au
  // bouclage) ; l'intro reçoit le même gain et sa propre enveloppe.
  const loopSum = mixDown(mixed.map((s) => s.loop));
  const ceiling = 10 ** (CEILING_DB / 20);
  let scalar =
    10 ** ((TARGET_LUFS - measureLoudness(tmpWav(work, 'loop.pre', loopSum)).integrated) / 20);
  let lim = periodicLimiterEnvelope(applyGainDb(loopSum, dbfs(scalar)), ceiling);
  for (let iter = 0; iter < 4; iter++) {
    const l = measureLoudness(tmpWav(work, 'loop.lim', applyEnvelope(loopSum, lim.gain, scalar)));
    if (Math.abs(l.integrated - TARGET_LUFS) < 0.1 || lim.maxReductionDb > MAX_LIMITING_DB) break;
    scalar *= 10 ** ((TARGET_LUFS - l.integrated) / 20);
    lim = periodicLimiterEnvelope(applyGainDb(loopSum, dbfs(scalar)), ceiling);
  }
  if (lim.maxReductionDb > MAX_LIMITING_DB) {
    // Trop de limitation nécessaire : on recule la loudness plutôt que d'écraser le mix.
    scalar /= 10 ** ((lim.maxReductionDb - MAX_LIMITING_DB) / 20);
    lim = periodicLimiterEnvelope(applyGainDb(loopSum, dbfs(scalar)), ceiling);
  }
  const loopGain = lim.gain;
  // Intro : limitée en tenant compte de la boucle déjà limitée qui la chevauche (queue de
  // l'intro sur le début de boucle) ; seule l'intro est réduite, la boucle restant périodique.
  const introSum = mixDown(mixed.map((s) => s.intro));
  const loopHead = applyEnvelope(loopSum, loopGain, scalar);
  const introGain = new Float32Array(frameCount(introSum)).fill(1);
  for (let iter = 0; iter < 4; iter++) {
    const firstPass = sliceAudio(
      overlay(applyEnvelope(introSum, introGain, scalar), loopHead, loopStart),
      0,
      frameCount(introSum),
    );
    const env = limiterEnvelope(firstPass, ceiling * 0.93);
    if (env.maxReductionDb < 0.05) break;
    for (let i = 0; i < introGain.length; i++) introGain[i] *= env.gain[i];
  }
  const introLim = { gain: introGain };

  const outDir = path.join(OUT, meta.id);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const entries: StemEntry[] = [];
  const finals: PcmAudio[] = [];
  let worstSeam = 0;
  mixed.forEach((s, i) => {
    const intro = applyEnvelope(s.intro, introLim.gain, scalar);
    const loop = applyEnvelope(s.loop, loopGain, scalar);
    const timeline = overlay(intro, loop, loopStart);
    finals.push(timeline);
    const l = measureLoudness(tmpWav(work, s.layer, timeline));
    const entry: StemEntry = {
      layer: s.layer,
      file: `${meta.id}/${s.layer}.ogg`,
      enterAt: meta.enterAt[s.layer],
    };
    encodeOpus(tmpWav(work, `${s.layer}.loop`, loop), path.join(outDir, `${s.layer}.ogg`));
    if (dbfs(samplePeak(intro)) > SILENCE_DB) {
      encodeOpus(
        tmpWav(work, `${s.layer}.intro`, intro),
        path.join(outDir, `${s.layer}.intro.ogg`),
      );
      entry.intro = `${meta.id}/${s.layer}.intro.ogg`;
    }
    entries.push(entry);
    const seam = seamRatio(loop);
    worstSeam = Math.max(worstSeam, seam);
    if (spectro) spectrogram(path.join(work, `${s.layer}.wav`), path.join(work, `${s.layer}.png`));
    Object.assign(rows[i], {
      'final LUFS': round(l.integrated),
      'relatif LU': round(l.integrated - TARGET_LUFS),
      'crête dBTP': round(l.truePeak),
      jointure: round(seam, 1),
    });
  });
  const mixAudio = mixDown(finals);
  const mixWav = tmpWav(work, 'mix', mixAudio);
  const final = measureLoudness(mixWav);
  encodeOpus(mixWav, path.join(work, 'mix.ogg'));
  if (spectro) spectrogram(mixWav, path.join(work, 'mix.png'));

  console.log(`\n■ ${meta.id} — ${meta.title}`);
  console.table(rows);
  const mixBands = octaveBands(mixAudio);
  const ref = Math.max(...mixBands);
  console.log(`  spectre (dB relatifs au maximum du mix, bandes d'octave)`);
  console.log(`    ${'mix'.padEnd(6)} ${formatBands(mixBands, ref)}`);
  finals.forEach((f, i) => {
    console.log(`    ${mixed[i].layer.padEnd(6)} ${formatBands(octaveBands(f), ref)}`);
  });
  console.log(
    `  mix : ${round(final.integrated)} LUFS, ${round(final.truePeak)} dBTP, LRA ${round(final.range)} LU · limiteur max ${round(lim.maxReductionDb, 1)} dB (${round(lim.activeRatio * 100, 1)} % du temps) · jointure ${round(worstSeam, 1)}`,
  );
  if (final.integrated < TARGET_LUFS - 0.5) {
    console.log(
      `  ⚠ loudness sous la cible : plus de ${MAX_LIMITING_DB} dB de limitation seraient nécessaires`,
    );
  }
  if (worstSeam > 4) console.log('  ⚠ discontinuité possible à la jointure de boucle');

  return {
    id: meta.id,
    title: meta.title,
    layout: 'split',
    bpm: meta.bpm,
    timeSignature: meta.timeSignature,
    key: meta.key,
    gainDb: 0,
    loopStart: round(loopStart / SAMPLE_RATE, 6),
    loopEnd: round((loopStart + loopLen) / SAMPLE_RATE, 6),
    ...(meta.group ? { group: meta.group } : {}),
    stems: entries,
    loudness: { integrated: round(final.integrated), truePeak: round(final.truePeak) },
  };
}

interface TracksFile {
  version: 1;
  tracks: TrackEntry[];
  bindings: Record<string, unknown>;
}

const DEFAULT_BINDINGS = {
  menu: 'menu',
  stages: Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7, 8].map((n) => [
      String(n),
      { calm: `stage${String(n)}-calm`, intense: `stage${String(n)}-intense` },
    ]),
  ),
  boss: 'boss',
  finalBoss: 'final-boss',
  endOfRun: 'end-of-run',
};

function writeTracksJson(entries: TrackEntry[], known: readonly string[]): void {
  const current: TracksFile = existsSync(TRACKS_JSON)
    ? (JSON.parse(readFileSync(TRACKS_JSON, 'utf8')) as TracksFile)
    : { version: 1, tracks: [], bindings: DEFAULT_BINDINGS };
  // Pistes générées dont la composition n'existe plus : retirées (pistes externes conservées).
  current.tracks = current.tracks.filter((t) => t.layout === 'single' || known.includes(t.id));
  for (const e of entries) {
    const i = current.tracks.findIndex((t) => t.id === e.id);
    if (i >= 0) current.tracks[i] = { ...e, gainDb: current.tracks[i].gainDb };
    else current.tracks.push(e);
  }
  linkRenderedTracks(current);
  writeFileSync(TRACKS_JSON, `${JSON.stringify(current, null, 2)}\n`);
}

/**
 * Relie une piste nouvellement rendue à sa scène quand la liaison est encore un repli (stage
 * non composé → stage 1, boss final → boss, fin de run → menu). Une liaison choisie à la main
 * (piste importée, par exemple) n'est jamais modifiée.
 */
function linkRenderedTracks(file: TracksFile): void {
  const has = (id: string): boolean => file.tracks.some((t) => t.id === id);
  const b = file.bindings as {
    stages: Record<string, { calm: string; intense: string } | undefined>;
    boss: string;
    menu: string;
    finalBoss?: string;
    endOfRun?: string;
  };
  for (const [n, def] of Object.entries(DEFAULT_BINDINGS.stages)) {
    const cur = b.stages[n];
    const fallback = !cur || (n !== '1' && cur.calm === 'stage1-calm');
    if (fallback && has(def.calm) && has(def.intense)) b.stages[n] = def;
  }
  if ((b.finalBoss ?? b.boss) === b.boss && has(DEFAULT_BINDINGS.finalBoss))
    b.finalBoss = DEFAULT_BINDINGS.finalBoss;
  if ((b.endOfRun ?? b.menu) === b.menu && has(DEFAULT_BINDINGS.endOfRun))
    b.endOfRun = DEFAULT_BINDINGS.endOfRun;
}

async function main(): Promise<void> {
  const server = await createServer({
    plugins: [renderPlugin()],
    server: { port: 5199, strictPort: false, host: '127.0.0.1' },
    optimizeDeps: { include: ['tone'], entries: ['src/audio/compositions/render/entry.ts'] },
    logLevel: 'warn',
    clearScreen: false,
  });
  await server.listen();
  const base = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:5199/';
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'],
  });
  try {
    const pages = await Promise.all(Array.from({ length: jobs }, () => browser.newPage()));
    for (const p of pages) {
      p.on('pageerror', (e) => {
        console.error('[page]', e.message);
      });
      p.on('console', (m) => {
        if (m.type() === 'error') console.error('[page]', m.text());
      });
    }
    const list = await runPage(pages[0], `${base}__render/page?list=1`);
    const all = list.metas ?? [];
    const metas = all.filter((m) => only.length === 0 || only.includes(m.id));
    if (metas.length === 0) throw new Error(`Aucune piste à rendre (${only.join(', ')})`);

    if (!flags.has('post-only')) {
      const queue = metas.flatMap((m) =>
        Object.keys(m.enterAt)
          .filter((layer) => !onlyLayers || onlyLayers.includes(layer))
          .flatMap((layer) => SECTIONS.map((section) => ({ id: m.id, layer, section }))),
      );
      const total = queue.length;
      let done = 0;
      await Promise.all(
        pages.map(async (page) => {
          for (let job = queue.shift(); job; job = queue.shift()) {
            const res = await runPage(
              page,
              `${base}__render/page?track=${job.id}&layer=${job.layer}&section=${job.section}`,
            );
            done++;
            console.log(
              `  [${done}/${total}] ${job.id}/${job.layer} (${job.section}) rendu en ${round(res.seconds ?? 0, 1)} s`,
            );
          }
        }),
      );
    }
    const entries = metas.map((m) => postProcess(m, flags.has('spectro')));
    writeTracksJson(
      entries,
      all.map((m) => m.id),
    );
    console.log(`\n✓ ${entries.length} piste(s) → ${path.relative(ROOT, TRACKS_JSON)}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
