// Race end flow (autopilot for the laps only, to see the finish, podium and result screens).
const booth = (await page.evaluate(() => window.__rg.interactables())).find((i) => i.id === 'race-booth');
if ((await H.s()).mode !== 'walk') { await page.keyboard.press('KeyE'); await st(40); }
await H.near(booth.position[0], booth.position[2], 8, 1.2);
log('walk', await H.walkTo(booth.position[0], booth.position[2], 10, 1.8));
log('ui before E', await H.ui());
await page.keyboard.press('KeyE');
await st(20);
await page.evaluate(() => window.__rgRace.autopilot(true));
let t = 0;
let ph = '';
const seen = [];
while (t < 220) {
  await st(60, false);
  t += 1;
  const R = await page.evaluate(() => window.__rgRace.state());
  if (R.phase !== ph) { ph = R.phase; seen.push([t, ph, R.place]); }
  if (ph === 'finish' || ph === 'podium' || ph === 'result') {
    await H.snap('r2/' + ph + '-' + String(t).padStart(3, '0'));
  }
  if (ph === 'idle' && t > 30) break;
}
await page.evaluate(() => window.__rgRace.autopilot(false));
log(JSON.stringify(seen), await H.ui(), JSON.stringify(await H.s()));
await H.snap('r2/zz-after');
