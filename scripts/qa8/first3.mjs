// QA5 item 1: the first 3 minutes as a brand-new child. Desktop keyboard (960x540) or phone touch.
// Clicks/taps the real PLAY, then obeys Pip: walk/jog to Pip (or his lead point), Space when he says
// jump, E / use button at prompts. Every simulated frame samples Pip's bubble (jumps, overlaps,
// off-screen). Logs every line, voice clip ids, pause log, gift (duck hat), lead/rescue state.
// Phase plan (game seconds): 0..follow obey Pip; then 20 s push W into whatever is ahead (stuck test);
// then idle until the end.
// Usage: RG_PORT=4374 node scripts/qa8/first3.mjs [desktop|phone] [gameSeconds=180] [follow=120]
import { writeFileSync } from 'node:fs';
import { open, touchSession } from './lib.mjs';
import { startRecorder, readRecorder, summarize } from './recorder.mjs';

const prof = process.argv[2] ?? 'desktop';
const total = Number(process.argv[3] ?? 180);
const follow = Number(process.argv[4] ?? 120);
const phone = prof === 'phone';
const { page, shot, close, errors, out } = await open(`first3-${prof}${process.env.QA_TAG ?? ''}`, {
  query: '&quality=low&buddyIntro=1&freeze=1',
  ...(phone ? { device: 'iPhone 13 landscape', ctxOpts: { deviceScaleFactor: 1 } } : { width: 960, height: 540 }),
});
const kb = page.keyboard;
const held = new Set();
const setKeys = async (want) => {
  for (const k of [...held]) if (!want.has(k)) {
    await kb.up(k);
    held.delete(k);
  }
  for (const k of want) if (!held.has(k)) {
    await kb.down(k);
    held.add(k);
  }
};
let touch = null;
let stick = null; // [x0,y0] while held
const rectOf = (tid) =>
  page.evaluate((t) => {
    const e = document.querySelector(`[data-testid="${t}"]`);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return r.width > 1 ? [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height] : null;
  }, tid);
