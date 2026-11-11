// Item 3: walk to the balloon basket, press E, ride up, jump (Space), steer the freefall toward the
// landing rings (W), open the chute (Space), glide (W), land.
const B = [84, 64];
const R = [124, 22];
await H.near(B[0], B[1], 12, -Math.PI / 2);
await H.snap('a/balloon/00');
let k = 0;
const tr = [];
const ints = await page.evaluate(() => window.__rg.interactables().filter((t) => /ball/i.test(t.id)).map((t) => `${t.id}@${t.position.map((n) => n.toFixed(0))}`));
log('interactables', ints);
await hold(['KeyW'], 90, 15, async (s) => { tr.push(`${s.playerPosition.map((n) => n.toFixed(0)).join(',')}`); if (k++ % 2 === 0) await H.snap(`a/balloon/w${k}`); });
log('walk', tr.join(' '), await H.ui());
const w0 = (await H.s()).wallet;
await tap('KeyE', 10);
await H.snap('a/balloon/after-E');
log('after E', await H.s(), await H.ui());
// ride up
const up = [];
for (let j = 0; j < 30; j++) {
  await st(60, j % 3 === 0);
  const s = await H.s();
  up.push(`${s.p[1].toFixed(0)}:${s.mode}`);
  if (j % 3 === 0) await H.snap(`a/balloon/up-${j}`);
  if (s.p[1] > 180) break;
}
log('ascent', up.join(' '), 'wallet', w0, '->', (await H.s()).wallet);
await tap('Space', 5);
// steer toward the rings: face by pressing W (camera relative); log path
const fall = [];
await page.keyboard.down('KeyW');
let chute = false;
for (let j = 0; j < 60; j++) {
  await st(30, j % 4 === 0);
  const s = await H.s();
  fall.push(`${s.p.map((n) => n.toFixed(0)).join(',')}`);
  if (j % 4 === 0) await H.snap(`a/balloon/fall-${j}`);
  const agl = s.p[1] - (await page.evaluate(([x, z]) => window.__rg.ctx.world.heightAt(x, z), [s.p[0], s.p[2]]));
  if (!chute && agl < 90) { await tap('Space', 1); chute = true; fall.push('CHUTE'); }
  if (s.mode === 'walk') break;
}
await page.keyboard.up('KeyW');
await st(120);
await H.snap('a/balloon/landed');
const s = await H.s();
log('fall', fall.join(' '));
log('landed', s, 'distance to ring centre', H.dist(s.p, [R[0], 0, R[1]]).toFixed(1), await H.ui());
