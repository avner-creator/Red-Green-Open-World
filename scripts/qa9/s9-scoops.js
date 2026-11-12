for (let i = 0; i < 3 && (await H.s()).mode !== 'walk'; i++) { await page.keyboard.press('KeyE'); await st(60, false); }
const I = () => page.evaluate(() => { const s = window.__rgScoops.info(); return { phase: s.phase, stage: s.build?.stage, cones: s.cones, cust: s.customer, yaw: s.site.yaw }; });
const s0 = await I();
log('scoops', JSON.stringify(s0));
// start 10 m in front of the customer spot
const fx = Math.sin(s0.yaw), fz = Math.cos(s0.yaw);
await page.evaluate(([x, z, tx, tz]) => { const rg = window.__rg; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.4, z, Math.atan2(tx - x, tz - z)); rg.step(1 / 60, 60, false); }, [s0.cust[0] + Math.sin(s0.yaw + 0.5) * 9, s0.cust[2] + Math.cos(s0.yaw + 0.5) * 9, s0.cust[0], s0.cust[2]]);
let w = await H.walkTo(s0.cust[0], s0.cust[2], 12, 0.8);
log('walk', JSON.stringify(w), 'ui', await H.ui());
await H.snap('scoops9e/00-arrive');
await page.keyboard.press('KeyE'); await st(60, true);
log('after E', JSON.stringify(await I()));
await H.snap('scoops9e/01-open');
const tl = [];
let last = '';
for (let i = 0; i < 80; i++) {
  const s = await I();
  const k = `${s.phase}/${s.stage}`;
  if (k !== last) { tl.push(`${(i * 0.75).toFixed(1)}s ${k}`); last = k; await H.snap(`scoops9e/p${i}-${s.phase}-${s.stage}`); }
  if (s.phase === 'idle' && i > 2) break;
  // a child: Space to drop/choose, E when it shows on the prompt, sometimes arrows
  if (i % 6 === 5) await page.keyboard.press('KeyE'); else if (i % 4 === 3) await page.keyboard.press('ArrowRight'); else await page.keyboard.press('Space');
  await st(45, false);
}
log(tl.join('\n'));
log('end', JSON.stringify(await I()), JSON.stringify(await H.s()));
log('sep', JSON.stringify(await H.sep('scoops9e/sep')));
