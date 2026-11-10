// 1080p UI screenshots (full, R-only, G-only) to test-results/ui/: title, HUD, pause, settings
// (both tabs), end screen. Moved out of the e2e suite: SwiftShader at 1920x1080 takes minutes.
// Usage: npm run build && RG_PORT=4217 npm run shots:ui1080
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4174);
const out = 'test-results/ui';
mkdirSync(out, { recursive: true });

function channel(png, c) {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    o.data[i] = o.data[i + 1] = o.data[i + 2] = png.data[i + c];
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
let browser;
let failed = false;
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://localhost:${port}/?test=1&quality=low`);
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 180000 });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 10000 });
  await page.evaluate(() => window.__rg.freeze(true));

  const save = async (name) => {
    await page.waitForTimeout(1100); // let CSS transitions settle (the game loop is frozen)
    const buf = await page.screenshot({ type: 'png', timeout: 180000 });
    writeFileSync(`${out}/${name}.png`, buf);
    const png = PNG.sync.read(buf);
    writeFileSync(`${out}/${name}-R.png`, channel(png, 0));
    writeFileSync(`${out}/${name}-G.png`, channel(png, 1));
    console.log(`saved ${out}/${name}{,-R,-G}.png`);
  };

  await page.evaluate(() => window.__rg.step(1 / 60, 5));
  await save('title-1080');
  await page.getByTestId('play').click();
await page.getByTestId('csel-go').click();
  await page.evaluate(() => {
    const rg = window.__rg;
    rg.ctx.session.setTotals({ gems: 60 });
    rg.ctx.events.emit('gem:collected', { id: 'g1', count: 3, total: 60, position: rg.ctx.player.position.clone() });
    rg.ctx.events.emit('interact:focus', { target: { id: 'x', icon: 'chest', position: () => rg.ctx.player.position.clone(), radius: 3, onUse: () => {} } });
    rg.step(1 / 60, 5);
  });
  await save('hud-1080');
  await page.evaluate(() => {
    window.__rg.ctx.session.pause();
    window.__rg.step(1 / 60, 2);
  });
  await save('pause-1080');
  await page.getByTestId('pause-grownups').click();
  await page.evaluate(() => {
    const m = /(\d+) × (\d+)/.exec(document.querySelector('[data-testid="gate-question"]').textContent);
    document.querySelector(`[data-testid="gate-answer"][data-value="${Number(m[1]) * Number(m[2])}"]`).click();
  });
  await page.getByTestId('settings').waitFor({ state: 'visible' });
  await save('settings-1080');
  await page.getByTestId('tab-game').click();
  await save('settings-game-1080');
  await page.getByTestId('settings-done').click();
  await page.getByTestId('resume').click();
  await page.evaluate(() => {
    const rg = window.__rg;
    rg.ctx.events.emit('chest:opened', { chestId: 'c1', outfitId: 'hat_party' });
    rg.ctx.events.emit('stunt', { kind: 'bigBounce', value: 22, stars: 4 });
    rg.setRemaining(0.05);
    rg.step(1 / 60, 30);
  });
  await page.getByTestId('play-again').waitFor({ state: 'visible' });
  await save('end-1080');
  if (errors.length) {
    console.error('page errors:', errors);
    failed = true;
  }
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  await browser?.close();
  await new Promise((done) => server.httpServer.close(done));
}
process.exit(failed ? 1 : 0);
