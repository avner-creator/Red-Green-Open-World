// Approach each secret path start (30 m, 10 m, on it) and walk up the first stones; then claim each pedestal.
import { open } from './lib.mjs';
const t = await open(process.env.OUT ?? 'path');
await t.start();
const paths = await t.page.evaluate(() => window.__rgSecrets.info().paths);
for (const p of paths) {
  const [sx, sz] = p.start;
  const f = p.stones[0];
  const dx = sx - f[0], dz = sz - f[2];
  const l = Math.hypot(dx, dz) || 1;
  for (const dist of [30, 10, 0.5]) {
    await t.stand(sx + (dx / l) * dist, sz + (dz / l) * dist, f[0], f[2], 40);
    await t.step(10, true);
    await t.shot(`${p.id}-${dist}m`, { channels: dist === 10 });
  }
  // Hop onto stone 2 and look along the path.
  const s = p.stones[2];
  const n = p.stones[3];
  await t.page.evaluate(([s, n]) => { const rg = window.__rg; rg.teleport(s[0], s[1] + 0.3, s[2], Math.atan2(n[0] - s[0], n[2] - s[2])); rg.step(1 / 60, 30, false); rg.step(1 / 60, 1, true); }, [s, n]);
  await t.shot(`${p.id}-onstone`);
  const ped = p.pedestal;
  await t.page.evaluate((ped) => { const rg = window.__rg; rg.teleport(ped[0], ped[1] + 0.3, ped[2], 0); rg.step(1 / 60, 30, false); rg.step(1 / 60, 1, true); }, ped);
  await t.step(20, true);
  await t.shot(`${p.id}-claimed`);
}
console.log(JSON.stringify((await t.page.evaluate(() => window.__rgSecrets.info().paths)).map((p) => [p.id, p.claimed])));
await t.close();
