// QA7 A (M3): every Pip lead destination, phone 750x342 touch. For each destination take Pip's planned way
// from spawn, start 15 m back along its last leg and push the touch stick straight at the destination.
// Usage: RG_PORT=4398 node scripts/qa7/phone-dests.mjs
import { open, touchSession } from './lib.mjs';
import { phoneKit, phoneStart } from './phonelib.mjs';

const { page, shot, close, errors } = await open('phone-dests', { query: '&quality=low&freeze=1', device: 'iPhone 13 landscape', ctxOpts: { deviceScaleFactor: 1 } });
try {
  const t = await touchSession(page);
  await phoneStart(page, t);
  const K = phoneKit(page, t);
  const dests = await page.evaluate(() => window.__rgBuddy.dests());
  console.log('dests', JSON.stringify(dests.map((d) => [d.name, d.dest.map((v) => +v.toFixed(1)), d.ok, d.moved])));
  const res = [];
  for (const d of dests.filter((d) => !process.env.QA_ONLY || process.env.QA_ONLY.split(',').includes(d.name))) {
    const route = await page.evaluate(([n]) => window.__rgBuddy.plan(0, 9, n), [d.name]);
    let from;
    const [dx, dz] = d.dest;
    if (route && route.length >= 2) {
      const a = route[route.length - 2];
      const L = Math.hypot(dx - a[0], dz - a[1]) || 1;
      const back = Math.min(15, L);
      from = [dx - ((dx - a[0]) / L) * back, dz - ((dz - a[1]) / L) * back];
    } else { const L = Math.hypot(dx, dz - 9) || 1; from = [dx - (dx / L) * 15, dz - ((dz - 9) / L) * 15]; }
    await K.tp(from[0], from[1], Math.atan2(dx - from[0], dz - from[1]));
    const r = await K.walkTo(dx, dz, 20, 1.2);
    await page.evaluate(() => window.__rg.render());
    await shot(`${d.name}`);
    res.push({ name: d.name, from: from.map((v) => +v.toFixed(1)), routeLen: route?.length ?? 0, ...r, ok: r.d < 1.5 });
    console.log(JSON.stringify(res[res.length - 1]));
  }
  console.log('FAILS', JSON.stringify(res.filter((r) => !r.ok)));
  console.log('errors', errors.length, JSON.stringify(errors.slice(0, 5)));
} finally {
  await close();
}
