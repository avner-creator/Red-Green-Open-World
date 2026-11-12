// Pip r8 (m13): where each glasses site's start point is at runtime (lead marker / booth pad view).
// Usage: RG_PORT=4413 node scripts/qa9/trail-probe.mjs
import { open } from './lib.mjs';

const { page, close, errors } = await open('trail-probe', { query: '&quality=low&freeze=1', width: 640, height: 360 });
try {
  await page.evaluate(() => { window.__rg.freeze(true); window.__rg.step(1 / 60, 1, true); });
  await page.getByTestId('play').click();
  await page.evaluate(() => window.__rg.step(1 / 60, 30, true));
  const out = await page.evaluate(() => {
    const g = window.__rgGlasses;
    const v = new window.__rg.ctx.camera.position.constructor();
    return g.sites().map((s) => {
      const o = window.__rg.ctx.scene.getObjectByName(`glasses:${s.id}:lead`);
      const lead = o ? (o.getWorldPosition(v), [v.x, v.z]) : null;
      return { id: s.id, site: [s.x, s.z, s.yaw], booth: g.isBooth(s.id), pad: g.boothPadView(s.id), lead, dbg: g.isBooth(s.id) ? Object.keys(g.boothDebug(s.id) ?? {}) : g.debug(s.id) };
    });
  });
  for (const r of out) console.log(JSON.stringify(r).slice(0, 600));
} finally {
  console.log('errors', errors.length);
  await close();
}
