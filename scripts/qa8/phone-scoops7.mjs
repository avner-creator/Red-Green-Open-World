// QA7 A (round 6 M2 recheck): phone 750x342 touch. Walk with the steered touch stick straight through each
// Scoops customer from 4 sides (6 m before to 4 m beyond), and east past the parlour from (16,0); log stall
// time and min camera-hero distance; then the counter top; then start the Scoops game with the use button.
// Usage: RG_PORT=4397 node scripts/qa8/phone-scoops7.mjs
import { open, touchSession } from './lib.mjs';
import { phoneKit, phoneStart } from './phonelib.mjs';

const { page, shot, close, errors } = await open('phone-scoops7', { query: '&quality=low&freeze=1', device: 'iPhone 13 landscape', ctxOpts: { deviceScaleFactor: 1 } });
try {
  const t = await touchSession(page);
  await phoneStart(page, t);
  const K = phoneKit(page, t);
  const info = await page.evaluate(() => window.__rgScoops.info());
  const res = [];
  for (const [fi, f] of info.friends.entries()) {
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const fx = f.world[0], fz = f.world[2];
      const x0 = fx + Math.sin(a) * 6, z0 = fz + Math.cos(a) * 6;
      await K.tp(x0, z0, Math.atan2(fx - x0, fz - z0));
      let shotDone = false;
      const r1 = await K.walkTo(fx - Math.sin(a) * 4, fz - Math.cos(a) * 4, 12, 0.6, async (s) => {
        if (!shotDone && Math.hypot(s.p[0] - fx, s.p[2] - fz) < 1.6) { shotDone = true; await page.evaluate(() => window.__rg.render()); await shot(`cust${fi}-${Math.round(a * 57)}`); }
      });
      res.push({ cust: fi, from: Math.round(a * 57), ...r1 });
    }
  }
  console.log(JSON.stringify(res));
  for (const [tx, tz, nm] of [[30, 0, 'east'], [24, 6, 'ne'], [24, -6, 'se']]) {
    await K.tp(14, 0, Math.PI / 2);
    const r2 = await K.walkTo(tx, tz, 12, 0.8, async (s, tt) => { if (tt === 2) { await page.evaluate(() => window.__rg.render()); await shot(`past-${nm}`); } });
    console.log('past', nm, JSON.stringify(r2));
  }
  const sc = await page.evaluate(() => window.__rg.interactables().find((i) => i.id === 'scoops-counter')?.position);
  for (const [ox, oz, tx, tz] of [[0, 0, 30, 6], [0.8, 0.6, 14, 0], [-0.8, -0.6, 22, 8]]) {
    await page.evaluate(([x, y, z]) => { window.__rg.teleport(x, y + 0.4, z, 0); window.__rg.step(1 / 60, 30, false); }, [sc[0] + ox, sc[1], sc[2] + oz]);
    const y0 = (await K.S(1)).p[1];
    let off = null;
    const r3 = await K.walkTo(tx, tz, 8, 1, async (s, tt) => { if (off === null && Math.abs(s.p[1] - y0) > 0.6) off = tt; });
    console.log('counter', ox, 'y0', y0.toFixed(2), 'offAfter', off, JSON.stringify(r3));
  }
  console.log('errors', errors.length, JSON.stringify(errors.slice(0, 5)));
} finally {
  await close();
}
