// QA4b: sky rides. Plane: walk up, E, contest with held keys (boost, loop, water balloons), landing.
// Dragon: walk the roost path from the north-road junction sign, E, tour, landing.
import { open } from './lib.mjs';

const g = await open('sky');
const { page, shot, step, st, pos, release, tap, walkTo, tp, setKeys, visibleText } = g;
const sky = (expr, a) => page.evaluate(expr, a);
const wallet = () => page.evaluate(() => window.__rg.ctx.profile.wallet);
const CONTEST = Number(process.env.QA_CONTEST ?? 40);
try {
  const ids = await sky(() => window.__rg.interactables().map((i) => `${i.id}@${i.position.map((v) => v.toFixed(0)).join(',')}`));
  console.log('interactables', ids.join(' '));
  const planeIt = await sky(() => window.__rg.interactables().find((i) => /plane/i.test(i.id))?.position);
  const dragonIt = await sky(() => window.__rg.interactables().find((i) => /dragon/i.test(i.id))?.position);
  console.log('plane', planeIt, 'dragon', dragonIt);
  // ---- Plane ----
  await tp(planeIt[0] + 9, planeIt[2] - 5, -Math.PI / 2);
  await shot('plane-approach');
  let r = await walkTo(planeIt[0], planeIt[2], { tol: 1.2 });
  console.log('to plane', JSON.stringify(r), await st());
  await shot('plane-at');
  await sky((s) => { window.__rgSky.plane.contestSeconds = s; }, CONTEST);
  const w0 = await wallet();
  await tap('KeyE');
  let t = 0, next = 0, last = '';
  const tw = Date.now();
  while (t < (CONTEST + 60) * 60) {
    const ph = await sky(() => window.__rgSky.plane.phase);
    if (ph !== last) { console.log(`[plane] t=${(t / 60).toFixed(1)} phase ${ph} score ${await sky(() => window.__rgSky.plane.score)} ${await st()}`); last = ph; }
    if (ph === 'idle' && t > 60) break;
    if (ph === 'race') {
      const k = [];
      const c = Math.floor(t / 60);
      if (c % 6 < 2) k.push('ShiftLeft');
      if (c % 6 === 3) k.push('KeyA');
      if (c % 9 === 5) k.push('KeyW');
      if (t % 120 < 3) k.push('Space');
      if (t % 600 === 300) k.push('KeyQ');
      await setKeys(k);
    } else await release();
    await step(6);
    t += 6;
    if (t >= next) { await shot(`plane-${ph}-t${Math.round(t / 60)}`); next += 240; }
  }
  await release();
  console.log(`[plane] wall ${((Date.now() - tw) / 1000).toFixed(0)} s; result ${JSON.stringify(await sky(() => window.__rgSky.plane.lastResult))} wallet ${w0}->${await wallet()}`, await st());
  await shot('plane-after');
  console.log('[plane] UI', JSON.stringify(await visibleText()));
  // Plane: R mid-flight (paid ride now)
  await page.evaluate(() => window.__rg.ctx.profile.earn(5, 'gem'));
  await walkTo(planeIt[0], planeIt[2], { tol: 1.2 });
  await tap('KeyE');
  for (let k = 0; k < 10; k++) { await step(60); if ((await sky(() => window.__rgSky.plane.phase)) === 'race') break; }
  await step(180);
  console.log('[plane] before R', await sky(() => window.__rgSky.plane.phase), await st());
  await tap('KeyR'); await step(30);
  console.log('[plane] after R', await sky(() => window.__rgSky.plane.phase), await st());
  await shot('plane-after-R');

  // ---- Dragon: from the junction sign up the roost path ----
  await tp(-20, -136, -Math.PI / 2);
  await shot('roost-sign');
  for (const [x, z] of [[-26, -137.5], [-26.3, -129.5], [-29.6, -125.2]]) {
    r = await walkTo(x, z, { tol: 1.0, maxS: 20 });
    console.log('roost path', x, z, JSON.stringify(r));
    await shot(`roost-path-${x}`);
  }
  r = await walkTo(dragonIt[0], dragonIt[2], { tol: 1.3, maxS: 20 });
  console.log('to dragon', JSON.stringify(r), await st());
  await shot('dragon-at');
  await sky(() => { window.__rgSky.dragon.tourSeconds = 40; });
  const w1 = await wallet();
  await tap('KeyE');
  t = 0; next = 0; last = '';
  while (t < 140 * 60) {
    const ph = await sky(() => window.__rgSky.dragon.phase);
    if (ph !== last) { console.log(`[dragon] t=${(t / 60).toFixed(1)} phase ${ph} ${await st()}`); last = ph; }
    if (ph === 'idle' && t > 60) break;
    if (ph === 'tour') {
      const k = [];
      if (t % 50 < 3) k.push('Space');
      if (Math.floor(t / 180) % 3 === 1) k.push('KeyD');
      if (t % 300 === 150) k.push('KeyQ');
      await setKeys(k);
    } else await release();
    await step(6);
    t += 6;
    if (t >= next) { await shot(`dragon-${ph}-t${Math.round(t / 60)}`); next += 240; }
  }
  await release();
  console.log(`[dragon] tour ${JSON.stringify(await sky(() => window.__rgSky.dragon.lastTour))} wallet ${w1}->${await wallet()}`, await st());
  await shot('dragon-after');
} finally {
  await g.close();
}
