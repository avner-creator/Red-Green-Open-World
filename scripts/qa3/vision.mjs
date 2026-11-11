// QA3 part 3: red-green rule audit at two mini-games and a chest, all four lens/eye combos.
// For each spot: render with all layers, with WeakOnly hidden, with StrongOnly hidden; diff the
// canvas per channel (only the weak / strong channel may change) and diff the DOM text (the HUD
// and Pip must not change when the weak layer is hidden). Saves full + R + G page shots.
// Usage: npm run build && RG_PORT=4354 node scripts/qa3/vision.mjs
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { open } from './lib.mjs';

const { page, shot, close, out } = await open('vision', { query: '&quality=low&buddy=1' });
const SPOTS = [['mg-oddone', -47.4, -2.2], ['mg-dots', 64, 8], ['mg-glowflies', -40.7, 73.2]];
const COMBOS = [['red', 'left'], ['red', 'right'], ['green', 'left'], ['green', 'right']];
async function canvas() {
  const url = await page.evaluate(() => document.getElementById('game').toDataURL('image/png'));
  return PNG.sync.read(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
}
function diff(a, b) {
  const n = [0, 0, 0];
  for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) if (Math.abs(a.data[i + c] - b.data[i + c]) > 2) n[c]++;
  return { r: n[0], g: n[1], b: n[2] };
}
const domText = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
try {
  await page.evaluate(() => {
    window.__rg.freeze(true);
    window.__rg.start();
    window.__rg.step(1 / 60, 10, false);
  });
  const chest = await page.evaluate(() => {
    const p = window.__rg.ctx.player.position;
    let best = null;
    let bd = 1e9;
    for (const c of window.__rg.ctx.world.chestSpots) {
      const d = Math.hypot(c.position.x - p.x, c.position.z - p.z);
      if (d < bd) {
        bd = d;
        best = [c.position.x, c.position.z];
      }
    }
    return best;
  });
  SPOTS.push(['chest', chest[0], chest[1]]);
  for (const [name, x, z] of SPOTS) {
    for (const [leftLens, weakEye] of COMBOS) {
      await page.evaluate(([x, z, leftLens, weakEye]) => {
        const rg = window.__rg;
        rg.setEye({ leftLens, weakEye });
        const px = x;
        const pz = z + 4.5;
        rg.teleport(px, rg.ctx.world.heightAt(px, pz) + 0.3, pz, Math.atan2(x - px, z - pz));
        rg.setLayerVisible(1, true);
        rg.setLayerVisible(2, true);
        rg.step(1 / 60, 90, false);
        rg.step(1 / 60, 1);
      }, [x, z, leftLens, weakEye]);
      const full = await canvas();
      const t0 = await domText();
      const tag = `${name}-${leftLens}L-weak${weakEye}`;
      if (leftLens === 'red' && weakEye === 'left') await shot(tag, { channels: true });
      await page.evaluate(() => {
        window.__rg.setLayerVisible(1, false);
        window.__rg.render();
      });
      const noWeak = await canvas();
      const t1 = await domText();
      await page.evaluate(() => {
        window.__rg.setLayerVisible(1, true);
        window.__rg.setLayerVisible(2, false);
        window.__rg.render();
      });
      const noStrong = await canvas();
      await page.evaluate(() => window.__rg.setLayerVisible(2, true));
      const weakCh = (leftLens === 'red') === (weakEye === 'left') ? 'R' : 'G';
      console.log(tag, 'weakChannel', weakCh, 'weak-layer diff', JSON.stringify(diff(full, noWeak)), 'strong-layer diff', JSON.stringify(diff(full, noStrong)), 'DOM same:', t0 === t1);
      if (t0 !== t1) console.log('  DOM A:', t0.slice(0, 300), '\n  DOM B:', t1.slice(0, 300));
      if (leftLens === 'red' && weakEye === 'left') writeFileSync(`${out}/${tag}-noweak.png`, PNG.sync.write(noWeak));
    }
  }
  await page.evaluate(() => window.__rg.setEye({ leftLens: 'red', weakEye: 'left' }));
} finally {
  await close();
}
