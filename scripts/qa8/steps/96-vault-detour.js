// Vault (village): walk the last 10 m, look at the door (composite + R + G), step a WRONG pad, then the right sequence.
const info = () => page.evaluate(() => window.__rgSecrets.info());
const d = (await info()).doors.find((x) => /village/.test(x.id)) ?? (await info()).doors[0];
log('door', d.id, [d.x, d.z].map((v) => +v.toFixed(1)), 'seq', d.sequence, 'pads', JSON.stringify(d.pads.map((p) => p.map((v) => +v.toFixed(1)))), 'looks', d.padLooks);
// stand 7 m in front of the door (door faces +Z of its yaw)
const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
await page.evaluate(([x, z, yaw]) => window.__rg.teleport(x, window.__rg.ctx.world.heightAt(x, z) + 0.5, z, yaw), [d.x + fx * 14, d.z + fz * 14, d.yaw + Math.PI]);
await st(30);
log('walk', await H.walkTo(d.x + fx * 7, d.z + fz * 7, 8, 0.8));
await st(20);
// face the door: tap S briefly? camera follows behind hero walking to the door, fine.
const p1 = await shot('v2/00-door');
log(p1);
const png = await page.screenshot();
const { PNG } = await import('pngjs');
const { writeFileSync } = await import('node:fs');
const img = PNG.sync.read(png);
for (const [c, nm] of [[0, 'R'], [1, 'G']]) {
  const o = new PNG({ width: img.width, height: img.height });
  for (let i = 0; i < img.data.length; i += 4) { const v = img.data[i + c]; o.data[i] = o.data[i + 1] = o.data[i + 2] = v; o.data[i + 3] = 255; }
  writeFileSync('test-results/qa8/drv/v2/00-door.' + nm + '.png', PNG.sync.write(o));
}
// wrong step: a pad that is not sequence[0]
const wrong = [0, 1, 2, 3].find((i) => d.padLooks?.[i] !== undefined ? i !== d.sequence[0] && d.padLooks[i] !== d.sequence[0] : i !== d.sequence[0]);
log('wrong pad', wrong);
await H.walkTo(d.pads[wrong][0], d.pads[wrong][1], 8, 0.4);
await st(40);
let i1 = (await info()).doors.find((x) => x.id === d.id);
log('after wrong', 'progress', i1.progress, 'misses', i1.misses);
await H.snap('v2/01-wrong');
// right sequence: pads whose look == sequence[k] (or index if padLooks is identity)
for (let k = 0; k < d.sequence.length; k++) {
  const want = d.sequence[k];
  const idx = d.padLooks?.length ? d.padLooks.indexOf(want) : want;
  const padIdx = idx >= 0 ? idx : want;
  // step off pads first (walk back 2 m toward the door front centre)
  await H.walkTo(d.x + fx * 12, d.z + fz * 12, 6, 0.8);
  await H.walkTo(d.pads[padIdx][0] + fx * 5, d.pads[padIdx][1] + fz * 5, 6, 0.6);
  await H.walkTo(d.pads[padIdx][0], d.pads[padIdx][1], 8, 0.4);
  await st(40);
  i1 = (await info()).doors.find((x) => x.id === d.id);
  log('step', k, 'pad', padIdx, 'progress', i1.progress, 'open', i1.open, 'misses', i1.misses);
  await H.snap('v2/02-step' + k);
}
for (let j = 0; j < 4; j++) await st(60);
i1 = (await info()).doors.find((x) => x.id === d.id);
log('final', 'open', i1.open, 'treasure', JSON.stringify(i1.treasure), (await H.s()).wallet);
await H.snap('v2/03-open');
