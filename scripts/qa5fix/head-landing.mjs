// QA5 item: "head turned ~90° after landing". For every hero (wobble on, as in play): stand still,
// read the head's yaw relative to the body; drop from 4 m, 12 m and 30 m (a long fall that lands
// with the flop / chute); after landing and 2 s of idle, read it again. Prints the differences.
// Usage: RG_PORT=4379 node scripts/qa5fix/head-landing.mjs   (needs `vite preview` on that port)
import { chromium } from '@playwright/test';
const port = process.env.RG_PORT ?? 4173;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 480, height: 270 } });
await p.goto(`http://localhost:${port}/?test=1&quality=low&freeze=1`);
await p.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 120000 });
await p.evaluate(() => { window.__rg.start(); window.__rg.step(1 / 60, 5, false); });
const only = process.argv.slice(2);
const all = await p.evaluate(() => window.__rg.ctx.economy.catalog.filter((i) => i.slot === 'character').map((i) => i.id));
const ids = only.length ? only : all;
const headYaw = () =>
  p.evaluate(() => {
    const rg = window.__rg;
    const obj = rg.ctx.player.object;
    let head = null;
    obj.traverse((o) => { if (!head && o.isBone && o.name === 'Head') head = o; });
    if (!head) return null;
    obj.updateMatrixWorld(true);
    const q = head.getWorldQuaternion(new head.quaternion.constructor());
    const body = obj.getWorldQuaternion(new head.quaternion.constructor());
    const rel = body.invert().multiply(q);
    // Yaw of the head's local +Z / +Y axes in body space (whichever is horizontal-ish).
    const e = new head.rotation.constructor().setFromQuaternion(rel, 'YXZ');
    return (e.y * 180) / Math.PI;
  });
const rows = [];
for (const id of ids) {
  await p.evaluate((i) => window.__rg.ctx.player.setCharacter(i), id);
  await p.waitForFunction((i) => window.__rg.ctx.player.characterId === i, id, { timeout: 60000 });
  const out = [id];
  for (const h of [4, 12, 30]) {
    await p.evaluate(() => {
      const rg = window.__rg;
      const x = 100, z = 40;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.1, z, 0.4);
      rg.step(1 / 60, 90, false);
    });
    const before = await headYaw();
    const mode = await p.evaluate((hh) => {
      const rg = window.__rg;
      const x = 100, z = 40;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + hh, z, 0.4);
      const modes = [];
      for (let k = 0; k < 60 * 8; k++) {
        rg.step(1 / 60, 1, false);
        const m = rg.state().playerMode;
        if (modes[modes.length - 1] !== m) modes.push(m);
      }
      rg.step(1 / 60, 120, false);
      return modes.join('>');
    }, h);
    const after = await headYaw();
    if (only.length) {
      await p.evaluate(() => window.__rg.render());
      await p.screenshot({ path: `test-results/qa5fix/head-${id}-${h}m.png` });
    }
    out.push(`${h}m ${mode} d=${before === null || after === null ? 'n/a' : (after - before).toFixed(1)}`);
  }
  rows.push(out.join(' | '));
  console.log(out.join(' | '));
}
await b.close();
