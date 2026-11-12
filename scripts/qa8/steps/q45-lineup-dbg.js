// QA6: line-up aiming probe: screen positions and what injected look does.
const G = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses[fn](...a), [fn, a]);
let d = await G('debug', 'lineup');
const pad = { x: d.pad[0], z: d.pad[2] };
await H.walkTo(pad.x, pad.z, 10, 0.3);
await page.keyboard.press('KeyE');
for (let i = 0; i < 10; i++) { await st(30, false); if ((await G('boothDebug', 'lineup')).phase === 'play') break; }
await st(30, false);
d = await G('debug', 'lineup');
log('screen', JSON.stringify(d.screen), 'inside', d.inside, 'aim', d.aim, 'bubbles', JSON.stringify(d.bubbles).slice(0, 400));
await H.snap('gl6/lineup-aim0');
for (const [lx, ly] of [[0.05, 0], [0, 0.05]]) {
  await page.evaluate(([lx, ly]) => window.__rg.inject({ lookX: lx, lookY: ly }), [lx, ly]);
  await st(3, false);
  await page.evaluate(() => window.__rg.inject(null));
  await st(1, false);
  d = await G('debug', 'lineup');
  log('after look', lx, ly, JSON.stringify(d.screen));
}
