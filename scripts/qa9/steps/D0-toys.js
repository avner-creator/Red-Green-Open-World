// Island toys: for one toy of each kind, start 6 m away and hold W straight through it (2 sides). Log min distance to its
// centre (pass-through if < 0.4 * r), max height (mushroom launch), end position (launched out of the world?).
const toys = await page.evaluate(() => window.__rgToys.toys.map((t, i) => ({ i, kind: t.kind, x: t.x, y: t.y, z: t.z, top: t.top })));
const counts = {};
for (const t of toys) counts[t.kind] = (counts[t.kind] ?? 0) + 1;
log('toys', toys.length, JSON.stringify(counts), 'live keys', await page.evaluate(() => Object.keys(window.__rgToys.live)));
const R = { mushroom: 1.3, duck: 1.0, pinwheel: 0.6, ball: 1.0, spring: 0.6 };
const out = [];
for (const kind of ['mushroom', 'duck', 'pinwheel', 'ball', 'spring']) {
  const t = toys.find((x) => x.kind === kind);
  if (!t) continue;
  for (const ang of [0, 2.1]) {
    const sx = t.x + Math.sin(ang) * 6;
    const sz = t.z + Math.cos(ang) * 6;
    await page.evaluate(([x, z, yaw]) => window.__rg.teleport(x, window.__rg.ctx.world.heightAt(x, z) + 0.3, z, yaw), [sx, sz, Math.atan2(t.x - sx, t.z - sz)]);
    await st(40, false);
    let minD = 99;
    let maxY = -99;
    await page.keyboard.down('KeyW');
    for (let k = 0; k < 24; k++) {
      await st(5, false);
      const p = (await H.s()).p;
      minD = Math.min(minD, Math.hypot(p[0] - t.x, p[2] - t.z));
      maxY = Math.max(maxY, p[1] - t.y);
      if (k === 10) await H.snap('toy/' + kind + '-' + ang);
    }
    await page.keyboard.up('KeyW');
    await st(60, false);
    const p = (await H.s()).p;
    out.push({ kind, ang, minD: +minD.toFixed(2), r: R[kind], passThrough: minD < 0.4 * R[kind], maxY: +maxY.toFixed(1), end: p, endFromToy: +Math.hypot(p[0] - t.x, p[2] - t.z).toFixed(1) });
  }
}
for (const o of out) log(JSON.stringify(o));
