// QA7: probe the bounce weave: per-frame flight vy and weave falls/ring while bouncing (Space held 2 s, then free).
const W = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses.weave[fn](...a), [fn, a]);
await page.evaluate(() => { const rg = window.__rg; rg.teleport(58, 19, -24, 0); rg.step(1 / 60, 30, false); });
await page.keyboard.down('Space'); await st(120, false); await page.keyboard.up('Space');
const rows = [];
for (let i = 0; i < 240; i++) {
  await st(1, false);
  if (i % 6 === 0) {
    const d = await W('debug', 'bounce');
    const s = await H.s();
    rows.push(`${i} y=${s.p[1].toFixed(1)} mode=${s.mode} onT=${d.onTrampoline} falling=${d.falling} ring=${d.ring} falls=${d.falls} skipped=${d.skipped} fall=${JSON.stringify(d.fall)?.slice(0, 60)}`);
  }
}
log(rows.join('\n'));
