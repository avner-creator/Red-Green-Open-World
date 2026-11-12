// QA7 phone helpers: steer the on-screen touch stick toward a world point (camera-relative), like a child.
export function phoneKit(page, t) {
  const vp = page.viewportSize();
  const sx = vp.width * 0.16, sy = vp.height * 0.72;
  const S = (n = 15) => page.evaluate((n) => { window.__rg.step(1 / 60, n, false); const c = window.__rg.ctx.camera.position; const p = window.__rg.ctx.player.object.position; return { cam: Math.hypot(c.x - p.x, c.y - (p.y + 1), c.z - p.z), p: [p.x, p.y, p.z] }; }, n);
  /** Walk to (x,z) with the stick, up to secs; returns stats. onTick(s) optional. */
  async function walkTo(x, z, secs = 10, stopAt = 1, onTick) {
    let held = false, minCam = 99, still = 0, maxStill = 0, prev = null, s;
    for (let tt = 0; tt < secs; tt += 0.25) {
      const g = await page.evaluate(([x, z]) => {
        const ctx = window.__rg.ctx; const hp = ctx.player.object.position;
        const f = ctx.camera.getWorldDirection(new ctx.camera.position.constructor());
        return { hp: [hp.x, hp.y, hp.z], f: [f.x, f.z], d: Math.hypot(x - hp.x, z - hp.z) };
      }, [x, z]);
      if (g.d < stopAt) break;
      const dx = x - g.hp[0], dz = z - g.hp[2];
      const fl = Math.hypot(g.f[0], g.f[1]) || 1; const fx = g.f[0] / fl, fz = g.f[1] / fl;
      const fwd = (dx * fx + dz * fz) / g.d, right = (dx * -fz + dz * fx) / g.d;
      const mx = sx + right * 50, my = sy - fwd * 50;
      if (!held) { await t.stickHold(sx, sy, mx - sx, my - sy); held = true; } else await t.stickMove(mx, my);
      s = await S(15);
      minCam = Math.min(minCam, s.cam);
      if (prev && Math.hypot(s.p[0] - prev[0], s.p[2] - prev[2]) < 0.05) { still += 0.25; maxStill = Math.max(maxStill, still); } else still = 0;
      prev = s.p;
      if (onTick) await onTick(s, tt);
    }
    if (held) await t.release();
    const e = await S(1);
    return { d: +Math.hypot(x - e.p[0], z - e.p[2]).toFixed(2), minCam: +minCam.toFixed(2), maxStill, p: e.p.map((v) => +v.toFixed(1)) };
  }
  const tp = (x, z, yaw = 0) => page.evaluate(([x, z, yaw]) => { window.__rg.teleport(x, window.__rg.ctx.world.heightAt(x, z) + 0.3, z, yaw); window.__rg.step(1 / 60, 40, false); }, [x, z, yaw]);
  return { walkTo, tp, S, sx, sy };
}

export async function phoneStart(page, t) {
  await page.evaluate(() => { window.__rg.freeze(true); window.__rg.step(1 / 60, 1, true); });
  const r = await page.evaluate(() => { const e = document.querySelector('[data-testid="play"]').getBoundingClientRect(); return [e.x + e.width / 2, e.y + e.height / 2]; });
  await t.tap(r[0], r[1]);
  await page.evaluate(() => { window.__rg.step(1 / 60, 60, false); window.__rg.setRemaining(3000); });
}
