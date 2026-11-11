// Item 2: rocket pads. Walk onto a pad three times: first (free), with 0 gems, then paid.
const pads = await page.evaluate(() => {
  const o = [];
  window.__rg.ctx.scene.traverse((x) => { if (/rocket|pad/i.test(x.name) && x.name.length < 40) o.push(`${x.name}@${x.getWorldPosition(new x.position.constructor()).toArray().map((n) => n.toFixed(0))}`); });
  return o.slice(0, 20);
});
log('pad objects', pads);
const A = [80, 24];
const run = async (tag) => {
  await H.near(A[0], A[1], 12, Math.PI / 2 + 0.3);
  const w0 = (await H.s()).wallet;
  await H.snap(`a/rocket/${tag}-0`);
  const tr = [];
  let k = 0;
  await hold(['KeyW'], 150, 15, async (s) => { tr.push(`${s.playerPosition.map((n) => n.toFixed(0)).join(',')}:${s.playerMode}`); if (k++ % 3 === 0) await H.snap(`a/rocket/${tag}-w${k}`); });
  log(tag, 'walk', tr.join(' '), await H.ui());
  const fl = [];
  for (let j = 0; j < 12; j++) { await st(45, j % 2 === 0); const s = await H.s(); fl.push(`${s.p.map((n) => n.toFixed(0)).join(',')}:${s.mode}`); if (j % 2 === 0) await H.snap(`a/rocket/${tag}-f${j}`); }
  const s = await H.s();
  log(tag, 'flight', fl.join(' '), 'wallet', w0, '->', s.wallet, await H.ui());
};
await run('1-first');
// 0 gems: empty the wallet (test setup, not gameplay)
await page.evaluate(() => { const p = window.__rg.ctx.profile; p.spend(p.wallet, 'test'); });
await run('2-zero');
await page.evaluate(() => window.__rg.ctx.profile.earn(20, 'test'));
await run('3-paid');
