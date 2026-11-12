// QA6: line-up vertical look test during play.
const G = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses[fn](...a), [fn, a]);
const sb = async () => { const d = await G('debug', 'lineup'); const b = d.screen.bubbles.find((x) => x); return { by: b && +b.y.toFixed(2), bx: b && +b.x.toFixed(2), ry: +d.screen.ring.y.toFixed(2), pitch: await page.evaluate(() => { const c = window.__rg.ctx.camera; const f = c.getWorldDirection(new c.position.constructor()); return +f.y.toFixed(3); }), ph: (await G('boothDebug', 'lineup')).phase }; };
log(JSON.stringify(await sb()));
for (const v of [0.03, 0.03, 0.03, -0.03, -0.03, -0.03, -0.03]) {
  await page.evaluate((v) => window.__rg.inject({ lookY: v }), v);
  await st(10, false);
  await page.evaluate(() => window.__rg.inject(null));
  await st(2, false);
  log(v, JSON.stringify(await sb()));
}
