// QA8: repro attempt: horse parked next to the foam start ring, child walks onto the ring from the east (W held), taps Space.
await st(60 * 60, false); // let any run finish
for (let i = 0; i < 4 && (await page.evaluate(() => window.__rgFoam.phase())) !== 'idle'; i++) { await page.keyboard.press('KeyR'); await st(120, false); }
for (let i = 0; i < 4 && (await H.s()).mode !== 'walk'; i++) { await page.keyboard.press('KeyE'); await st(60, false); }
const pad = await page.evaluate(() => window.__rgFoam.pad().at);
const hp0 = await page.evaluate(() => window.__rg.ctx.vehicles.all.find((x) => x.kind === 'horse').position.toArray());
log('foam', await page.evaluate(() => window.__rgFoam.phase()), 'horse', hp0, 'pad', pad);
// mount the horse and ride it to 1.6 m east of the ring, get off
log(await H.walkTo(hp0[0], hp0[2], 8, 1.6));
await tap('KeyE', 60);
log('mode', (await H.s()).mode);
log('ride', await H.walkTo(pad[0] + 1.8, pad[2], 10, 0.8));
await tap('KeyE', 60);
log('off', (await H.s()).mode, 'horse now', await page.evaluate(() => window.__rg.ctx.vehicles.all.find((x) => x.kind === 'horse').position.toArray().map((v) => +v.toFixed(1))));
await H.near(pad[0], pad[2], 9, Math.PI / 2);
const w = await H.walkTo(pad[0], pad[2], 10, 0.4);
log('walk', w, await page.evaluate(() => window.__rgFoam.phase()));
await page.keyboard.press('KeyE');
await page.keyboard.down('KeyW');
let still = 0, prev = null, maxStill = 0;
const tl = [];
for (let i = 0; i < 60; i++) {
  await st(30, false);
  if (i % 2 === 0) await page.keyboard.press('Space');
  const s = await H.s();
  const ph = await page.evaluate(() => window.__rgFoam.phase());
  if (prev && Math.hypot(s.p[0] - prev[0], s.p[2] - prev[2]) < 0.05) { still += 0.5; maxStill = Math.max(maxStill, still); } else still = 0;
  prev = s.p;
  if (i % 6 === 0) tl.push(`${i / 2} ${ph} ${s.mode} ${s.p.join(',')}`);
  if (i === 20) await H.snap('foam3/t10');
}
await page.keyboard.up('KeyW');
log(tl.join('\n'), '\nmaxStill', maxStill);
