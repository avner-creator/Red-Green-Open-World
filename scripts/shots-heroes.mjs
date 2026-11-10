// Before/after screenshots of the hero objects (buggy, balloon, player) at gameplay distance and
// close up, to check render-cost work for visible downgrades. Saves to test-results/heroes-<tag>/.
// Usage: npm run build && RG_PORT=4271 node scripts/shots-heroes.mjs <tag> [quality]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4174);
const tag = process.argv[2] ?? 'now';
const quality = process.argv[3] ?? 'high';
const out = `test-results/heroes-${tag}`;
mkdirSync(out, { recursive: true });

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
    rg.step(1 / 60, 5, false);
    rg.step(1 / 30, 360, false);
  });

  /**
   * Put the camera `dist` m from the target (bearing `yaw`, `up` m above its base) looking at a point
   * `aim` m above the base; the player stands beside the camera (or is hidden).
   */
  const shot = async (name, s) => {
    await page.evaluate((s) => {
      const rg = window.__rg;
      const ctx = rg.ctx;
      const V = ctx.camera.position.constructor;
      const t = s.target === 'balloon' ? ctx.world.anchors.balloon.position.clone() : ctx.scene.getObjectByName(s.target).getWorldPosition(new V());
      const px = t.x + Math.sin(s.yaw + (s.playerSide ?? 0.35)) * (s.playerDist ?? s.dist * 0.7);
      const pz = t.z + Math.cos(s.yaw + (s.playerSide ?? 0.35)) * (s.playerDist ?? s.dist * 0.7);
      rg.teleport(px, ctx.world.heightAt(px, pz) + 0.2, pz, Math.atan2(t.x - px, t.z - pz));
      rg.step(1 / 60, 60, false);
      ctx.scene.getObjectByName('player').visible = !s.hidePlayer;
      const cx = t.x + Math.sin(s.yaw) * s.dist;
      const cz = t.z + Math.cos(s.yaw) * s.dist;
      ctx.camera.position.set(cx, Math.max(t.y, ctx.world.heightAt(cx, cz)) + s.up, cz);
      ctx.camera.fov = s.fov ?? 55;
      ctx.camera.updateProjectionMatrix();
      ctx.camera.lookAt(t.x, t.y + s.aim, t.z);
      ctx.camera.updateMatrixWorld(true);
      rg.render();
    }, s);
    const buf = await page.screenshot({ type: 'png', animations: 'disabled', timeout: 180000 });
    writeFileSync(`${out}/${name}.png`, buf);
    console.log(`saved ${out}/${name}.png`);
  };
  await shot('buggy-gameplay', { target: 'buggy', yaw: 2.3, dist: 9, up: 2.4, aim: 0.3, hidePlayer: true });
  await shot('buggy-close', { target: 'buggy', yaw: 2.3, dist: 3.4, up: 1.2, aim: 0.2, hidePlayer: true });
  await shot('buggy-front', { target: 'buggy', yaw: 0.5, dist: 3.8, up: 0.9, aim: 0.1, hidePlayer: true });
  await shot('balloon-gameplay', { target: 'balloon', yaw: 0.6, dist: 30, up: 3, aim: 12, fov: 66, hidePlayer: true });
  await shot('balloon-close', { target: 'balloon', yaw: 0.6, dist: 6.5, up: 2.5, aim: 2.2, fov: 66, hidePlayer: true });
  await shot('player-gameplay', { target: 'player', yaw: 0.3, dist: 5, up: 1.8, aim: 0.9, playerDist: 0, hidePlayer: false });
  await shot('player-close', { target: 'player', yaw: 0.3, dist: 2.2, up: 1.2, aim: 0.9, playerDist: 0, hidePlayer: false });
  if (errors.length) console.log('errors:', errors.slice(0, 5));
} finally {
  await browser?.close();
  await server.close();
}
