// Loading screen and failure screens: full, R-only and G-only screenshots at phone landscape
// (640x360), 1080p and 4K, saved to test-results/boot/. The game's JavaScript is held back so the
// inline loading screen stays up; the failure screens are opened from a real (aborted) boot.
// Usage: npm run build && node scripts/shots-boot.mjs
/* global HTMLCanvasElement */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4176);
const out = 'test-results/boot';
mkdirSync(out, { recursive: true });

function channel(png, c) {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    o.data[i] = o.data[i + 1] = o.data[i + 2] = png.data[i + c];
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

async function save(page, name) {
  const png = PNG.sync.read(await page.screenshot({ type: 'png' }));
  writeFileSync(`${out}/${name}.png`, PNG.sync.write(png));
  writeFileSync(`${out}/${name}-R.png`, channel(png, 0));
  writeFileSync(`${out}/${name}-G.png`, channel(png, 1));
  console.log(`saved ${out}/${name}{,-R,-G}.png`);
}

const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
let browser;
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
  const sizes = [
    ['phone', 640, 360],
    ['1080p', 1920, 1080],
    ['4k', 3840, 2160],
  ];
  for (const [label, width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    // Hold every script back: only the inline loading screen exists.
    await page.route('**/build/*.js', () => undefined);
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'commit' });
    await page.waitForSelector('#boot');
    await page.waitForTimeout(1800); // wordmark drop-in finished, first tip visible
    await save(page, `loading-${label}`);
    await page.close();
  }
  // Failure screens (phone + 1080p): no WebGL 2, a failed chunk, a lost context.
  for (const [label, width, height] of sizes.slice(0, 2)) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        return type === 'webgl2' ? null : orig.call(this, type, ...rest);
      };
    });
    await page.goto(`http://localhost:${port}/`);
    await page.waitForSelector('[data-testid="fail-webgl"]');
    await page.waitForTimeout(400);
    await save(page, `fail-webgl-${label}`);
    await page.close();

    const p2 = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await p2.route(/\/build\/(?!index-).*\.js$/, (r) => r.abort());
    await p2.goto(`http://localhost:${port}/`);
    await p2.waitForSelector('[data-testid="fail-load"]', { timeout: 60_000 });
    await p2.waitForTimeout(400);
    await save(p2, `fail-load-${label}`);
    await p2.close();
  }
} finally {
  await browser?.close();
  await new Promise((r) => server.httpServer.close(r));
}
