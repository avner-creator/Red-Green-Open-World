// QA9: map board reading view on a phone (750x342, touch): walk up with the stick from 12 m, stop,
// read; then a one-finger look drag on the right half must cancel it. Also desktop mouse-look with a
// stubbed pointer lock (headless Chromium does not grant one). RG_PORT=4423 node scripts/qa9/board-phone.mjs
import { open, touchSession } from './lib.mjs';
import { phoneKit, phoneStart } from './phonelib.mjs';

const cam = (page) => page.evaluate(() => { const s = window.__rgCamera.state(); return +s.reading.toFixed(2); });
{
  const { page, shot, close, errors } = await open('board9-phone', { query: '&quality=low&freeze=1', device: 'iPhone 13 landscape', ctxOpts: { deviceScaleFactor: 1 } });
  try {
    const t = await touchSession(page);
    await phoneStart(page, t);
    const k = phoneKit(page, t);
    const b = await page.evaluate(() => window.__rgCamera.state().spots.find((s) => s.id === 'mapboard'));
    for (const hero of ['frog', 'rex']) {
      await page.evaluate(async (h) => { const c = window.__rg.ctx; await c.player.setCharacter(h); c.profile.unlock('hat-tophat', 'shop'); c.economy.equip(c.economy.item('hat-tophat').slot, 'hat-tophat'); }, hero);
      await k.tp(b.x + b.nx * 12, b.z + b.nz * 12, Math.atan2(-b.nx, -b.nz));
      const w = await k.walkTo(b.x + b.nx * 4, b.z + b.nz * 4, 10, 0.6);
      const r = [];
      for (let i = 0; i < 8; i++) { await k.S(10); r.push(await cam(page)); }
      console.log(hero, 'walk', JSON.stringify(w), 'reading', JSON.stringify(r));
      await page.evaluate(() => window.__rg.render());
      await shot(`${hero}-read`, { channels: true });
      // one-finger look drag on the right half
      const vp = page.viewportSize();
      const x0 = vp.width * 0.7, y0 = vp.height * 0.45;
      await t.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 3 }] });
      for (let s = 1; s <= 6; s++) { await t.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + s * 12, y: y0, id: 3 }] }); await k.S(2); }
      await t.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const r2 = [];
      for (let i = 0; i < 6; i++) { await k.S(10); r2.push(await cam(page)); }
      console.log(hero, 'after touch look', JSON.stringify(r2));
      await page.evaluate(() => window.__rg.render());
      await shot(`${hero}-looked`);
    }
  } finally {
    console.log('phone errors', errors.length, JSON.stringify(errors.slice(0, 5)));
    await close();
  }
}
{
  const { page, shot, close, errors } = await open('board9-mouse', { query: '&quality=low&freeze=1', width: 960, height: 540 });
  try {
    await page.evaluate(() => { window.__rg.freeze(true); window.__rg.step(1 / 60, 1, true); });
    await page.getByTestId('play').click();
    await page.evaluate(() => { window.__rg.step(1 / 60, 90, false); window.__rg.setRemaining(3000); });
    const b = await page.evaluate(() => window.__rgCamera.state().spots.find((s) => s.id === 'mapboard'));
    await page.evaluate((b) => { const rg = window.__rg; const x = b.x + b.nx * 4.5, z = b.z + b.nz * 4.5; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.2, z, Math.atan2(-b.nx, -b.nz)); rg.step(1 / 60, 120, false); }, b);
    console.log('mouse: before look', await cam(page));
    // Stub pointer lock so real mouse moves count as look input (headless cannot lock).
    await page.evaluate(() => { const c = window.__rg.ctx.canvas; Object.defineProperty(document, 'pointerLockElement', { get: () => c, configurable: true }); });
    for (let s = 1; s <= 6; s++) { await page.mouse.move(480 + s * 15, 270); await page.evaluate(() => window.__rg.step(1 / 60, 2, false)); }
    const r = [];
    for (let i = 0; i < 6; i++) { await page.evaluate(() => window.__rg.step(1 / 60, 10, false)); r.push(await cam(page)); }
    console.log('mouse: after look', JSON.stringify(r));
    await page.evaluate(() => window.__rg.render());
    await shot('mouse-looked');
  } finally {
    console.log('mouse errors', errors.length, JSON.stringify(errors.slice(0, 5)));
    await close();
  }
}
