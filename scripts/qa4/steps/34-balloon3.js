// Item 3, child who lets go of W after the chute opens.
const R = [124, 22];
await H.near(84, 64, 12, -Math.PI / 2);
await hold(['KeyW'], 95, 95);
log('at basket', await H.s(), await H.ui());
await tap('KeyE', 10);
log('after E', await H.s());
for (let j = 0; j < 40; j++) {
  await st(30, false);
  const s = await H.s();
  if (s.p[1] > 189.5) break;
}
await st(30, false);
await tap('Space', 5);
const fall = [];
await page.keyboard.down('KeyW');
let chute = false;
for (let j = 0; j < 90; j++) {
  await st(30, j % 6 === 0);
  const s = await H.s();
  fall.push(`${s.p.map((n) => n.toFixed(0)).join(',')}:${s.mode[0]}`);
  if (j % 6 === 0) await H.snap(`a/balloon3/fall-${j}`);
  if (!chute && s.p[1] < 100) { await tap('Space', 1); chute = true; await page.keyboard.up('KeyW'); fall.push('CHUTE'); }
  if (s.mode === 'walk') break;
}
await page.keyboard.up('KeyW');
await H.snap('a/balloon3/touchdown');
await st(90);
await H.snap('a/balloon3/landed');
const s = await H.s();
log('fall', fall.join(' '));
log('landed', s, 'dist to rings', H.dist(s.p, [R[0], 0, R[1]]).toFixed(1), await H.ui());
