// Probe: Pip vs the hero on the buggy / horse / plane / dragon (chase camera). Prints how far Pip's
// body is from the camera→hero sight lines ("clear" < 0 = Pip hides part of the hero), saves shots.
// Usage: RG_PORT=4377 node scripts/qa5/pip-rides-probe.mjs
import { open } from './lib.mjs';

const { page, shot, close } = await open('pip-rides', { query: '&quality=low&freeze=1', width: 960, height: 540 });
try {
  await page.evaluate(() => {
    const rg = window.__rg;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 30, 3, false);
    rg.setRemaining?.(3000);
  });
  const measure = () =>
    page.evaluate(() => {
      const rg = window.__rg;
      const ctx = rg.ctx;
      const V = ctx.camera.position.constructor;
      const cam = ctx.camera.position.clone();
      const pl = ctx.player;
      const bp = window.__rgBuddy.pos();
      const sc = window.__rgBuddy.scale ? window.__rgBuddy.scale() : 1.22;
      const c = new V(bp[0], bp[1] + 0.35 * sc, bp[2]);
      const r = 0.38 * sc;
      let worst = Infinity;
      for (let k = 0; k <= 6; k++) {
        const h = new V(pl.position.x, pl.position.y + 0.3 + (k / 6) * 1.4, pl.position.z);
        const d = h.clone().sub(cam);
        const L = d.length();
        d.divideScalar(L);
        const t = c.clone().sub(cam).dot(d);
        if (t <= 0 || t >= L) continue;
        worst = Math.min(worst, cam.clone().add(d.clone().multiplyScalar(t)).distanceTo(c) - r);
      }
      const f = (v) => [v.x, v.y, v.z].map((n) => +n.toFixed(2));
      return { mode: pl.mode, ride: window.__rgBuddy.ride(), pip: bp.map((v) => +v.toFixed(2)), hero: f(pl.position), cam: f(cam), sc, clear: +worst.toFixed(2) };
    });
  const drive = async (name, n) => {
    for (let i = 0; i < n; i++) {
      await page.evaluate(() => {
        const rg = window.__rg;
        rg.inject({ moveY: 1 });
        rg.step(1 / 30, 15, false);
        rg.inject(null);
      });
      console.log(name, i, JSON.stringify(await measure()));
    }
    await page.evaluate(() => window.__rg.render());
    await shot(name);
  };
  const leave = (k = 'usePressed') =>
    page.evaluate((k) => {
      const rg = window.__rg;
      rg.inject({ [k]: true });
      rg.step(1 / 30, 1, false);
      rg.inject(null);
      rg.step(1 / 30, 40, false);
    }, k);
  await page.evaluate(() => {
    const rg = window.__rg;
    const c = rg.ctx.vehicles.all.find((v) => v.kind === 'car');
    rg.teleport(c.position.x + 1.2, c.position.y + 0.2, c.position.z - 1.2);
    rg.step(1 / 30, 10, false);
    rg.inject({ usePressed: true });
    rg.step(1 / 30, 1, false);
    rg.inject(null);
    rg.step(1 / 30, 30, false);
  });
  await drive('buggy', 8);
  await leave();
  await page.evaluate(() => {
    const rg = window.__rg;
    const h = rg.ctx.vehicles.all.find((v) => v.kind === 'horse');
    const q = h.object.quaternion;
    const yaw = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
    const x = h.position.x + Math.cos(yaw) * 1.8;
    const z = h.position.z - Math.sin(yaw) * 1.8;
    rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.2, z, yaw);
    rg.step(1 / 60, 20, false);
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 150, false);
  });
  await drive('horse', 8);
  await leave();
  for (const k of ['plane', 'dragon']) {
    await page.evaluate((k) => {
      const rg = window.__rg;
      const pa = window.__rgSky[k].pad.at;
      rg.teleport(pa.x + 5, pa.y + 0.3, pa.z, 0);
      rg.step(1 / 60, 10, false);
      rg.teleport(pa.x, pa.y + 0.3, pa.z, 0);
      rg.step(1 / 60, 240, false);
    }, k);
    await drive(k, 8);
    await leave('respawnPressed');
  }
} finally {
  await close();
}
