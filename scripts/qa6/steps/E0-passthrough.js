// Walk INTO big things from 4 sides: the parked buggy, the Gear Shack kiosk, the trampoline frame, the balloon basket,
// a carnival booth, the Scoops parlour. Pass-through = the hero centre gets within `inner` m of the object's centre.
if ((await H.s()).mode !== 'walk') { await page.keyboard.press('KeyR'); await st(60); }
const car = await page.evaluate(() => window.__rg.ctx.vehicles.all.find((v) => v.kind === 'car').position.toArray());
const targets = [
  ['buggy', car[0], car[2], 0.7, 7],
  ['gearShack', 14, 2, 1.0, 7],
  ['scoops', 24, -2, 2.5, 10],
  ['balloonPop booth', 25.5, -30, 1.0, 7],
  ['plaza fountain', 0, 2, 1.5, 8],
];
const out = [];
for (const [name, x, z, inner, d] of targets) {
  for (const ang of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const sx = x + Math.sin(ang) * d;
    const sz = z + Math.cos(ang) * d;
    await page.evaluate(([x, z, yaw]) => window.__rg.teleport(x, window.__rg.ctx.world.heightAt(x, z) + 0.3, z, yaw), [sx, sz, Math.atan2(x - sx, z - sz)]);
    await st(30, false);
    let minD = 99;
    let camIn = 0;
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    for (let k = 0; k < 16; k++) {
      await st(10, false);
      const r = await page.evaluate(() => { const c = window.__rg.ctx.camera.position; const p = window.__rg.ctx.player.object.position; return { p: window.__rg.state().playerPosition, cd: c.distanceTo(p) }; });
      minD = Math.min(minD, Math.hypot(r.p[0] - x, r.p[2] - z));
      if (r.cd < 1.2) camIn++;
    }
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    const mode = (await H.s()).mode;
    if (minD < inner || camIn > 4) await H.snap(`pt/${name.replace(/\s/g, '_')}-${ang.toFixed(1)}`);
    out.push(`${name} from ${ang.toFixed(1)}: minD ${minD.toFixed(2)} (inner ${inner}) ${minD < inner ? 'PASS-THROUGH?' : 'ok'} camClose ${camIn} mode ${mode}`);
    if (mode !== 'walk') { await page.keyboard.press('KeyE'); await st(40, false); if ((await H.s()).mode !== 'walk') { await page.keyboard.press('KeyR'); await st(60, false); } }
  }
}
log(out.join('\n'));
