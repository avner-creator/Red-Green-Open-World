H.snap = async (name) => { await page.evaluate(() => window.__rg.render()); const p = await shot(name); H.shots.push(p); return p; };
const o = await page.evaluate(() => {
  const r = [];
  const B = window.__rg.ctx.scene.children[0].constructor; // unused
  window.__rg.ctx.scene.traverse((x) => {
    if (!/bung|bridge|deck/i.test(x.name)) return;
    const b = new (window.__rg.ctx.scene.position.constructor)();
    x.getWorldPosition(b);
    r.push(`${x.name}@${b.toArray().map((n) => n.toFixed(1))}`);
  });
  return r.slice(0, 30);
});
log(o);
// sample a ray-ish: heights reported by physics? try standing points around the platform
const P = [-5.8, 34.5, -106];
for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6], [10, 0]]) {
  await page.evaluate(([x, y, z]) => { const rg = window.__rg; rg.teleport(x, y + 0.6, z, 0); rg.step(1 / 60, 40, false); }, [P[0] + dx, P[1], P[2] + dz]);
  log(dx, dz, (await H.s()).p);
}
