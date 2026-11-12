const P = (await page.evaluate(() => window.__rgSecrets.info())).paths[1];
const S = P.stones; const t = S[S.length - 1]; const ped = P.pedestal;
log('last stone', JSON.stringify(t), 'ped', JSON.stringify(ped));
await page.evaluate(([x, y, z, tx, tz]) => { const rg = window.__rg; rg.teleport(x, y + 0.3, z, Math.atan2(tx - x, tz - z)); rg.step(1 / 60, 40, false); }, [t[0], t[1], t[2], ped[0], ped[2]]);
await H.snap('paths9/ped-0');
for (let k = 0; k < 4; k++) {
  await page.keyboard.down('Space'); await page.keyboard.down('KeyW');
  await st(8, false); await page.keyboard.up('Space');
  await st(30, false); await page.keyboard.up('KeyW'); await st(40, false);
  const s = await H.s();
  const c = (await page.evaluate(() => window.__rgSecrets.info())).paths[1].claimed;
  log('try', k, JSON.stringify(s.p), 'claimed', c);
  if (c) break;
}
await H.snap('paths9/ped-1');
