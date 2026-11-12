// QA6 B: emulated gamepad walk/jump again (after the session is running).
await page.evaluate(() => {
  const mk = () => ({ id: 'QA pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
  window.__qaPad = mk();
  navigator.getGamepads = () => [window.__qaPad, null, null, null];
});
const btn = (i, on) => page.evaluate(([i, on]) => { window.__qaPad.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 }; }, [i, on]);
const axes = (a) => page.evaluate((a) => { window.__qaPad.axes = a; }, a);
log('state', await H.s(), await page.evaluate(() => window.__rg.ctx.input.state));
const p0 = (await H.s()).p;
await axes([0, -1, 0, 0]);
for (let i = 0; i < 4; i++) { await st(30, false); log('t', i, (await H.s()).p, JSON.stringify(await page.evaluate(() => { const s = window.__rg.ctx.input.state; return [s.moveX, s.moveY]; }))); }
await axes([0, 0, 0, 0]);
await st(10, false);
const p1 = (await H.s()).p;
log('walk', Math.hypot(p1[0] - p0[0], p1[2] - p0[2]).toFixed(2));
let ymax = p1[1];
await btn(0, true);
for (let i = 0; i < 8; i++) { await st(4, false); ymax = Math.max(ymax, (await H.s()).p[1]); }
await btn(0, false);
await st(30, false);
log('jump', (ymax - p1[1]).toFixed(2));
await page.evaluate(() => { delete navigator.getGamepads; });
