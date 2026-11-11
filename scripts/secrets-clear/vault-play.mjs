// Approach each vault like a child: 30 m, 10 m, touching; then press the buttons in order with real E presses.
import { open } from './lib.mjs';
const t = await open(process.env.OUT ?? 'vault');
await t.start();
const doors = await t.page.evaluate(() => window.__rgSecrets.info().doors);
const out = (yaw, lx, lz) => ({ x: Math.cos(yaw) * lx + Math.sin(yaw) * lz, z: -Math.sin(yaw) * lx + Math.cos(yaw) * lz });
for (const [i, d] of doors.entries()) {
  for (const dist of [30, 10, 3]) {
    const o = out(d.yaw, 0, dist);
    await t.stand(d.x + o.x, d.z + o.z, d.x, d.z, 60);
    await t.step(30, true);
    await t.shot(`${d.id}-${dist}m`, { channels: dist === 10 });
  }
  // Wrong press first (a child guesses), then the right sequence.
  const seq = d.sequence;
  const wrong = [0, 1, 2, 3].find((b) => b !== seq[0]);
  // Walk onto pad b with real key presses: stand 2 m out from it facing it, hold W.
  const press = async (b, tag) => {
    const [x, z] = await t.page.evaluate(([i, b]) => window.__rgSecrets.standPoint(i, b), [i, b]);
    const ox = x - d.x, oz = z - d.z, ol = Math.hypot(ox, oz);
    await t.stand(x + (ox / ol) * 2.2, z + (oz / ol) * 2.2, x, z, 20);
    await t.hold('w', 16);
    await t.step(8, true);
    const st = await t.page.evaluate((i) => { const d = window.__rgSecrets.info().doors[i]; return [d.selected, d.progress, d.padLooks.join(',')]; }, i);
    console.log('  pad', b, '->', JSON.stringify(st));
    if (tag) await t.shot(`${d.id}-${tag}`);
    await t.hold('s', 16);
  };
  await press(wrong, 'wrong');
  for (const [k, b] of seq.entries()) await press(b, `right${k}`);
  await t.step(40, true);
  await t.shot(`${d.id}-opening`);
  await t.step(60, true);
  await t.shot(`${d.id}-open`);
  const [ix, iz] = await t.page.evaluate((i) => window.__rgSecrets.insidePoint(i), i);
  const o = out(d.yaw, 0, 4);
  await t.stand(d.x + o.x, d.z + o.z, d.x, d.z, 10);
  await t.hold('w', 80);
  await t.shot(`${d.id}-inside`);
  await t.step(30, true);
  await t.shot(`${d.id}-reward`);
  console.log(d.id, JSON.stringify(await t.page.evaluate((i) => window.__rgSecrets.info().doors[i], i)), JSON.stringify([ix, iz]));
}
await t.close();
