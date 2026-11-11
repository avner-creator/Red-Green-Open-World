// Trampoline with surprises on: walk onto the mat, hold Space ~25 s, log surprises, screenshots every 1 s; then floppy (flop key) look.
await page.evaluate(() => window.__rgTramp.setSurprises(true));
await H.near(58, -24, 12, Math.PI / 2);
log('walk', await H.walkTo(58, -24, 12, 1.0));
const seen = [];
await page.keyboard.down('Space');
for (let i = 0; i < 26; i++) {
  await st(60, false);
  const t = await page.evaluate(() => ({ s: window.__rgTramp.surprise ? JSON.stringify(window.__rgTramp.surprise).slice(0, 80) : null, sc: window.__rgTramp.superCount, bs: window.__rgTramp.bonusStars, y: +window.__rg.state().playerPosition[1].toFixed(1), m: window.__rg.state().playerMode }));
  seen.push([i, t.y, t.m, t.s, t.sc, t.bs]);
  await H.snap('tr/t' + String(i).padStart(2, '0'));
}
await page.keyboard.up('Space');
await st(120);
log(seen.map((x) => JSON.stringify(x)).join('\n'));
// floppy: what key? try the flop control (F on desktop? check help card) -> G
for (const k of ['KeyF', 'KeyG', 'KeyX']) {
  await page.keyboard.press(k);
  await st(20);
  log('after', k, (await H.s()).mode);
}
await H.snap('tr/flop');
