// QA4C section 1: Pip's bubbles on an emulated phone, real-time loop, touch input via CDP.
// Usage: RG_PORT=4363 node scripts/qa4c/phone.mjs "iPhone 13 landscape" [seconds=180] [followUntil=90]
// First `followUntil` s the child steers the joystick towards Pip (or Pip's lead), then ignores
// him: holds the stick forward for 30 s, stands idle, then walks away from Pip.
import { writeFileSync } from 'node:fs';
import { open, touchSession, screencast } from './lib.mjs';
import { startRecorder, readRecorder, summarize } from './recorder.mjs';

const device = process.argv[2] ?? 'iPhone 13 landscape';
const total = Number(process.argv[3] ?? 180);
const followUntil = Number(process.argv[4] ?? 90);
const custom = device === 'small';
const dir = `phone-${device.replace(/\W+/g, '-')}`;
const { page, shot, close, errors, pip, out } = await open(dir, {
  query: '&quality=low&buddyIntro=1',
  device: custom ? null : device,
  ctxOpts: custom ? { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : {},
});
const T = await touchSession(page);
const events = [];
try {
  await shot('00-title');
  const play = await page.getByTestId('play').boundingBox();
  await T.tap(play.x + play.width / 2, play.y + play.height / 2);
  await page.waitForTimeout(1500);
  await shot('01-after-play');
  await startRecorder(page);
  const sc = await screencast(page, `${out}/frames`);
  const zone = await page.getByTestId('touch-stick-zone').boundingBox().catch(() => null);
  console.log('stick zone', JSON.stringify(zone));
  const sx = zone ? zone.x + zone.width * 0.45 : 120;
  const sy = zone ? zone.y + zone.height * 0.6 : 250;
  let holding = false;
  const start = Date.now();
    let lastId = '';
  while ((Date.now() - start) / 1000 < total) {
    const t = (Date.now() - start) / 1000;
    // Decide stick vector.
    let vec = null;
    if (t < followUntil) {
      vec = await page.evaluate(() => {
        const B = window.__rgBuddy;
        const ctx = window.__rg.ctx;
        const hp = window.__rg.state().playerPosition;
        const l = B.lead();
        const pp = B.pos();
        const tgt = l.dest && l.guiding ? [l.dest[0], l.dest[1]] : [pp[0], pp[2]];
        const dx = tgt[0] - hp[0];
        const dz = tgt[1] - hp[2];
        const d = Math.hypot(dx, dz);
        if (d < 3) return null;
        const f = ctx.camera.getWorldDirection(new ctx.camera.position.constructor());
        const fl = Math.hypot(f.x, f.z) || 1;
        const fx = f.x / fl;
        const fz = f.z / fl;
        const rx = -fz;
        const rz = fx;
        const nx = dx / d;
        const nz = dz / d;
        return [nx * rx + nz * rz, nx * fx + nz * fz];
      });
    } else if (t < followUntil + 30) vec = [0, 1];
    else if (t < followUntil + 60) vec = null;
    else vec = [0.3, -1]; // walk back/away
    if (vec) {
      const R = 45;
      if (!holding) {
        await T.stickHold(sx, sy, vec[0] * R, -vec[1] * R);
        holding = true;
      } else await T.stickMove(sx + vec[0] * R, sy - vec[1] * R);
    } else if (holding) {
      await T.release();
      holding = false;
    }
    const s = await pip();
    if (s.on && s.id !== lastId) {
      events.push({ t: +t.toFixed(1), id: s.id, text: s.text, act: s.act, rect: s.rect, font: s.fontPx, pos: s.pos, lead: s.lead?.to, step: s.dir?.step });
      lastId = s.id;
    }
    if (!s.on) lastId = '';
    await page.waitForTimeout(120);
  }
  if (holding) await T.release();
  await sc.stop();
  console.log('screencast frames', sc.frames.length);
  const raw = await readRecorder(page);
  const sum = summarize(raw);
  writeFileSync(`${out}/bubble-log.json`, JSON.stringify({ events, recorder: sum, history: await page.evaluate(() => window.__rgBuddy.history()), voice: await page.evaluate(() => window.__rgBuddy.voice()) }, null, 1));
  console.log('LINES', JSON.stringify(events));
  const counts = {};
  for (const e of sum) counts[e.ev] = (counts[e.ev] ?? 0) + 1;
  console.log('RECORDER COUNTS', JSON.stringify(counts));
  console.log('RECORDER (non-overlap)', JSON.stringify(sum.filter((e) => e.ev !== 'overlap').slice(0, 80)));
  console.log('OVERLAPS', JSON.stringify(sum.filter((e) => e.ev === 'overlap').slice(0, 30)));
  console.log('frames', await page.evaluate(() => window.__rg.frames), 'final', JSON.stringify(await pip()));
  // portrait check
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);
  await shot('zz-portrait');
  console.log('rotate overlay visible:', await page.getByTestId('touch-rotate').isVisible().catch(() => 'n/a'));
} finally {
  console.log('errors', errors.length);
  await close();
}
