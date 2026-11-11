// QA round 5 driver (copy of scripts/qa4/driver.mjs): boots `vite preview` + one Chromium (SwiftShader) and keeps it open.
// Accepts POSTed JS bodies on http://127.0.0.1:$QA_CTL/run (run as an async function with
// `page`, `shot`, `hold`, `tap`, `st`, `log`, `errors`).
// Usage: RG_PORT=4361 QA_CTL=4461 node scripts/qa4/driver.mjs
//        curl -s --data-binary @scripts/qa6/steps/<item>.js 127.0.0.1:4461/run
// Inputs are real keyboard events (page.keyboard.down/up) read by src/core/input.ts; time is
// stepped with window.__rg.step(1/60, n) while frozen (`&freeze=1`). Screenshots: test-results/qa6/drv/.
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4361);
const ctl = Number(process.env.QA_CTL ?? 4461);
const out = 'test-results/qa6/drv';
mkdirSync(out, { recursive: true });
const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'],
});
let page;
const errors = [];
const q = process.env.QA_QUERY ?? '&freeze=1&quality=low';
/** (Re)open the game page: used at start and after a renderer crash (load on the shared box). */
async function boot() {
  if (page) await page.close().catch(() => {});
  page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('crash', () => errors.push('RENDERER CRASH'));
  await page.goto(`http://localhost:${port}/?test=1${q}`);
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 240000 });
  console.log('READY');
}
await boot();

const shot = async (name) => {
  const buf = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
  const dir = `${out}/${name.split('/').slice(0, -1).join('/')}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${out}/${name}.png`, buf);
  return `${out}/${name}.png`;
};
/** Step n frames at 1/60 (sim only), rendering only the last when draw. */
const st = (n = 60, draw = true) => page.evaluate(([k, d]) => window.__rg.step(1 / 60, k, d), [n, draw]);
/** Hold keys for `frames` frames, stepping in chunks; returns per-chunk states. */
const hold = async (keys, frames, chunk = 30, onChunk) => {
  for (const k of keys) await page.keyboard.down(k);
  const res = [];
  for (let f = 0; f < frames; f += chunk) {
    await st(Math.min(chunk, frames - f), !!onChunk);
    const s = await page.evaluate(() => window.__rg.state());
    res.push(s);
    if (onChunk) await onChunk(s, f);
  }
  for (const k of keys) await page.keyboard.up(k);
  return res;
};
const tap = async (key, after = 2) => {
  await page.keyboard.down(key);
  await st(2, false);
  await page.keyboard.up(key);
  await st(after, false);
};
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      const logs = [];
      const log = (...a) => logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
      try {
        if (req.url === '/quit') {
          res.end('bye');
          await browser.close();
          server.httpServer.close();
          process.exit(0);
        }
        if (req.url === '/reboot') await boot();
        const fn = new AsyncFunction('page', 'shot', 'hold', 'tap', 'st', 'log', 'errors', body);
        const r = await fn(page, shot, hold, tap, st, log, errors);
        res.end(logs.join('\n') + (r !== undefined ? `\n=> ${JSON.stringify(r)}` : '') + '\n');
      } catch (e) {
        res.end(logs.join('\n') + `\nERR ${e?.stack ?? e}\n`);
      }
    });
  })
  .listen(ctl, '127.0.0.1');
