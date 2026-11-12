// QA8 A/M2: a child who gets into the parked buggy at ~10 s and just sits there for the whole 5-minute session.
// Logs every Pip line (time, id, text, action) and the end phase. RG_PORT=4406 node scripts/qa8/sitbuggy.mjs [vehicle=car|horse]
import { writeFileSync } from 'node:fs';
import { open } from './lib.mjs';

const kind = process.argv[2] ?? 'car';
const { page, shot, close, errors, out } = await open(`sit-${kind}`, { query: '&quality=low&buddyIntro=1&freeze=1', width: 960, height: 540 });
const lines = [];
try {
  await page.evaluate(() => window.__rg.freeze(true));
  await page.evaluate(() => window.__rg.step(1 / 60, 1, true));
  await page.getByTestId('play').click();
  await page.evaluate((k) => {
    const rg = window.__rg;
    rg.step(1 / 60, 1200, false);
    const c = rg.ctx.vehicles.all.find((v) => v.kind === k);
    const p = c.position;
    const x = p.x + Math.sin(2.6) * 2.4;
    const z = p.z + Math.cos(2.6) * 2.4;
    rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.5, z, Math.atan2(p.x - x, p.z - z));
    rg.step(1 / 60, 20, false);
  }, kind);
  await page.keyboard.press('KeyE');
  await page.evaluate(() => window.__rg.step(1 / 60, 30, false));
  console.log('mode after E', await page.evaluate(() => window.__rg.state().playerMode));
  let gt = 20.5;
  let last = '';
  let lastShot = 0;
  for (;;) {
    const r = await page.evaluate(() => {
      window.__rg.step(1 / 60, 15, false);
      const b = document.querySelector('[data-testid="pip-bubble"]');
      const s = window.__rg.state();
      return { on: b?.classList.contains('on'), id: b?.dataset.id, text: b?.dataset.text, act: b?.dataset.action, mode: s.playerMode, phase: s.phase, rem: s.remaining };
    });
    gt += 0.25;
    const key = r.on ? r.id + r.text : '';
    if (key && key !== last) {
      lines.push({ t: +gt.toFixed(1), id: r.id, text: r.text, act: r.act, mode: r.mode });
      console.log('LINE', gt.toFixed(1), r.mode, r.id, '|', r.text, '|', r.act);
      await page.evaluate(() => window.__rg.render());
      await shot(`L${lines.length}`);
    }
    last = key;
    if (gt - lastShot > 60) {
      lastShot = gt;
      await page.evaluate(() => window.__rg.render());
      await shot(`t${Math.round(gt)}`);
    }
    if (r.phase !== 'playing') {
      console.log('PHASE', gt, r.phase);
      await page.evaluate(() => window.__rg.step(1 / 60, 120, true));
      await shot('end', { channels: true });
      break;
    }
    if (gt > 360) break;
  }
  writeFileSync(`${out}/lines.json`, JSON.stringify(lines, null, 1));
} finally {
  console.log('errors', errors.length, JSON.stringify(errors.slice(0, 5)));
  await close();
}
