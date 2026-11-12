// QA6 B: foam course second try: leave the stuck run with R, then E at the booth, NO keys during the countdown,
// then hold W + tap Space; log position; then check whether the run ever ends by itself.
const F = () => page.evaluate(() => ({ phase: window.__rgFoam.phase(), last: window.__rgFoam.lastResult() }));
log('before', JSON.stringify(await F()), await H.s());
await page.keyboard.press('KeyR');
await st(90);
log('after R', JSON.stringify(await F()), await H.s());
await H.snap('foam2/00-after-R');
const b = await page.evaluate(() => window.__rgFoam.booth());
await H.near(b[0], b[2], 8, Math.PI / 2);
log('walk', await H.walkTo(b[0], b[2], 10, 1.6));
await page.keyboard.press('KeyE');
const tl = [];
for (let i = 0; i < 12; i++) { await st(30, false); const f = await F(); tl.push(['cd', i / 2, f.phase, (await H.s()).p]); if (f.phase === 'run') break; }
await H.snap('foam2/01-go');
await page.keyboard.down('KeyW');
let lastP = null;
for (let i = 0; i < 90; i++) {
  await st(60, false);
  if (i % 2 === 0) await page.keyboard.press('Space');
  const f = await F();
  const p = (await H.s()).p;
  tl.push([i, f.phase, p, await page.evaluate(() => document.querySelector('[data-testid="foamlava-hud"]')?.textContent?.slice(0, 20))]);
  if (i % 10 === 0) await H.snap('foam2/r' + String(i).padStart(2, '0'));
  if (f.phase !== 'run') break;
  lastP = p;
}
await page.keyboard.up('KeyW');
log(tl.map((x) => JSON.stringify(x)).join('\n'));
log('final', JSON.stringify(await F()), await H.ui());
await H.snap('foam2/99-end');
