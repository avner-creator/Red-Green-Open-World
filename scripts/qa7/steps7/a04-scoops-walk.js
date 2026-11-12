// QA7 A: desktop walks past the Scoops parlour (real WASD), log end, stall, camera distance; snapshots.
const camD = () => page.evaluate(() => { const c = window.__rg.ctx.camera.position; const p = window.__rg.ctx.player.object.position; return +Math.hypot(c.x - p.x, c.y - (p.y + 1), c.z - p.z).toFixed(2); });
const out = [];
for (const [x0, z0, tx, tz, nm] of [[8, 0, 30, 0, 'e8'], [8, 0, 24, -6, 'se8'], [8, 0, 24, 6, 'ne8'], [20, -10, 20, 10, 'ns'], [30, -8, 10, -4, 'wcounter'], [16, 0, 30, 0, 'e16']]) {
  await page.evaluate(([x, z, tx, tz]) => { const rg = window.__rg; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.4, z, Math.atan2(tx - x, tz - z)); rg.step(1 / 60, 40, false); }, [x0, z0, tx, tz]);
  let minCam = 99;
  const r = await H.walkTo(tx, tz, 12, 0.8);
  for (let i = 0; i < 1; i++) minCam = Math.min(minCam, await camD());
  await H.snap(`scw/${nm}`);
  out.push([nm, JSON.stringify(r), 'camEnd', minCam]);
}
log(out.map((x) => x.join(' ')).join('\n'));