const lines = [];
const sitAt = process.env.QA_SIT ? Number(process.env.QA_SIT) : null;
let sat = false;
const ticks = [];
try {
  await page.evaluate(() => window.__rg.freeze(true));
  await page.evaluate(() => window.__rg.step(1 / 60, 1, true));
  await shot('00-title', { channels: true });
  if (phone) {
    touch = await touchSession(page);
    const p = await rectOf('play');
    await touch.tap(p[0], p[1]);
  } else await page.getByTestId('play').click();
  await page.evaluate(() => {
    window.__rgGear?.enableGifts(true);
    window.__rg.step(1 / 60, 2, true);
  });
  await shot('01-after-play', { channels: true });
  await startRecorder(page, { raf: false });
  const vp = page.viewportSize();
  let gt = 0;
  let lastId = '';
  let jumpHold = 0;
  let giftAt = null;
  let lastShot = -10;
  while (gt < total) {
    const st = await page.evaluate(() => {
      const B = window.__rgBuddy;
      const ctx = window.__rg.ctx;
      const hp = window.__rg.state().playerPosition;
      const pp = B.pos();
      const f = ctx.camera.getWorldDirection(new ctx.camera.position.constructor());
      const prompt = document.querySelector('[data-testid="prompt"]');
      const pv = !!prompt && prompt.getBoundingClientRect().width > 2 && getComputedStyle(prompt).opacity !== '0' && getComputedStyle(prompt).visibility !== 'hidden';
      const b = document.querySelector('[data-testid="pip-bubble"]');
      return { hp, pp, f: [f.x, f.z], lead: B.lead(), act: b?.classList.contains('on') ? b.dataset.action : '', prompt: pv, mode: window.__rg.state().playerMode, phase: window.__rg.state().phase };
    });
    if (sitAt !== null && gt >= sitAt && !sat) {
      sat = true;
      await setKeys(new Set());
      await page.evaluate((k) => {
        const rg = window.__rg;
        const c = rg.ctx.vehicles.all.find((v) => v.kind === k);
        const p = c.position;
        const x = p.x + Math.sin(2.6) * 2.4;
        const z = p.z + Math.cos(2.6) * 2.4;
        rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.5, z, Math.atan2(p.x - x, p.z - z));
        rg.step(1 / 60, 20, false);
      }, process.env.QA_SITV ?? 'car');
      await kb.press('KeyE');
      console.log('SAT', gt, await page.evaluate(() => window.__rg.state().playerMode));
    }
    let mx = 0;
    let my = 0;
    let jump = false;
    let use = false;
    if (sat) {
      /* sits still */
    } else if (gt < follow) {
      if (st.act === 'jump' || jumpHold > 0) {
        jump = true;
        jumpHold = jumpHold > 0 ? jumpHold - 1 : 4;
      }
      const tgt = process.env.QA_DEST === '1' && st.lead.guiding && st.lead.dest ? st.lead.dest : [st.pp[0], st.pp[2]];
      const dx = tgt[0] - st.hp[0];
      const dz = tgt[1] - st.hp[2];
      const d = Math.hypot(dx, dz);
      if (d > 2.5) {
        const fl = Math.hypot(st.f[0], st.f[1]) || 1;
        const fx = st.f[0] / fl;
        const fz = st.f[1] / fl;
        my = (dx * fx + dz * fz) / d;
        mx = (dx * -fz + dz * fx) / d;
      }
      if (st.prompt && st.mode === 'walk' && (process.env.QA_E === '1' || st.act === 'use') && Math.random() < 0.15) use = true;
    } else if (gt < follow + 20) my = 1;
    if (!phone) {
      const want = new Set();
      if (my > 0.38) want.add('KeyW');
      if (my < -0.38) want.add('KeyS');
      if (mx > 0.38) want.add('KeyD');
      if (mx < -0.38) want.add('KeyA');
      if (jump) want.add('Space');
      await setKeys(want);
      if (use) await kb.press('KeyE');
    } else {
      // Left thumb on the stick zone (lower-left quarter), drag 50 px in the wanted direction.
      const sx = vp.width * 0.16;
      const sy = vp.height * 0.72;
      if (Math.hypot(mx, my) > 0.3) {
        const L = Math.hypot(mx, my);
        const tx = sx + (mx / L) * 50;
        const ty = sy - (my / L) * 50;
        if (!stick) {
          await touch.stickHold(sx, sy, tx - sx, ty - sy);
          stick = [sx, sy];
        } else await touch.stickMove(tx, ty);
      } else if (stick) {
        await touch.release();
        stick = null;
      }
      if (jump || use) {
        const r = await rectOf(jump ? 'touch-jump' : 'touch-use');
        if (r) await touch.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...(stick ? [{ x: stick[0] + mx * 50, y: stick[1] - my * 50, id: 1 }] : []), { x: r[0], y: r[1], id: 7 }] });
        if (r) await touch.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: stick ? [{ x: stick[0] + mx * 50, y: stick[1] - my * 50, id: 1 }] : [] });
      }
    }
    const res = await page.evaluate((gt0) => {
      for (let i = 0; i < 15; i++) {
        window.__rg.step(1 / 60, 1, false);
        window.__qaClock = gt0 + (i + 1) / 60;
        window.__qaSample();
      }
      const b = document.querySelector('[data-testid="pip-bubble"]');
      return {
        on: b?.classList.contains('on'), id: b?.dataset.id, text: b?.dataset.text, act: b?.dataset.action, icon: b?.dataset.icon, cls: b?.className,
        pos: window.__rg.state().playerPosition.map((v) => +v.toFixed(1)), mode: window.__rg.state().playerMode, phase: window.__rg.state().phase,
        lead: window.__rgBuddy.lead(), dir: window.__rgBuddy.director(), hat: window.__rgGear?.attached?.() ?? null,
      };
    }, gt);
    gt += 0.25;
    if (Math.round(gt * 4) % 4 === 0) ticks.push([+gt.toFixed(1), res.lead.state, res.lead.to ?? '', !!res.lead.guiding, res.mode, res.phase, res.lead.at ?? '', res.pos[0], res.pos[2]]);
    if (giftAt === null && JSON.stringify(res.hat ?? '').includes('duck')) giftAt = gt;
    const newLine = res.on && res.id + res.text !== lastId;
    if (newLine) {
      lines.push({ t: +gt.toFixed(2), id: res.id, text: res.text, icon: res.icon, act: res.act, cls: res.cls, pos: res.pos, mode: res.mode, lead: res.lead.to, leadState: res.lead.state, rescues: res.lead.rescues, done: res.lead.done.join(','), step: res.dir.step });
      lastId = res.id + res.text;
    }
    if (!res.on) lastId = '';
    if (newLine || gt - lastShot >= 2) {
      lastShot = gt;
      await page.evaluate(() => window.__rg.render());
      await shot(`t${String(Math.round(gt * 4)).padStart(4, '0')}${newLine ? '-L' + lines.length : ''}`);
    }
    if (res.phase !== 'playing') console.log('PHASE', gt, res.phase);
  }
  if (!phone) await setKeys(new Set());
  else if (stick) await touch.release();
  const raw = await readRecorder(page);
  const sum = summarize(raw);
  const voice = await page.evaluate(() => window.__rgBuddy.voice());
  const history = await page.evaluate(() => window.__rgBuddy.history());
  const pauseLog = await page.evaluate(() => window.__rg.pauseLog ?? window.__rgPauseLog);
  writeFileSync(`${out}/log.json`, JSON.stringify({ ticks, lines, recorder: sum, history, voice, pauseLog, giftAt }, null, 1));
  for (const l of lines) console.log('LINE', JSON.stringify(l));
  const counts = {};
  for (const e of sum) counts[e.ev] = (counts[e.ev] ?? 0) + 1;
  console.log('RECORDER COUNTS', JSON.stringify(counts));
  console.log('JUMPS', JSON.stringify(sum.filter((e) => e.ev === 'jump').slice(0, 30).map((e) => [e.t, e.id, e.dx, e.dy])));
  console.log('OVERLAPS', JSON.stringify(sum.filter((e) => e.ev === 'overlap' || e.ev === 'offscreen').slice(0, 30).map((e) => [e.t, e.ev, e.id, e.hits ?? ''])));
  console.log('VOICE', JSON.stringify(voice.map((v) => `${v.id}:${v.source}`)));
  console.log('NO CLIP', JSON.stringify(voice.filter((v) => v.source !== 'clip')));
  console.log('PAUSELOG', JSON.stringify(pauseLog));
  console.log('GIFT AT', giftAt);
  console.log('final', JSON.stringify(await page.evaluate(() => ({ s: window.__rg.state(), lead: window.__rgBuddy.lead(), wallet: window.__rg.ctx.profile?.gems ?? null }))));
} finally {
  console.log('errors', errors.length, JSON.stringify(errors.slice(0, 5)));
  await close();
}
