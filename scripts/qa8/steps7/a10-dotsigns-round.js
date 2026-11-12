// QA7: one dot-signs round, start on the pad, then log debug every 0.5 s; answer like a child (walk to the
// stand of the shape that pops out, E).
const G = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses[fn](...a), [fn, a]);
await G('goto', 'dotsigns');
await st(30, false);
let d = await G('debug', 'dotsigns');
const P = (p) => (Array.isArray(p) ? { x: p[0], z: p[2] } : p);
const pad = P(d.pad ?? (await G('boothPadView', 'dotsigns')));
log('pad walk', await H.walkTo(pad.x, pad.z, 25, 0.5));
await page.keyboard.press('KeyE');
const strip = (o) => JSON.stringify(o, (k, v) => (k === 'kit' ? undefined : typeof v === 'number' ? +v.toFixed(2) : Array.isArray(v) && v.length > 8 ? `[${v.length}]` : v)).slice(0, 400);
const tl = [];
for (let i = 0; i < 80; i++) {
  await st(30, false);
  d = await G('debug', 'dotsigns');
  const k = await G('boothDebug', 'dotsigns');
  if (i < 6 || i % 4 === 0) tl.push(`${i / 2} ${k?.phase} ${strip(d)}`);
  if (k?.phase === 'play' && d.dotsShown && d.chosen === -1 && d.stand && d.answer >= 0) {
    const s = d.stand[d.answer];
    tl.push(`answer ${d.answer} -> ${JSON.stringify(await H.walkTo(s.x, s.z, 6, 0.35))}`);
    await page.keyboard.press('KeyE');
  }
  if (i === 8) await H.snap('dots7/20-play');
  if (k?.phase === 'cooldown' || (i > 10 && k?.phase === 'idle')) break;
}
log(tl.join('\n'));
log('results', JSON.stringify((await G('boothDebug', 'dotsigns'))?.results));
