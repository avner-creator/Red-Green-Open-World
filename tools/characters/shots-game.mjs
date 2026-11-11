// Heroes in the real game: title screen, hero select and in play (normal camera), each with R-only
// and G-only splits. Needs a running dev server: `npx vite --port $RG_PORT`.
// Usage: RG_PORT=4373 node tools/characters/shots-game.mjs <outdir> [id ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';

const port = Number(process.env.RG_PORT ?? 4373);
const [out = 'test-results/heroes-look2', ...only] = process.argv.slice(2);
const ids = only.length ? only : ['frog', 'robot', 'panda', 'bee', 'pup', 'flamingo', 'rex', 'fox', 'alpaca', 'trike'];
mkdirSync(out, { recursive: true });

function split(png, c) {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    o.data[i] = o.data[i + 1] = o.data[i + 2] = png.data[i + c];
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror', String(e)));
  page.on('console', (m) => m.type() === 'error' && console.error('console', m.text()));
  await page.goto(`http://localhost:${port}/?test=1&quality=${process.env.Q ?? 'medium'}&freeze=1`);
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 240000 });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 20000 });
  const shot = async (name, rgb = true) => {
    await page.evaluate(() => {
      window.__rg.step(1 / 60, 30, false);
      window.__rg.render();
    });
    const buf = await page.screenshot({ type: 'png', animations: 'disabled', timeout: 120000 });
    writeFileSync(`${out}/${name}.png`, buf);
    if (rgb) {
      const png = PNG.sync.read(buf);
      writeFileSync(`${out}/${name}-R.png`, split(png, 0));
      writeFileSync(`${out}/${name}-G.png`, split(png, 1));
    }
    console.log('saved', name);
  };
  const setHero = async (id) => {
    await page.evaluate(async (i) => {
      for (const c of ['robot', 'frog', 'panda', 'bee', 'pup', 'flamingo', 'rex', 'fox', 'alpaca', 'trike']) window.__rg.ctx.profile.unlock?.(c, 'shop');
      await window.__rg.ctx.player.setCharacter(i);
    }, id);
  };
  for (const id of ids) {
    await setHero(id);
    await shot(`title-${id}`, id === ids[0] || process.env.RGB === '1');
  }
  // Hero select with the first hero.
  await page.getByTestId('title-hero').click();
  await page.getByTestId(`csel-${ids[0]}`).click();
  await setHero(ids[0]);
  await shot(`select-${ids[0]}`);
  await page.getByTestId('csel-back').click();
  // In play at the normal camera distance.
  await page.evaluate(() => window.__rg.start());
  for (const id of ids) {
    await setHero(id);
    await page.evaluate(() => {
      const rg = window.__rg;
      const sp = rg.ctx.world.anchors.spawn;
      rg.teleport(sp.position.x, sp.position.y, sp.position.z, sp.yaw);
    });
    await shot(`play-${id}`, id === ids[0] || process.env.RGB === '1');
  }
} finally {
  await browser.close();
}
