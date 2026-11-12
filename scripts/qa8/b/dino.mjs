// QA4b: Dino Sumo. Walk up, bump the set, active round, passive round, R mid-round.
import { open } from './lib.mjs';

const g = await open('dino');
const { page, shot, step, st, release, tap, walkTo, tp, steer, visibleText } = g;
const ds = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgDinoSumo[fn](...a), [fn, a]);
const W = async (lx, lz) => { const w = await ds('world', lx, 0, lz); return [w[0], w[2]]; };
try {
  const booth = await ds('booth');
  console.log('booth', booth);
  await tp(booth[0], booth[2] - 10, 0);
  await shot('approach-10m');
  let r = await walkTo(booth[0], booth[2] - 1.0, { tol: 0.8 });
  console.log('to booth', r, await st());
  await shot('at-booth');
  // Walk into the ring from the booth (idle set: is it solid? can we stand on it?).
  const c = await W(0, 0);
  r = await walkTo(c[0], c[1], { maxS: 10 });
  console.log('into ring idle', r, await st());
  await shot('ring-idle');
  // Walk out the far side and into a post / balloon rope.
  const far = await W(0, 9);
  r = await walkTo(far[0], far[1], { maxS: 10 });
  console.log('out far side', r, await st());

  async function round(tag, active, exitAfterS = 0) {
    await tp(booth[0], booth[2] - 4, 0);
    await walkTo(booth[0], booth[2] - 1.0, { tol: 0.7 });
    const w0 = await page.evaluate(() => window.__rg.ctx.profile.wallet);
    console.log(`[${tag}] at booth`, await st());
    await tap('KeyE');
    console.log(`[${tag}] after E phase=${await ds('phase')} wallet ${w0} -> ${await page.evaluate(() => window.__rg.ctx.profile.wallet)}`);
    let t = 0, nextShot = 0, charges = 0, lastPts = '', firstPlay = -1;
    while (t < 100 * 60) {
      const ph = await ds('phase');
      if (ph === 'result' || ph === 'idle') break;
      const s = await ds('state');
      if (s && s.phase === 'play' && firstPlay < 0) firstPlay = t;
      if (exitAfterS && firstPlay >= 0 && t - firstPlay > exitAfterS * 60) {
        await tap('KeyR'); await step(30);
        console.log(`[${tag}] R mid-round: phase=${await ds('phase')}`, await st());
        await shot(`${tag}-after-R`);
        return;
      }
      if (s && active && s.phase === 'play') {
        // Pick the nearest friend still in the ring; approach from the centre side, charge when close.
        let best = null;
        for (let i = 1; i < s.dinos.length; i++) {
          const [x, z, state] = s.dinos[i];
          if (state !== 'ok' || Math.hypot(x, z) > 4.6) continue;
          const d = Math.hypot(x - s.px, z - s.pz);
          if (!best || d < best.d) best = { x, z, d };
        }
        if (best) {
          const rl = Math.hypot(best.x, best.z) || 1;
          const ax = best.x - (best.x / rl) * 1.5, az = best.z - (best.z / rl) * 1.5;
          const inLine = Math.hypot(s.px - ax, s.pz - az) < 1.2 || best.d < 2.2;
          const tgt = inLine ? [best.x, best.z] : [ax, az];
          const w = await W(tgt[0], tgt[1]);
          const extra = ['ShiftLeft'];
          if (best.d < 2.6 && inLine) { extra.push('Space'); charges++; }
          await steer(w[0], w[1], extra);
        } else {
          const w = await W(0, 0); await steer(w[0], w[1]);
        }
      } else await release();
      await step(6);
      t += 6;
      if (s) {
        const pts = s.points.join(',');
        if (pts !== lastPts) { console.log(`[${tag}] t=${(t / 60).toFixed(1)} points ${pts} clock ${s.clock.toFixed(1)} me ${s.px.toFixed(1)},${s.pz.toFixed(1)} states ${s.dinos.map((d) => d[2]).join('/')}`); lastPts = pts; }
      }
      if (t >= nextShot) { await shot(`${tag}-t${Math.round(t / 60)}`); nextShot += 180; }
    }
    await release();
    console.log(`[${tag}] ended after ${(t / 60).toFixed(1)} s (play ${((t - firstPlay) / 60).toFixed(1)} s) phase=${await ds('phase')} charge-chunks ${charges} wallet ${await page.evaluate(() => window.__rg.ctx.profile.wallet)}`);
    await shot(`${tag}-result`);
    console.log(`[${tag}] UI text`, JSON.stringify(await visibleText()));
    await step(120);
    await shot(`${tag}-result-2s`);
    await tap('KeyR'); await step(30);
    console.log(`[${tag}] after R`, await ds('phase'), await st());
    await shot(`${tag}-left`);
  }
  await round('active', true);
  await page.evaluate(() => window.__rg.ctx.profile.earn(10, 'gem'));
  await round('passive', false);
  await round('exitR', true, 5);
} finally {
  await g.close();
}
