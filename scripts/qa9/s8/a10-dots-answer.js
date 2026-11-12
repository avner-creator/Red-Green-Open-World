// QA8 A/m9: dot signs, answer by walking to the pedestal of the shape and pressing E; log stands, prompt, debug.
const G = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses[fn](...a), [fn, a]);
await G('goto', 'dotsigns');
await st(30, false);
let d = await G('debug', 'dotsigns');
const P = (p) => (Array.isArray(p) ? { x: p[0], z: p[2] } : p);
const pad = P(d.pad ?? (await G('boothPadView', 'dotsigns')));
log('pad walk', await H.walkTo(pad.x, pad.z, 25, 0.5));
await page.keyboard.press('KeyE');
const strip = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? +v.toFixed(2) : v)).slice(0, 700);
const ia = async () => (await page.evaluate(() => window.__rg.interactables())).filter((i) => /dotsigns/.test(i.id)).map((i) => `${i.id}@${i.position.map((v) => v.toFixed(1))}`);
const tl = [];
for (let i = 0; i < 120; i++) {
  await st(30, false);
  d = await G('debug', 'dotsigns');
  const k = await G('boothDebug', 'dotsigns');
  if (i < 8) tl.push(`${i / 2} ${k?.phase} ${strip(d)}`);
  if (k?.phase === 'play' && d.dotsShown && d.chosen === -1 && d.stand && d.answer >= 0) {
    const s = d.stand[d.answer]; globalThis.__ans = d.answer;
    const w = await H.walkTo(s.x, s.z, 6, 0.35);
    const iap = (await page.evaluate(() => window.__rg.interactables())).find((x) => x.id === `glasses-dotsigns-${globalThis.__ans}`);
    if (globalThis.QA_FACE) {
      const ip = (await page.evaluate(() => window.__rg.interactables())).find((x) => x.id === `glasses-dotsigns-${globalThis.__ans}`).position;
      // face it with a real key: turn by a short press toward it (A/D) using camera-relative steer then stop
      await H.walkTo(ip[0], ip[2], 0.5, 0.2);
    }
    const ui = await H.ui();
    await tap('KeyE', 20);
    const d2 = await G('debug', 'dotsigns');
    tl.push(`answer ${d.answer} stand ${JSON.stringify(s)} walk ${JSON.stringify(w)} ui ${ui.filter((x) => /prompt/.test(x))} ia ${await ia()} -> chosen ${d2.chosen} results ${JSON.stringify((await G('boothDebug', 'dotsigns'))?.results)}`);
    if (tl.length > 14) break;
  }
  if (i === 10) await H.snap('dots8/play');
  if (k?.phase === 'cooldown' || (i > 10 && k?.phase === 'idle')) break;
}
log(tl.join('\n'));
log('results', JSON.stringify((await G('boothDebug', 'dotsigns'))?.results));
