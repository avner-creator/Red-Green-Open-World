// QA8 A/m4: walk straight into the Gear Shack kiosk from 12 directions (10 m out), W held toward its centre for 8 s.
// Logs closest distance, time stuck without the E prompt, and whether the prompt shows. Snap at the end.
for (let i = 0; i < 3 && (await H.s()).mode !== 'walk'; i++) { await page.keyboard.press('KeyE'); await st(60, false); }
const gs = (await page.evaluate(() => window.__rg.interactables())).find((i) => i.id === 'gearShack');
const K = { x: 14, z: 2 };
log('shack prompt pos', gs.position);
const yawK = Math.atan2(-14, -4); // layout yaw (front faces the plaza)
const rows = [];
for (let n = 0; n < 12; n++) {
  const a = yawK + (n * Math.PI) / 6;
  const x = K.x + Math.sin(a) * 10;
  const z = K.z + Math.cos(a) * 10;
  await page.evaluate(([x, z, tx, tz]) => { const rg = window.__rg; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.4, z, Math.atan2(tx - x, tz - z)); rg.step(1 / 60, 40, false); }, [x, z, K.x, K.z]);
  let stuckNoPrompt = 0;
  let maxStuck = 0;
  let last = null;
  let prompt = false;
  let firstPrompt = null;
  const held = new Set();
  for (let f = 0; f < 480; f += 15) {
    const want = await page.evaluate(([x, z]) => {
      const ctx = window.__rg.ctx;
      const hp = window.__rg.state().playerPosition;
      const fv = ctx.camera.getWorldDirection(new ctx.camera.position.constructor());
      const d = Math.hypot(x - hp[0], z - hp[2]) || 1;
      const dx = (x - hp[0]) / d; const dz = (z - hp[2]) / d;
      const fl = Math.hypot(fv.x, fv.z) || 1; const fx = fv.x / fl; const fz = fv.z / fl;
      const fwd = dx * fx + dz * fz; const right = dx * -fz + dz * fx;
      const w = [];
      if (fwd > 0.38) w.push('KeyW'); if (fwd < -0.38) w.push('KeyS'); if (right > 0.38) w.push('KeyD'); if (right < -0.38) w.push('KeyA');
      return w;
    }, [K.x, K.z]);
    for (const k of [...held]) if (!want.includes(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
    await st(15, false);
    const s = await page.evaluate(() => {
      const p = window.__rg.state().playerPosition;
      const e = document.querySelector('[data-testid="prompt"]');
      const vis = !!e && e.getBoundingClientRect().width > 2 && getComputedStyle(e).opacity !== '0' && getComputedStyle(e).visibility !== 'hidden';
      return { p, vis };
    });
    prompt = s.vis;
    if (prompt && firstPrompt === null) firstPrompt = f / 60;
    if (last && Math.hypot(s.p[0] - last[0], s.p[2] - last[2]) < 0.05 && !prompt) { stuckNoPrompt += 0.25; maxStuck = Math.max(maxStuck, stuckNoPrompt); } else stuckNoPrompt = 0;
    last = s.p;
  }
  for (const k of held) await page.keyboard.up(k);
  await st(5, false);
  const deg = Math.round((n * 360) / 12);
  const p = (await H.s()).p;
  rows.push(`${deg}deg (0=front) end=${p[0]},${p[2]} d=${Math.hypot(p[0] - K.x, p[2] - K.z).toFixed(2)} promptAt=${firstPrompt} promptEnd=${prompt} maxStuckNoPrompt=${maxStuck}s`);
  await H.snap(`shack9/d${String(deg).padStart(3, '0')}`);
}
log(rows.join('\n'));
