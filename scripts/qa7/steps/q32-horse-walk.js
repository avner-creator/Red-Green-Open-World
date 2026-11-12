// QA6: walk into the horse from the front (yaw+0) and from behind (yaw+180), snapshots while walking.
const v = await page.evaluate(() => { const v = window.__rg.ctx.vehicles.all.find((x) => x.kind === 'horse'); const q = v.object.quaternion; return { p: v.position.toArray(), yaw: Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y)) }; });
for (const k of [0, 2, 4]) {
  const ang = v.yaw + (k * Math.PI) / 4;
  const sx = v.p[0] + Math.sin(ang) * 6, sz = v.p[2] + Math.cos(ang) * 6;
  await page.evaluate(([x, z, yaw]) => window.__rg.teleport(x, window.__rg.ctx.world.heightAt(x, z) + 0.3, z, yaw), [sx, sz, Math.atan2(v.p[0] - sx, v.p[2] - sz)]);
  await st(40);
  await H.snap(`pk/hw-${k}-a`);
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 6; i++) await st(20, false);
  await page.keyboard.up('KeyW');
  await st(5);
  const p = await page.evaluate(() => window.__rg.state().playerPosition);
  log(k, 'hero', p.map((n) => +n.toFixed(2)), 'horse', v.p.map((n) => +n.toFixed(2)), 'd', Math.hypot(p[0] - v.p[0], p[2] - v.p[2]).toFixed(2));
  await H.snap(`pk/hw-${k}-b`);
}
