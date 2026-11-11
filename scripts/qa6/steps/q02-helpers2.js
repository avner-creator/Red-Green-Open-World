// QA6 extra helpers on globalThis.H: channel-separation spot check, channel-split snapshot, play-step logging.
const { PNG } = await import('pngjs');
const { writeFileSync, mkdirSync } = await import('node:fs');
H.grab = async () => PNG.sync.read(await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' }));
H.chan = async () => page.evaluate(() => {
  const c = window.__rg.ctx.vision.channels();
  const e = window.__rg.ctx.settings.get().eye;
  const idx = (x) => (x === 'R' || x === 'r' || x === 0 ? 0 : 1);
  return { leftLens: e.leftLens, weakEye: e.weakEye, weak: idx(c.weak), strong: idx(c.strong), raw: c };
});
/** Same frozen frame with/without each layer: max abs delta per channel. */
H.sep = async (name) => {
  const ch = await H.chan();
  const render = (w, s) => page.evaluate(([w, s]) => { const rg = window.__rg; rg.setLayerVisible(1, w); rg.setLayerVisible(2, s); rg.render(); }, [w, s]);
  await render(true, true);
  const A = await H.grab();
  await render(false, true);
  const B = await H.grab();
  await render(true, false);
  const C = await H.grab();
  await render(true, true);
  const md = (X, Y) => { const m = [0, 0, 0]; let n = 0; for (let i = 0; i < X.data.length; i += 4) { let any = false; for (let c = 0; c < 3; c++) { const d = Math.abs(X.data[i + c] - Y.data[i + c]); if (d > m[c]) m[c] = d; if (d > 2) any = true; } if (any) n++; } return { m, n }; };
  const w = md(A, B);
  const s = md(A, C);
  const res = { ch, weakLayer: { weakMax: w.m[ch.weak], strongMax: w.m[ch.strong], blueMax: w.m[2], px: w.n }, strongLayer: { strongMax: s.m[ch.strong], weakMax: s.m[ch.weak], blueMax: s.m[2], px: s.n } };
  res.ok = res.weakLayer.strongMax === 0 && res.weakLayer.blueMax === 0 && res.strongLayer.weakMax === 0 && res.strongLayer.blueMax === 0;
  if (name) {
    const dir = 'test-results/qa6/drv/' + name.split('/').slice(0, -1).join('/');
    mkdirSync(dir, { recursive: true });
    writeFileSync(`test-results/qa6/drv/${name}.png`, PNG.sync.write(A));
    for (const [c, nm] of [[0, 'R'], [1, 'G']]) {
      const o = new PNG({ width: A.width, height: A.height });
      for (let i = 0; i < A.data.length; i += 4) { const v = A.data[i + c]; o.data[i] = o.data[i + 1] = o.data[i + 2] = v; o.data[i + 3] = 255; }
      writeFileSync(`test-results/qa6/drv/${name}.${nm}.png`, PNG.sync.write(o));
    }
  }
  return res;
};
log('helpers2 ok', await H.chan());
