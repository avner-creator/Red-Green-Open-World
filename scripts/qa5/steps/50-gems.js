// 60 s gem hunt with real keys: always walk to the nearest live gem (read from the instanced mesh), jump if it is high.
if ((await H.s()).mode === 'driving') { await page.keyboard.press('KeyE'); await st(40); }
const gemsNear = () => page.evaluate(() => {
  const p = window.__rg.state().playerPosition;
  const V = (window.__qaV = window.__qaV ?? new Set());
  const out = [];
  window.__rg.ctx.world.gemSpots.forEach((g, i) => {
    const d = Math.hypot(g.position.x - p[0], g.position.z - p[2]);
    if (d < 1.4) V.add(i);
    if (!V.has(i)) out.push({ i, x: g.position.x, y: g.position.y, z: g.position.z, d, mega: false });
  });
  out.sort((a, b) => a.d - b.d);
  return { list: out.slice(0, 5), megas: window.__rgEconomy?.megaSpots.length };
});
const s0 = await page.evaluate(() => window.__rg.state());
// start near the plaza gem field
await H.near(0, 9, 1, 0);
const g0 = await gemsNear();
log('nearest', JSON.stringify(g0.list.slice(0, 3).map((g) => [g.x, g.y, g.z, g.d].map((v) => +v.toFixed(1)))), 'megas', g0.megas);
let t = 0;
let shots = 0;
const trace = [];
while (t < 60) {
  const g = (await gemsNear()).list[0];
  if (!g) break;
  const r = await H.walkTo(g.x, g.z, 3, 0.8, true);
  t += 3 - 0; // walkTo runs up to 3 s
  const st1 = await page.evaluate(() => window.__rg.state());
  if (g.y - st1.playerPosition[1] > 1.6 && g.d < 2) { await page.keyboard.down('Space'); await st(20, false); await page.keyboard.up('Space'); await st(40, false); }
  trace.push([t, +g.d.toFixed(1), g.mega, st1.gems, st1.bestCombo, st1.megaGems]);
  if (shots++ % 2 === 0) await H.snap('gem/t' + String(t).padStart(3, '0'));
}
const s1 = await page.evaluate(() => window.__rg.state());
log(JSON.stringify(trace));
log('gems', s0.gems, '->', s1.gems, 'bestCombo', s1.bestCombo, 'mega', s1.megaGems, 'wallet', (await H.s()).wallet);
// mega gem: go to the nearest mega spot and walk the last 10 m
const megas = await page.evaluate(() => window.__rgEconomy.megaSpots);
const p = s1.playerPosition;
megas.sort((a, b) => Math.hypot(a.x - p[0], a.z - p[2]) - Math.hypot(b.x - p[0], b.z - p[2]));
log('megas', JSON.stringify(megas.slice(0, 6).map((m) => [m.tag, +m.x.toFixed(1), +m.y.toFixed(1), +m.z.toFixed(1), +(m.y - window.__dummy0 || 0)])));
