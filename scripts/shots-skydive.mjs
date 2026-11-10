// Saves full, R-only and G-only screenshots of the balloon skydive to test-results/skydive/:
// parked balloon, top of the ascent, mid-freefall, under canopy, the landing rings.
// Usage: npm run build && RG_PORT=4212 node scripts/shots-skydive.mjs [quality]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4174);
const quality = process.argv[2] ?? 'medium';
const out = 'test-results/skydive';
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
    const buf = await page.screenshot({ type: 'png', animations: 'disabled', timeout: 180000 });
    const png = PNG.sync.read(buf);
    writeFileSync(`${out}/${name}-full.png`, buf);
    writeFileSync(`${out}/${name}-R.png`, splitChannel(png, 0));
    writeFileSync(`${out}/${name}-G.png`, splitChannel(png, 1));
    console.log(`saved ${out}/${name}-{full,R,G}.png`);
  };
  // Step until `cond` (evaluated in the page) is true, then settle the camera and render.
  const until = async (cond, settle = 20) => {
    const info = await page.evaluate(
      ([src, settleFrames]) => {
        const rg = window.__rg;
        const ctx = rg.ctx;
        const test = new Function('ctx', `return (${src})`);
        let n = 0;
        while (!test(ctx) && n < 3000) {
          rg.step(1 / 30, 1, false);
          n++;
        }
        rg.step(1 / 60, settleFrames, false);
        rg.step(1 / 60, 1, true);
        const p = ctx.player.position;
        return { frames: n, agl: p.y - ctx.world.heightAt(p.x, p.z), x: p.x, z: p.z, mode: ctx.player.mode };
      },
      [cond, settle],
    );
    console.log(cond, JSON.stringify(info));
  };

  await page.evaluate(() => {
    const rg = window.__rg;
    const ctx = rg.ctx;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 5, false);
    rg.step(1 / 30, 360, false); // let the wordless tutorial finish
    const a = ctx.world.anchors.balloon;
    // Stand back from the balloon looking at it, camera low and pitched up to frame the envelope.
    const x = a.position.x + Math.sin(a.yaw) * 26;
    const z = a.position.z + Math.cos(a.yaw) * 26;
    rg.teleport(x, ctx.world.heightAt(x, z) + 0.2, z, a.yaw + Math.PI);
    ctx.cameraRig.setOverride({ distance: 7, height: 1.2, fov: 66 });
    rg.inject({ lookY: -0.5 });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 60, false);
    rg.step(1 / 60, 1, true);
  });
  await save('1-parked');
  await page.evaluate(() => {
    const rg = window.__rg;
    const ctx = rg.ctx;
    ctx.cameraRig.setOverride(null);
    const a = ctx.world.anchors.balloon.position;
    rg.teleport(a.x + 1.7, ctx.world.heightAt(a.x, a.z) + 0.4, a.z, -Math.PI / 2);
    rg.step(1 / 60, 5, false);
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
  });
  await until('ctx.player.position.y - ctx.world.heightAt(ctx.world.anchors.balloon.position.x, ctx.world.anchors.balloon.position.z) > 6', 0);
  await save('2-liftoff');
  await until('ctx.player.position.y - ctx.world.heightAt(ctx.world.anchors.balloon.position.x, ctx.world.anchors.balloon.position.z) > 179.5', 30);
  await save('3-top');
  await until('document.querySelector(".rg-sky-prompt.on") !== null', 2);
  await save('3b-jump-prompt');
  await until('ctx.player.velocity.y < -25', 4);
  await save('4-freefall');
  await until('ctx.scene.getObjectByName("canopy").visible', 50);
  await save('5-canopy');
  await until('ctx.player.position.y - ctx.world.heightAt(ctx.player.position.x, ctx.player.position.z) < 4', 0);
  await save('6-approach');
  if (errors.length) console.error('page errors:', errors);
} finally {
  await browser?.close();
  await server.close();
}
