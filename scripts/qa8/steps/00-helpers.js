// Node-side helpers kept on globalThis.H (does NOT press PLAY).
const H = (globalThis.H = {});
H.s = () => page.evaluate(() => {
  const rg = window.__rg;
  const s = rg.state();
  const p = s.playerPosition.map((n) => +n.toFixed(2));
  return { p, mode: s.playerMode, phase: s.phase, rem: Math.round(s.remaining ?? 0), wallet: rg.ctx.profile?.wallet, gems: s.gems };
});
H.near = (x, z, dist, ang = 0) => page.evaluate(([x, z, d, a]) => {
  const rg = window.__rg;
  const px = x + Math.sin(a) * d;
  const pz = z + Math.cos(a) * d;
  const yaw = Math.atan2(x - px, z - pz);
  rg.teleport(px, rg.ctx.world.heightAt(px, pz) + 0.5, pz, yaw);
  rg.step(1 / 60, 30, false);
  return [px, pz, yaw];
}, [x, z, dist, ang]);
H.ui = () => page.evaluate(() => {
  const vis = (e) => e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden' && +getComputedStyle(e).opacity > 0.05;
  const sel = '[class*=prompt],[class*=toast],[class*=bubble],[class*=banner],[class*=result],[class*=count],[class*=hint],[data-testid$=hud]';
  return [...document.querySelectorAll(sel)].filter(vis).map((e) => `${e.dataset.testid ?? e.className}:${e.textContent.trim().slice(0, 50)}`).slice(0, 14);
});
H.snap = async (name) => { await page.evaluate(() => window.__rg.render()); return shot(name); };
/** Walk toward world point (x,z) with real WASD for up to `secs`, steering by camera yaw; stops within `stopAt` m. */
H.walkTo = async (x, z, secs = 10, stopAt = 1.5, sprint = false) => {
  const held = new Set();
  const set = async (want) => {
    for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  let s;
  let best = 1e9;
  let stall = 0;
  for (let t = 0; t < secs; t += 0.25) {
    s = await page.evaluate(([x, z]) => {
      const ctx = window.__rg.ctx;
      const hp = window.__rg.state().playerPosition;
      const f = ctx.camera.getWorldDirection(new ctx.camera.position.constructor());
      return { hp, f: [f.x, f.z], d: Math.hypot(x - hp[0], z - hp[2]) };
    }, [x, z]);
    if (s.d < stopAt) break;
    if (s.d < best - 0.2) { best = s.d; stall = 0; } else stall += 0.25;
    const dx = x - s.hp[0];
    const dz = z - s.hp[2];
    const fl = Math.hypot(s.f[0], s.f[1]) || 1;
    const fx = s.f[0] / fl;
    const fz = s.f[1] / fl;
    const fwd = (dx * fx + dz * fz) / s.d;
    const right = (dx * -fz + dz * fx) / s.d;
    const want = new Set();
    if (fwd > 0.38) want.add('KeyW');
    if (fwd < -0.38) want.add('KeyS');
    if (right > 0.38) want.add('KeyD');
    if (right < -0.38) want.add('KeyA');
    if (sprint) want.add('ShiftLeft');
    await set(want);
    await st(15, false);
  }
  await set(new Set());
  return { d: +s.d.toFixed(2), stall, p: s.hp.map((v) => +v.toFixed(1)) };
};
log('helpers ok', await H.s());
