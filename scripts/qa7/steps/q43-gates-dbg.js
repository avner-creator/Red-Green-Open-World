// QA6: gates details: arches, pad, start, then where the hero goes.
const G = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses[fn](...a), [fn, a]);
let d = await G('debug', 'gates');
log('kit', (await G('boothDebug', 'gates')).phase, 'state', d.state, 'arches', JSON.stringify(d.arches), 'pad', JSON.stringify(d.pad), 'cands', JSON.stringify(d.candidates).slice(0, 300));
await H.walkTo(d.pad.x, d.pad.z, 10, 0.4);
await st(20, false);
await page.keyboard.press('KeyE');
for (let i = 0; i < 8; i++) { await st(30, false); if ((await G('boothDebug', 'gates')).phase === 'play') break; }
await st(30, false);
d = await G('debug', 'gates');
log('after start', (await G('boothDebug', 'gates')).phase, d.state, 'answer', d.answer, 'arches', JSON.stringify(d.arches));
await H.snap('gl6/gates-open');
const a = d.arches[d.answer];
log('arch', JSON.stringify(a));
const tr = [];
const tx = a.x, tz = a.z;
for (let i = 0; i < 40; i++) {
  const w = await H.walkTo(tx, tz, 0.5, 0.3, false);
  const k = await G('boothDebug', 'gates');
  const dd = await G('debug', 'gates');
  tr.push([i, w.p, w.d, k.phase, dd.state, dd.chosen, JSON.stringify(k.results)]);
  if (dd.chosen !== -1 || k.phase !== 'play') break;
}
log(JSON.stringify(tr));
await H.snap('gl6/gates-at-arch');
