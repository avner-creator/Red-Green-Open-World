// Buggy free drive: walk to the garage car, E, drive 60 s on/off road with W/A/D, bump toys; screenshots every ~2 s.
await page.evaluate(() => window.__rg.setRemaining(3000));
const ia = await page.evaluate(() => window.__rg.interactables());
log('interactables', JSON.stringify(ia.filter((i) => /car|buggy|garage|race|kart/i.test(i.id))));
const carPos = await page.evaluate(() => { const c = window.__rg.ctx.vehicles.all.find((v) => v.kind === 'car'); return [c.position.x, c.position.y, c.position.z]; });
log('car at', carPos);
const [cx, , cz] = carPos;
await H.near(cx, cz, 10, 2.6);
log('walk', await H.walkTo(cx, cz, 10, 2.0));
log('ui', await H.ui());
await H.snap('b/00-at-car');
await page.keyboard.press('KeyE');
await st(30);
log('after E', await H.s());
await H.snap('b/01-in-car');
const plan = [
  [['KeyW'], 4], [['KeyW', 'KeyD'], 2], [['KeyW'], 6], [['KeyW', 'KeyA'], 3], [['KeyW'], 8], [['KeyW', 'KeyD'], 2.5],
  [['KeyW'], 6], [['KeyS'], 2], [['KeyW', 'KeyA'], 4], [['KeyW'], 10], [['KeyW', 'KeyD'], 3], [['KeyW'], 8],
];
let t = 0;
const track = [];
for (const [keys, secs] of plan) {
  for (const k of keys) await page.keyboard.down(k);
  for (let s = 0; s < secs; s += 0.5) {
    await st(30, false);
    t += 0.5;
    const s1 = await page.evaluate(() => {
      const ctx = window.__rg.ctx;
      const p = window.__rg.state().playerPosition;
      const cam = ctx.camera.position;
      return { p: p.map((v) => +v.toFixed(1)), mode: window.__rg.state().playerMode, cam: [cam.x, cam.y, cam.z].map((v) => +v.toFixed(1)), h: +ctx.world.heightAt(p[0], p[2]).toFixed(1) };
    });
    track.push([t, ...s1.p, s1.mode, s1.h]);
    if (Math.abs(t % 2) < 0.01) await H.snap('b/drive-' + String(t).padStart(4, '0'));
  }
  for (const k of keys) await page.keyboard.up(k);
}
log('track', JSON.stringify(track));
log('errors', errors.slice(-5));
