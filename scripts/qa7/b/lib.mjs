// QA round 4 part B helpers. Real keyboard input through page.keyboard (the game's input layer),
// time advanced with window.__rg.step while frozen. Not part of `npm run verify`.
// Usage: npm run build && RG_PORT=4362 node scripts/qa7b/<script>.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

export async function open(dirName, { query = '', width = 960, height = 540 } = {}) {
  const port = Number(process.env.RG_PORT ?? 4362);
  const out = `test-results/qa7b/${dirName}`;
  mkdirSync(out, { recursive: true });
  const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${port}/?test=1&freeze=1&quality=low${query}`);
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 240000 });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 20000 }).catch(() => {});
  await page.evaluate(() => { window.__rg.freeze(true); window.__rg.start(); window.__rg.step(1 / 60, 10, false); });
  let n = 0;
  const shot = async (name) => {
    await page.evaluate(() => window.__rg.step(1 / 60, 1, true));
    const buf = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
    const f = `${out}/${String(n++).padStart(3, '0')}-${name}.png`;
    writeFileSync(f, buf);
    console.log(`  shot ${f}`);
  };
  const step = (frames, render = false) => page.evaluate(([f, r]) => window.__rg.step(1 / 60, f, r), [frames, render]);
  const st = () => page.evaluate(() => {
    const s = window.__rg.state();
    const pr = document.querySelector('[data-testid="prompt"]');
    const pip = document.querySelector('[data-testid="pip-bubble"]');
    return `${s.playerMode} pos=${s.playerPosition.map((v) => v.toFixed(1)).join(',')} gems=${s.gems} wallet=${window.__rg.ctx.profile.wallet} prompt=${pr && pr.offsetParent ? pr.innerText.replace(/\s+/g, ' ') : '-'} pip=${pip && pip.offsetParent ? pip.innerText.replace(/\s+/g, ' ') : '-'}`;
  });
  const pos = () => page.evaluate(() => window.__rg.state().playerPosition);
  const held = new Set();
  const setKeys = async (want) => {
    for (const k of [...held]) if (!want.includes(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  const release = () => setKeys([]);
  const tap = async (k, frames = 2) => { await page.keyboard.down(k); await step(frames); await page.keyboard.up(k); await step(1); };
  /** Keys (camera-relative WASD) that move toward world direction (dx,dz). */
  const keysToward = (dx, dz) => page.evaluate(([dx, dz]) => {
    const cam = window.__rg.ctx.camera;
    const f = new cam.position.constructor();
    cam.getWorldDirection(f);
    f.y = 0; f.normalize();
    const rx = -f.z, rz = f.x; // right = forward x up
    const l = Math.hypot(dx, dz) || 1;
    const fw = (dx * f.x + dz * f.z) / l, rt = (dx * rx + dz * rz) / l;
    const k = [];
    if (fw > 0.38) k.push('KeyW'); else if (fw < -0.38) k.push('KeyS');
    if (rt > 0.38) k.push('KeyD'); else if (rt < -0.38) k.push('KeyA');
    return k;
  }, [dx, dz]);
  /** Walk with held keys toward (x,z). Returns {reached, stuck, pos}. */
  const walkTo = async (x, z, { sprint = false, maxS = 20, tol = 1.2, chunk = 6, log = false, extra = [] } = {}) => {
    let last = await pos();
    let stillFor = 0;
    for (let t = 0; t < maxS * 60; t += chunk) {
      const p = await pos();
      const dx = x - p[0], dz = z - p[2];
      if (Math.hypot(dx, dz) < tol) { await release(); return { reached: true, stuck: false, pos: p }; }
      const k = await keysToward(dx, dz);
      if (sprint) k.push('ShiftLeft');
      k.push(...extra);
      await setKeys(k);
      await step(chunk);
      const q = await pos();
      if (Math.hypot(q[0] - last[0], q[2] - last[2]) < 0.02 * chunk) stillFor += chunk; else stillFor = 0;
      last = q;
      if (log && t % 60 === 0) console.log(`   walk t=${(t / 60).toFixed(1)} ${q.map((v) => v.toFixed(1))} keys=${k}`);
      if (stillFor > 120) { await release(); return { reached: false, stuck: true, pos: q }; }
    }
    await release();
    return { reached: false, stuck: false, pos: await pos() };
  };
  const tp = (x, z, yaw = 0, dy = 0.3) => page.evaluate(([x, z, yaw, dy]) => {
    const rg = window.__rg; rg.teleport(x, rg.ctx.world.heightAt(x, z) + dy, z, yaw); rg.step(1 / 60, 20, false);
  }, [x, z, yaw, dy]);
  const close = async () => {
    await release().catch(() => {});
    const rgErr = await page.evaluate(() => window.__rg.errors).catch(() => []);
    console.log('CONSOLE ERRORS:', JSON.stringify(errors.slice(0, 20)), 'RG ERRORS:', JSON.stringify(rgErr.slice(0, 10)));
    await browser.close();
    await new Promise((r) => server.httpServer.close(r));
  };
  /** Hold the keys that steer toward world (x, z) (plus `extra` keys); does not step. */
  const steer = async (x, z, extra = []) => {
    const p = await pos();
    const k = await keysToward(x - p[0], z - p[2]);
    await setKeys([...k, ...extra]);
    return k;
  };
  const visibleText = () => page.evaluate(() => [...document.querySelectorAll('#ui *, [data-testid]')]
    .filter((e) => e.offsetParent && e.children.length === 0 && e.innerText && e.innerText.trim())
    .map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter((v, i, a) => a.indexOf(v) === i).slice(0, 40));
  return { page, shot, step, st, pos, setKeys, release, tap, walkTo, tp, close, errors, out, steer, keysToward, visibleText };
}
