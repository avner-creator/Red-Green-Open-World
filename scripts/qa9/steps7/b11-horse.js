// QA7 B: horse ride. Leave the buggy (E), walk to the horse, E, ride 40 s (W, sprint, turns, jump), E off.
if ((await H.s()).mode !== 'walk') { await tap('KeyE', 60); }
const h = await page.evaluate(() => { const v = window.__rg.ctx.vehicles.all.find((x) => x.kind === 'horse'); return v.position.toArray(); });
await H.near(h[0], h[2], 10, 1.0);
await H.snap('horse/00-near');
log('walk', JSON.stringify(await H.walkTo(h[0], h[2], 10, 1.6)), await H.ui());
await tap('KeyE', 60);
log('after E', await H.s());
await H.snap('horse/01-on');
const plan = [[['KeyW'], 5], [['KeyW', 'ShiftLeft'], 5], [['KeyW', 'KeyD'], 3], [['KeyW'], 5], [['KeyW', 'Space'], 1], [['KeyW', 'KeyA'], 4], [['KeyW', 'ShiftLeft'], 8], [['KeyS'], 2], [['KeyW'], 7]];
const tr = [];
let t = 0;
for (const [keys, secs] of plan) {
  for (const k of keys) await page.keyboard.down(k);
  for (let s = 0; s < secs; s += 0.5) {
    await st(30, false); t += 0.5;
    const s1 = await H.s();
    tr.push([t, s1.p[0], s1.p[2], s1.mode]);
    if (t % 5 === 0) await H.snap(`horse/ride-${String(t).padStart(3, '0')}`);
  }
  for (const k of keys) await page.keyboard.up(k);
}
log('track', JSON.stringify(tr.filter((_, i) => i % 4 === 0)));
let dist = 0; for (let i = 1; i < tr.length; i++) dist += Math.hypot(tr[i][1] - tr[i - 1][1], tr[i][2] - tr[i - 1][2]);
log('distance', dist.toFixed(1), 'sep', JSON.stringify(await H.sep('horse/sep')));
await tap('KeyE', 60);
log('after E off', await H.s(), await page.evaluate(() => window.__rg.audioLoops()));
await H.snap('horse/02-off');
