import { open } from './lib.mjs';
const t = await open('dbg', { query: '&quality=low&freeze=1', width: 800, height: 450 });
await t.start();
const r = await t.page.evaluate(() => {
  const rg = window.__rg; const S = window.__rgSecrets; const out = [];
  const d = S.info().doors[0];
  for (let b = 0; b < 4; b++) {
    const [ox, oz] = S.standPoint(0, 1, 6); const [x, z] = S.standPoint(0, b);
    rg.teleport(ox, rg.ctx.world.heightAt(ox, oz) + 0.1, oz, d.yaw + Math.PI); rg.step(1 / 60, 3, false);
    rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.1, z, d.yaw + Math.PI); rg.step(1 / 60, 12, false);
    const p = rg.ctx.player.position;
    const f = rg.ctx.interactions.focused; out.push({ focus: f ? f.id : null, want: [x.toFixed(2), z.toFixed(2)], got: [p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2)], dy: (p.y - d.y).toFixed(2), sel: S.info().doors[0].selected, mode: rg.ctx.player.mode });
  }
  const near = rg.interactables().map((i) => [i.id, Math.hypot(i.position[0] - d.x, i.position[2] - d.z).toFixed(1)]).filter((a) => a[1] < 25);
  out.push(near);
  return out;
});
console.log(JSON.stringify(r, null, 0));
await t.close();
