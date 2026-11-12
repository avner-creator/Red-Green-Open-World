// QA7 B: weave 'bounce' (perfect-bounce ring on the trampoline) and 'hero' ring: walk onto the trampoline,
// hold Space for big bounces; when the ring debug shows the window open, tap Space; channel check mid-fall.
const W = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses.weave[fn](...a), [fn, a]);
const ia = (await page.evaluate(() => window.__rg.interactables())).map((i) => i.id);
const tr = await page.evaluate(() => { let best = null; window.__rg.ctx.scene.traverse((o) => { if (!best && /trampoline/i.test(o.name)) best = o.getWorldPosition(new window.__rg.ctx.camera.position.constructor()).toArray(); }); return best; });
log('tramp at', tr);
await H.near(tr[0], tr[2], 8, 0.5);
log('walk', JSON.stringify(await H.walkTo(tr[0], tr[2], 8, 1)));
const tl = [];
let sepDone = false;
for (let i = 0; i < 160; i++) {
  const d = await W('debug', 'bounce');
  if (i < 40) await page.keyboard.down('Space'); else await page.keyboard.up('Space');
  if (i >= 40 && d.ring && d.perfect != null && !d.presses) {
    // tap at the window guessed from debug.at/perfect: just tap when |at - perfect| small
    if (Math.abs((d.at ?? 0) - d.perfect) < 0.08) { await tap('Space', 1); tl.push(`tap at ${d.at} perfect ${d.perfect}`); }
  }
  if (d.ring && !sepDone && i > 40) { sepDone = true; await H.snap('weave/bounce-ring'); tl.push('sep ' + JSON.stringify(await H.sep('weave/bounce-sep'))); }
  await st(6, false);
  if (i % 20 === 0) tl.push(`${i} y=${(await H.s()).p[1].toFixed(1)} ${JSON.stringify(d).slice(0, 220)}`);
}
await page.keyboard.up('Space');
const d = await W('debug', 'bounce');
log(tl.join('\n'), '\nfinal hits', d.hits, 'misses', d.misses, 'perfects', d.perfects, 'falls', d.falls);
