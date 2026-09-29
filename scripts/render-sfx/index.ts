/**
 * Pré-rendu des effets sonores : designs Tone.js (src/audio/sfx-design) → Ogg Opus + sfx.json.
 *
 *   npm run sfx:render                  # tous les sons
 *   npm run sfx:render -- hit.fire xp   # sons choisis
 *   options : --jobs=4
 *
 * Chaîne : Chromium headless rend chaque variante avec Tone.Offline (Math.random seedé :
 * reproductible) → rognage du silence final et court fondu → normalisation (RMS court terme
 * maximal à -12 dBFS, crête ≤ -1 dBFS) → Opus (mono 64 kbps, stéréo 96 kbps)
 * → assets/audio/sfx/<id>/<variante>.ogg. Le niveau de mix de chaque son (gainDb) est appliqué
 * au jeu, via sfx.json.
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { createServer, type Plugin } from 'vite';
import type { SoundMeta } from '../../src/audio/sfx-design/meta';
import { cyrb128 } from '../../src/engine/rng';
import { encodeOpus } from '../lib/ffmpeg';
import {
  applyGainDb,
  frameCount,
  readWav,
  samplePeak,
  trimTrailingSilence,
  writeWav,
  type PcmAudio,
} from '../lib/wav';

const ROOT = process.cwd();
const CACHE = path.join(ROOT, '.cache', 'sfx');
const OUT = path.join(ROOT, 'assets', 'audio', 'sfx');
const SAFE_ID = /^[a-z0-9.-]+$/;
const TARGET_RMS_DB = -12;
const CEILING_DB = -1;

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
const jobs = Math.max(1, Number(flags.get('jobs') ?? 4));

function renderPlugin(): Plugin {
  return {
    name: 'voidpulse-render-sfx',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname === '/favicon.ico') {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (url.pathname === '/__sfx/page') {
          const key = `${url.searchParams.get('sound') ?? 'list'}/${url.searchParams.get('variant') ?? ''}`;
          const seed = cyrb128(key)[0];
          const html = `<!doctype html><meta charset="utf-8"><title>sfx ${key}</title>
<script>(function(){var s=${seed}>>>0;Math.random=function(){s=(s+0x6D2B79F5)>>>0;var t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};})();</script>
<script type="module" src="/src/audio/sfx-design/render/entry.ts"></script>`;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
          return;
        }
        if (url.pathname === '/__sfx/save' && req.method === 'POST') {
          const id = url.searchParams.get('sound') ?? '';
          const variant = Number(url.searchParams.get('variant'));
          if (!SAFE_ID.test(id) || !Number.isInteger(variant) || variant < 0) {
            res.statusCode = 400;
            res.end('nom invalide');
            return;
          }
          mkdirSync(CACHE, { recursive: true });
          const ws = createWriteStream(path.join(CACHE, `${id}.${variant}.wav`));
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
  if (existsSync('/opt/pw-browsers/chromium')) return '/opt/pw-browsers/chromium';
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
  metas?: SoundMeta[];
  peak?: number;
}

async function runPage(page: Page, url: string): Promise<PageResult> {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction('window.__sfxDone !== undefined', undefined, {
    timeout: 120_000,
    polling: 100,
  });
  const res = await page.evaluate<PageResult>('window.__sfxDone');
  if (!res.ok) throw new Error(res.error ?? 'échec du rendu');
  return res;
}

/** RMS maximal sur des fenêtres de 50 ms (niveau perçu d'un son court). */
function shortTermRms(a: PcmAudio): number {
  const win = Math.round(a.sampleRate * 0.05);
  const n = frameCount(a);
  let best = 0;
  for (let s = 0; s < n; s += win / 2) {
    let sum = 0;
    let count = 0;
    for (const ch of a.channels) {
      for (let i = s; i < Math.min(n, s + win); i++) sum += ch[i] * ch[i];
      count += Math.min(n, s + win) - s;
    }
    if (count > 0) best = Math.max(best, Math.sqrt(sum / count));
  }
  return best;
}

function fadeOut(a: PcmAudio, seconds: number): void {
  const n = frameCount(a);
  const f = Math.min(n, Math.round(seconds * a.sampleRate));
  for (const ch of a.channels) for (let i = 0; i < f; i++) ch[n - f + i] *= 1 - (i + 1) / f;
}

