// QA8 A/m5: ride the horse straight into the foam course rim (steer at the foam centre, W held 35 s).
for (let i = 0; i < 3 && (await H.s()).mode !== 'walk'; i++) { await page.keyboard.press('KeyE'); await st(60, false); }
const h = await page.evaluate(() => { const v = window.__rg.ctx.vehicles.all.find((x) => x.kind === 'horse'); return v.position.toArray(); });
await H.near(h[0], h[2], 6, 1.0);
log('walk', JSON.stringify(await H.walkTo(h[0], h[2], 10, 1.6)));
await tap('KeyE', 60);
log('mounted', (await H.s()).mode);
const F = [-25.5, -21.5];
// teleport the horse+rider closer: walk the horse is slow in a stepped run; mount then ride from ~30 m out
const tr = [];
const held = new Set();
for (let t = 0.5; t <= 35; t += 0.5) {
  const s = await page.evaluate(([x, z]) => {
    const ctx = window.__rg.ctx;
    const hp = window.__rg.state().playerPosition;
    const f = ctx.camera.getWorldDirection(new ctx.camera.position.constructor());
    const c = ctx.camera.position;
    return { hp, f: [f.x, f.z], d: Math.hypot(x - hp[0], z - hp[2]), cam: +Math.hypot(c.x - hp[0], c.y - hp[1] - 1.6, c.z - hp[2]).toFixed(2) };
  }, F);
  const dx = (F[0] - s.hp[0]) / s.d, dz = (F[1] - s.hp[2]) / s.d;
  const fl = Math.hypot(s.f[0], s.f[1]) || 1; const fx = s.f[0] / fl, fz = s.f[1] / fl;
  const right = dx * -fz + dz * fx;
  const want = new Set(['KeyW']);
  if (right > 0.25) want.add('KeyD');
  if (right < -0.25) want.add('KeyA');
  for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  await st(30, false);
  const m = (await H.s()).mode;
  tr.push(`${t} ${s.hp.map((v) => v.toFixed(1)).join(',')} dFoam=${s.d.toFixed(1)} cam=${s.cam} ${m}`);
  if (t > 10 && t % 2.5 === 0) await H.snap(`horse/foam-${t}`);
}
for (const k of held) await page.keyboard.up(k);
log(tr.join('\n'));
