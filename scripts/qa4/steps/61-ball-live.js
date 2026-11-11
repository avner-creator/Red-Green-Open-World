// Silly Zone ball: horizontal distance hero -> ball centre every 5 frames while walking into it.
const bp = () => page.evaluate(() => { let p = null; window.__rg.ctx.scene.traverse((x) => { if (!p && /^silly-ball/.test(x.name)) { const v = x.getWorldPosition(x.position.clone()); const r = new (x.position.constructor)(); new (window.__rg.ctx.scene.constructor === Object ? Object : Object)(); p = [v.x, v.y, v.z, x.geometry?.boundingSphere?.radius ?? (x.children[0]?.geometry?.boundingSphere?.radius ?? -1)]; } }); return p; });
for (const ang of [0.4, 2.2, 4.0]) {
  const b0 = await bp();
  await H.near(b0[0], b0[2], 8, ang);
  const tr = [];
  await page.keyboard.down('KeyW');
  for (let j = 0; j < 30; j++) { await st(5, false); const s = await H.s(); const b = await bp(); tr.push(`${H.dist(s.p, b).toFixed(1)}/${(s.p[1] - b[1]).toFixed(1)}`); }
  await page.keyboard.up('KeyW');
  log('ang', ang, 'r', b0[3], tr.join(' '));
}