function process1(meta: SoundMeta, variant: number): string {
  const raw = readWav(path.join(CACHE, `${meta.id}.${variant}.wav`));
  const audio = trimTrailingSilence(raw, -70, Math.round(raw.sampleRate * 0.02));
  fadeOut(audio, 0.004);
  const rms = shortTermRms(audio);
  if (rms <= 0) throw new Error(`${meta.id}/${variant} : rendu silencieux`);
  let gain = TARGET_RMS_DB - 20 * Math.log10(rms);
  const peak = samplePeak(audio);
  gain = Math.min(gain, CEILING_DB - 20 * Math.log10(peak));
  const out = applyGainDb(audio, gain);
  const wav = path.join(CACHE, `${meta.id}.${variant}.norm.wav`);
  writeWav(wav, out);
  const rel = `${meta.id}/${variant}.ogg`;
  const dest = path.join(OUT, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  encodeOpus(wav, dest, meta.stereo ? 96 : 64);
  return rel;
}

async function main(): Promise<void> {
  const server = await createServer({
    plugins: [renderPlugin()],
    server: { port: 5198, strictPort: false, host: '127.0.0.1' },
    optimizeDeps: { include: ['tone'], entries: ['src/audio/sfx-design/render/entry.ts'] },
    logLevel: 'warn',
    clearScreen: false,
  });
  await server.listen();
  const base = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:5198/';
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--disable-dev-shm-usage'],
  });
  try {
    const pages = await Promise.all(Array.from({ length: jobs }, () => browser.newPage()));
    for (const p of pages) {
      p.on('pageerror', (e) => {
        console.error('[page]', e.message);
      });
    }
    const all = (await runPage(pages[0], `${base}__sfx/page?list=1`)).metas ?? [];
    const metas = all.filter((m) => only.length === 0 || only.includes(m.id));
    if (metas.length === 0) throw new Error(`Aucun son à rendre (${only.join(', ')})`);
    const queue = metas.flatMap((m) =>
      Array.from({ length: m.variants }, (_, v) => ({ id: m.id, v })),
    );
    const total = queue.length;
    let done = 0;
    await Promise.all(
      pages.map(async (page) => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          await runPage(
            page,
            `${base}__sfx/page?sound=${encodeURIComponent(job.id)}&variant=${job.v}`,
          );
          done++;
          if (done % 10 === 0 || done === total) console.log(`  [${done}/${total}] rendus`);
        }
      }),
    );

    // Manifeste : on conserve les sons non re-rendus, on remplace les autres.
    const manifestPath = path.join(OUT, 'sfx.json');
    const sounds: Record<string, unknown> = {};
    for (const m of all) {
      const rendered = metas.includes(m);
      if (rendered) rmSync(path.join(OUT, m.id), { recursive: true, force: true });
      const files = rendered
        ? Array.from({ length: m.variants }, (_, v) => process1(m, v))
        : Array.from({ length: m.variants }, (_, v) => `${m.id}/${v}.ogg`).filter((f) =>
            existsSync(path.join(OUT, f)),
          );
      if (files.length === 0) continue;
      sounds[m.id] = {
        files,
        bus: m.bus,
        gainDb: m.gainDb,
        pitchVar: m.pitchVar,
        volVar: m.volVar,
        maxVoices: m.maxVoices,
        priority: m.priority,
        cooldownMs: m.cooldownMs,
      };
    }
    // Dossiers orphelins (sons supprimés du design).
    if (existsSync(OUT)) {
      for (const d of readdirSync(OUT, { withFileTypes: true })) {
        if (d.isDirectory() && !(d.name in sounds))
          rmSync(path.join(OUT, d.name), { recursive: true, force: true });
      }
    }
    const sorted = Object.fromEntries(
      Object.keys(sounds)
        .sort()
        .map((k) => [k, sounds[k]]),
    );
    writeFileSync(manifestPath, `${JSON.stringify({ version: 1, sounds: sorted }, null, 2)}\n`);
    console.log(`\n✓ ${Object.keys(sorted).length} sons → ${path.relative(ROOT, manifestPath)}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
