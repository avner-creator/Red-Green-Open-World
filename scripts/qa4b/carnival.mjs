// QA4b: carnival row. Walk in through the arch, play every booth once (free), then 0-gem child and a paid replay.
import { open } from './lib.mjs';

const g = await open('carnival');
const { page, shot, step, st, release, tap, walkTo, tp, setKeys, visibleText } = g;
const info = () => page.evaluate(() => window.__rgCarnival.info());
const wallet = () => page.evaluate(() => window.__rg.ctx.profile.wallet);
try {
  const i0 = await info();
  console.log('site', JSON.stringify(i0.site), 'booths', JSON.stringify(i0.booths.map((b) => [b.id, b.playable, b.stand.map((v) => +v.toFixed(1))])));
  // Approach from the plaza end (arch at z ~ -26), 10 m out.
  await tp(i0.site.x, -16, Math.PI);
  await shot('approach');
  const r = await walkTo(i0.site.x, -30, { maxS: 15 });
  console.log('through arch', r, await st());
  await shot('in-arch');

  async function playBooth(b, tag) {
    const rr = await walkTo(b.stand[0], b.stand[2], { tol: 0.6, maxS: 25 });
    console.log(`[${tag}] walk to stand`, JSON.stringify(rr), await st());
    const w0 = await wallet();
    await shot(`${tag}-stand`);
    await tap('KeyE');
    await step(10);
    let inf = await info();
    console.log(`[${tag}] after E active=${inf.active} phase=${inf.phase} wallet ${w0}->${await wallet()}`, JSON.stringify(await visibleText()));
    if (!inf.active) { await shot(`${tag}-noStart`); return; }
    let t = 0, next = 0;
    while (t < 60 * 60) {
      inf = await info();
      if (!inf.active || inf.phase === 'result' || inf.result) break;
      // A mashing child: sweep left/right, nudge up/down, press the action often.
      const ph = Math.floor(t / 40) % 4;
      const keys = [ph === 0 || ph === 1 ? 'KeyA' : 'KeyD'];
      if (Math.floor(t / 90) % 3 === 1) keys.push('KeyW');
      if (Math.floor(t / 90) % 3 === 2) keys.push('KeyS');
      if (b.id === 'ringToss') { if (t % 60 < 35) keys.push('Space'); }
      else if (t % 30 < 4) keys.push('Space');
      await setKeys(keys);
      await step(4);
      t += 4;
      if (t >= next) { await shot(`${tag}-t${Math.round(t / 60)}`); next += 120; }
    }
    await release();
    inf = await info();
    console.log(`[${tag}] round ended ${(t / 60).toFixed(1)} s phase=${inf.phase} scores=${JSON.stringify(inf.scores)} result=${JSON.stringify(inf.result)} plush=${inf.plush} wallet=${await wallet()}`);
    await step(60);
    await shot(`${tag}-result`);
    console.log(`[${tag}] UI`, JSON.stringify(await visibleText()));
    await tap('KeyR');
    await step(30);
    inf = await info();
    console.log(`[${tag}] after R active=${inf.active}`, await st());
  }
  for (const b of i0.booths) await playBooth(b, b.id);
  // 0-gem child at an already-played booth.
  const bp = i0.booths[0];
  await page.evaluate(() => { const p = window.__rg.ctx.profile; p.spend(p.wallet, 'shop'); });
  console.log('wallet emptied', await wallet());
  await walkTo(bp.stand[0] - 2, bp.stand[2], { tol: 0.5 });
  await walkTo(bp.stand[0], bp.stand[2], { tol: 0.5 });
  await tap('KeyE');
  await step(10);
  console.log('[zero-gem] after E', JSON.stringify(await info()).slice(0, 200), JSON.stringify(await visibleText()));
  await shot('zero-gem-E');
  await step(60);
  await shot('zero-gem-E-1s');
  // Paid replay with 5 gems.
  await page.evaluate(() => window.__rg.ctx.profile.earn(5, 'gem'));
  await playBooth(bp, 'paid-' + bp.id);
} finally {
  await g.close();
}
