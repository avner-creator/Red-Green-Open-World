// QA3 (variant): after one balloon ride, walk onto the giant trampoline from four sides, sampling height (does walk-on bounce?).
// Usage: RG_PORT=4360 node scripts/qa3/tramp.mjs
import { open } from './lib.mjs';

const { page, close } = await open('tramp', { query: '&quality=low' });
try {
  const out = await page.evaluate(() => {
    const rg = window.__rg;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 10, false);
    // Ride the balloon first (E at the balloon), then wait until back on foot.
    const b = rg.interactables().find((i) => i.id === 'balloon');
    const bx = b.position[0] + 2;
    const bz = b.position[2];
    rg.teleport(bx, rg.ctx.world.heightAt(bx, bz) + 0.3, bz, -Math.PI / 2);
    rg.step(1 / 60, 30, false);
    rg.inject({ usePressed: true, use: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 60 * 40, false);
    const after = rg.state();
    const a = rg.ctx.world.anchors.trampoline;
    const res0 = `after balloon: ${after.playerMode} ${after.playerPosition.map((v) => v.toFixed(1)).join(',')}`;
    const res = [res0, `anchor ${a.position.x.toFixed(1)},${a.position.y.toFixed(1)},${a.position.z.toFixed(1)} r=${a.radius}`];
    for (const ang of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const x = a.position.x + Math.sin(ang) * 12;
      const z = a.position.z + Math.cos(ang) * 12;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.3, z, ang + Math.PI);
      rg.step(1 / 60, 20, false);
      rg.inject({ moveY: 1 });
      let maxY = -1e9;
      const ys = [];
      for (let i = 0; i < 30; i++) {
        rg.step(1 / 60, 10, false);
        const s = rg.state();
        maxY = Math.max(maxY, s.playerPosition[1]);
        if (i % 3 === 0) ys.push(`${Math.hypot(s.playerPosition[0] - a.position.x, s.playerPosition[2] - a.position.z).toFixed(1)}m:y${s.playerPosition[1].toFixed(1)}:${s.playerMode}`);
      }
      rg.inject(null);
      rg.step(1 / 60, 120, false);
      res.push(`side ${ang.toFixed(2)} maxY=${maxY.toFixed(1)} ${ys.join(' ')}`);
    }
    return res;
  });
  console.log(out.join('\n'));
} finally {
  await close();
}
