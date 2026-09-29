/**
 * Rendu des images de l'application à partir des SVG de assets/src (Chromium via Playwright) :
 * aperçus assets/icon-*.png (1024 px) et ressources Android — icône adaptative (fond, avant-plan,
 * monochrome pour Android 13+), icônes classiques carrée et ronde, icône de notification, logo
 * de l'écran de lancement clair et sombre. Usage : npm run assets:render.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = join(import.meta.dirname, '..', '..');
const SRC = join(ROOT, 'assets', 'src');
const RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});
const page = await browser.newPage();

/**
 * Superpose `layers` (SVG de assets/src) et enregistre un PNG w×h, découpé selon `radius`
 * (CSS : '0', '18%' pour l'icône carrée, '50%' pour la ronde).
 */
async function render(
  layers: string[],
  w: number,
  h: number,
  file: string,
  opaque = false,
  radius = '0',
) {
  const imgs = layers
    .map((l) => {
      const b64 = readFileSync(join(SRC, l)).toString('base64');
      return `<img src="data:image/svg+xml;base64,${b64}" style="position:absolute;inset:0;width:${String(w)}px;height:${String(h)}px">`;
    })
    .join('');
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(
    `<body style="margin:0;background:transparent"><div style="position:relative;width:${String(w)}px;height:${String(h)}px;overflow:hidden;border-radius:${radius}">${imgs}</div></body>`,
  );
  await page.waitForTimeout(150);
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({
    path: file,
    omitBackground: !opaque || radius !== '0',
    clip: { x: 0, y: 0, width: w, height: h },
  });
  console.log(file.slice(ROOT.length + 1));
}

const out = (name: string) => join(ROOT, 'assets', name);
await render(
  ['icon-background.svg', 'icon-foreground.svg'],
  1024,
  1024,
  out('icon-only.png'),
  true,
);
await render(['icon-foreground.svg'], 1024, 1024, out('icon-foreground.png'));
await render(['icon-background.svg'], 1024, 1024, out('icon-background.png'), true);

const BOTH = ['icon-background.svg', 'icon-foreground.svg'];
for (const [d, k] of Object.entries(DENSITIES)) {
  const mip = (name: string) => join(RES, `mipmap-${d}`, name);
  await render(['icon-background.svg'], 108 * k, 108 * k, mip('ic_launcher_background.png'), true);
  await render(['icon-foreground.svg'], 108 * k, 108 * k, mip('ic_launcher_foreground.png'));
  await render(BOTH, 48 * k, 48 * k, mip('ic_launcher.png'), true, '18%');
  await render(BOTH, 48 * k, 48 * k, mip('ic_launcher_round.png'), true, '50%');
  await render(
    ['icon-monochrome.svg'],
    108 * k,
    108 * k,
    join(RES, `mipmap-${d}`, 'ic_launcher_monochrome.png'),
  );
  await render(
    ['notification.svg'],
    24 * k,
    24 * k,
    join(RES, `drawable-${d}`, 'ic_stat_voidpulse.png'),
  );
}
await render(['splash-logo.svg'], 720, 609, join(RES, 'drawable-xxhdpi', 'splash_logo.png'));
await render(
  ['splash-logo-dark.svg'],
  720,
  609,
  join(RES, 'drawable-night-xxhdpi', 'splash_logo.png'),
);

await browser.close();
