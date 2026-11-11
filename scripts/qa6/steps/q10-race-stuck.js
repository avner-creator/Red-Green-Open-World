// QA6 A: race, get stuck on purpose 3 ways (hard left into the scenery; reverse away; steer far off), then
// the reset button (tap), then R twice (leave). Real keys, game time stepped at 1/60.
const RS = () => page.evaluate(() => { const r = window.__rgRace.state(); const car = window.__rg.ctx.vehicles.all.find((v) => v.kind === 'car'); return { ph: r.phase, prog: Math.round(r.progress), resets: r.resets, mode: window.__rg.state().playerMode, car: [car.position.x, car.position.y, car.position.z].map((v) => +v.toFixed(1)), sp: +car.speed.toFixed(1) }; });
if ((await H.s()).mode === 'driving') { await page.keyboard.press('KeyE'); await st(40); }
const booth = (await page.evaluate(() => window.__rg.interactables())).find((i) => i.id === 'race-booth');
await H.near(booth.position[0], booth.position[2], 6, 1.2);
log('walk', await H.walkTo(booth.position[0], booth.position[2], 10, 1.8));
await page.keyboard.press('KeyE');
await st(20);
log('after E', await RS());
// countdown
for (let i = 0; i < 12; i++) { const s = await RS(); if (s.ph === 'racing') break; await st(30, false); }
log('start', await RS());
await H.snap('rs/00-racing');
const runWay = async (name, keys, secs) => {
  const r0 = (await RS()).resets;
  for (const k of keys) await page.keyboard.down(k);
  const tl = [];
  let resetAt = null;
  for (let t = 0; t < secs; t += 0.5) {
    await st(30, false);
    const s = await RS();
    tl.push([t + 0.5, s.prog, s.sp, s.car[0], s.car[2], s.resets]);
    if (s.resets > r0 && resetAt === null) { resetAt = t + 0.5; await H.snap(`rs/${name}-after-reset`); break; }
    if (t === 3) await H.snap(`rs/${name}-stuck`);
  }
  for (const k of keys) await page.keyboard.up(k);
  log(name, 'resetAt', resetAt, JSON.stringify(tl.slice(-6)));
  await st(60, false);
};
await runWay('1-hardleft', ['KeyW', 'KeyA'], 30);
await runWay('2-reverse', ['KeyS'], 30);
await runWay('3-right', ['KeyW', 'KeyD'], 30);
// 4: stop dead and do nothing for 20 s (a child waiting) – should NOT reset
{
  const r0 = (await RS()).resets;
  await st(20 * 60, false);
  log('4-idle20 resets delta', (await RS()).resets - r0, await RS());
}
// reset button
const btn = await page.evaluate(() => { const b = document.querySelector('[data-testid="race-reset"]'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width, r.height]; });
log('reset btn', btn);
await H.snap('rs/05-hud');
if (btn) {
  const r0 = (await RS()).resets;
  await page.mouse.click(btn[0], btn[1]);
  await st(10);
  log('after click resets delta', (await RS()).resets - r0, await RS());
}
await st(200, false);
// R twice
await page.keyboard.press('KeyR');
await st(20, false);
log('after R1', await RS());
await page.keyboard.press('KeyR');
await st(60);
log('after R2', await RS(), await H.ui());
await H.snap('rs/06-after-RR');
log('errors', errors.slice(-5));
