// QA7 B: rocket / launch pads. From Pip's lead point (80.1, 22.5) look around, walk onto the nearest pad-like
// interactable or into the pad centre, press E if a prompt shows; log height/mode for 25 s.
const ia = await page.evaluate(() => window.__rg.interactables());
log('pads', JSON.stringify(ia.filter((i) => /rocket|launch|pad/i.test(i.id))));
await page.evaluate(() => { const rg = window.__rg; rg.teleport(80.1, rg.ctx.world.heightAt(80.1, 22.5) + 0.4, 22.5, Math.PI / 2); rg.step(1 / 60, 40, false); });
await H.snap('rocket/00-arrive');
const pad = ia.find((i) => /rocket|launch/i.test(i.id)) ?? null;
let tgt = pad ? pad.position : null;
if (!tgt) {
  // fall back: find the nearest object named like a pad in the scene
  tgt = await page.evaluate(() => { let best = null, bd = 1e9; const p = window.__rg.state().playerPosition; window.__rg.ctx.scene.traverse((o) => { if (/rocket|launch/i.test(o.name)) { const v = o.getWorldPosition(new window.__rg.ctx.camera.position.constructor()); const d = Math.hypot(v.x - p[0], v.z - p[2]); if (d < bd && d > 1) { bd = d; best = [v.x, v.y, v.z, o.name]; } } }); return best; });
}
log('target', JSON.stringify(tgt));
log('walk', JSON.stringify(await H.walkTo(tgt[0], tgt[2], 12, 0.6)), await H.ui());
await H.snap('rocket/01-on-pad');
if ((await H.ui()).some((u) => u.startsWith('prompt'))) await tap('KeyE', 10);
let ymax = -1e9;
const tl = [];
for (let i = 0; i < 50; i++) {
  await st(30, false);
  const s = await H.s();
  ymax = Math.max(ymax, s.p[1]);
  tl.push(`${i / 2} ${s.mode} ${JSON.stringify(s.p)}`);
  if (i % 6 === 0) await H.snap(`rocket/t${String(i).padStart(2, '0')}`);
  if (i === 6) tl.push('sep ' + JSON.stringify(await H.sep('rocket/sep')));
}
log(tl.filter((_, i) => i % 3 === 0).join('\n'), '\nymax', ymax, await H.ui());
