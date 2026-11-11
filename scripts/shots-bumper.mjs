// Saves full, R-only and G-only screenshots of the Bubble Ball arena and the Dino Sumo ring
// (idle sets, a live round, the weak-eye bonus pieces, the result card) to test-results/bumper-arena/.
// Usage: npm run build && node scripts/shots-bumper.mjs [bubble|sumo ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4175);
const out = 'test-results/bumper-arena';
const wanted = process.argv.slice(2);
const want = (k) => !wanted.length || wanted.includes(k);
mkdirSync(out, { recursive: true });

function splitChannel(png, c) {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    const v = png.data[i + c];
    o.data[i] = o.data[i + 1] = o.data[i + 2] = v;
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
let browser;
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://localhost:${port}/?test=1&quality=${process.env.Q ?? 'medium'}`);
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 120000 });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 10000 });

  const save = async (name) => {
    const buf = await page.screenshot({ type: 'png', animations: 'disabled' });
    const png = PNG.sync.read(buf);
    writeFileSync(`${out}/${name}-full.png`, buf);
    writeFileSync(`${out}/${name}-R.png`, splitChannel(png, 0));
    writeFileSync(`${out}/${name}-G.png`, splitChannel(png, 1));
    console.log(`saved ${out}/${name}-{full,R,G}.png`);
  };
  const info = await page.evaluate(() => {
    const rg = window.__rg;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 10, false);
    return { tris: rg.ctx.renderer.info.render.triangles };
  });
  console.log(info);

  if (want('bubble')) {
    // Idle set from the approach, looking at the booth and the pitch.
    await page.evaluate(() => {
      const rg = window.__rg;
      const bb = window.__rgBubbleBall;
      const p = bb.world(-6.5, 0, -15.5);
      const c = bb.world(0, 0, 0);
      rg.teleport(p[0], rg.ctx.world.heightAt(p[0], p[2]) + 0.1, p[2], Math.atan2(c[0] - p[0], c[2] - p[2]));
      rg.step(1 / 60, 60, false);
      rg.step(1 / 60, 1);
    });
    const draws = await page.evaluate(() => window.__rg.ctx.renderer.info.render.calls);
    console.log('idle draws', draws);
    await save('bubble-idle');
    await page.evaluate(async () => {
      const rg = window.__rg;
      window.__rgBubbleBall.start();
      for (let i = 0; i < 400 && window.__rgBubbleBall.phase() === 'loading'; i++) {
        rg.step(1 / 60, 1, false);
        await new Promise((r) => setTimeout(r, 25));
      }
      rg.step(1 / 60, 60 * 4, false); // past the 3-2-1
      rg.inject({ moveY: 1, sprint: true });
      rg.step(1 / 60, 60 * 3, false);
      rg.inject(null);
      rg.step(1 / 60, 1);
    });
    await save('bubble-match');
    await page.evaluate(() => {
      const rg = window.__rg;
      const bb = window.__rgBubbleBall;
      // A bonus ring ahead of the player along the pitch, and a charged ball.
      const m = bb.match();
      bb.ring(Math.min(6, (m?.px ?? 0) + 4), m?.pz ?? 0);
      bb.charge();
      rg.step(1 / 60, 20, false);
      rg.step(1 / 60, 1);
    });
    await save('bubble-weak');
    await page.evaluate(() => {
      const rg = window.__rg;
      window.__rgBubbleBall.setClock(0.05);
      rg.step(1 / 60, 150, false);
      rg.step(1 / 60, 1);
    });
    await save('bubble-result');
    await page.evaluate(() => {
      const rg = window.__rg;
      rg.inject({ respawnPressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 10, false);
    });
  }

  if (want('sumo') && (await page.evaluate(() => !!window.__rgDinoSumo))) {
    await page.evaluate(() => {
      const rg = window.__rg;
      const ds = window.__rgDinoSumo;
      const p = ds.world(0, 0, -11);
      const c = ds.world(0, 0, 0);
      rg.teleport(p[0], rg.ctx.world.heightAt(p[0], p[2]) + 0.1, p[2], Math.atan2(c[0] - p[0], c[2] - p[2]));
      rg.step(1 / 60, 60, false);
      rg.step(1 / 60, 1);
    });
    console.log('idle draws', await page.evaluate(() => window.__rg.ctx.renderer.info.render.calls));
    await save('sumo-idle');
    await page.evaluate(async () => {
      const rg = window.__rg;
      window.__rgDinoSumo.start();
      for (let i = 0; i < 400 && window.__rgDinoSumo.phase() === 'loading'; i++) {
        rg.step(1 / 60, 1, false);
        await new Promise((r) => setTimeout(r, 25));
      }
      rg.step(1 / 60, 60 * 4, false);
      rg.inject({ moveY: 1 });
      rg.step(1 / 60, 60 * 2, false);
      rg.inject({ jumpPressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 10, false);
      rg.step(1 / 60, 1);
    });
    await save('sumo-round');
    await page.evaluate(() => {
      const rg = window.__rg;
      window.__rgDinoSumo.setClock(0.05);
      rg.step(1 / 60, 150, false);
      rg.step(1 / 60, 1);
    });
    await save('sumo-result');
  }
  if (errors.length) console.log('ERRORS', errors);
} finally {
  await browser?.close();
  await new Promise((r) => server.httpServer.close(r));
}
