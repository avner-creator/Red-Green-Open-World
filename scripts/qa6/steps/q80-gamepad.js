// QA6 B: emulated standard gamepad (navigator.getGamepads override): walk, jump, use (Gear Shack), pause/resume, radio.
await page.evaluate(() => {
  const mk = () => ({ id: 'QA pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
  window.__qaPad = mk();
  navigator.getGamepads = () => [window.__qaPad, null, null, null];
});
const btn = (i, on) => page.evaluate(([i, on]) => { window.__qaPad.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 }; window.__qaPad.timestamp++; }, [i, on]);
const axes = (a) => page.evaluate((a) => { window.__qaPad.axes = a; window.__qaPad.timestamp++; }, a);
const press = async (i, hold = 3) => { await btn(i, true); await st(hold, false); await btn(i, false); await st(3, false); };
if ((await H.s()).phase !== 'playing') { await page.getByTestId('play').click().catch(() => {}); await st(30); }
await page.evaluate(() => { window.__rg.setRemaining(3000); window.__rg.teleport(0, window.__rg.ctx.world.heightAt(0, 9) + 0.5, 9, Math.PI); });
await st(30);
const out = {};
// walk 2 s forward with the left stick
const p0 = (await H.s()).p;
await axes([0, -1, 0, 0]);
await st(120, false);
await axes([0, 0, 0, 0]);
await st(10, false);
const p1 = (await H.s()).p;
out.walk = +Math.hypot(p1[0] - p0[0], p1[2] - p0[2]).toFixed(2);
out.device = await page.evaluate(() => window.__rg.ctx.input.device ?? null);
await H.snap('pad/01-walked');
// jump: A
let ymax = p1[1];
await btn(0, true);
for (let i = 0; i < 8; i++) { await st(4, false); ymax = Math.max(ymax, (await H.s()).p[1]); }
await btn(0, false);
await st(60, false);
out.jumpHeight = +(ymax - p1[1]).toFixed(2);
// right stick look
const yaw0 = await page.evaluate(() => { const c = window.__rg.ctx.camera; const f = c.getWorldDirection(new c.position.constructor()); return Math.atan2(f.x, f.z); });
await axes([0, 0, 1, 0]); await st(30, false); await axes([0, 0, 0, 0]); await st(5, false);
const yaw1 = await page.evaluate(() => { const c = window.__rg.ctx.camera; const f = c.getWorldDirection(new c.position.constructor()); return Math.atan2(f.x, f.z); });
out.lookYaw = +(yaw1 - yaw0).toFixed(2);
// use: X at the Gear Shack kiosk
const gs = (await page.evaluate(() => window.__rg.interactables())).find((i) => i.id === 'gearShack');
await H.near(gs.position[0], gs.position[2], 2.5, 0);
await st(20);
await H.snap('pad/02-at-shack');
await press(2);
await st(30);
out.afterUse = await H.ui();
out.shopOpen = await page.evaluate(() => [...document.querySelectorAll('[data-testid]')].filter((e) => e.offsetParent && /shop|kiosk|wardrobe|gear/i.test(e.dataset.testid)).map((e) => e.dataset.testid).slice(0, 6));
await H.snap('pad/03-after-X');
// close with B (back)
await press(1);
await st(30);
out.afterB = (await H.s()).phase;
out.shopAfterB = await page.evaluate(() => [...document.querySelectorAll('[data-testid]')].filter((e) => e.offsetParent && /shop|kiosk|wardrobe/i.test(e.dataset.testid)).map((e) => e.dataset.testid).slice(0, 6));
await H.snap('pad/04-after-B');
// pause: Start, then Start again
await press(9);
await st(10);
out.afterStart = (await H.s()).phase;
await H.snap('pad/05-paused');
await press(9);
await st(10);
out.afterStart2 = (await H.s()).phase;
if (out.afterStart2 === 'paused') { await press(1); await st(10); out.afterB2 = (await H.s()).phase; if (out.afterB2 === 'paused') { await press(0); await st(10); out.afterA = (await H.s()).phase; } }
// radio: RB
const r0 = await page.evaluate(() => JSON.stringify(window.__rgRadio?.state?.() ?? window.__rgRadio?.current?.() ?? null));
await press(5);
await st(10);
const r1 = await page.evaluate(() => JSON.stringify(window.__rgRadio?.state?.() ?? window.__rgRadio?.current?.() ?? null));
out.radio = [r0, r1];
await H.snap('pad/06-radio');
log(JSON.stringify(out, null, 1));
await page.evaluate(() => { delete navigator.getGamepads; });
