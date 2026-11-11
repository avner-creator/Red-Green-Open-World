// QA3 probe: which weak-layer object floats next to the hero at the mini-game sites?
// Lists layer objects within 3 m of the player at the dot-signs site.
// Usage: npm run build && RG_PORT=4355 node scripts/qa3/probe.mjs
import { open } from './lib.mjs';

const { page, shot, close } = await open('probe', { query: '&quality=low' });
try {
  const res = await page.evaluate(() => {
    const rg = window.__rg;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 10, false);
    const x = 64;
    const z = 8;
    const px = x - 5;
    const pz = z;
    rg.teleport(px, rg.ctx.world.heightAt(px, pz) + 0.3, pz, Math.atan2(x - px, z - pz));
    rg.step(1 / 60, 60, false);
    rg.step(1 / 60, 1);
    const p = rg.ctx.player.position;
    const found = [];
    rg.ctx.scene.traverse((o) => {
      if (!o.isMesh && !o.isSprite) return;
      const w = o.getWorldPosition(o.position.clone());
      const d = w.distanceTo(p);
      if (d < 2.5 && o.visible) found.push(`${o.name || '?'} parent=${o.parent?.name} d=${d.toFixed(2)} layers=${o.layers.mask}`);
    });
    return { names: rg.layerObjects().map((l) => `${l.layer}:${l.name}`), found };
  });
  console.log(JSON.stringify(res, null, 1));
  await shot('dots');
} finally {
  await close();
}
