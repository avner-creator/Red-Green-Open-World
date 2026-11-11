// Node-side helpers kept on globalThis.H for later step files.
const H = (globalThis.H = {});
H.s = () => page.evaluate(() => {
  const rg = window.__rg;
  const s = rg.state();
  const p = s.playerPosition.map((n) => +n.toFixed(2));
  return { p, mode: s.playerMode, phase: s.phase, rem: Math.round(s.remaining ?? 0), wallet: rg.ctx.profile?.wallet, gems: s.gems };
});
/** Teleport `dist` m from (x,z) at bearing `ang` (rad), facing the point. */
H.near = (x, z, dist, ang = 0) => page.evaluate(([x, z, d, a]) => {
  const rg = window.__rg;
  const px = x + Math.sin(a) * d;
  const pz = z + Math.cos(a) * d;
  const yaw = Math.atan2(x - px, z - pz);
  rg.teleport(px, rg.ctx.world.heightAt(px, pz) + 0.5, pz, yaw);
  rg.step(1 / 60, 30, false);
  return [px, pz, yaw];
}, [x, z, dist, ang]);
/** Prompt / toast / bubble texts visible in the DOM. */
H.ui = () => page.evaluate(() => {
  const vis = (e) => e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden' && +getComputedStyle(e).opacity > 0.05;
  const sel = '[class*=prompt],[class*=toast],[class*=bubble],[class*=banner],[class*=result],[class*=count],[class*=hint]';
  return [...document.querySelectorAll(sel)].filter(vis).map((e) => `${e.className}:${e.textContent.trim().slice(0, 40)}`).slice(0, 12);
});
H.dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
H.shots = [];
H.snap = async (name) => { const p = await shot(name); H.shots.push(p); return p; };
// Start: click PLAY like a child, then keep the session long so rounds are not cut off.
await page.evaluate(() => window.__rg.start()); // PLAY click: see 05-play-mem.js (renderer OOM)
await st(30);
await page.evaluate(() => window.__rg.setRemaining(3000));
await st(60);
log(await H.s(), await H.ui());
log(await shot('a/01-after-play'));
