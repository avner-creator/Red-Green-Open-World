// QA4b: Bubble Ball. Kickabout (8 directions + push into goal), active match, passive match, R mid-match.
import { open } from './lib.mjs';

const g = await open('bubble');
const { page, shot, step, st, pos, setKeys, release, tap, walkTo, tp } = g;
const bb = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgBubbleBall[fn](...a), [fn, a]);
const W = async (lx, lz) => { const w = await bb('world', lx, 0, lz); return [w[0], w[2]]; };
const L = async () => { const p = await pos(); return bb('local', p[0], p[1], p[2]); };
try {
  const booth = await bb('booth');
  console.log('booth', booth);
  // Approach on foot from 10 m north.
  await tp(booth[0], booth[2] - 10, 0);
  await shot('approach-10m');
  let r = await walkTo(booth[0], booth[2] - 1.2, { tol: 0.8 });
  console.log('to booth', r, await st());
  await shot('at-booth');
  // Walk onto the pitch as a child would (from the booth straight at the centre spot).
  const c = await W(0, 0);
  r = await walkTo(c[0], c[1] + 3, { maxS: 10 });
  console.log('onto pitch', r, 'local', (await L()).map((v) => v.toFixed(2)), await st());
  if (!r.reached) {
    console.log('  stuck walking onto pitch; trying with jump held');
    r = await walkTo(c[0], c[1] + 3, { maxS: 10, extra: ['Space'] });
    console.log('  with jump', r, (await L()).map((v) => v.toFixed(2)));
  }
  await shot('on-pitch');
  // 8 directions into the ball.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    await bb('placeBall', 0, 0);
    const s = await W(4.5 * Math.cos(a), 4.5 * Math.sin(a));
    const deckY = (await bb('world', 0, 0, 0))[1];
    await page.evaluate(([x, y, z]) => { window.__rg.teleport(x, y + 0.3, z, 0); window.__rg.step(1 / 60, 20, false); }, [s[0], deckY, s[1]]);
    const sprint = i % 2 === 1;
    let minD = 99, b0 = await bb('ball');
    const target = await W(-6 * Math.cos(a), -6 * Math.sin(a));
    for (let t = 0; t < 150; t += 3) {
      const p = await pos();
      const k = await page.evaluate(([dx, dz]) => {
        const cam = window.__rg.ctx.camera; const f = new cam.position.constructor(); cam.getWorldDirection(f); f.y = 0; f.normalize();
        const l = Math.hypot(dx, dz) || 1; const fw = (dx * f.x + dz * f.z) / l, rt = (dx * -f.z + dz * f.x) / l;
        const k = []; if (fw > 0.38) k.push('KeyW'); else if (fw < -0.38) k.push('KeyS'); if (rt > 0.38) k.push('KeyD'); else if (rt < -0.38) k.push('KeyA'); return k;
      }, [target[0] - p[0], target[1] - p[2]]);
      if (sprint) k.push('ShiftLeft');
      await setKeys(k);
      await step(3);
      const lp = await L(); const b = await bb('ball');
      minD = Math.min(minD, Math.hypot(lp[0] - b.x, lp[2] - b.z));
    }
    await release();
    const b1 = await bb('ball');
    console.log(`dir ${i} (${Math.round((a * 180) / Math.PI)}deg${sprint ? ', sprint' : ''}): min hero-ball centre dist ${minD.toFixed(2)} (ball r 0.72 + hero ~0.35) ball moved ${Math.hypot(b1.x - b0.x, b1.z - b0.z).toFixed(1)} m to ${b1.x.toFixed(1)},${b1.z.toFixed(1)}`);
    if (i === 0 || i === 5) await shot(`dir${i}`);
  }
  // Dribble into the +X goal.
  await bb('placeBall', 3, 1);
  const s0 = await W(0, 1);
  const deckY = (await bb('world', 0, 0, 0))[1];
  await page.evaluate(([x, y, z]) => { window.__rg.teleport(x, y + 0.3, z, Math.PI / 2); window.__rg.step(1 / 60, 20, false); }, [s0[0], deckY, s0[1]]);
  let goal = false;
  for (let t = 0; t < 900 && !goal; t += 6) {
    const b = await bb('ball'); const lp = await L();
    const gx = 11, gz = 0; const dl = Math.hypot(gx - b.x, gz - b.z) || 1;
    const bx = b.x - ((gx - b.x) / dl) * 1.4, bz = b.z - ((gz - b.z) / dl) * 1.4;
    const behind = Math.hypot(lp[0] - bx, lp[2] - bz) < 0.8;
    const tgt = behind ? [gx, gz] : [bx, bz];
    const wt = await W(tgt[0], tgt[1]); const p = await pos();
    const k = await page.evaluate(([dx, dz]) => {
      const cam = window.__rg.ctx.camera; const f = new cam.position.constructor(); cam.getWorldDirection(f); f.y = 0; f.normalize();
      const l = Math.hypot(dx, dz) || 1; const fw = (dx * f.x + dz * f.z) / l, rt = (dx * -f.z + dz * f.x) / l;
      const k = []; if (fw > 0.38) k.push('KeyW'); else if (fw < -0.38) k.push('KeyS'); if (rt > 0.38) k.push('KeyD'); else if (rt < -0.38) k.push('KeyA'); return k;
    }, [wt[0] - p[0], wt[1] - p[2]]);
    await setKeys(k);
    await step(6);
    if (b.x > 9.7) { goal = true; console.log(`kickabout goal after ${(t / 60).toFixed(1)} s`, await st()); }
    if (t % 120 === 0) await shot(`dribble-${t}`);
  }
  await release();
  console.log('kickabout goal?', goal, await bb('ball'));
  await step(20);
  await shot('kickabout-goal');

  // ---- Match 1: active ----
  async function playMatch(tag, active, exitAfterS = 0, skipAfterS = 0) {
    await tp(booth[0], booth[2] - 4, 0);
    await walkTo(booth[0], booth[2] - 1.0, { tol: 0.7 });
    const w0 = await page.evaluate(() => window.__rg.ctx.profile.wallet);
    console.log(`[${tag}] at booth`, await st());
    await shot(`${tag}-booth`);
    await tap('KeyE');
    console.log(`[${tag}] after E phase=${await bb('phase')} wallet ${w0} -> ${await page.evaluate(() => window.__rg.ctx.profile.wallet)}`, await st());
    let t = 0, nextShot = 0, dashes = 0, skipped = false; const tw = Date.now();
    const scores = [];
    while (t < 120 * 60) {
      const ph = await bb('phase');
      if (ph === 'result' || ph === 'idle') break;
      const m = await bb('match');
      if (skipAfterS && m && t > skipAfterS * 60 && !skipped) { skipped = true; await bb('setClock', 3); console.log(`[${tag}] clock skipped to 3 s at t=${(t / 60).toFixed(1)}`); }
      if (exitAfterS && t > exitAfterS * 60) {
        await tap('KeyR');
        await step(30);
        console.log(`[${tag}] pressed R mid-match: phase=${await bb('phase')}`, await st());
        await shot(`${tag}-after-R`);
        return;
      }
      if (m && active && m.phase === 'play') {
        const gx = 10.5; const dl = Math.hypot(gx - m.bx, -m.bz) || 1;
        const bx = m.bx - ((gx - m.bx) / dl) * 1.6, bz = m.bz - ((0 - m.bz) / dl) * 1.6;
        const dBehind = Math.hypot(m.px - bx, m.pz - bz);
        const dBall = Math.hypot(m.px - m.bx, m.pz - m.bz);
        const aligned = m.px < m.bx;
        const tgt = dBehind < 1.2 || (aligned && dBall < 2.6) ? [gx, 0] : [bx, bz];
        const wt = await W(tgt[0], tgt[1]); const p = await pos();
        const k = await page.evaluate(([dx, dz]) => {
          const cam = window.__rg.ctx.camera; const f = new cam.position.constructor(); cam.getWorldDirection(f); f.y = 0; f.normalize();
          const l = Math.hypot(dx, dz) || 1; const fw = (dx * f.x + dz * f.z) / l, rt = (dx * -f.z + dz * f.x) / l;
          const k = []; if (fw > 0.38) k.push('KeyW'); else if (fw < -0.38) k.push('KeyS'); if (rt > 0.38) k.push('KeyD'); else if (rt < -0.38) k.push('KeyA'); return k;
        }, [wt[0] - p[0], wt[1] - p[2]]);
        k.push('ShiftLeft');
        if (aligned && dBall < 2.4 && dBall > 0.5) { k.push('Space'); dashes++; }
        await setKeys(k);
      } else await release();
      await step(6);
      t += 6;
      if (m) {
        const sc = `${m.home}-${m.away}`;
        if (scores[scores.length - 1] !== sc) { scores.push(sc); console.log(`[${tag}] t=${(t / 60).toFixed(1)} score ${sc} clock ${m.clock.toFixed(1)} phase ${m.phase}`); }
      }
      if (t >= nextShot) { await shot(`${tag}-t${Math.round(t / 60)}`); nextShot += 180; }
    }
    await release();
    const m = await bb('match');
    console.log(`[${tag}] wall ${((Date.now() - tw) / 1000).toFixed(0)} s; ended after ${(t / 60).toFixed(1)} s phase=${await bb('phase')} final`, JSON.stringify(m), 'dash presses(chunks)', dashes);
    await shot(`${tag}-result`);
    const toast = await page.evaluate(() => [...document.querySelectorAll('[data-testid]')].filter((e) => e.offsetParent && /toast|result|card/i.test(e.dataset.testid)).map((e) => `${e.dataset.testid}: ${e.innerText.replace(/\s+/g, ' ')}`));
    console.log(`[${tag}] result UI`, JSON.stringify(toast), await st());
    await step(120);
    await shot(`${tag}-result-2s`);
    await tap('KeyR');
    await step(30);
    console.log(`[${tag}] after R`, await bb('phase'), await st());
    await shot(`${tag}-left`);
  }
  await playMatch('active', true);
  await page.evaluate(() => window.__rg.ctx.profile.earn(10, 'gem'));
  await playMatch('passive', false, 0, 30);
  await playMatch('exitR', true, 6);
} finally {
  await g.close();
}
