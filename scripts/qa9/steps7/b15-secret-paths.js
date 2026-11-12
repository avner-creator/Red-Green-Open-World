// QA7 B: two secret paths. Arrive 8 m from the start sign, walk to the start, then hop stone to stone
// (walk + Space when the next stone is higher or > 2 m away) to the pedestal; log claim; channel check.
const I = () => page.evaluate(() => window.__rgSecrets.info());
const info = await I();
log('paths', JSON.stringify(info.paths.map((p) => ({ id: p.id, start: p.start.map((v) => +v.toFixed(1)), n: p.stones.length, ped: p.pedestal.map((v) => +v.toFixed(1)), claimed: p.claimed }))));
for (const k of globalThis.QA_PATHS ?? [0, 1]) {
  const p = (await I()).paths[k];
  await H.near(p.start[0], p.start[1], 8, 0.4);
  await H.snap(`sp/${k}-00-near-start`);
  log(k, 'to start', JSON.stringify(await H.walkTo(p.start[0], p.start[1], 10, 0.8)));
  log(k, 'sep at start', JSON.stringify(await H.sep(`sp/${k}-sep-start`)));
  let falls = 0;
  for (let i = 0; i < p.stones.length; i++) {
    const s = p.stones[i];
    const hp = (await H.s()).p;
    const far = Math.hypot(s[0] - hp[0], s[2] - hp[2]) > 1.6 || s[1] > hp[1] + 0.3;
    if (far) await page.keyboard.down('Space');
    const w = await H.walkTo(s[0], s[2], 4, Math.max(0.4, s[3] * 0.6));
    await page.keyboard.up('Space');
    await st(10, false);
    const y = (await H.s()).p[1];
    if (y < s[1] - 1.5) falls++;
    if (i === Math.floor(p.stones.length / 2)) await H.snap(`sp/${k}-01-mid`);
  }
  log(k, 'to pedestal', JSON.stringify(await H.walkTo(p.pedestal[0], p.pedestal[2], 6, 0.6)));
  await tap('KeyE', 60);
  await st(60, false);
  const p2 = (await I()).paths[k];
  log(k, 'claimed', p2.claimed, 'falls', falls, 'wallet', (await H.s()).wallet, await H.ui());
  await H.snap(`sp/${k}-02-end`);
}
