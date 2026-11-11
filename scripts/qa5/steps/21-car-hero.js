// While driving: is the hero model visible, where is it relative to the car and Pip?
const r = await page.evaluate(() => {
  const ctx = window.__rg.ctx;
  const o = ctx.player.object;
  let vis = o.visible;
  for (let p = o.parent; p; p = p.parent) vis = vis && p.visible;
  const wp = new o.position.constructor();
  o.getWorldPosition(wp);
  const car = ctx.vehicles.all.find((v) => v.kind === 'car');
  return { mode: ctx.player.mode, visible: o.visible, chainVisible: vis, scale: o.scale.toArray(), hero: wp.toArray().map((v) => +v.toFixed(2)), car: car.position.toArray().map((v) => +v.toFixed(2)), pip: window.__rgBuddy?.pos().map((v) => +v.toFixed(2)), cam: ctx.camera.position.toArray().map((v) => +v.toFixed(2)) };
});
log(JSON.stringify(r));
// Orbit camera to the side with the mouse look (drag) to see the seats.
await page.mouse.move(480, 270);
await page.mouse.down();
await page.mouse.move(700, 270, { steps: 5 });
await page.mouse.up();
await st(10);
log(await H.snap('b/side-look'));
