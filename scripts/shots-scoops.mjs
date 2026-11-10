// Saves full, R-only and G-only screenshots of Scoops, the ice-cream shop, to test-results/ice-cream/:
// the parlour from the plaza, the build station (secret topping in its jar), a tall wobbly cone,
// the chomp, and the effects afterwards.
// Usage: npm run build && node scripts/shots-scoops.mjs [quality]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4177);
const quality = process.argv[2] ?? 'medium';
const out = 'test-results/ice-cream';
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
  await page.goto(`http://localhost:${port}/?test=1&quality=${quality}`);
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
  const step = (n, render = false) => page.evaluate(([n, render]) => window.__rg.step(1 / 60, n, render), [n, render]);
  const press = async (patch, frames = 2) => {
    await page.evaluate((p) => window.__rg.inject(p), patch);
    await step(1);
    await page.evaluate(() => window.__rg.inject(null));
    await step(frames);
  };

  await page.evaluate(() => {
    const rg = window.__rg;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 10, false);
  });
  // Let the friends' models load (async) while frozen.
  const info = await page.evaluate(() => window.__rgScoops.info());
  const s = info.site;
  // 1. From the plaza: the parlour front.
  await page.evaluate((s) => {
    const fx = Math.sin(s.yaw);
    const fz = Math.cos(s.yaw);
    // In front of the shop and a little to its right, looking at it.
    const x = s.x + fx * 10.5 - fz * 4.5;
    const z = s.z + fz * 10.5 + fx * 4.5;
    window.__rg.teleport(x, window.__rg.ctx.world.heightAt(x, z) + 0.1, z, Math.atan2(s.x - x, s.z - z));
  }, s);
  await step(30);
  await page.waitForFunction(() => window.__rgScoops.info().friendsLoaded, undefined, { timeout: 30000 }).catch(() => console.log('friends not loaded'));
  await step(60, true);
  await save('exterior');

  // 2. Walk up and open the station.
  await page.evaluate(([c, yaw]) => window.__rg.teleport(c[0], c[1] + 0.05, c[2], yaw + Math.PI), [info.customer, s.yaw]);
  await step(5);
  await press({ usePressed: true }, 70);
  await press({ jumpPressed: true }, 30); // waffle cone
  for (let i = 0; i < 3; i++) {
    await press({ moveX: 1 }, 2);
    await press({ moveX: 0 }, 1);
    await press({ jumpPressed: true }, 100);
  }
  await step(10, true);
  await save('station-scoops');
  await press({ usePressed: true }, 5); // → sauce
  await press({ jumpPressed: true }, 30); // fudge
  await press({ jumpPressed: true }, 30); // worms
  await step(30, true);
  await save('station-toppings');
  // Find the secret jar: select its tile and pick it.
  const st = await page.evaluate(() => window.__rgScoops.info());
  const jarTile = st.tiles.findIndex((t) => t.kind === 'jar' && t.index === st.build.secretJar);
  const cur = st.build.selected;
  for (let i = cur; i < jarTile; i++) {
    await press({ moveX: 1 }, 1);
    await press({ moveX: 0 }, 1);
  }
  await press({ jumpPressed: true }, 50);
  await step(1, true);
  await save('station-secret-found');
  // 3. Eat.
  await press({ usePressed: true }, 75);
  await step(1, true);
  await save('chomp');
  await step(150);
  // 4. Effects, out on the open plaza: giant head, rainbow trail, bubble burps.
  await page.evaluate(() => {
    const rg = window.__rg;
    rg.teleport(-6, rg.ctx.world.heightAt(-6, 10) + 0.1, 10, 0.4);
    rg.step(1 / 60, 5, false);
    window.__rgScoops.startEffects(['bigHead', 'rainbow', 'burps']);
  });
  // Run a curve to draw the rainbow trail.
  for (let i = 0; i < 6; i++) {
    await page.evaluate((i) => window.__rg.inject({ moveY: 1, moveX: i % 2 ? 0.7 : -0.7 }), i);
    await step(20);
  }
  await page.evaluate(() => window.__rg.inject(null));
  await step(26, true);
  await save('effects');
  console.log(JSON.stringify(await page.evaluate(() => window.__rgScoops.info()), null, 0).slice(0, 600));
  if (errors.length) console.log('ERRORS', errors);
} finally {
  await browser?.close();
  await server.close();
}
