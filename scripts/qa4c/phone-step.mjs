// QA4C section 1 (stepped): Pip's bubbles on an emulated phone with frozen time stepped at 60 Hz,
// bubble sampled after EVERY simulation frame, touch input through CDP touch events.
// Usage: RG_PORT=4363 node scripts/qa4c/phone-step.mjs "<device>|small" [gameSeconds=180] [followUntil=90]
import { writeFileSync } from 'node:fs';
import { open, touchSession } from './lib.mjs';
import { startRecorder, readRecorder, summarize } from './recorder.mjs';

const device = process.argv[2] ?? 'iPhone 13 landscape';
const total = Number(process.argv[3] ?? 180);
const followUntil = Number(process.argv[4] ?? 90);
const custom = device === 'small';
const capFrom = Number(process.argv[5] ?? -1);
const capTo = Number(process.argv[6] ?? -1);
const onlyCap = capFrom >= 0;
const dir = `step-${device.replace(/\W+/g, '-')}${onlyCap ? `-cap${capFrom}` : ''}`;
const { page, shot, close, errors, out } = await open(dir, {
  query: '&quality=low&buddyIntro=1&freeze=1',
  device: custom ? null : device,
  ctxOpts: custom ? { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : {},
});
const T = await touchSession(page);
const lines = [];
let shots = 0;
try {
  await page.evaluate(() => window.__rg.freeze(true));
  await page.evaluate(() => window.__rg.step(1 / 60, 1, true));
  await shot('00-title', { channels: true });
  const play = await page.getByTestId('play').boundingBox();
  await T.tap(play.x + play.width / 2, play.y + play.height / 2);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__rg.step(1 / 60, 2, true));
  await shot('01-after-play');
  await startRecorder(page, { raf: false });
  const zone = await page.getByTestId('touch-stick-zone').boundingBox().catch(() => null);
  const sx = zone ? zone.x + zone.width * 0.45 : 120;
  const sy = zone ? zone.y + zone.height * 0.6 : 250;
  let holding = false;
  let gt = 0;
  let lastId = '';
  while (gt < (onlyCap ? capTo : total)) {
    let vec = null;
    if (gt < followUntil) {
      vec = await page.evaluate(() => {
        const B = window.__rgBuddy;
        const ctx = window.__rg.ctx;
        const hp = window.__rg.state().playerPosition;
        const l = B.lead();
        const pp = B.pos();
        // A child follows the dog itself.
        const dx = pp[0] - hp[0];
        const dz = pp[2] - hp[2];
        const d = Math.hypot(dx, dz);
        if (d < 2.5 && !(l.guiding && l.state === 'wait')) return null;
        const tx = l.guiding && l.state === 'wait' && l.dest ? l.dest[0] - hp[0] : dx;
        const tz = l.guiding && l.state === 'wait' && l.dest ? l.dest[1] - hp[2] : dz;
        const dd = Math.hypot(tx, tz) || 1;
        const f = ctx.camera.getWorldDirection(new ctx.camera.position.constructor());
        const fl = Math.hypot(f.x, f.z) || 1;
        const fx = f.x / fl;
        const fz = f.z / fl;
        return [(tx / dd) * -fz + (tz / dd) * fx, (tx / dd) * fx + (tz / dd) * fz];
      });
    } else if (gt < followUntil + 30) vec = [0, 1];
    else if (gt < followUntil + 60) vec = null;
    else vec = [0.4, -1];
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
    if (onlyCap && gt >= capFrom && gt < capTo) {
      // Frame-by-frame capture window: render + screenshot every 2nd frame.
      for (let k = 0; k < 8; k++) {
        const info = await page.evaluate((g) => {
          for (let i = 0; i < 2; i++) {
            window.__rg.step(1 / 60, 1, i === 1);
            window.__qaClock = g + (i + 1) / 60;
            window.__qaSample();
          }
          const b = document.querySelector('[data-testid="pip-bubble"]');
          const r = b.getBoundingClientRect();
          return `${b.classList.contains('on') ? 'on' : 'off'} ${b.dataset.id} ${Math.round(r.left)},${Math.round(r.top)}`;
        }, gt);
        gt += 2 / 60;
        await shot(`C-${gt.toFixed(3)}`);
        console.log('cap', gt.toFixed(3), info);
      }
      continue;
    }
    // 0.25 s of game time, bubble sampled after every frame.
    const res = await page.evaluate((gt0) => {
      let ev = 0;
      for (let i = 0; i < 15; i++) {
        window.__rg.step(1 / 60, 1, false);
        window.__qaClock = gt0 + (i + 1) / 60;
        const before = window.__qaBubbleLog.length;
        window.__qaSample();
        for (const e of window.__qaBubbleLog.slice(before)) if (e.ev === 'jump' || e.ev === 'replace' || e.ev === 'retype') ev++;
      }
      const b = document.querySelector('[data-testid="pip-bubble"]');
      return { ev, on: b.classList.contains('on'), id: b.dataset.id, text: b.dataset.text, act: b.dataset.action, html: b.querySelector('.act')?.innerHTML.slice(0, 90), font: getComputedStyle(b.querySelector('.say')).fontSize, rect: (() => { const r = b.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); })(), pos: window.__rg.state().playerPosition.map((v) => +v.toFixed(1)), lead: window.__rgBuddy.lead() };
    }, gt);
    gt += 0.25;
    if (res.on && res.id !== lastId) {
      lines.push({ t: +gt.toFixed(2), id: res.id, text: res.text, act: res.act, font: res.font, rect: res.rect, pos: res.pos, lead: res.lead.to, leadState: res.lead.state });
      lastId = res.id;
      // burst: 6 frames at 0.1 s
      if (shots < 120) {
        for (let k = 0; k < 6; k++) {
          if (!onlyCap) {
            await page.evaluate(() => window.__rg.render());
            await shot(`L${String(lines.length).padStart(2, '0')}-${k}`);
          }
          shots++;
          await page.evaluate((g) => {
            for (let i = 0; i < 6; i++) {
              window.__rg.step(1 / 60, 1, false);
              window.__qaClock = g + (i + 1) / 60;
              window.__qaSample();
            }
          }, gt);
          gt += 0.1;
        }
      }
    }
    if (!res.on) lastId = '';
    if (res.ev > 0 && shots < 160 && !onlyCap) {
      await page.evaluate(() => window.__rg.render());
      await shot(`J-t${gt.toFixed(2)}`);
      shots++;
    }
    if (!onlyCap && Math.abs(gt % 15) < 0.01) {
      await page.evaluate(() => window.__rg.render());
      await shot(`P-t${Math.round(gt)}`);
    }
  }
  if (holding) await T.release();
  const raw = await readRecorder(page);
  const sum = summarize(raw);
  writeFileSync(`${out}/bubble-log.json`, JSON.stringify({ lines, recorder: sum, history: await page.evaluate(() => window.__rgBuddy.history()), voice: await page.evaluate(() => window.__rgBuddy.voice()) }, null, 1));
  console.log('LINES', JSON.stringify(lines));
  const counts = {};
  for (const e of sum) counts[e.ev] = (counts[e.ev] ?? 0) + 1;
  console.log('RECORDER COUNTS', JSON.stringify(counts));
  console.log('JUMPS', JSON.stringify(sum.filter((e) => e.ev === 'jump').slice(0, 40).map((e) => [e.t, e.id, e.dx, e.dy, e.below])));
  console.log('REPLACE/RETYPE', JSON.stringify(sum.filter((e) => e.ev === 'replace' || e.ev === 'retype' || e.ev === 'show' || e.ev === 'hide').map((e) => [e.t, e.ev, e.id, e.from ?? ''])));
  console.log('OVERLAPS', JSON.stringify(sum.filter((e) => e.ev === 'overlap' || e.ev === 'offscreen').slice(0, 40).map((e) => [e.t, e.ev, e.id, e.hits ?? '', e.x, e.y, e.w, e.h])));
  console.log('final', JSON.stringify(await page.evaluate(() => ({ s: window.__rg.state(), lead: window.__rgBuddy.lead() }))));
} finally {
  console.log('errors', errors.length);
  await close();
}
