// QA4C section 2: first 3 minutes on desktop 1280x720, frozen time stepped at 60 Hz, real keyboard
// input (W/A/S/D, Space, E). Phases (game seconds): 0..followUntil follow Pip and obey
// (jump when he says jump, E at prompts), then hold W 30 s, idle 25 s, walk away (S) to the end.
// Logs every Pip line with game time, the voice requests, bubble glitches; screenshots per line.
// Usage: RG_PORT=4363 node scripts/qa4c/desktop.mjs [gameSeconds=180] [followUntil=100] [mode=follow|ignore]
import { writeFileSync } from 'node:fs';
import { open } from './lib.mjs';
import { startRecorder, readRecorder, summarize } from './recorder.mjs';

const total = Number(process.argv[2] ?? 180);
let followUntil = Number(process.argv[3] ?? 100);
const mode = process.argv[4] ?? 'follow';
if (mode === 'ignore') followUntil = 0;
const { page, shot, close, errors, out } = await open(`desktop-${mode}`, { query: '&quality=low&buddyIntro=1&freeze=1', width: 1280, height: 720 });
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
const lines = [];
try {
  await page.evaluate(() => window.__rg.freeze(true));
  await page.evaluate(() => window.__rg.step(1 / 60, 1, true));
  await shot('00-title', { channels: true });
  await page.getByTestId('play').click();
  await page.evaluate(() => window.__rg.step(1 / 60, 2, true));
  await shot('01-after-play', { channels: true });
  await startRecorder(page, { raf: false });
  let gt = 0;
  let lastId = '';
  let jumpHold = 0;
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
      return { hp, pp, f: [f.x, f.z], lead: B.lead(), act: b.classList.contains('on') ? b.dataset.action : '', id: b.dataset.id, prompt: pv, mode: window.__rg.state().playerMode };
    });
    const want = new Set();
    if (gt < followUntil) {
      // Obey: Pip says jump -> hold Space a while; a prompt -> press E once; else walk to Pip.
      if (st.act === 'jump' || jumpHold > 0) {
        want.add('Space');
        jumpHold = jumpHold > 0 ? jumpHold - 1 : 4;
      }
      const tgt = st.lead.guiding && st.lead.state === 'wait' && st.lead.dest ? st.lead.dest : [st.pp[0], st.pp[2]];
      const dx = tgt[0] - st.hp[0];
      const dz = tgt[1] - st.hp[2];
      const d = Math.hypot(dx, dz);
      if (d > 2.5) {
        const fl = Math.hypot(st.f[0], st.f[1]) || 1;
        const fx = st.f[0] / fl;
        const fz = st.f[1] / fl;
        const fwd = (dx * fx + dz * fz) / d;
        const right = (dx * -fz + dz * fx) / d;
        if (fwd > 0.38) want.add('KeyW');
        if (fwd < -0.38) want.add('KeyS');
        if (right > 0.38) want.add('KeyD');
        if (right < -0.38) want.add('KeyA');
      }
      if (st.prompt && st.mode === 'walk' && Math.random() < 0.15) {
        await kb.press('KeyE');
      }
    } else if (gt < followUntil + 30) want.add('KeyW');
    else if (gt < followUntil + 55) {
      /* idle */
    } else want.add('KeyS');
    await setKeys(want);
    const res = await page.evaluate((gt0) => {
      for (let i = 0; i < 15; i++) {
        window.__rg.step(1 / 60, 1, false);
        window.__qaClock = gt0 + (i + 1) / 60;
        window.__qaSample();
      }
      const b = document.querySelector('[data-testid="pip-bubble"]');
      return { on: b.classList.contains('on'), id: b.dataset.id, text: b.dataset.text, act: b.dataset.action, extra: b.dataset.extra, icon: b.dataset.icon, pos: window.__rg.state().playerPosition.map((v) => +v.toFixed(1)), mode: window.__rg.state().playerMode, lead: window.__rgBuddy.lead(), dir: window.__rgBuddy.director() };
    }, gt);
    gt += 0.25;
    if (res.on && res.id + res.text !== lastId) {
      lines.push({ t: +gt.toFixed(2), id: res.id, text: res.text, icon: res.icon, act: res.act, extra: res.extra, pos: res.pos, mode: res.mode, lead: res.lead.to, leadState: res.lead.state, step: res.dir.step, keys: [...held].join('+') });
      lastId = res.id + res.text;
      await page.evaluate(() => window.__rg.render());
      await shot(`L${String(lines.length).padStart(2, '0')}-t${Math.round(gt)}`);
    }
    if (!res.on) lastId = '';
    if (Math.abs(gt % 20) < 0.01) {
      await page.evaluate(() => window.__rg.render());
      await shot(`P-t${String(Math.round(gt)).padStart(3, '0')}`);
    }
  }
  await setKeys(new Set());
  const raw = await readRecorder(page);
  const sum = summarize(raw);
  const voice = await page.evaluate(() => window.__rgBuddy.voice());
  const history = await page.evaluate(() => window.__rgBuddy.history());
  writeFileSync(`${out}/log.json`, JSON.stringify({ lines, recorder: sum, history, voice }, null, 1));
  for (const l of lines) console.log('LINE', JSON.stringify(l));
  const counts = {};
  for (const e of sum) counts[e.ev] = (counts[e.ev] ?? 0) + 1;
  console.log('RECORDER COUNTS', JSON.stringify(counts));
  console.log('JUMPS', JSON.stringify(sum.filter((e) => e.ev === 'jump').slice(0, 30).map((e) => [e.t, e.id, e.dx, e.dy])));
  console.log('OVERLAPS', JSON.stringify(sum.filter((e) => e.ev === 'overlap' || e.ev === 'offscreen').slice(0, 30).map((e) => [e.t, e.ev, e.id, e.hits ?? ''])));
  console.log('VOICE', JSON.stringify(voice.map((v) => `${v.id}:${v.source}`)));
  console.log('NO CLIP', JSON.stringify(voice.filter((v) => v.source === 'speech')));
  console.log('final', JSON.stringify(await page.evaluate(() => ({ s: window.__rg.state(), lead: window.__rgBuddy.lead() }))));
} finally {
  console.log('errors', errors.length, JSON.stringify(errors.slice(0, 5)));
  await close();
}
