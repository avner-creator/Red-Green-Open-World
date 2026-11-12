// QA8 B: the open vault: list vault scene objects (name, rotation, visible), snap from 7 m and from 3 m off-axis.
const info = () => page.evaluate(() => window.__rgSecrets.info());
const d = (await info()).doors.find((x) => /village/.test(x.id));
log('door', JSON.stringify({ open: d.open, treasure: d.treasure, progress: d.progress }));
log(await page.evaluate(() => {
  const out = [];
  window.__rg.ctx.scene.traverse((o) => { if (/vault|door/i.test(o.name)) out.push(`${o.name} vis=${o.visible} rot=${o.rotation.toArray().slice(0, 3).map((v) => (+v).toFixed(2))} pos=${o.position.toArray().map((v) => v.toFixed(1))}`); });
  return out.slice(0, 40);
}));
const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
for (const [nm, dist, side] of [['far', 8, 0], ['side', 4, 2.5]]) {
  const x = d.x + fx * dist - fz * side, z = d.z + fz * dist + fx * side;
  await page.evaluate(([x, z, tx, tz]) => { const rg = window.__rg; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.4, z, Math.atan2(tx - x, tz - z)); rg.step(1 / 60, 90, true); }, [x, z, d.x, d.z]);
  await H.snap(`v/05-${nm}`);
}
