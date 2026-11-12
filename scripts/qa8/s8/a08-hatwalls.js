// QA8 A: tall hat (top hat), back to walls: Gear Shack front and behind, Scoops front; walk backwards (S) into the wall 2 s.
for (let i = 0; i < 3 && (await H.s()).mode !== 'walk'; i++) { await page.keyboard.press('KeyE'); await st(60, false); }
const hat = globalThis.QA_HAT ?? 'hat-tophat';
log('equip', await page.evaluate((h) => { const c = window.__rg.ctx; c.profile.unlock(h, 'shop'); c.economy.equip('head', h); return c.profile.equipped('head'); }, hat));
await st(30, false);
const camD = () => page.evaluate(() => { const c = window.__rg.ctx.camera.position; const p = window.__rg.ctx.player.position; return +Math.hypot(c.x - p.x, c.y - p.y - 1.2, c.z - p.z).toFixed(2); });
// spots: [name, x, z, faceAwayFrom (wall) x,z]
const spots = [['shack-front', 10.5, 0.8, 14, 2], ['shack-back', 17.5, 3.0, 14, 2], ['shack-side', 13.2, 5.5, 14, 2], ['scoops-front', 15.5, -1.5, 18.4, 0.1]];
for (const [nm, x, z, wx, wz] of spots) {
  // face away from the wall, then walk backwards into it
  await page.evaluate(([x, z, wx, wz]) => { const rg = window.__rg; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.4, z, Math.atan2(x - wx, z - wz)); rg.step(1 / 60, 60, false); }, [x, z, wx, wz]);
  // walk into the wall first (facing it), then turn round with a tap of S and stand still
  await H.walkTo(wx, wz, 4, 0.3);
  await tap('KeyS', 6);
  await st(90, false);
  log(nm, (await H.s()).p, 'cam-to-head m', await camD());
  await H.snap(`hat/${hat}-${nm}`);
}
