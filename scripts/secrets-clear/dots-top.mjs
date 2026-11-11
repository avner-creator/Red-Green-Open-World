// Top-down look at chest 0's dotted area hint (debug view).
import { open } from './lib.mjs';
const t = await open('dots');
await t.start();
const c = (await t.page.evaluate(() => window.__rgChests.info()))[Number(process.env.CHEST ?? 0)];
await t.stand(c.position[0] - 4, c.position[2], c.position[0], c.position[2], 30);
await t.page.evaluate((c) => {
  const rg = window.__rg; const cam = rg.ctx.camera;
  rg.ctx.uiRoot.style.display = 'none';
  cam.position.set((c.position[0] + c.area[0]) / 2, c.position[1] + 16, (c.position[2] + c.area[1]) / 2 + 6);
  cam.lookAt((c.position[0] + c.area[0]) / 2, c.position[1], (c.position[2] + c.area[1]) / 2);
  rg.render();
}, c);
await t.shot('top', { channels: true });
const m = await t.page.evaluate(() => { const o = window.__rg.ctx.scene.getObjectByName('chest-hint-dots'); const a = new (o.matrixWorld.constructor)(); o.getMatrixAt(0, a); return { count: o.count, visible: o.visible, parent: !!o.parent, m0: a.elements.slice(12, 15), s0: a.elements[0] }; });
console.log(JSON.stringify(m), JSON.stringify(c.key), JSON.stringify(c.area));
const dbg = await t.page.evaluate(() => {
  const o = window.__rg.ctx.scene.getObjectByName('chest-hint-dots');
  const M = o.matrixWorld.constructor; const a = new M();
  const out = [];
  for (let i = 0; i < 5; i++) { o.getMatrixAt(i, a); out.push([a.elements[0].toFixed(2), a.elements[12].toFixed(1), a.elements[13].toFixed(2), a.elements[14].toFixed(1)]); }
  return { out, layers: o.layers.mask, geoCount: o.geometry.attributes.position.count, mat: o.material.type, vis: o.material.visible, matrixWorld: o.matrixWorld.elements.slice(12) , ic: !!o.instanceColor, rend: o.visible };
});
console.log(JSON.stringify(dbg));
await t.close();
