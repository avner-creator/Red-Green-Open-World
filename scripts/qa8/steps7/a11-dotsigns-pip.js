// QA7: dot signs from Pip's lead point (62.5, 8): walk straight at the glowing pad with W, press E when the
// prompt shows, then hold still; log rounds. Then the same from the arrival spot of the booth (goto).
const G = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses[fn](...a), [fn, a]);
await G('goto', 'dotsigns'); await st(30, false);
await st(60 * 20, false); // let any old round finish
let d = await G('debug', 'dotsigns');
const P = (p) => (Array.isArray(p) ? { x: p[0], z: p[2] } : p);
const pad = P(d.pad ?? (await G('boothPadView', 'dotsigns')));
log('kit', (await G('boothDebug', 'dotsigns'))?.phase, 'misses', d.misses, 'buttons', JSON.stringify(d.buttons), 'pad', JSON.stringify(pad));
await page.evaluate(([x, z, px, pz]) => { const rg = window.__rg; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.4, z, Math.atan2(px - x, pz - z)); rg.step(1 / 60, 30, false); }, [62.5, 8, pad.x, pad.z]);
await H.snap('dots7/30-from-pip');
const tl = [];
let pressed = false;
for (let i = 0; i < 60; i++) {
  const r = await H.walkTo(pad.x, pad.z, 0.5, 0.5);
  const ui = await H.ui();
  d = await G('debug', 'dotsigns');
  const k = await G('boothDebug', 'dotsigns');
  tl.push(`${(i / 2).toFixed(1)} ${k?.phase}/${d.state} pos ${JSON.stringify(r.p)} d ${r.d} misses ${d.misses} hits ${d.hits} last ${JSON.stringify(d.lastResult)} ${ui.filter((u) => u.startsWith('prompt')).join()}`);
  if (!pressed && ui.some((u) => u.startsWith('prompt'))) { pressed = true; await page.keyboard.press('KeyE'); tl.push('E'); }
  if (i === 12) await H.snap('dots7/31-stuck');
  if (k?.phase === 'cooldown') break;
}
log(tl.join('\n'));
await H.snap('dots7/32-end');
