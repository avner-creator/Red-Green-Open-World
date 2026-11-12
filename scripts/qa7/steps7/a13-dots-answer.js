// QA7: answer a running dot-signs round like a child: walk to the answer pedestal (buttons[answer]), tap E.
const G = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses[fn](...a), [fn, a]);
const tl = [];
const tag = globalThis.QA_TAG ?? '';
let lastRound = -1;
for (let i = 0; i < 80; i++) {
  const d = await G('debug', 'dotsigns');
  const k = await G('boothDebug', 'dotsigns');
  if (k?.phase === 'play' && d.state === 'open' && d.chosen === -1 && d.round !== lastRound) {
    const b = d.buttons[d.answer];
    const w = await H.walkTo(b.x, b.z, 6, 1.0);
    await tap('KeyE', 20);
    const d2 = await G('debug', 'dotsigns');
    tl.push(`round ${d.round} ans ${d.answer} walk ${JSON.stringify(w)} -> hits ${d2.hits} misses ${d2.misses} chosen ${d2.chosen}`);
    lastRound = d.round;
    if (d.round === 1 && !globalThis.__dsShot) { globalThis.__dsShot = 1; await H.sep(`dots7/sep${tag}`).then((r) => tl.push('sep ' + JSON.stringify(r))); }
  }
  await st(30, false);
  if (k?.phase === 'cooldown' || (i > 4 && k?.phase === 'idle')) break;
}
const k = await G('boothDebug', 'dotsigns');
log(tl.join('\n'), '\nresults', JSON.stringify(k?.results));
