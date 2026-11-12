// QA7: child coming from Pip's point gets stuck at the third answer pedestal and presses E there (idle booth).
const G = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses[fn](...a), [fn, a]);
for (let i = 0; i < 40 && (await G('boothDebug', 'dotsigns'))?.phase !== 'idle'; i++) await st(60, false);
const pad = (await G('debug', 'dotsigns')).pad;
await page.evaluate(([x, z]) => { const rg = window.__rg; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.4, z, Math.atan2(66 - x, 6.3 - z)); rg.step(1 / 60, 30, false); }, [62.5, 8]);
log('walk', JSON.stringify(await H.walkTo(66.04, 6.26, 4, 0.5)));
log('ui', await H.ui());
const d0 = await G('debug', 'dotsigns');
await tap('KeyE', 10);
const tl = [];
for (let i = 0; i < 30; i++) {
  await st(30, false);
  const d = await G('debug', 'dotsigns');
  const k = await G('boothDebug', 'dotsigns');
  tl.push(`${i / 2} ${k?.phase}/${d.state} round ${d.round} hits ${d.hits} misses ${d.misses} p ${JSON.stringify((await H.s()).p)}`);
  if (i === 4) await H.snap('dots7/50-pedestal-E');
  if (k?.phase === 'cooldown') break;
}
log('misses before', d0.misses, '\n' + tl.join('\n'));
