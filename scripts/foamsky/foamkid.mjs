// Foam Lava played like a kid with real keys: walk-into probes, a full run with a fall, the blowers, the result.
import { open, probe8 } from './lib.mjs';

const g = await open('foamkid');
const { page, shot, step, st, pos, release, tap, walkTo, tp, setKeys, keysToward, visibleText } = g;
const fo = (expr, a) => page.evaluate(expr, a);
const W = (x, z) => fo(([x, z]) => window.__rgFoam.toWorld(x, 0, z), [x, z]);
const PLAN = [
  [3.4, 3.9], [4.2, 6.3], [2.6, 8.4], [4.1, 10.6],
  [3.5, 13.0], [2.6, 14.9], [3.6, 16.5], [2.8, 18.0], [3.3, 20.8],
  [2.7, 23.4], [3.9, 24.5], [2.7, 25.6], [3.9, 26.7], [3.3, 27.9],
  [3.3, 35.95], [3.3, 39.0], [1.9, 40.3, 0.6],
  [-3.8, 40.2, 0.6], [-3.8, 37.0],
  [-3.8, 25.6, 0.8], [-3.8, 7.6], [-3.8, 5.9], [-3.6, 0.3],
];
const local = () => fo(() => { const s = window.__rgFoam.sim; return { x: s.p.x, y: s.p.y, z: s.p.z, falls: s.falls, time: s.time, mode: s.mode, cp: s.cp, ph: window.__rgFoam.phase() }; });
const PROBE = process.env.PROBE !== '0';
try {
  const booth = await fo(() => window.__rgFoam.booth());
  await tp(booth[0] + 6, booth[2] + 3, -Math.PI / 2);
  await shot('approach');
  const r = await walkTo(booth[0], booth[2], { tol: 1.0 });
  console.log('to booth', JSON.stringify(r), await st());
  await shot('booth');
  const w0 = await fo(() => window.__rg.ctx.profile.wallet);
  await tap('KeyE');
  let t = 0, i = 0, nextShot = 0, fellOnce = false, wanderT = 0, minFriend = 9;
  const t0 = Date.now();
  while (t < 150 * 60) {
    const s = await local();
    if (s.ph === 'result' || s.ph === 'idle') break;
    if (s.ph === 'run' && s.mode === 'run' && i < PLAN.length) {
      const [wx, wz, rr = 0.35] = PLAN[i];
      // One deliberate wobble off the third float into the foam.
      if (!fellOnce && i === 3) { wanderT++; if (wanderT > 40) fellOnce = true; const a = await W(s.x + 3, s.z); const p = await pos(); await setKeys(await keysToward(a[0] - p[0], a[2] - p[2])); }
      else if (Math.hypot(wx - s.x, wz - s.z) < rr + 0.15) { i++; continue; }
      else { const a = await W(wx, wz); const p = await pos(); await setKeys(await keysToward(a[0] - p[0], a[2] - p[2])); }
    } else if (s.mode === 'slide') await setKeys([]);
    else await release();
    await step(3); t += 3;
    const after = await local();
    if (after.falls !== s.falls) { console.log(`FELL wp ${i} at ${s.x.toFixed(1)},${s.z.toFixed(1)} t=${after.time.toFixed(1)}`); await shot(`fall-${after.falls}`); }
    if (s.mode === 'splash' && after.mode === 'run') { let best = 0, bd = 1e9; for (let j = 0; j < PLAN.length; j++) { const d = Math.hypot(PLAN[j][0] - after.x, PLAN[j][1] - after.z); if (d < bd) { bd = d; best = j; } } i = best; console.log(`respawn cp${after.cp} -> wp ${i}`); await shot('respawn'); }
    if (s.mode === 'swing' && after.mode === 'run' && i < 17) i = 17;
    if (after.cp >= 3 && i < 20) i = 20;
    if (t >= nextShot) { await shot(`run-t${(t / 60).toFixed(0)}`); nextShot += 75; console.log(`t=${(t / 60).toFixed(1)} wp ${i} ${after.mode} cp${after.cp} local ${after.x.toFixed(1)},${after.y.toFixed(1)},${after.z.toFixed(1)} run ${after.time.toFixed(1)}`); }
    if (Math.abs(after.x) > 6.3 || after.z > 44.5) console.log(`OUT OF COURSE at ${after.x.toFixed(1)},${after.z.toFixed(1)}`);
  }
  // Resync after a respawn is handled crudely above (the kid heads for the nearest waypoint ahead).
  await release();
  const res = await fo(() => window.__rgFoam.lastResult());
  console.log(`RESULT ${JSON.stringify(res)} wallet ${w0}->${await fo(() => window.__rg.ctx.profile.wallet)} wall ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  for (let k = 0; k < 4; k++) { await step(30); await shot(`result-${k}`); }
  console.log('UI', JSON.stringify(await visibleText()));
  await tap('KeyR'); await step(40);
  console.log('after R', await fo(() => window.__rgFoam.phase()), await st());
  await shot('left');
  await page.evaluate(() => window.__rg.ctx.profile.earn(3, 'test'));
  if (PROBE) {
    const props = {
      booth: [0, -2.2], archL: [5.75, 1.7], archR: [-5.75, 1.7], blower0: [-6.65, 19.6], blower1: [-6.65, 15.4],
      machine: [-6.7, -0.6], ropePostN: [-0.6, 42.8], towerA: [3.3, 40.3], cp1: [3.3, 20.8], rimEast: [5.8, 12], rimWest: [-5.8, 30], rimNorth: [0, 43.6],
    };
    for (const [n, [x, z]] of Object.entries(props)) { const w = await W(x, z); await probe8(g, n, w[0], w[2]); }
    await shot('probe-end');
  }
} finally {
  await g.close();
}
