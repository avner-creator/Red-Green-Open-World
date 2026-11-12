// QA7 B: weave 'boost' during a race: start the race at the booth (E), hold W (autopilot steering off; the
// race autopilot only steers), log boost debug, channel check when its ring is attached; 'hero' debug too.
const W = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses.weave[fn](...a), [fn, a]);
if ((await H.s()).mode !== 'walk') await tap('KeyE', 60);
const booth = (await page.evaluate(() => window.__rg.interactables())).find((i) => i.id === 'race-booth');
await H.near(booth.position[0], booth.position[2], 6, 1.2);
await H.walkTo(booth.position[0], booth.position[2], 10, 1.8);
await tap('KeyE', 20);
await page.evaluate(() => window.__rgRace.autopilot(true));
const tl = [];
let sepped = false;
for (let i = 0; i < 120; i++) {
  await st(30, false);
  const d = await W('debug', 'boost');
  if (i % 10 === 0) tl.push(`${i / 2} ${JSON.stringify(d).slice(0, 200)}`);
  if (!sepped && (d.ringAttached || d.flashAttached || d.faceAttached)) { sepped = true; tl.push('sep ' + JSON.stringify(await H.sep('weave/boost-sep'))); await H.snap('weave/boost'); }
  const r = await page.evaluate(() => window.__rgRace.state());
  if (r.phase === 'result' || r.phase === 'idle') { tl.push(`race ${r.phase} place ${r.place}`); break; }
}
await page.evaluate(() => window.__rgRace.autopilot(false));
const d = await W('debug', 'boost');
log(tl.join('\n'), '\nboost final', JSON.stringify(d).slice(0, 400), '\nhero', JSON.stringify(await W('debug', 'hero')).slice(0, 300));
