// Play-test helpers for the secrets/chests clarity pass (not part of verify).
// Boots `vite preview` on RG_PORT, Chromium (SwiftShader), saves PNGs to test-results/secrets-clear/<dir>/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { preview } from 'vite';

function splitChannel(png, c) {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    const v = png.data[i + c];
    o.data[i] = o.data[i + 1] = o.data[i + 2] = v;
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

export async function open(dirName, { query = '&quality=low&freeze=1', width = 960, height = 540 } = {}) {
  const port = Number(process.env.RG_PORT ?? 4391);
  const out = `test-results/secrets-clear/${dirName}`;
  mkdirSync(out, { recursive: true });
  const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
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
  /** Start playing, frozen. */
  const start = () => page.evaluate(() => { const rg = window.__rg; rg.freeze(true); rg.start(); rg.step(1 / 60, 10, false); });
  const step = (n = 1, render = false) => page.evaluate(([n, r]) => window.__rg.step(1 / 60, n, r), [n, render]);
  /** Stand at x,z facing a point. */
  const stand = (x, z, tx, tz, settle = 30) =>
    page.evaluate(([x, z, tx, tz, settle]) => {
      const rg = window.__rg;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.2, z, Math.atan2(tx - x, tz - z));
      rg.step(1 / 60, settle, false);
      rg.step(1 / 60, 1, true);
    }, [x, z, tx, tz, settle]);
  /** Hold a real key for n frames (stepping the frozen loop). */
  const hold = async (key, n) => {
    await page.keyboard.down(key);
    for (let i = 0; i < n; i += 10) await step(Math.min(10, n - i));
    await page.keyboard.up(key);
    await step(2, true);
  };
  const tap = async (key) => {
    await page.keyboard.down(key);
    await step(2);
    await page.keyboard.up(key);
    await step(4, true);
  };
  const pos = () => page.evaluate(() => window.__rg.state().playerPosition);
  return { page, shot, close, errors, out, start, step, stand, hold, tap, pos };
}
