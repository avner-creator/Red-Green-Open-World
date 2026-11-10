// Screenshots of the outer areas (stream G): full, R-only and G-only, at the start of a session and
// at sunset, saved to test-results/world-outer/. Also prints draw calls and triangles per view.
// Usage: npm run build && RG_PORT=4393 node scripts/shots-world-outer.mjs [view ...] [--quality=medium]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4174);
const out = 'test-results/world-outer';
const args = process.argv.slice(2);
const quality = (args.find((a) => a.startsWith('--quality=')) ?? '--quality=medium').split('=')[1];
const sunsetOnly = args.includes('--sunset');
const startOnly = args.includes('--start');
const wanted = args.filter((a) => !a.startsWith('--'));
mkdirSync(out, { recursive: true });

// Player position (x, z), facing (towards tx, tz) and the camera override.
const VIEWS = [
  { name: 'spawn', spawn: true },
  { name: 'fingerpost', x: 2.5, z: 8.5, tx: 8.4, tz: 4.9, d: 4, h: 1.2 },
  { name: 'fingerpost-back', x: 14.5, z: 1.5, tx: 8.4, tz: 4.9, d: 4, h: 1.2 },
  { name: 'ranch', x: -47, z: 25, tx: -74, tz: 44, d: 11, h: 4.5 },
  { name: 'barn', x: -84, z: 46, tx: -101, tz: 44, d: 8, h: 3 },
  { name: 'bridge', x: 22, z: -88, tx: 0, tz: -110, d: 10, h: 5 },
  { name: 'platform', x: 1.6, z: -103, tx: -10, tz: -106, d: 6, h: 2.6 },
  { name: 'canyon', x: -30, z: -106, tx: 0, tz: -106, d: 9, h: 3.5 },
  { name: 'landing', x: -6, z: -104, tx: -18, tz: -106, d: 9, h: 4 },
  { name: 'waterfall', x: -38, z: -101, tx: -45, tz: -118, d: 8, h: 3 },
  { name: 'silly', x: 6, z: 62, tx: 8, tz: 98, d: 9, h: 4.5 },
  { name: 'silly-side', x: -22, z: 88, tx: 8, tz: 98, d: 9, h: 4 },
  { name: 'beach', x: -118, z: 5, tx: -128, tz: -20, d: 9, h: 4 },
  { name: 'lake', x: -101, z: -6, tx: -118, tz: -50, d: 8, h: 3.5 },
  { name: 'lighthouse', x: -43, z: -127, tx: -62, tz: -134, d: 10, h: 4.5 },
  { name: 'lighthouse-top', x: -65.6, z: -134.6, tx: -62, tz: -134, d: 4.5, h: 2, y: 'deck' },
  { name: 'road-west', x: -20, z: 9, tx: -52, tz: 30, d: 7, h: 3 },
];

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
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 180000 });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 10000 });
  await page.evaluate(() => {
    const rg = window.__rg;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 30, 360, false); // let the wordless intro finish
  });
  const save = async (name) => {
    const buf = await page.screenshot({ type: 'png', animations: 'disabled' });
    const png = PNG.sync.read(buf);
    writeFileSync(`${out}/${name}-full.png`, buf);
    writeFileSync(`${out}/${name}-R.png`, splitChannel(png, 0));
    writeFileSync(`${out}/${name}-G.png`, splitChannel(png, 1));
  };
  const times = sunsetOnly ? ['sunset'] : startOnly ? ['start'] : ['start', 'sunset'];
  for (const v of VIEWS) {
    if (wanted.length && !wanted.includes(v.name)) continue;
    for (const when of times) {
      const info = await page.evaluate(
        ([v, when]) => {
          const rg = window.__rg;
          const ctx = rg.ctx;
          if (v.spawn) {
            ctx.player.respawn();
            ctx.cameraRig.setOverride(null);
          } else {
            const yaw = Math.atan2(v.tx - v.x, v.tz - v.z);
            let y = ctx.world.heightAt(v.x, v.z) + 0.3;
            if (v.y === 'deck') y = ctx.world.heightAt(-62, -134) + 1.1 + 13.2 + 0.25 + 0.3;
            if (v.name === 'platform' || v.name === 'waterfall') y = 33.5 + 0.3;
            rg.teleport(v.x, y, v.z, yaw);
            ctx.cameraRig.setOverride({ distance: v.d, height: v.h });
          }
          // Sunset = the last few seconds of the session (the session clock drives the time of day).
          rg.setRemaining(when === 'sunset' ? 8 : 290);
          rg.step(1 / 60, 50, false);
          const r = ctx.renderer;
          r.info.autoReset = false;
          r.info.reset();
          rg.render();
          const res = { calls: r.info.render.calls, tris: r.info.render.triangles };
          r.info.autoReset = true;
          return res;
        },
        [v, when],
      );
      await save(`${v.name}-${when}`);
      console.log(`${v.name}-${when}: ${info.calls} draws, ${Math.round(info.tris / 1000)}k tris`);
    }
  }
  if (errors.length) console.error('page errors:', errors);
} finally {
  await browser?.close();
  await server.close();
}
