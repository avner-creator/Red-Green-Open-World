// QA4b: Scoops. Walk in from the plaza, build two cones with keys (A/D, Space, E), try every topping effect.
import { open } from './lib.mjs';

const g = await open('scoops');
const { page, shot, step, st, pos, release, tap, walkTo, tp, setKeys, visibleText } = g;
const info = () => page.evaluate(() => window.__rgScoops.info());
const wallet = () => page.evaluate(() => window.__rg.ctx.profile.wallet);
const same = (t, want) => t && t.kind === want.kind && (want.id === undefined || t.id === want.id) && (want.index === undefined || t.index === want.index);
async function pick(want, settle = 0) {
  for (let i = 0; i < 14; i++) {
    const inf = await info();
    if (!inf.build) return 'no build';
    const cur = inf.tiles[inf.build.selected];
    if (same(cur, want)) {
      await tap('Space', 2);
      await step(settle || 20);
      return 'ok';
    }
    await tap('KeyD', 2);
    await step(4);
  }
  return 'not found';
}
try {
  const i0 = await info();
  console.log('site', JSON.stringify(i0.site), 'customer', i0.customer, 'recipe', JSON.stringify(i0.recipe));
  const cu = i0.customer;
  await tp(cu[0] - 10 * Math.sin(i0.site.yaw), cu[2] - 10 * Math.cos(i0.site.yaw), i0.site.yaw);
  await shot('approach');
  let r = await walkTo(cu[0], cu[2], { tol: 0.6 });
  console.log('to counter', JSON.stringify(r), await st());
  await shot('counter');

  async function cone(tag, plan) {
    const w0 = await wallet();
    await tap('KeyE');
    await step(90);
    let inf = await info();
    console.log(`[${tag}] after E phase=${inf.phase} wallet ${w0}->${await wallet()} stage=${inf.build?.stage}`, JSON.stringify(await visibleText()));
    await shot(`${tag}-enter`);
    if (!inf.build) return;
    console.log(`[${tag}] cone`, await pick({ kind: 'cone', id: plan.cone }));
    for (const f of plan.scoops) console.log(`[${tag}] scoop ${f}`, await pick({ kind: 'flavour', id: f }, plan.fast ? 6 : 100), 'lean', (await info()).lean?.toFixed?.(2));
    await shot(`${tag}-scoops`);
    await step(60);
    inf = await info();
    console.log(`[${tag}] after scoops: scoops=${JSON.stringify(inf.build.scoops)} debris=${JSON.stringify(inf.debris)?.slice(0, 80)}`);
    await shot(`${tag}-scoops-1s`);
    await tap('KeyE'); await step(20);
    console.log(`[${tag}] sauce`, await pick({ kind: 'sauce', id: plan.sauce }));
    for (const t of plan.toppings) console.log(`[${tag}] topping ${t}`, await pick({ kind: 'topping', id: t }, 40));
    if (plan.jar !== undefined) console.log(`[${tag}] jar ${plan.jar}`, await pick({ kind: 'jar', index: plan.jar }, 40));
    inf = await info();
    console.log(`[${tag}] build`, JSON.stringify(inf.build));
    await shot(`${tag}-built`);
    await tap('KeyE'); // next -> eat
    await step(10);
    inf = await info();
    console.log(`[${tag}] after E: phase=${inf.phase} stage=${inf.build?.stage}`);
    if (inf.phase === 'build') { await tap('KeyE'); await step(10); console.log(`[${tag}] after 2nd E phase=${(await info()).phase}`); }
    for (let k = 0; k < 6; k++) {
      await step(60);
      inf = await info();
      await shot(`${tag}-eat-${k}`);
      if (inf.phase === 'idle') break;
    }
    console.log(`[${tag}] done phase=${inf.phase} cones=${inf.cones} wallet=${await wallet()} effects=${JSON.stringify(inf.effects)}`, await st());
  }
  await cone('cone1', { cone: i0.recipe?.cone ?? 'waffle', scoops: i0.recipe?.scoops ?? ['vanilla', 'choc'], sauce: i0.recipe?.sauce ?? 'fudge', toppings: [...new Set([...(i0.recipe?.topping ? [i0.recipe.topping] : []), 'worms', 'popcorn', 'pickle'])].slice(0, 3), jar: 1 });
  // Try effects: sprint 2 s (speed), jump (height), screenshot (giant head etc).
  let p0 = await pos();
  await setKeys(['KeyW', 'ShiftLeft']); await step(120); await release();
  let p1 = await pos();
  console.log('sprint 2 s distance', Math.hypot(p1[0] - p0[0], p1[2] - p0[2]).toFixed(1));
  let maxY = p1[1];
  await page.keyboard.down('Space');
  for (let k = 0; k < 40; k++) { await step(3); maxY = Math.max(maxY, (await pos())[1]); if (k === 8) await shot('effects-jump'); }
  await page.keyboard.up('Space');
  console.log('jump height', (maxY - p1[1]).toFixed(1));
  await step(120);
  await shot('effects-after');
  // Cone 2: pile five scoops fast (topple), the other three toppings.
  await walkTo(cu[0], cu[2], { tol: 0.6 });
  await cone('cone2', { cone: 'rainbow', scoops: ['mint', 'blue', 'berry', 'choc', 'vanilla'], fast: true, sauce: 'caramel', toppings: ['duck', 'sprinkles', 'marsh'] });
  p0 = await pos();
  await setKeys(['KeyW']); await step(120); await release();
  await shot('effects2-walk');
  for (let k = 0; k < 4; k++) { await step(60); }
  await shot('effects2-4s');
  console.log('effects2', JSON.stringify((await info()).effects));
  // 0-gem child.
  await page.evaluate(() => { const p = window.__rg.ctx.profile; p.spend(p.wallet, 'shop'); });
  await walkTo(cu[0], cu[2], { tol: 0.6 });
  await tap('KeyE'); await step(30);
  console.log('[zero] after E', (await info()).phase, JSON.stringify(await visibleText()));
  await shot('zero-gem');
} finally {
  await g.close();
}
