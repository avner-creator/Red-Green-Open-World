// QA7: dot signs, arrival spot -> pad walk (round 6 m6). Snap arrival and the stall.
const G = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses[fn](...a), [fn, a]);
await G('goto', 'dotsigns');
await st(30, false);
const d = await G('debug', 'dotsigns');
const P = (p) => (Array.isArray(p) ? { x: p[0], z: p[2] } : p);
const pad = P(d.pad ?? (await G('boothPadView', 'dotsigns')));
log('arrive', await H.s(), 'pad', pad, 'approach', d.approach);
await H.snap('dots7/00-arrive');
if (d.approach) log('approach walk', await H.walkTo(d.approach.x, d.approach.z, 10, 0.8));
log('pad walk', await H.walkTo(pad.x, pad.z, 15, 0.5));
await H.snap('dots7/01-stall');
log('ui', await H.ui());
// a child would press E anyway
await page.keyboard.press('KeyE'); await st(60);
log('after E', (await G('boothDebug', 'dotsigns'))?.phase);
await H.snap('dots7/02-afterE');
