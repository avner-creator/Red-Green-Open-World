// QA6: watch line-up bubbles for 12 s while standing on the pad.
const G = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses[fn](...a), [fn, a]);
const out = [];
for (let i = 0; i < 24; i++) {
  await st(30, false);
  const d = await G('debug', 'lineup');
  const k = await G('boothDebug', 'lineup');
  out.push([i / 2, k.phase, d.onPad, d.bubbles.map((b) => b.state + ':' + b.age.toFixed(1)).join(','), JSON.stringify(d.screen.bubbles), d.inside]);
}
log(out.map((r) => JSON.stringify(r)).join('\n'));
await H.snap('gl6/lineup-watch');
