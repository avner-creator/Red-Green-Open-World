// QA8 Part 0: real-time frame time at spawn, 960x540 Low, 20 s warm-up then 15 s window (round 7 method),
// plus a 5 s fps window (round 6 q01 method). QA_ROOT = folder with dist/ (default cwd).
// Usage: QA_ROOT=/path RG_PORT=4405 QA_TAG=main node scripts/qa8/frametime8.mjs
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const root = process.env.QA_ROOT ?? process.cwd();
const port = Number(process.env.RG_PORT ?? 4405);
const load = () => readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' ');
const server = await preview({ root, preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`http://localhost:${port}/?test=1&quality=low`);
await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 240000 });
await page.getByTestId('play').click();
const l0 = load();
await page.waitForTimeout(20000);
const l1 = load();
const r = await page.evaluate(async () => {
  const f0 = window.__rg.frames;
  const t0 = performance.now();
  await new Promise((res) => setTimeout(res, 15000));
  const n = window.__rg.frames - f0;
  const dt = performance.now() - t0;
  const f1 = window.__rg.frames;
  const t1 = performance.now();
  await new Promise((res) => setTimeout(res, 5000));
  const fps5 = (window.__rg.frames - f1) / ((performance.now() - t1) / 1000);
  return { frames: n, msPerFrame: +(dt / Math.max(1, n)).toFixed(1), fps5: +fps5.toFixed(2) };
});
const l2 = load();
console.log(JSON.stringify({ tag: process.env.QA_TAG ?? root, ...r, loadStart: l0, loadWarm: l1, loadEnd: l2, errs: errs.length }));
await browser.close();
await new Promise((res) => server.httpServer.close(res));
