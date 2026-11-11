// Shared helpers for the QA round 3 scripts (scripts/qa3/*.mjs). Not part of `npm run verify`.
// Each script boots `vite preview` on RG_PORT, opens Chromium (SwiftShader) and saves PNGs to
// test-results/qa3/<script>/. `shot(name, { channels: true })` also writes R-only and G-only copies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { preview } from 'vite';

function splitChannel(png, c) {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    const v = png.data[i + c];
    o.data[i] = v;
    o.data[i + 1] = v;
    o.data[i + 2] = v;
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

export async function open(dirName, { query = '', width = 960, height = 540 } = {}) {
  const port = Number(process.env.RG_PORT ?? 4352);
  const out = `test-results/qa3/${dirName}`;
  mkdirSync(out, { recursive: true });
  const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${port}/?test=1${query}`);
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 180000 });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 20000 }).catch(() => {});
  const shot = async (name, opts = {}) => {
    const buf = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
    writeFileSync(`${out}/${name}.png`, buf);
    if (opts.channels) {
      const png = PNG.sync.read(buf);
      writeFileSync(`${out}/${name}.R.png`, splitChannel(png, 0));
      writeFileSync(`${out}/${name}.G.png`, splitChannel(png, 1));
    }
    console.log(`saved ${out}/${name}.png`);
  };
  const close = async () => {
    if (errors.length) console.log('ERRORS:', JSON.stringify(errors.slice(0, 20)));
    await browser.close();
    await new Promise((r) => server.httpServer.close(r));
  };
  return { page, shot, close, errors, out };
}
