const s0 = await page.evaluate(() => window.__rgScoops.info());
const fx = Math.sin(s0.site.yaw), fz = Math.cos(s0.site.yaw);
log('site', JSON.stringify(s0.site), 'cust', JSON.stringify(s0.customer));
const rows = [];
for (const [nm, ang] of [['a0', 0], ['a+30', 0.5], ['a-30', -0.5], ['a+60', 1.0], ['a-60', -1.0]]) {
  const a = s0.site.yaw + ang;
  const x = s0.customer[0] + Math.sin(a) * 9, z = s0.customer[2] + Math.cos(a) * 9;
  await page.evaluate(([x, z, tx, tz]) => { const rg = window.__rg; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.4, z, Math.atan2(tx - x, tz - z)); rg.step(1 / 60, 60, false); }, [x, z, s0.customer[0], s0.customer[2]]);
  await H.snap(`scoops9d/${nm}-start`);
  const w = await H.walkTo(s0.customer[0], s0.customer[2], 12, 0.8);
  const pr = await H.ui();
  await H.snap(`scoops9d/${nm}-end`);
  rows.push(`${nm} start=${x.toFixed(1)},${z.toFixed(1)} ${JSON.stringify(w)} prompt=${pr.some((u) => u.startsWith('prompt'))}`);
}
log(rows.join('\n'));
