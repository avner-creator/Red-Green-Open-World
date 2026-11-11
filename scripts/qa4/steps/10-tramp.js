// Item 1: walk onto the trampoline, hold jump for the giant bounce, do a trick, walk off.
const T = [58, -24];
await H.near(T[0], T[1], 24, -Math.PI / 2); // from the west (plaza side)
await st(1);
await H.snap('a/tramp/00-approach');
let maxY = 0;
let i = 0;
// walk in
await hold(['KeyW'], 240, 30, async (s) => {
  maxY = Math.max(maxY, s.playerPosition[1]);
  if (i++ % 2 === 0) await H.snap(`a/tramp/walk-${i}`);
});
log('after walk', await H.s(), 'maxY', maxY.toFixed(1), await H.ui());
// hold Space for the giant bounce (~12 s), sampling apex
const ys = [];
await page.keyboard.down('Space');
for (let k = 0; k < 14; k++) {
  await st(60, k % 2 === 0);
  const s = await H.s();
  ys.push(`${s.p[1].toFixed(0)}:${s.mode}`);
  if (k % 2 === 0) await H.snap(`a/tramp/hold-${k}`);
}
await page.keyboard.up('Space');
log('hold space', ys.join(' '));
// trick: hold A + W while in the air
const tr = [];
await hold(['KeyA', 'KeyW'], 120, 30, async (s, f) => { tr.push(s.playerPosition[1].toFixed(0)); await H.snap(`a/tramp/trick-${f}`); });
log('trick ys', tr.join(' '), await H.ui());
const stars = await page.evaluate(() => document.body.innerText.match(/\d+/g)?.slice(0, 8));
log('nums', stars);
// let it decay, then walk off east
const dec = [];
for (let k = 0; k < 10; k++) { await st(60, false); const s = await H.s(); dec.push(s.p[1].toFixed(0)); }
log('decay', dec.join(' '));
await hold(['KeyW'], 240, 60);
log('walk off', await H.s());
await H.snap('a/tramp/zz-off');
log('errors', errors.length, errors.slice(-5));
