// QA6 B: start a booth game the child way (walk onto the pad, E), then dump its debug once playing.
const id = globalThis.QA_ID;
await page.evaluate((id) => window.__rgGlasses.goto(id), id);
await st(30, false);
const pv = await page.evaluate((id) => window.__rgGlasses.boothPadView(id), id);
const dbg = () => page.evaluate((id) => window.__rgGlasses.debug(id), id);
const d0 = await dbg();
const pad0 = d0.pad ?? pv; const pad = Array.isArray(pad0) ? { x: pad0[0], z: pad0[2] } : pad0;
if (d0.approach) log("approach", await H.walkTo(d0.approach.x, d0.approach.z, 10, 0.8));
log('walk to pad', await H.walkTo(pad.x, pad.z, 15, 0.5));
await st(20);
await H.snap(`gl/${id}-01-onpad`);
log('ui on pad', await H.ui());
await page.keyboard.press('KeyE');
const t0 = Date.now();
for (let i = 0; i < 10; i++) {
  await st(30, false);
  const k = await page.evaluate((id) => window.__rgGlasses.boothDebug(id).phase, id);
  if (k === 'play') break;
}
await st(1);
await H.snap(`gl/${id}-02-play`);
const d = await dbg();
const strip = (o, depth = 0) => {
  if (Array.isArray(o)) return o.length > 6 ? `[${o.length}]` : o.map((x) => strip(x, depth + 1));
  if (o && typeof o === 'object') { if (depth > 1) return '{..}'; const r = {}; for (const [k, v] of Object.entries(o)) if (k !== 'kit') r[k] = strip(v, depth + 1); return r; }
  return typeof o === 'number' ? +o.toFixed(2) : o;
};
log(id, 'kit phase', d.kit?.phase, JSON.stringify(strip(d)).slice(0, 1800));
