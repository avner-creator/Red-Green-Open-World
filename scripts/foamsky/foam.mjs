// QA4b: Foam Lava. Walk to the booth, E, run the course with held keys along the bot's route, fall in once.
import { open } from './lib.mjs';

const g = await open('foam');
const { page, shot, step, st, pos, release, tap, walkTo, tp, setKeys, keysToward, visibleText } = g;
const fo = (expr, a) => page.evaluate(expr, a);
const PLAN = [
  [3.4, 3.9], [4.2, 6.3], [2.6, 8.4], [4.1, 10.6],
  [3.5, 13.3], [2.6, 14.9], [3.6, 16.5], [2.8, 18.0], [3.3, 20.8],
  [2.7, 23.4], [3.9, 24.5], [2.7, 25.6], [3.9, 26.7], [3.3, 27.9],
  [3.3, 35.95], [3.3, 39.0], [1.9, 40.3, 0.6],
  [-3.8, 40.2, 0.6], [-3.8, 37.0],
  [-3.8, 25.6, 0.8], [-3.8, 22.5, 0.35, 'wait'], [-3.8, 7.6], [-3.8, 5.9], [-3.6, 0.3],
];
const local = () => fo(() => { const p = window.__rgFoam.sim.p; return [p.x, p.y, p.z, window.__rgFoam.sim.falls, window.__rgFoam.sim.time, window.__rgFoam.phase()]; });
try {
  const booth = await fo(() => window.__rgFoam.booth());
  console.log('booth', booth);
  await tp(booth[0] + 10, booth[2], -Math.PI / 2);
  await shot('approach');
  const r = await walkTo(booth[0], booth[2], { tol: 1.0 });
  console.log('to booth', JSON.stringify(r), await st());
  await shot('booth');
  async function run(tag, { fallAt = -1, maxS = 120 } = {}) {
    const w0 = await fo(() => window.__rg.ctx.profile.wallet);
    await tap('KeyE');
    await step(10);
    console.log(`[${tag}] after E phase=${await fo(() => window.__rgFoam.phase())} wallet ${w0}->${await fo(() => window.__rg.ctx.profile.wallet)}`);
    await shot(`${tag}-countdown`);
    let t = 0, i = 0, next = 0, waited = 0;
    while (t < maxS * 60) {
      const [x, , z, falls, time, ph] = await local();
      if (ph === 'result' || ph === 'idle') break;
      if (ph === 'run' && i < PLAN.length) {
        const [wx, wz, rr = 0.35, wait] = PLAN[i];
        let goal = [wx, wz];
        if (i === fallAt) goal = [x + 3, z]; // walk sideways off into the foam once
        if (Math.hypot(wx - x, wz - z) < rr + 0.15) {
          if (wait && waited < 90) { waited += 6; await release(); await step(6); t += 6; continue; }
          i++; if (fallAt === i - 1) fallAt = -1;
          continue;
        }
        const a = await fo(([lx, lz]) => window.__rgFoam.toWorld(lx, 0, lz), goal);
        const p = await pos();
        await setKeys(await keysToward(a[0] - p[0], a[2] - p[2]));
      } else await release();
      await step(6);
      t += 6;
      const after = await local();
      if (after[3] !== falls) { console.log(`[${tag}] FELL at wp ${i} local ${x.toFixed(1)},${z.toFixed(1)} t=${time.toFixed(1)}`); await shot(`${tag}-fall-${after[3]}`); i = Math.max(0, i - 1); }
      if (t >= next) { await shot(`${tag}-t${Math.round(t / 60)}`); next += 120; console.log(`[${tag}] t=${(t / 60).toFixed(0)} wp ${i} local ${after[0].toFixed(1)},${after[1].toFixed(1)},${after[2].toFixed(1)} time ${after[4].toFixed(1)}`); }
    }
    await release();
    const res = await fo(() => window.__rgFoam.lastResult());
    console.log(`[${tag}] end phase=${await fo(() => window.__rgFoam.phase())} wp ${i}/${PLAN.length} result ${JSON.stringify(res)} wallet ${await fo(() => window.__rg.ctx.profile.wallet)}`);
    await step(60);
    await shot(`${tag}-result`);
    console.log(`[${tag}] UI`, JSON.stringify(await visibleText()));
    await tap('KeyR'); await step(40);
    console.log(`[${tag}] after R`, await fo(() => window.__rgFoam.phase()), await st());
    await shot(`${tag}-left`);
  }
  await run('run1', { fallAt: 4 });
  // R mid-run
  await walkTo(booth[0], booth[2], { tol: 1.0 });
  await page.evaluate(() => window.__rg.ctx.profile.earn(5, 'gem'));
  await run('exitR', { maxS: 12 });
} finally {
  await g.close();
}
