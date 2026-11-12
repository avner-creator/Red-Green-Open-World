// QA6: does look input move the line-up bubble on screen? (during play)
const G = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses[fn](...a), [fn, a]);
const sb = async () => { const d = await G('debug', 'lineup'); return { b: d.screen.bubbles.find((x) => x), r: d.screen.ring, inside: d.inside, cam: await page.evaluate(() => { const c = window.__rg.ctx.camera; const f = c.getWorldDirection(new c.position.constructor()); return [f.x, f.y, f.z].map((v) => +v.toFixed(3)); }) }; };
log('0', JSON.stringify(await sb()), 'kit', JSON.stringify((await G('boothDebug', 'lineup')).camHeld));
for (const inj of [{ lookX: 0.03 }, { lookX: -0.03 }, { lookY: 0.03 }, { lookY: -0.03 }]) {
  await page.evaluate((p) => window.__rg.inject(p), inj);
  await st(10, false);
  await page.evaluate(() => window.__rg.inject(null));
  log(JSON.stringify(inj), JSON.stringify(await sb()));
}
// arrow keys / A-D while on the pad
for (const k of ['ArrowLeft', 'KeyD']) {
  await page.keyboard.down(k); await st(20, false); await page.keyboard.up(k);
  log(k, JSON.stringify(await sb()), JSON.stringify(await page.evaluate(() => window.__rg.state().playerPosition)));
}
