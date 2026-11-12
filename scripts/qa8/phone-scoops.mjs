// QA6 A: phone (750x342 touch): put the hero on the Scoops counter top and push the stick toward the
// trampoline (east-south-east); does the hero get off (hop-out) and how long does it take?
// Usage: RG_PORT=4397 node scripts/qa8/phone-scoops.mjs
import { open, touchSession } from './lib.mjs';

const { page, shot, close, errors } = await open('phone-scoops', { query: '&quality=low&freeze=1', device: 'iPhone 13 landscape', ctxOpts: { deviceScaleFactor: 1 } });
try {
  await page.evaluate(() => { window.__rg.freeze(true); window.__rg.step(1 / 60, 1, true); });
  const t = await touchSession(page);
  const r = await page.evaluate(() => { const e = document.querySelector('[data-testid="play"]').getBoundingClientRect(); return [e.x + e.width / 2, e.y + e.height / 2]; });
  await t.tap(r[0], r[1]);
  await page.evaluate(() => { window.__rg.step(1 / 60, 60, false); window.__rg.setRemaining(3000); });
  const vp = page.viewportSize();
  const sc = await page.evaluate(() => window.__rg.interactables().find((i) => i.id === 'scoops-counter').position);
  const res = [];
  for (const [ox, oz] of [[0, 0], [0.8, 0.6], [-0.8, -0.6]]) {
    const x = sc[0] + ox, z = sc[2] + oz;
    await page.evaluate(([x, y, z]) => { window.__rg.teleport(x, y + 0.4, z, Math.atan2(51 - x, -20 - z)); window.__rg.step(1 / 60, 30, false); }, [x, sc[1], z]);
    const y0 = await page.evaluate(() => window.__rg.state().playerPosition[1]);
    await shot(`on-counter-${ox}`);
    await t.stickHold(vp.width * 0.16, vp.height * 0.72, 0, -50);
    let off = null;
    const tr = [];
    for (let i = 0; i < 40; i++) {
      const p = await page.evaluate(() => { window.__rg.step(1 / 60, 15, false); return [window.__rg.state().playerPosition, window.__rg.state().playerMode]; });
      tr.push(p[0].map((v) => +v.toFixed(1)));
      if (off === null && p[0][1] < y0 - 0.8) off = (i + 1) * 0.25;
      if (off !== null && i > off * 4 + 4) break;
    }
    await t.release();
    await page.evaluate(() => window.__rg.render());
    await shot(`after-${ox}`);
    res.push({ start: [x, y0].map((v) => +v.toFixed(1)), offAfterS: off, last: tr[tr.length - 1] });
  }
  console.log(JSON.stringify(res));
} finally {
  console.log('errors', errors.length, JSON.stringify(errors.slice(0, 5)));
  await close();
}
