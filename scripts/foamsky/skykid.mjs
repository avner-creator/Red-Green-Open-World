// Sky rides played like a kid with real keys. Plane: walk up, E, full contest steering for hoops
// (A/D, W/S), boost, water balloons, loops, landing, podium. Dragon: walk the roost path from the
// north-road junction sign, E, tour, landing. Pip: where is he during each ride. Walk-into probes.
import { open, probe8 } from './lib.mjs';

const g = await open('skykid');
const { page, shot, step, st, release, tap, walkTo, tp, setKeys, visibleText } = g;
const ev = (f, a) => page.evaluate(f, a);
const wallet = () => ev(() => window.__rg.ctx.profile.wallet);
const pip = () => ev(() => { const b = window.__rgBuddy; if (!b) return 'no-pip'; const p = b.pos(); const h = window.__rg.state().playerPosition; return `pip ${b.ride()} ${b.pose()} d=${Math.hypot(p[0] - h[0], p[1] - h[1], p[2] - h[2]).toFixed(1)}`; });
const MODE = process.env.MODE ?? 'all';
const SHOT_EVERY = Number(process.env.SHOT_EVERY ?? 90);
try {
  const its = await ev(() => window.__rg.interactables().map((i) => [i.id, i.position]));
  console.log('interactables', JSON.stringify(its.filter(([id]) => /plane|dragon|sky/i.test(id))));
  const planeIt = its.find(([id]) => /plane/i.test(id))[1];
  const dragonIt = its.find(([id]) => /dragon/i.test(id))[1];
  if (MODE === 'all' || MODE === 'probe') {
    await probe8(g, 'plane-body', planeIt[0], planeIt[2]);
    await probe8(g, 'plane-wing', planeIt[0] + 2.5, planeIt[2]);
    const rivals = await ev(() => { const out = []; window.__rg.ctx.scene.traverse((o) => { if (/rival|friend-plane|sky-plane/i.test(o.name)) out.push([o.name, o.getWorldPosition(new o.position.constructor()).toArray()]); }); return out; });
    console.log('named plane objects', JSON.stringify(rivals.slice(0, 12)));
    await probe8(g, 'dragon', dragonIt[0], dragonIt[2]);
    const named = await ev(() => { const out = []; window.__rg.ctx.scene.traverse((o) => { if (/windsock|sky-sign|roost|nest|basket|airstrip/i.test(o.name)) out.push([o.name, o.getWorldPosition(new o.position.constructor()).toArray().map((v) => +v.toFixed(1))]); }); return out; });
    console.log('site objects', JSON.stringify(named));
    await shot('probe-end');
  }
  if (MODE === 'all' || MODE === 'plane') {
    await tp(planeIt[0] + 9, planeIt[2] - 6, -Math.PI / 2);
    await shot('plane-approach');
    let r = await walkTo(planeIt[0], planeIt[2], { tol: 2.5 });
    console.log('to plane', JSON.stringify(r), await st());
    await shot('plane-at');
    const w0 = await wallet();
    await tap('KeyE');
    let t = 0, next = 0, last = '', loops = 0;
    const tw = Date.now();
    while (t < 200 * 60) {
      const ph = await ev(() => window.__rgSky.plane.phase);
      if (ph !== last) { console.log(`[plane] t=${(t / 60).toFixed(1)} phase ${ph} score ${await ev(() => window.__rgSky.plane.score)} ${await st()} ${await pip()}`); last = ph; }
      if (ph === 'idle' && t > 60) break;
      if (ph === 'race') {
        // Kid who tries: steer for the nearest armed hoop ahead.
        const aim = await ev(() => {
          const sky = window.__rgSky.plane; const c = sky.contest; const p = window.__rg.ctx.player.position;
          const fwd = window.__rg.ctx.player.yaw;
          let best = null, bd = 1e9;
          for (const h of c.hoops) {
            if (h.cool > 0) continue;
            const dx = h.pos.x - p.x, dz = h.pos.z - p.z; const d = Math.hypot(dx, dz);
            const ang = Math.atan2(dx, dz); let da = ang - fwd; da = Math.atan2(Math.sin(da), Math.cos(da));
            if (Math.abs(da) > 1.4 || d < 4) continue;
            const cost = d + Math.abs(da) * 40;
            if (cost < bd) { bd = cost; best = { da, dy: h.pos.y - p.y - 0.8, d }; }
          }
          return best;
        });
        const k = [];
        if (aim) {
          if (aim.da > 0.08) k.push('KeyA'); else if (aim.da < -0.08) k.push('KeyD');
          if (aim.dy > 2) k.push('KeyW'); else if (aim.dy < -2) k.push('KeyS');
        }
        if (Math.floor(t / 60) % 7 < 2) k.push('ShiftLeft');
        if (t % 90 < 3) k.push('Space');
        if (t % 900 === 450 && loops < 4) { k.push('KeyQ'); loops++; }
        await setKeys(k);
      } else await release();
      await step(6);
      t += 6;
      if (t >= next) { await shot(`plane-${ph}-t${Math.round(t / 60)}`); next += SHOT_EVERY; if (ph === 'race') console.log(`[plane] t=${(t / 60).toFixed(0)} score ${await ev(() => window.__rgSky.plane.score)} clock ${(await ev(() => window.__rgSky.plane.clock)).toFixed(0)} ${await pip()}`); }
    }
    await release();
    console.log(`[plane] wall ${((Date.now() - tw) / 1000).toFixed(0)} s; game ${(t / 60).toFixed(1)} s; result ${JSON.stringify(await ev(() => window.__rgSky.plane.lastResult))} wallet ${w0}->${await wallet()}`, await st());
    for (let i = 0; i < 3; i++) { await step(40); await shot(`plane-podium-${i}`); }
    console.log('[plane] UI', JSON.stringify(await visibleText()));
    // R mid-flight.
    r = await walkTo(planeIt[0], planeIt[2], { tol: 2.5 });
    const w1 = await wallet();
    await tap('KeyE');
    for (let k = 0; k < 12; k++) { await step(60); if ((await ev(() => window.__rgSky.plane.phase)) === 'race') break; }
    await step(120);
    console.log('[plane] before R', await ev(() => window.__rgSky.plane.phase), await st(), `wallet ${w1}->${await wallet()}`);
    await tap('KeyR'); await step(30);
    console.log('[plane] after R', await ev(() => window.__rgSky.plane.phase), await st());
    await shot('plane-after-R');
  }
  if (MODE === 'all' || MODE === 'dragon') {
    // Dragon: from the north-road junction sign up the roost path.
    await tp(-20, -136, -Math.PI / 2);
    await shot('roost-sign');
    for (const [x, z] of [[-26, -137.5], [-26.3, -129.5], [-29.6, -125.2]]) {
      const r = await walkTo(x, z, { tol: 1.0, maxS: 20 });
      console.log('roost path', x, z, JSON.stringify(r));
      await shot(`roost-path-${x}`);
    }
    const r = await walkTo(dragonIt[0], dragonIt[2], { tol: 2.0, maxS: 20 });
    console.log('to dragon', JSON.stringify(r), await st());
    await shot('dragon-at');
    const w1 = await wallet();
    await tap('KeyE');
    let t = 0, next = 0, last = '';
    while (t < 200 * 60) {
      const ph = await ev(() => window.__rgSky.dragon.phase);
      if (ph !== last) { console.log(`[dragon] t=${(t / 60).toFixed(1)} phase ${ph} ${await st()} ${await pip()}`); last = ph; }
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
      if (t >= next) { await shot(`dragon-${ph}-t${Math.round(t / 60)}`); next += SHOT_EVERY; }
    }
    await release();
    console.log(`[dragon] game ${(t / 60).toFixed(1)} s tour ${JSON.stringify(await ev(() => window.__rgSky.dragon.lastTour))} wallet ${w1}->${await wallet()}`, await st());
    await shot('dragon-after');
    console.log('[dragon] UI', JSON.stringify(await visibleText()));
  }
} finally {
  await g.close();
}
