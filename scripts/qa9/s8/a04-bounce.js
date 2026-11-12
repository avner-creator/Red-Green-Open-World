// QA8 A/M4: perfect-bounce ring in play, both weak-eye settings, channel check while the ring shows.
const W = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses.weave[fn](...a), [fn, a]);
for (let i = 0; i < 3 && (await H.s()).mode !== 'walk'; i++) { await page.keyboard.press('KeyE'); await st(60, false); }
const tr = await page.evaluate(() => { let best = null; window.__rg.ctx.scene.traverse((o) => { if (!best && /trampoline/i.test(o.name)) best = o.getWorldPosition(new window.__rg.ctx.camera.position.constructor()).toArray(); }); return best; });
log('tramp at', tr);
for (const weakEye of ['left', 'right']) {
  await page.evaluate((w) => window.__rg.setEye({ weakEye: w }), weakEye);
  await H.near(tr[0], tr[2], 9, 0.5);
  log(weakEye, 'walk', JSON.stringify(await H.walkTo(tr[0], tr[2], 10, 1)));
  const d0 = await W('debug', 'bounce');
  const tl = [];
  let sepDone = false;
  let taps = 0;
  let ringFrames = 0;
  let lastFall = -1;
  let tapped = false;
  for (let i = 0; i < 700; i++) {
    if (i === 0) await page.keyboard.down('Space');
    await st(1, false);
    const d = await W('debug', 'bounce');
    if (d.falls !== lastFall) { lastFall = d.falls; tapped = false; }
    if (d.ring) ringFrames++;
    if (i > 120 && d.ring && !tapped && d.perfect != null && d.at != null && Math.abs(d.at - d.perfect) < (d.half ?? 0.1) * 0.5) {
      await page.keyboard.up('Space'); await st(1, false); await page.keyboard.down('Space'); tapped = true; taps++;
      tl.push(`tap fall=${d.falls} at=${d.at.toFixed(2)} perfect=${d.perfect.toFixed(2)} half=${d.half}`);
    }
    if (i % 60 === 0) tl.push(`${i} y=${(await H.s()).p[1].toFixed(1)} falls=${d.falls} ring=${d.ring} fall=${d.fall}`);
    if (d.ring && !sepDone && d.at > 0.3) {
      sepDone = true;
      await H.snap(`m4/${weakEye}-ring`);
      tl.push('sep ' + JSON.stringify(await H.sep(`m4/${weakEye}-sep`)));
    }
  }
  await page.keyboard.up('Space');
  const d = await W('debug', 'bounce');
  log(tl.join('\n'));
  log(weakEye, 'falls', d.falls - d0.falls, 'ringFrames', ringFrames, 'taps', taps, 'hits', d.hits - d0.hits, 'misses', d.misses - d0.misses, 'perfects', d.perfects - d0.perfects, 'skipped', d.skipped - d0.skipped, 'mashed', d.mashed, 'last', d.lastGrade);
  // get off: walk away
  await hold(['KeyS'], 180, 60);
}
await page.evaluate(() => window.__rg.setEye({ weakEye: 'left' }));
