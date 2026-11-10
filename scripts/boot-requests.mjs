// Cold-boot network log: every request (and its transferred bytes) up to the title screen, and
// then up to the first playable frame after Play. Checks that only the selected character's GLB
// and no music load before Play. Plays as a real user would (no test mode).
// Usage: npm run build && node scripts/boot-requests.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
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
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('#boot', { state: 'detached', timeout: 180_000 });
  await page.waitForSelector('[data-testid="play"]', { state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(500);
  const tTitle = Date.now() - t0;
  for (const r of reqs.values()) r.stage ||= 'title';

  await page.click('[data-testid="play"]');
  // Play may open the character select first: start with the preselected character.
  const go = page.locator('[data-testid="csel-go"]');
  await Promise.race([
    go.waitFor({ state: 'visible', timeout: 60_000 }).then(() => go.click()).catch(() => undefined),
    page.waitForSelector('[data-testid="timer"]', { state: 'visible', timeout: 60_000 }).catch(() => undefined),
  ]);
  await page.waitForSelector('[data-testid="timer"]', { state: 'visible', timeout: 60_000 });
  await page.evaluate(() => new Promise((res) => window.requestAnimationFrame(() => window.requestAnimationFrame(res))));
  await page.waitForTimeout(3000); // let Play-triggered streaming (music) start
  const tPlay = Date.now() - t0;
  for (const r of reqs.values()) r.stage ||= 'play';

  const base = `http://localhost:${port}/`;
  const rows = [...reqs.values()].filter((r) => r.url.startsWith(base));
  const gz = (url) => {
    try {
      const path = decodeURIComponent(new URL(url).pathname).replace(/^\/$/, '/index.html');
      return gzipSync(readFileSync(join('dist', path)), { level: 9 }).length;
    } catch {
      return 0;
    }
  };
  console.log(`\n######## stored character: ${stored ?? 'none (first visit)'}`);
  for (const stage of ['title', 'play']) {
    const list = rows.filter((r) => r.stage === stage);
    const bytes = list.reduce((s, r) => s + r.bytes, 0);
    const gzBytes = list.reduce((s, r) => s + gz(r.url), 0);
    console.log(`== ${stage === 'title' ? `boot → title (${tTitle} ms)` : `title → first playable frame + 3 s (${tPlay} ms total)`}: ${list.length} requests, ${(bytes / 1048576).toFixed(2)} MB transferred, ~${(gzBytes / 1048576).toFixed(2)} MB gzip`);
    for (const r of list) console.log(`  ${(r.bytes / 1024).toFixed(0).padStart(6)} KB  ${r.url.slice(base.length - 1)}`);
  }
  const want = `/${stored ?? 'robot'}.glb`;
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
