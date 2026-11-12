// QA8: trampoline secret path, stone 14 -> 15: trajectory of one jump with W held towards 15.
const info = await page.evaluate(() => window.__rgSecrets.info());
const S = info.paths[1].stones;
const a = S[14];
const b = S[15];
await page.evaluate(([x, y, z, tx, tz]) => { const rg = window.__rg; rg.teleport(x, y + 0.6, z, Math.atan2(tx - x, tz - z)); rg.step(1 / 60, 40, false); }, [a[0], a[1], a[2], b[0], b[2]]);
log('start', (await H.s()).p, 'target', b);
await H.snap('m10/last-0');
const rows = [];
await page.keyboard.down('Space');
await page.keyboard.down('KeyW');
for (let i = 0; i < 40; i++) {
  await st(2, false);
  if (i === 3) await page.keyboard.up('Space');
  const p = (await H.s()).p;
  rows.push(`${i * 2} ${p.join(',')} d=${Math.hypot(p[0] - b[0], p[2] - b[2]).toFixed(2)}`);
  if (Math.hypot(p[0] - b[0], p[2] - b[2]) < 0.3) { await page.keyboard.up('KeyW'); }
  if (i === 10) await H.snap('m10/last-1');
}
await page.keyboard.up('KeyW');
log(rows.join('\n'));
// what is near stone 15?
log(await page.evaluate(([x, y, z]) => {
  const ctx = window.__rg.ctx; const V = ctx.camera.position.constructor; const out = [];
  ctx.scene.traverse((o) => { if (!o.visible || !o.isMesh) return; const p = o.getWorldPosition(new V()); if (Math.hypot(p.x - x, p.z - z) < 4 && Math.abs(p.y - y) < 6) out.push(`${o.name || o.parent?.name}@${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`); });
  return out.slice(0, 30);
}, [b[0], b[1], b[2]]));
