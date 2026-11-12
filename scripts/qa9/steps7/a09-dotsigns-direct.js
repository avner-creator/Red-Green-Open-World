// QA7: dot signs, arrival spot -> straight to the pad (no approach point), as a child walking at the glowing pad.
const G = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses[fn](...a), [fn, a]);
await G('goto', 'dotsigns');
await st(30, false);
const d = await G('debug', 'dotsigns');
const P = (p) => (Array.isArray(p) ? { x: p[0], z: p[2] } : p);
const pad = P(d.pad ?? (await G('boothPadView', 'dotsigns')));
log('pad walk', await H.walkTo(pad.x, pad.z, 20, 0.5));
await H.snap('dots7/10-direct');
await page.keyboard.press('KeyE'); await st(60);
log('after E', (await G('boothDebug', 'dotsigns'))?.phase);
const blockers = await page.evaluate(() => { const p = window.__rg.state().playerPosition; return p; });
log('at', blockers);
