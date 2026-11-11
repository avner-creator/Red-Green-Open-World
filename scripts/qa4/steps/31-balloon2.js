// Item 3 second ride (paid): press Space when the jump prompt shows, steer with W in freefall,
// let go after the chute opens (a child aiming at the rings below).
const R = [124, 22];
await H.near(84, 64, 6, -Math.PI / 2);
await hold(['KeyW'], 20, 20);
const w0 = (await H.s()).wallet;
await tap('KeyE', 10);
let topAt = -1;
for (let j = 0; j < 40; j++) {
  await st(30, false);
  const s = await H.s();
  const ui = await H.ui();
  if (s.p[1] > 188) { topAt = j; break; }
}
await st(30, false);
await tap('Space', 5);
const after = await H.s();
log('wallet', w0, '->', after.wallet, 'top chunk', topAt, 'after space y', after.p[1]);
const fall = [];
await page.keyboard.down('KeyW');
let chute = false;
for (let j = 0; j < 80; j++) {
  await st(30, j % 6 === 0);
  const s = await H.s();
  fall.push(`${s.p.map((n) => n.toFixed(0)).join(',')}:${s.mode}`);
  if (j % 6 === 0) await H.snap(`a/balloon2/fall-${j}`);
  if (!chute && s.p[1] < 100) { await tap('Space', 1); chute = true; await page.keyboard.up('KeyW'); fall.push('CHUTE'); }
  if (s.mode === 'walk') break;
}
await page.keyboard.up('KeyW');
await H.snap('a/balloon2/touchdown');
await st(90);
await H.snap('a/balloon2/landed');
const s = await H.s();
log('fall', fall.join(' '));
log('landed', s, 'dist to rings', H.dist(s.p, [R[0], 0, R[1]]).toFixed(1), await H.ui());
