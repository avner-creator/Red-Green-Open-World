// Cold-boot network log: every request (and its transferred bytes) up to the title screen, and
// then up to the first playable frame after Play. Checks that only the selected character's GLB
// and no music load before Play. Boots in test mode with the loop frozen (`?test=1&freeze=1`, as the
// e2e helpers do): the real-time loop on SwiftShader made the Play click time out. Quality stays on
// auto, so the same files load as for a real user.
// "loading screen" = what the browser needs to paint the inline loading screen and run its
// progress bar: the HTML plus the scripts index.html names (not the preloaded WASM).
// gzip / brotli columns compress the dist files (vite preview itself sends them uncompressed).
// Usage: npm run build && node scripts/boot-requests.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4175);
const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
let browser;
let failed = false;
/** One cold boot; `stored` = the remembered character pick (null = first visit). */
async function run(stored) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  if (stored) await context.addInitScript((id) => window.localStorage.setItem('rgow.character.v1', id), stored);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  /** requestId → { url, bytes } (bytes = encoded bytes on the wire, headers included). */
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, bytes: 0, stage: '' }));
  cdp.on('Network.loadingFinished', (e) => {
    const r = reqs.get(e.requestId);
    if (r) r.bytes = e.encodedDataLength;
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/?test=1&freeze=1`, { waitUntil: 'commit' });
  // The loader script marks the first boot stage as soon as it runs (older builds: no marker).
  await page.waitForSelector('#boot[data-stage], #boot.js', { state: 'attached', timeout: 60_000 }).catch(() => undefined);
  const tLoader = Date.now() - t0;
  await page.waitForSelector('#boot', { state: 'detached', timeout: 180_000 });
  await page.waitForSelector('[data-testid="play"]', { state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(500);
  const tTitle = Date.now() - t0;
  for (const r of reqs.values()) r.stage ||= 'title';

  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__rg.freeze(true));
  await page.click('[data-testid="play"]');
  await page.evaluate(() => window.__rg.step(1 / 60, 1, false));
  // Play may open the character select first: start with the preselected character.
  const go = page.locator('[data-testid="csel-go"]');
  if (await go.isVisible()) {
    await go.click();
    await page.evaluate(() => window.__rg.step(1 / 60, 1, false));
  }
  await page.waitForFunction(() => window.__rg.state().phase === 'playing', undefined, { timeout: 60_000 });
  // The first playable frame: a couple of rendered steps.
  await page.evaluate(() => window.__rg.step(1 / 60, 2, true));
  await page.waitForTimeout(3000); // let Play-triggered streaming (music) start
  const tPlay = Date.now() - t0;
  for (const r of reqs.values()) r.stage ||= 'play';

  const base = `http://localhost:${port}/`;
  const rows = [...reqs.values()].filter((r) => r.url.startsWith(base));
  const file = (url) => {
    try {
      return readFileSync(join('dist', decodeURIComponent(new URL(url).pathname).replace(/^\/$/, '/index.html')));
    } catch {
      return null;
    }
  };
  const gz = (url) => (file(url) ? gzipSync(file(url), { level: 9 }).length : 0);
  const br = (url) => (file(url) ? brotliCompressSync(file(url), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length : 0);
  const html = readFileSync('dist/index.html', 'utf8');
  const loaderFiles = new Set([...html.matchAll(/<script[^>]+src="\.\/([^"]+)"|<link[^>]+rel="modulepreload"[^>]+href="\.\/([^"]+)"/g)].map((m) => `/${m[1] ?? m[2]}`));
  const isLoader = (r) => {
    const path = new URL(r.url).pathname;
    return path === '/' || path === '/index.html' || loaderFiles.has(path);
  };
  console.log(`\n######## stored character: ${stored ?? 'none (first visit)'}`);
  const mb = (n) => (n / 1048576).toFixed(2);
  const kb = (n) => `${(n / 1024).toFixed(0).padStart(6)} KB`;
  const report = (label, list) => {
    const sum = (f) => list.reduce((s, r) => s + f(r), 0);
    console.log(`== ${label}: ${list.length} requests, ${mb(sum((r) => r.bytes))} MB transferred, ~${mb(sum((r) => gz(r.url)))} MB gzip, ~${mb(sum((r) => br(r.url)))} MB brotli`);
    for (const r of list) console.log(`  ${kb(r.bytes)} raw ${kb(gz(r.url))} gz ${kb(br(r.url))} br  ${r.url.slice(base.length - 1)}`);
  };
  report(`loading screen (inline HTML + entry script, ${tLoader} ms)`, rows.filter((r) => r.stage === 'title' && isLoader(r)));
  report(`boot → title (${tTitle} ms, includes the above)`, rows.filter((r) => r.stage === 'title'));
  report(`title → first playable frame + 3 s (${tPlay} ms total)`, rows.filter((r) => r.stage === 'play'));
  const want = `/${stored ?? 'frog'}.glb`; // DEFAULT_CHARACTER in src/core/characters/catalog.ts
  const early = rows.filter((r) => r.stage === 'title' && /\/assets\/(characters|audio)\//.test(r.url));
  if (early.length !== 1 || !early[0].url.endsWith(want)) {
    console.log(`FAIL: expected only ${want} before Play, got ${early.map((r) => r.url).join(', ') || 'nothing'}`);
    failed = true;
  }
  if (errors.length) {
    console.log(`page errors: ${errors.join(' | ')}`);
    failed = true;
  }
  await context.close();
}

try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
  await run(null);
  await run('frog');
} finally {
  await browser?.close();
  await new Promise((r) => server.httpServer.close(r));
}
process.exit(failed ? 1 : 0);
