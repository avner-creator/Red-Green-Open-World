globalThis.QA_FOAM_MODE='fall';
// QA7 A: foam course. Child walks onto the start ring (real W), keeps W held through the countdown,
// taps Space every second. QA_FOAM_MODE='fall' = never jump, only W (always falls into the foam).
const mode = globalThis.QA_FOAM_MODE ?? 'jump';
const F = () => page.evaluate(() => ({ phase: window.__rgFoam.phase(), last: window.__rgFoam.lastResult(), pad: window.__rgFoam.pad().fill }));
const pad = await page.evaluate(() => window.__rgFoam.pad().at);
await H.near(pad[0], pad[2], 9, Math.PI / 2);
await H.snap(`foam-${mode}/00-approach`);
log('ui approach', await H.ui());
const w = await H.walkTo(pad[0], pad[2], 10, 0.4);
log('walk', w, JSON.stringify(await F()));
await st(10,false);
await page.keyboard.press('KeyE');
await st(4,false);
log('after E', JSON.stringify(await F()));
await page.keyboard.down('KeyW');
const tl = [];
let gt = 0, last = '', tEnd = null, stillT = 0, prevP = null, maxStill = 0;
for (let i = 0; i < 260; i++) {
  await st(30, false); gt += 0.5;
  if (mode === 'jump' && i % 2 === 0) await page.keyboard.press('Space');
  const f = await F();
  const s = await H.s();
  if (prevP && Math.hypot(s.p[0] - prevP[0], s.p[2] - prevP[2]) < 0.05) { stillT += 0.5; maxStill = Math.max(maxStill, stillT); } else stillT = 0;
  prevP = s.p;
  const k = `${f.phase}/${s.mode}`;
  if (k !== last) { tl.push([gt, k, s.p]); last = k; }
  if (i % 20 === 0) { await H.snap(`foam-${mode}/t${String(gt).padStart(5, '0')}`); tl.push([gt, 'hud', (await H.ui()).join(' | ').slice(0, 160), s.p]); }
  if (gt === 2) { await H.snap(`foam-${mode}/countdown`); const cd = await page.evaluate(() => window.__rg.ctx.camera.position.distanceTo(window.__rg.ctx.player.object.position)); tl.push([gt, 'cam-hero', cd]); }
  if (f.phase === 'result' && tEnd === null) { tEnd = gt; await H.snap(`foam-${mode}/result`); tl.push([gt, 'result', JSON.stringify(f.last), await H.ui()]); }
  if (tEnd !== null && gt > tEnd + 8) break;
  if (f.phase === 'idle' && gt > 10) break;
}
await page.keyboard.up('KeyW');
log(tl.map((x) => JSON.stringify(x)).join('\n'));
log('end', tEnd, 'maxStill', maxStill, JSON.stringify(await F()), await H.s());
await H.snap(`foam-${mode}/99-after`);
