// QA6: line-up closed-loop aim with logs (start a round first if idle).
const G = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses[fn](...a), [fn, a]);
for (let i = 0; i < 30; i++) { const k = (await G('boothDebug', 'lineup')).phase; if (k === 'idle') break; await st(30, false); }
await page.keyboard.press('KeyE');
for (let i = 0; i < 10; i++) { await st(30, false); if ((await G('boothDebug', 'lineup')).phase === 'play') break; }
const lg = [];
let pops = 0;
for (let i = 0; i < 400; i++) {
  const d = await G('debug', 'lineup');
  const kp = (await G('boothDebug', 'lineup')).phase;
  if (kp !== 'play' && kp !== 'beat') break;
  const r = d.screen.ring, b = d.screen.bubbles.find((x) => x);
  if (i % 10 === 0) lg.push([i, kp, d.inside, r && [r.x.toFixed(2), r.y.toFixed(2)], b && [b.x.toFixed(2), b.y.toFixed(2)], d.pops, d.misses]);
  if (d.inside >= 0) { await page.keyboard.press('KeyE'); await st(20, false); pops++; if (pops === 1) await H.snap('gl6/lineup-pop'); continue; }
  if (r && b) {
    const ex = r.x - b.x, ey = r.y - b.y;
    await page.evaluate(([lx, ly]) => window.__rg.inject({ lookX: lx, lookY: ly }), [-ex * 0.3, -ey * 0.6]);
    await st(1, false);
    await page.evaluate(() => window.__rg.inject(null));
    await st(1, false);
  } else await st(10, false);
}
log(lg.map((x) => JSON.stringify(x)).join('\n'));
const k = await G('boothDebug', 'lineup');
log('results', JSON.stringify(k.results), k.phase);
