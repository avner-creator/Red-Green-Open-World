// QA6 C: head orientation after landing from a jump and after a fall, for 3 heroes. Close camera shots
// from behind and the side; logs the head bone's yaw relative to the body.
const heroes = globalThis.QA_HEROES ?? ['frog', 'fox', 'panda'];
const headYaw = () => page.evaluate(() => {
  const pl = window.__rg.ctx.player;
  const root = pl.object;
  let head = null;
  root.traverse((o) => { if (!head && /head/i.test(o.name) && (o.isBone || o.type === 'Bone' || o.isObject3D)) head = o; });
  if (!head) return null;
  const Q = root.quaternion.constructor;
  const qb = new Q(); root.getWorldQuaternion(qb);
  const qh = new Q(); head.getWorldQuaternion(qh);
  const rel = qb.clone().invert().multiply(qh);
  const V = root.position.constructor;
  const f = new V(0, 0, 1).applyQuaternion(rel);
  return { name: head.name, yawDeg: Math.round((Math.atan2(f.x, f.z) * 180) / Math.PI), pitchDeg: Math.round((Math.asin(Math.max(-1, Math.min(1, f.y))) * 180) / Math.PI) };
});
const out = [];
for (const h of heroes) {
  await page.evaluate((h) => { const p = window.__rg.ctx.profile; try { p.unlock?.(h, 'starter'); } catch {} p.equip('character', h); }, h);
  await st(120);
  // flat open spot: plaza north-west lawn
  const X = -10, Z = 20;
  await page.evaluate(([x, z]) => window.__rg.teleport(x, window.__rg.ctx.world.heightAt(x, z) + 0.2, z, 0), [X, Z]);
  await st(90);
  out.push([h, 'idle', await headYaw()]);
  // jump while walking forward
  await page.keyboard.down('KeyW');
  await page.keyboard.press('Space');
  await st(20, false);
  await page.keyboard.up('KeyW');
  await st(40, false);
  out.push([h, 'jump+0.7s', await headYaw()]);
  await page.evaluate(() => window.__rg.render());
  await H.snap(`heads/${h}-jump-land`);
  await st(60, false);
  out.push([h, 'jump+1.7s', await headYaw()]);
  await H.snap(`heads/${h}-jump-land-1s`);
  // fall from 12 m
  await page.evaluate(([x, z]) => window.__rg.teleport(x, window.__rg.ctx.world.heightAt(x, z) + 12, z, 0.5), [X + 4, Z]);
  for (let i = 0; i < 8; i++) { await st(10, false); }
  out.push([h, 'fall+1.3s', await headYaw(), (await H.s()).mode]);
  await st(40, false);
  out.push([h, 'fall+2s', await headYaw(), (await H.s()).mode]);
  await H.snap(`heads/${h}-fall-land`);
  await st(120, false);
  out.push([h, 'fall+4s', await headYaw(), (await H.s()).mode]);
  await H.snap(`heads/${h}-fall-4s`);
}
log(out.map((r) => JSON.stringify(r)).join('\n'));
await page.evaluate(() => window.__rg.ctx.profile.equip('character', 'frog'));
