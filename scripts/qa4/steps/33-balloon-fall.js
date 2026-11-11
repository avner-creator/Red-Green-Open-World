const R = [124, 22];
log('start', await H.s());
await tap('Space', 5);
const fall = [];
await page.keyboard.down('KeyW');
let chute = false;
for (let j = 0; j < 80; j++) {
  await st(30, j % 6 === 0);
  const s = await H.s();
  fall.push(`${s.p.map((n) => n.toFixed(0)).join(',')}:${s.mode[0]}`);
  if (j % 6 === 0) await H.snap(`a/balloon2/fall-${j}`);
  if (!chute && s.p[1] < 100 && s.p[1] < 180) { await tap('Space', 1); chute = true; await page.keyboard.up('KeyW'); fall.push('CHUTE'); }
  if (s.mode === 'walk') break;
}
await page.keyboard.up('KeyW');
await H.snap('a/balloon2/touchdown');
await st(90);
await H.snap('a/balloon2/landed');
const s = await H.s();
log('fall', fall.join(' '));
log('landed', s, 'dist to rings', H.dist(s.p, [R[0], 0, R[1]]).toFixed(1), await H.ui());
