// Probe: boot the game (test mode, frozen) and run a JS file in the page; prints the JSON result.
// Usage: RG_PORT=4393 node scripts/pipfix/eval.mjs <file.js> [phone]
// The file is the body of an async function with `rg` (window.__rg) in scope; it returns a value.
import { readFileSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';
import { preview } from 'vite';

const body = readFileSync(process.argv[2], 'utf8');
const phone = process.argv[3] === 'phone';
const port = Number(process.env.RG_PORT ?? 4393);
const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const ctxOpts = phone ? { ...devices['iPhone 13 landscape'], deviceScaleFactor: 1 } : { viewport: { width: 640, height: 360 } };
const page = await (await browser.newContext(ctxOpts)).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (m.text().startsWith('[probe]')) console.log(m.text());
});
await page.goto(`http://localhost:${port}/?test=1&quality=low&freeze=1${process.env.Q ?? ''}`);
await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 240000 });
await page.evaluate(() => {
  window.__rg.freeze(true);
  window.__rg.start();
  window.__rg.step(1 / 30, 3, false);
});
const out = await page.evaluate(`(async () => { const rg = window.__rg; ${body} })()`);
console.log(JSON.stringify(out, null, 1));
if (process.env.SHOT) {
  await page.evaluate(() => window.__rg.render());
  await page.screenshot({ path: process.env.SHOT, timeout: 120000 });
}
if (errors.length) console.log('ERRORS', errors.slice(0, 5));
await browser.close();
await new Promise((r) => server.httpServer.close(r));
