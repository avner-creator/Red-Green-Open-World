// QA7 C: rotate / resize the phone mid-game (landscape -> portrait -> landscape -> small), mid-walk and in the
// Scoops game. Usage: RG_PORT=4398 node scripts/qa7/phone-rotate.mjs
import { open, touchSession } from './lib.mjs';
import { phoneKit, phoneStart } from './phonelib.mjs';

const { page, shot, close, errors } = await open('phone-rotate', { query: '&quality=low&freeze=1', device: 'iPhone 13 landscape', ctxOpts: { deviceScaleFactor: 1 } });
try {
  const t = await touchSession(page);
  await phoneStart(page, t);
  const K = phoneKit(page, t);
  const canvasSize = () => page.evaluate(() => { const c = window.__rg.ctx.canvas; return [c.clientWidth, c.clientHeight, c.width, c.height, window.__rg.ctx.camera.aspect.toFixed(2)]; });
  console.log('walk', JSON.stringify(await K.walkTo(5, 0, 3, 1)));
  for (const [w, h, nm] of [[342, 750, 'portrait'], [750, 342, 'landscape'], [568, 320, 'small'], [844, 390, 'big']]) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => window.__rg.step(1 / 60, 30, true));
    await shot(`walk-${nm}`);
    console.log(nm, JSON.stringify(await canvasSize()), 'phase', await page.evaluate(() => window.__rg.state().phase));
  }
  await page.setViewportSize({ width: 750, height: 342 });
  const info = await page.evaluate(() => window.__rgScoops.info());
  await K.tp(info.customer[0], info.customer[2]);
  const use = await page.evaluate(() => { const e = document.querySelector('[data-testid="touch-use"]'); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  if (use) await t.tap(use[0], use[1]);
  await page.evaluate(() => window.__rg.step(1 / 60, 150, true));
  await shot('scoops-landscape');
  console.log('scoops', (await page.evaluate(() => window.__rgScoops.info())).phase);
  await page.setViewportSize({ width: 342, height: 750 });
  await page.evaluate(() => window.__rg.step(1 / 60, 30, true));
  await shot('scoops-portrait');
  await page.setViewportSize({ width: 750, height: 342 });
  await page.evaluate(() => window.__rg.step(1 / 60, 30, true));
  await shot('scoops-back');
  console.log('errors', errors.length, JSON.stringify(errors.slice(0, 5)));
} finally {
  await close();
}
