// QA7: watch a running dot-signs round with no input (child stands on the pad).
const G = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses[fn](...a), [fn, a]);
const tl = [];
for (let i = 0; i < 60; i++) {
  await st(30, false);
  const d = await G('debug', 'dotsigns');
  const k = await G('boothDebug', 'dotsigns');
  tl.push(`${i / 2} ${k?.phase}/${d.state} shown ${d.dotsShown} chosen ${d.chosen} ans ${d.answer} misses ${d.misses} hits ${d.hits} p ${JSON.stringify((await H.s()).p)}`);
  if (i === 6) await H.snap('dots7/40-play-on-pad');
  if (k?.phase === 'cooldown' || (i > 4 && k?.phase === 'idle')) break;
}
log(tl.join('\n'));
