// QA8: + Esc at 30 s and I at 50 s mid-race, channel check at 20 s. From qa6: Buggy race start -> finish with real keys: steer toward the racing line 14 m ahead (lineInfo), W held.
const phase = () => page.evaluate(() => window.__rg.state().phase);
if (['podium', 'result'].includes(await page.evaluate(() => window.__rgRace.state().phase))) { await page.evaluate(() => window.__rgRace.exit()); await st(60); }
if ((await phase()) === 'paused') { await page.getByTestId('resume').click(); await st(10); }
if ((await H.s()).mode === 'driving') { await page.keyboard.press('KeyE'); await st(40); }
const booth = (await page.evaluate(() => window.__rg.interactables())).find((i) => i.id === 'race-booth');
await H.near(booth.position[0], booth.position[2], 9, 1.2);
log('walk', await H.walkTo(booth.position[0], booth.position[2], 10, 1.8));
log('ui', await H.ui());
await H.snap('r8/00-booth');
await page.keyboard.press('KeyE');
await st(20);
log('after E', await H.s(), await page.evaluate(() => window.__rgRace.state().phase), await H.ui());
await H.snap('r8/01-after-E');
let t = 0;
let lastShot = -5;
const held = new Set();
const set = async (want) => {
  for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
};
const trace = [];
while (t < 200) {
  const s = await page.evaluate(() => {
    const R = window.__rgRace.state();
    const car = window.__rg.ctx.vehicles.all.find((v) => v.kind === 'car');
    const q = car.object.quaternion;
    const fwd = new car.position.constructor(0, 0, 1).applyQuaternion(q);
    const L = R.length || 1;
    const ahead = window.__rgRace.lineInfo(((R.progress % L) + L + 14) % L);
    return { R, p: [car.position.x, car.position.z], f: [fwd.x, fwd.z], a: [ahead.x, ahead.z], mode: window.__rg.state().playerMode, sp: car.speed };
  });
  if (s.R.phase === 'result' || s.R.phase === 'podium' || s.R.phase === 'idle' && t > 20) { trace.push(['end', t, s.R]); break; }
  const dx = s.a[0] - s.p[0];
  const dz = s.a[1] - s.p[1];
  const cross = s.f[0] * dz - s.f[1] * dx;
  const want = new Set(['KeyW']);
  const ang = Math.atan2(cross, s.f[0] * dx + s.f[1] * dz);
  if (ang > 0.12) want.add('KeyD');
  if (ang < -0.12) want.add('KeyA');
  await set(s.R.phase === 'racing' || s.R.phase === 'countdown' ? want : new Set());
  await st(15, false);
  t += 0.25;
  if (Math.round(t * 4) % 20 === 0) trace.push([t, s.R.phase, s.R.lap, Math.round(s.R.progress), s.R.place, s.R.rivals.map(Math.round), +s.sp.toFixed(1), s.p.map((v) => +v.toFixed(1))]);
  if (t - lastShot >= 10) { lastShot = t; await H.snap('r8/t' + String(Math.round(t)).padStart(3, '0')); }
  if (t === 20) trace.push(['sep', JSON.stringify(await H.sep('r8/sep20'))]);
  if (t === 30 || t === 50) {
    const key = t === 30 ? 'Escape' : 'KeyI';
    await set(new Set());
    await page.keyboard.press(key); await st(30);
    const ui = await page.evaluate(() => ({ phase: window.__rg.state().phase, race: window.__rgRace.state().phase, open: [...document.querySelectorAll('[data-testid]')].filter((e) => e.offsetParent && /pause|wardrobe|resume/i.test(e.dataset.testid)).map((e) => e.dataset.testid).slice(0, 6) }));
    await H.snap(`r8/menu-${key}`);
    trace.push([t, 'menu', key, JSON.stringify(ui)]);
    await st(120, false);
    await page.keyboard.press('Escape'); await st(30);
    const ui2 = await page.evaluate(() => ({ phase: window.__rg.state().phase, race: window.__rgRace.state().phase }));
    trace.push([t, 'closed', JSON.stringify(ui2)]);
    if (ui2.phase === 'paused') { await page.keyboard.press('Escape'); await st(30); trace.push([t, 'esc again', await phase()]); }
  }
}
await set(new Set());
await st(120);
log(JSON.stringify(trace));
log('final', JSON.stringify(await page.evaluate(() => window.__rgRace.state())), await H.ui());
await H.snap('r8/99-result');
