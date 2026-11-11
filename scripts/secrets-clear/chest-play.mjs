// Approach each chest like a child (30 m, 10 m, touching, no key), walk to the key, carry it back and open from three sides.
import { open } from './lib.mjs';
const t = await open(process.env.OUT ?? 'chest');
await t.start();
const list = await t.page.evaluate(() => window.__rgChests.info());
const only = process.env.CHESTS ? process.env.CHESTS.split(',').map(Number) : list.map((_, i) => i);
for (const i of only) {
  const c = list[i];
  const [cx, , cz] = c.position;
  const [kx, , kz] = c.key;
  // approach from the side away from the key
  const ax = cx - kx, az = cz - kz, al = Math.hypot(ax, az) || 1;
  for (const dist of [30, 10, 3.6]) {
    await t.stand(cx + (ax / al) * dist, cz + (az / al) * dist, cx, cz, 40);
    await t.step(20, true);
    await t.shot(`c${i}-${dist}m`, { channels: dist === 10 && i === only[0] });
    if (dist === 10) console.log('chest', i, JSON.stringify(await t.page.evaluate((i) => { const c = window.__rgChests.info()[i]; return { badge: c.badge, dots: c.dots, area: c.area }; }, i)));
  }
  // Look from behind the chest toward the key's side (dots + weak trail in view).
  await t.stand(cx + (ax / al) * 5, cz + (az / al) * 5, kx, kz, 20);
  await t.shot(`c${i}-toward-key`, { channels: i === only[0] });
  await t.stand(cx + (ax / al) * 3.6, cz + (az / al) * 3.6, cx, cz, 10);
  await t.tap('e');
  await t.shot(`c${i}-nokey-E`);
  // walk to the key: stand 3 m short of it and hold W
  const kd = Math.hypot(kx - cx, kz - cz);
  const sx = kx + ((cx - kx) / kd) * 3, sz = kz + ((cz - kz) / kd) * 3;
  await t.stand(sx, sz, kx, kz, 20);
  await t.shot(`c${i}-key-near`, { channels: i === only[0] });
  await t.hold('w', 45);
  await t.shot(`c${i}-key-picked`);
  console.log('hud', JSON.stringify(await t.page.evaluate(() => window.__rgChests.hud())));
  const st = await t.page.evaluate((i) => window.__rgChests.info()[i].keyState, i);
  console.log('chest', i, 'key', st);
  // carry back: stand 6 m from chest on a side, walk in
  await t.stand(cx + (ax / al) * 6, cz + (az / al) * 6, cx, cz, 30);
  await t.shot(`c${i}-carry`);
  await t.hold('w', 30);
  await t.shot(`c${i}-at-ring`);
  const info = await t.page.evaluate((i) => window.__rgChests.info()[i], i);
  console.log('chest', i, 'open', info.open, 'wrong', info.wrongTries);
  if (!info.open) {
    const b = info.buttons.find((b) => b.symbol === info.symbol);
    await t.stand(b.x, b.z, cx, cz, 10);
    await t.step(30, true);
    console.log('chest', i, 'open after right button', await t.page.evaluate((i) => window.__rgChests.info()[i].open, i));
  }
  await t.step(30, true);
  await t.shot(`c${i}-opened`);
}
await t.close();
