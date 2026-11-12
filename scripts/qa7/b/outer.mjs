// QA4b: walk (sprint) the island perimeter for 2 minutes of game time; log stuck spots, shots every ~5 s.
import { open } from './lib.mjs';

const g = await open('outer');
const { page, shot, step, pos, setKeys, keysToward, tp } = g;
const S = Number(process.env.QA_SECONDS ?? 120);
try {
  // Waypoints on a ring 22 m inside the coast, every 15 degrees, starting north-east of spawn going clockwise.
  const ring = await page.evaluate(() => {
    const out = [];
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      // Probe outward for the last point above sea level.
      let r = 60;
      for (let rr = 60; rr < 190; rr += 2) {
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        if (window.__rg.ctx.world.heightAt(x, z) > 1.2) r = rr;
      }
      out.push([Math.cos(a) * (r - 18), Math.sin(a) * (r - 18), r]);
    }
    return out;
  });
  console.log('ring', JSON.stringify(ring.map((p) => p.map((v) => +v.toFixed(0)))));
  await tp(ring[0][0], ring[0][1], 0);
  let i = 1, t = 0, next = 0, stuckFor = 0, last = await pos(), dist = 0;
  const log = [];
  while (t < S * 60) {
    const p = await pos();
    const w = ring[i % ring.length];
    if (Math.hypot(w[0] - p[0], w[1] - p[2]) < 4) { i++; continue; }
    const k = await keysToward(w[0] - p[0], w[1] - p[2]);
    k.push('ShiftLeft');
    if (stuckFor > 30) k.push('Space');
    await setKeys(k);
    await step(6);
    t += 6;
    const q = await pos();
    const mv = Math.hypot(q[0] - last[0], q[2] - last[2]);
    dist += mv;
    if (mv < 0.05) stuckFor += 6; else stuckFor = 0;
    if (stuckFor === 60) { console.log(`STUCK 1 s at ${q.map((v) => v.toFixed(1))} heading to wp ${i}`); await shot(`stuck-${q[0].toFixed(0)}_${q[2].toFixed(0)}`); }
    if (stuckFor > 240) { console.log(`  skipping wp ${i}`); i++; stuckFor = 0; }
    last = q;
    if (t >= next) {
      const life = await page.evaluate(() => window.__rg.state().playerMode);
      log.push(`${(t / 60).toFixed(0)}s ${q.map((v) => v.toFixed(0)).join(',')} ${life}`);
      await shot(`t${String(Math.round(t / 60)).padStart(3, '0')}-${q[0].toFixed(0)}_${q[2].toFixed(0)}`);
      next += 300;
    }
  }
  await setKeys([]);
  console.log(`walked ${dist.toFixed(0)} m, reached wp ${i}`);
  console.log(log.join('\n'));
} finally {
  await g.close();
}
