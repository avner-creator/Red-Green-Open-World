// Full / R / G screenshots of the HUD (with compass) and the controls card at 640x360 and 1920x1080.
// Usage: npm run build && RG_PORT=4223 node scripts/shots-ui.mjs   -> test-results/ui/wayfinding-*.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4174);
const out = 'test-results/ui';
mkdirSync(out, { recursive: true });

function splitChannel(png, c) {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    o.data[i] = o.data[i + 1] = o.data[i + 2] = png.data[i + c];
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
let browser;
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
  for (const [w, h] of [[640, 360], [1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error('page error', String(e)));
    await page.goto(`http://localhost:${port}/?test=1&quality=low`);
    await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 180000 });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 10000 });
    await page.evaluate(() => {
      const rg = window.__rg;
      rg.freeze(true);
      rg.start();
      rg.step(1 / 60, 20, false);
      // Face the trampoline from a little way off so several markers are in view.
      const a = rg.ctx.world.anchors.trampoline;
      rg.teleport(a.position.x + Math.sin(a.yaw) * 40, a.position.y + 0.3, a.position.z + Math.cos(a.yaw) * 40, a.yaw + Math.PI);
      rg.step(1 / 60, 150, false);
      rg.step(1 / 60, 1);
    });
    const save = async (name) => {
      const buf = await page.screenshot({ type: 'png', animations: 'disabled', timeout: 240000 });
      const png = PNG.sync.read(buf);
      const base = `${out}/wayfinding-${name}-${w}x${h}`;
      writeFileSync(`${base}-full.png`, buf);
      writeFileSync(`${base}-R.png`, splitChannel(png, 0));
      writeFileSync(`${base}-G.png`, splitChannel(png, 1));
      console.log('saved', base);
    };
    await page.waitForTimeout(800);
    await save('hud');
    await page.keyboard.press('KeyH');
    await page.waitForTimeout(500);
    await save('card');
    await page.keyboard.press('KeyH');
    await page.evaluate(() => window.__rg.ctx.events.emit('player:mode', { mode: 'driving', previous: 'walk' }));
    await page.waitForTimeout(800);
    await save('driving');
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
