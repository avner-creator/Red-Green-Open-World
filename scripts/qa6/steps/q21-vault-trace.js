// QA6 A M5 detail: trace hero door-local position + presses for 1->2 and 3->0.
const info = () => page.evaluate(() => window.__rgSecrets.info());
const d = (await info()).doors.find((x) => /village/.test(x.id));
const loc = (p) => { const dx = p[0] - d.x, dz = p[2] - d.z; const c = Math.cos(d.yaw), s = Math.sin(d.yaw); return [+(dx * c - dz * s).toFixed(2), +(dx * s + dz * c).toFixed(2)]; };
for (const [i, j] of [[1, 2], [3, 0]]) {
  await page.evaluate(([x, z, yaw]) => window.__rg.teleport(x, window.__rg.ctx.world.heightAt(x, z) + 0.3, z, yaw), [d.pads[i][0], d.pads[i][1], Math.atan2(d.pads[j][0] - d.pads[i][0], d.pads[j][1] - d.pads[i][1])]);
  await st(60, false);
  const n0 = await page.evaluate(() => window.__qaPress.length);
  const tr = [];
  const tx = d.pads[j][0], tz = d.pads[j][1];
  // walk with W only toward target, stepping in 5-frame chunks so we see each position
  for (let t = 0; t < 120; t++) {
    const s = await page.evaluate(([x, z]) => { const ctx = window.__rg.ctx; const hp = window.__rg.state().playerPosition; const f = ctx.camera.getWorldDirection(new ctx.camera.position.constructor()); return { hp, f: [f.x, f.z], d: Math.hypot(x - hp[0], z - hp[2]) }; }, [tx, tz]);
    if (s.d < 0.3) break;
    const dx = tx - s.hp[0], dz = tz - s.hp[2];
    const fl = Math.hypot(...s.f); const fx = s.f[0] / fl, fz = s.f[1] / fl;
    const fwd = (dx * fx + dz * fz) / s.d, right = (dx * -fz + dz * fx) / s.d;
    const keys = [];
    if (fwd > 0.38) keys.push('KeyW'); if (fwd < -0.38) keys.push('KeyS'); if (right > 0.38) keys.push('KeyD'); if (right < -0.38) keys.push('KeyA');
    for (const k of keys) await page.keyboard.down(k);
    await st(5, false);
    for (const k of keys) await page.keyboard.up(k);
    const n = await page.evaluate(() => window.__qaPress.length);
    tr.push([t, loc(s.hp), keys.join('+'), n - n0]);
  }
  await st(30, false);
  log(`${i}->${j}`, JSON.stringify(tr));
  await H.snap(`v6/trace-${i}${j}`);
}
