// Item 1 retry: approach along the paved entrance path (between the striped poles).
const T = [58, -24];
await page.evaluate(() => { const rg = window.__rg; rg.teleport(36, rg.ctx.world.heightAt(36, -19.5) + 0.5, -19.5, Math.atan2(22, -4.5)); rg.step(1 / 60, 30, false); });
await H.snap('a/tramp2/00-approach');
let i = 0;
const path = [];
await hold(['KeyW'], 180, 20, async (s) => {
  path.push(`${s.playerPosition.map((n) => n.toFixed(0)).join(',')}:${s.playerMode}`);
  if (i++ % 3 === 0) await H.snap(`a/tramp2/walk-${i}`);
});
log('walk', path.join(' '));
const ys = [];
await page.keyboard.down('Space');
for (let k = 0; k < 24; k++) {
  await st(30, k % 3 === 0);
  const s = await H.s();
  ys.push(`${s.p[1].toFixed(0)}`);
  if (k % 3 === 0) await H.snap(`a/tramp2/hold-${k}`);
}
await page.keyboard.up('Space');
log('hold space y', ys.join(' '), await H.s());
const tr = [];
await hold(['KeyA', 'KeyW'], 120, 20, async (s, f) => { tr.push(s.playerPosition[1].toFixed(0)); if (f % 40 === 0) await H.snap(`a/tramp2/trick-${f}`); });
log('trick ys', tr.join(' '));
const dec = [];
for (let k = 0; k < 16; k++) { await st(60, k % 4 === 0); const s = await H.s(); dec.push(s.p[1].toFixed(0)); if (k % 4 === 0) await H.snap(`a/tramp2/decay-${k}`); }
log('decay', dec.join(' '), await H.s());
log('hud text', await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200)));
