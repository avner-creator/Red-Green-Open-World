// QA6 A M6: walk (sprint, real W) into the parked buggy and the parked horse from 8 directions.
// Record the hero's closest approach to the vehicle centre and whether E mounted by accident.
if ((await H.s()).mode !== 'walk') { await page.keyboard.press('KeyR'); await st(60); }
const out = [];
for (const kind of ['car', 'horse']) {
  const v = await page.evaluate((k) => { const v = window.__rg.ctx.vehicles.all.find((x) => x.kind === k); const q = v.object.quaternion; return { p: v.position.toArray(), yaw: Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y)) }; }, kind);
  for (let k = 0; k < 8; k++) {
    const ang = v.yaw + (k * Math.PI) / 4;
    const d = 6;
    const sx = v.p[0] + Math.sin(ang) * d, sz = v.p[2] + Math.cos(ang) * d;
    await page.evaluate(([x, z, yaw]) => window.__rg.teleport(x, window.__rg.ctx.world.heightAt(x, z) + 0.3, z, yaw), [sx, sz, Math.atan2(v.p[0] - sx, v.p[2] - sz)]);
    await st(40, false);
    let minD = 99;
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    for (let i = 0; i < 14; i++) {
      await st(10, false);
      const p = await page.evaluate(() => window.__rg.state().playerPosition);
      minD = Math.min(minD, Math.hypot(p[0] - v.p[0], p[2] - v.p[2]));
    }
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    const now = await page.evaluate((k) => window.__rg.ctx.vehicles.all.find((x) => x.kind === k).position.toArray(), kind);
    const moved = Math.hypot(now[0] - v.p[0], now[2] - v.p[2]);
    const mode = (await H.s()).mode;
    if (k === 4 || minD < 0.9) await H.snap(`pk/${kind}-${k * 45}`);
    out.push([kind, k * 45, +minD.toFixed(2), +moved.toFixed(2), mode]);
    v.p = now;
  }
}
log(JSON.stringify(out));
