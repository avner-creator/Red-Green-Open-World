// QA6: where is the parked horse and is it drawn?
const r = await page.evaluate(() => {
  const h = window.__rg.ctx.vehicles.all.find((x) => x.kind === 'horse');
  let meshes = 0, vis = 0;
  h.object.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) { meshes++; let v = true; let p = o; while (p) { if (!p.visible) v = false; p = p.parent; } if (v) vis++; } });
  return { pos: h.position.toArray().map((v) => +v.toFixed(2)), objPos: h.object.position.toArray().map((v) => +v.toFixed(2)), visible: h.object.visible, inScene: !!h.object.parent, meshes, vis };
});
log(r);
const p = r.pos;
await page.evaluate(([x, z]) => window.__rg.teleport(x + 5, window.__rg.ctx.world.heightAt(x + 5, z) + 0.3, z, -Math.PI / 2), [p[0], p[2]]);
await st(60);
await H.snap('pk/horse-look');
