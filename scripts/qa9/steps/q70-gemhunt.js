// QA6 B: 5-minute child-like gem hunt to the end screen. Reboot-free: set the remaining time to 300 s,
// respawn at the plaza, then: walk (sprint) to the nearest gem spot not yet visited within 35 m (the child
// sees glowing gems), else wander toward a random far spot; jump now and then; E when a prompt shows
// (rides happen). Stops at the end screen; snapshots + R/G of the end screen.
await page.keyboard.press('KeyR');
await st(60);
await page.evaluate(() => { window.__rg.teleport(0, window.__rg.ctx.world.heightAt(0, 9) + 0.5, 9, Math.PI); window.__rg.setRemaining(300); });
await st(30);
const spots = await page.evaluate(() => window.__rg.ctx.world.gemSpots.map((g) => [g.x ?? g.position?.x ?? g[0], g.z ?? g.position?.z ?? g[2]]));
log('spots', spots.length, JSON.stringify(spots.slice(0, 3)));
const visited = new Set();
const g0 = (await H.s()).gems;
const t0 = await page.evaluate(() => window.__rg.state().remaining);
let lastGems = g0, lastGemT = 0, t = 0, maxGap = 0, rides = 0, shots = 0;
const tl = [];
let wanderTo = null;
while (t < 360) {
  const s = await H.s();
  if (s.phase !== 'playing') { tl.push([t, 'phase', s.phase]); break; }
  if (s.mode !== 'walk') { await st(60, false); t += 1; if (t % 10 < 1) tl.push([t, 'mode', s.mode]); continue; }
  if (s.gems > lastGems) { maxGap = Math.max(maxGap, t - lastGemT); lastGems = s.gems; lastGemT = t; }
  let best = null, bd = 35;
  spots.forEach((p, i) => { if (visited.has(i)) return; const d = Math.hypot(p[0] - s.p[0], p[1] - s.p[2]); if (d < bd) { bd = d; best = i; } });
  let tx, tz;
  if (best !== null) { [tx, tz] = spots[best]; wanderTo = null; }
  else { if (!wanderTo || Math.hypot(wanderTo[0] - s.p[0], wanderTo[1] - s.p[2]) < 3) { const i = Math.floor(Math.random() * spots.length); wanderTo = spots[i]; } [tx, tz] = wanderTo; }
  const w = await H.walkTo(tx, tz, 4, 1.0, true);
  t += 4;
  if (best !== null && (w.d < 1.5 || w.stall >= 2)) visited.add(best);
  if (Math.random() < 0.3) { await page.keyboard.press('Space'); }
  const prompt = await page.evaluate(() => { const p = document.querySelector('[data-testid="prompt"]'); return !!p && p.getBoundingClientRect().width > 2 && getComputedStyle(p).opacity !== '0'; });
  if (prompt && Math.random() < 0.25) { await page.keyboard.press('KeyE'); rides++; tl.push([t, 'E']); }
  if (Math.round(t) % 40 < 4 && shots < 10) { shots++; await H.snap('hunt/t' + String(Math.round(t)).padStart(3, '0')); }
}
await st(120);
const end = await H.s();
log('hunt: game s ~', t, 'gems', end.gems - g0, 'maxGapBetweenGems', maxGap, 'E presses', rides, 'phase', end.phase);
log(JSON.stringify(tl).slice(0, 1500));
const sep = await H.sep('hunt/end-screen');
log('end sep', JSON.stringify(sep));
log('end ui text', await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600)));
