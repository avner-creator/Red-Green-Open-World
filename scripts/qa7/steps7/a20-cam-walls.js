// QA7 A: camera with the hero's back to a wall. Stand 4 m out facing away from the building, back up (S)
// into it for 2 s, then stand; log camera-hero distance and whether the hero mesh is faded.
const spots = globalThis.QA_SPOTS ?? [
  ['shack-front', 12.85, 1.67, 11.3, 1.2], ['shack-north', 12.85, 1.67, 13.5, 5.5], ['scoops-front', 24, -2, 18.4, 0.1], ['scoops-side', 24, -2, 24, 6],
  ['carnival-balloon', 25.5, -30, 21, -30], ['carnival-bell', 25.5, -48, 21, -48], ['dotsigns-booth', 66, 6.3, 62.5, 8],
];
const out = [];
for (const [nm, cx, cz, sx, sz] of spots) {
  const yaw = Math.atan2(sx - cx, sz - cz); // facing away from the building
  await page.evaluate(([x, z, y]) => { const rg = window.__rg; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.4, z, y); rg.step(1 / 60, 60, false); }, [sx, sz, yaw]);
  await page.keyboard.down('KeyS');
  await st(120, false);
  await page.keyboard.up('KeyS');
  await st(60, false);
  const m = await page.evaluate(() => {
    const ctx = window.__rg.ctx; const c = ctx.camera.position; const p = ctx.player.object.position;
    let minOp = 1; ctx.player.object.traverse((o) => { if (o.material && 'opacity' in o.material) minOp = Math.min(minOp, o.material.transparent ? o.material.opacity : 1); });
    return { cam: +Math.hypot(c.x - p.x, c.y - (p.y + 1), c.z - p.z).toFixed(2), heroOpacity: +minOp.toFixed(2), p: [p.x, p.z].map((v) => +v.toFixed(1)) };
  });
  await H.snap(`camwall/${nm}`);
  out.push([nm, JSON.stringify(m)]);
}
log(out.map((x) => x.join(' ')).join('\n'));
