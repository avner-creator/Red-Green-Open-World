// QA7 A (M5): Scoops game view while wearing the biggest hats (sombrero, cone, top hat). Real keys.
const out = [];
for (const hat of globalThis.QA_HATS ?? ['hat-sombrero', 'hat-cone', 'hat-tophat']) {
  await page.evaluate((h) => { const c = window.__rg.ctx; c.profile.unlock(h, 'shop'); c.economy.equip('head', h); }, hat);
  const i0 = await page.evaluate(() => window.__rgScoops.info());
  const cu = i0.customer;
  const fx = cu[0] - i0.site.x, fz = cu[2] - i0.site.z, fl = Math.hypot(fx, fz);
  await page.evaluate(([x, z, y]) => { const rg = window.__rg; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.4, z, y); rg.step(1 / 60, 30, false); }, [cu[0] + (6 * fx) / fl, cu[2] + (6 * fz) / fl, Math.atan2(-fx, -fz)]);
  out.push(['walk', JSON.stringify(await H.walkTo(cu[0], cu[2], 8, 0.6))]);
  await tap('KeyE');
  await st(90, false);
  await H.snap(`hat/${hat}-0`);
  for (let k = 0; k < 3; k++) { await tap('KeyD', 2); await st(4, false); await tap('Space', 2); await st(60, false); }
  await H.snap(`hat/${hat}-3`);
  const inf = await page.evaluate(() => window.__rgScoops.info());
  out.push([hat, inf.phase, JSON.stringify(inf.build?.scoops ?? null)]);
  // leave: Esc then R just in case
  await tap('Escape', 30);
  let ph = (await page.evaluate(() => window.__rgScoops.info())).phase;
  out.push(['after Esc', ph, (await H.s()).phase]);
  if ((await H.s()).phase === 'paused') { await tap('Escape', 30); }
  for (let i = 0; i < 4 && (await page.evaluate(() => window.__rgScoops.info())).phase !== 'idle'; i++) { await tap('KeyR', 60); }
  out.push(['left', (await page.evaluate(() => window.__rgScoops.info())).phase, (await H.s()).phase]);
}
log(out.map((x) => x.join(' ')).join('\n'));
