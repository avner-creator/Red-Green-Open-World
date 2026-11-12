// QA8 A/M3: dot signs pad from Pip's lead point and from the stepping-stone trail (parklink road edge ~ (70.9, 6.0)).
const G = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses[fn](...a), [fn, a]);
for (let i = 0; i < 3 && (await H.s()).mode !== 'walk'; i++) { await page.keyboard.press('KeyE'); await st(60, false); }
log('mode', (await H.s()).mode);
await G('goto', 'dotsigns');
await st(30, false);
const d = await G('debug', 'dotsigns');
const P = (p) => (Array.isArray(p) ? { x: p[0], z: p[2] } : p);
const pad = P(d.pad ?? (await G('boothPadView', 'dotsigns')));
log('pad', pad, 'approach', d.approach, 'boothDebug', JSON.stringify(await G('boothDebug', 'dotsigns')).slice(0, 300));
const dest = (await page.evaluate(() => window.__rgBuddy.dests().find((x) => x.name === 'dotsigns'))).dest;
const face = (x, z, tx, tz) => page.evaluate(([x, z, tx, tz]) => { const rg = window.__rg; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.5, z, Math.atan2(tx - x, tz - z)); rg.step(1 / 60, 40, false); }, [x, z, tx, tz]);
// 1) Pip's lead point
await face(dest[0], dest[1], pad.x, pad.z);
await H.snap('m3/pip-00');
const r1 = await H.walkTo(pad.x, pad.z, 25, 0.6);
log('from Pip point', dest, r1);
await H.snap('m3/pip-01-end');
log('ui', await H.ui());
// 2) stepping-stone trail: start at the road edge, look at the booth
const start = [70.9, 6.0];
await face(start[0], start[1], 64, 8);
await H.snap('m3/trail-00');
// follow the stones (straight line to the site edge), then head to the pad
const r2a = await H.walkTo(64 + (start[0] - 64) * 0.45, 8 + (start[1] - 8) * 0.45, 12, 0.6);
await H.snap('m3/trail-01-stones-end');
log('trail end', r2a, await H.ui());
const r2 = await H.walkTo(pad.x, pad.z, 25, 0.6);
log('trail -> pad', r2);
await H.snap('m3/trail-02-end');
// 3) start round, then try walking pedestal to pedestal (m9)
await page.keyboard.press('KeyE'); await st(60);
log('phase', (await G('boothDebug', 'dotsigns'))?.phase);
