// QA9: channel spot checks with the other glasses (green left, weak right) at the vault, the trampoline
// and the map board reading view. Same frozen frame with/without each vision layer.
// RG_PORT=4429 node scripts/qa9/sep3.mjs
import { PNG } from 'pngjs';
import { open } from './lib.mjs';

const { page, shot, close, errors } = await open('sep3', { query: '&quality=low&freeze=1', width: 960, height: 540 });
const grab = async () => PNG.sync.read(await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' }));
const md = (X, Y) => { const m = [0, 0, 0]; let n = 0; for (let i = 0; i < X.data.length; i += 4) { let any = false; for (let c = 0; c < 3; c++) { const d = Math.abs(X.data[i + c] - Y.data[i + c]); if (d > m[c]) m[c] = d; if (d > 2) any = true; } if (any) n++; } return { m, n }; };
try {
  await page.evaluate(() => { window.__rg.freeze(true); window.__rg.step(1 / 60, 1, true); window.__rg.setEye({ leftLens: 'green', weakEye: 'right' }); });
  await page.getByTestId('play').click();
  await page.evaluate(() => { window.__rg.step(1 / 60, 90, false); window.__rg.setRemaining(3000); });
  const ch = await page.evaluate(() => window.__rg.ctx.vision.channels());
  const W = ch.weak === 'r' ? 0 : 1, S = 1 - W;
  const b = await page.evaluate(() => window.__rgCamera.state().spots.find((s) => s.id === 'mapboard'));
  const places = [
    ['vault', 9.1, 33, 9.1, 25],
    ['trampoline', 50, -24, 58, -24],
    ['board', b.x + b.nx * 4.5, b.z + b.nz * 4.5, b.x, b.z],
  ];
  for (const [nm, x, z, tx, tz] of places) {
    await page.evaluate(([x, z, tx, tz]) => { const rg = window.__rg; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.3, z, Math.atan2(tx - x, tz - z)); rg.step(1 / 60, 150, false); }, [x, z, tx, tz]);
    const render = (w, s) => page.evaluate(([w, s]) => { const rg = window.__rg; rg.setLayerVisible(1, w); rg.setLayerVisible(2, s); rg.render(); }, [w, s]);
    await render(true, true); const A = await grab();
    await render(false, true); const B = await grab();
    await render(true, false); const C = await grab();
    await render(true, true);
    await shot(nm, { channels: true });
    const w = md(A, B), s = md(A, C);
    console.log(nm, JSON.stringify({ ch, weakLayer: { weak: w.m[W], strong: w.m[S], blue: w.m[2], px: w.n }, strongLayer: { strong: s.m[S], weak: s.m[W], blue: s.m[2], px: s.n } }));
  }
} finally {
  console.log('errors', errors.length, JSON.stringify(errors.slice(0, 5)));
  await close();
}
