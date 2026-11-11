// Foam course: walk to the booth, E, then (a) 8 s of a child holding W only, (b) the game's autopilot for two laps; screenshots every 3 s.
const F = () => page.evaluate(() => ({ phase: window.__rgFoam.phase(), last: window.__rgFoam.lastResult() }));
const b = await page.evaluate(() => window.__rgFoam.booth());
log('booth', b, 'cam-hero dist before', await page.evaluate(() => window.__rg.ctx.camera.position.distanceTo(window.__rg.ctx.player.object.position)));
await H.near(b[0], b[2], 10, Math.PI / 2);
log('walk', await H.walkTo(b[0], b[2], 10, 1.6));
log('ui', await H.ui());
await H.snap('foam/00-booth');
await page.keyboard.press('KeyE');
await st(30);
log('after E', JSON.stringify(await F()), (await H.s()).mode);
await H.snap('foam/01-start');
await page.keyboard.down('KeyW');
for (let i = 0; i < 4; i++) { await st(120, false); await H.snap('foam/w' + i); log('holdW', JSON.stringify(await F()), JSON.stringify((await H.s()).p)); }
await page.keyboard.up('KeyW');
await page.evaluate(() => window.__rgFoam.autopilot('main'));
let t = 0;
let ph = '';
while (t < 150) {
  await st(90, false);
  t += 1.5;
  const f = await F();
  if (f.phase !== ph) { ph = f.phase; log('phase', t, ph, JSON.stringify(await H.ui()).slice(0, 200)); }
  if (Math.round(t / 1.5) % 3 === 0) await H.snap('foam/a' + String(Math.round(t)).padStart(3, '0'));
  if (f.phase === 'result' || f.phase === 'idle') break;
}
await page.evaluate(() => window.__rgFoam.autopilot(null));
log('final', JSON.stringify(await F()), (await H.s()).wallet);
await H.snap('foam/99-result');
