// QA7 A: Scoops camera timeline after E (no hat change): camera-head distance every 0.5 s for 8 s.
const hat = globalThis.QA_HAT ?? null;
await page.evaluate((h) => { const c = window.__rg.ctx; if (h) { c.profile.unlock(h, 'shop'); } c.economy.equip('head', h); }, hat);
const i0 = await page.evaluate(() => window.__rgScoops.info());
const cu = i0.customer;
const fx = cu[0] - i0.site.x, fz = cu[2] - i0.site.z, fl = Math.hypot(fx, fz);
await page.evaluate(([x, z, y]) => { const rg = window.__rg; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.4, z, y); rg.step(1 / 60, 30, false); }, [cu[0] + (6 * fx) / fl, cu[2] + (6 * fz) / fl, Math.atan2(-fx, -fz)]);
await H.walkTo(cu[0], cu[2], 8, 0.6);
await tap('KeyE');
const tl = [];
for (let i = 0; i < 16; i++) {
  await st(30, false);
  const d = await page.evaluate(() => { const c = window.__rg.ctx.camera.position; const p = window.__rg.ctx.player.object.position; return [+Math.hypot(c.x - p.x, c.y - (p.y + 1.2), c.z - p.z).toFixed(2), window.__rgScoops.info().build?.stage, window.__rg.cameraOverridden()]; });
  tl.push([(i + 1) / 2, ...d]);
  if (i === 2 || i === 7 || i === 15) await H.snap(`hat/cam-${hat}-${i}`);
}
log(JSON.stringify(tl));
await tap('Escape', 30); if ((await H.s()).phase === 'paused') await tap('Escape', 30);
for (let i = 0; i < 4 && (await page.evaluate(() => window.__rgScoops.info())).phase !== 'idle'; i++) await tap('KeyR', 60);
log('left', (await page.evaluate(() => window.__rgScoops.info())).phase);
