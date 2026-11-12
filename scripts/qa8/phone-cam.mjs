// QA6 C: phone (iPhone 13 landscape, 750x342, touch) camera checks: walk with the touch stick through
// grass meadows, along tree lines and in the village; log camera-hero distance and save frames.
// Usage: RG_PORT=4396 node scripts/qa8/phone-cam.mjs
import { open, touchSession } from './lib.mjs';

const { page, shot, close, errors } = await open('phone-cam', { query: '&quality=low&freeze=1', device: 'iPhone 13 landscape', ctxOpts: { deviceScaleFactor: 1 } });
try {
  await page.evaluate(() => { window.__rg.freeze(true); window.__rg.step(1 / 60, 1, true); });
  const t = await touchSession(page);
  const r = await page.evaluate(() => { const e = document.querySelector('[data-testid="play"]').getBoundingClientRect(); return [e.x + e.width / 2, e.y + e.height / 2]; });
  await t.tap(r[0], r[1]);
  await page.evaluate(() => { window.__rg.step(1 / 60, 60, false); window.__rg.setRemaining(3000); });
  const vp = page.viewportSize();
  const spots = [
    ['toys-meadow', -40, 80, 0],
    ['glowflies-meadow', -66, 30, 2.4],
    ['treeline-west', -10, 20, 0.5],
    ['village-gap', 8, 20, 1.6],
    ['scoops-side', 16, 0, 2.2],
    ['outer-forest', -80, -40, 1.0],
  ];
  const out = [];
  for (const [name, x, z, yaw] of spots) {
    await page.evaluate(([x, z, yaw]) => { window.__rg.teleport(x, window.__rg.ctx.world.heightAt(x, z) + 0.3, z, yaw); window.__rg.step(1 / 60, 40, false); }, [x, z, yaw]);
    const sx = vp.width * 0.16, sy = vp.height * 0.72;
    let minCam = 99, frames = 0, close1 = 0;
    for (const [dx, dy] of [[0, -50], [40, -30], [-40, -30], [0, 50]]) {
      await t.stickHold(sx, sy, dx, dy);
      for (let i = 0; i < 6; i++) {
        const d = await page.evaluate(() => { window.__rg.step(1 / 60, 15, false); const c = window.__rg.ctx.camera.position; const p = window.__rg.ctx.player.object.position; return Math.hypot(c.x - p.x, c.y - (p.y + 1), c.z - p.z); });
        minCam = Math.min(minCam, d); frames++; if (d < 1.3) close1++;
      }
      await t.release();
      await page.evaluate(() => window.__rg.render());
      await shot(`${name}-${dx}_${dy}`);
    }
    out.push({ name, minCam: +minCam.toFixed(2), closeFrames: `${close1}/${frames}` });
  }
  console.log(JSON.stringify(out, null, 1));
} finally {
  console.log('errors', errors.length, JSON.stringify(errors.slice(0, 5)));
  await close();
}
