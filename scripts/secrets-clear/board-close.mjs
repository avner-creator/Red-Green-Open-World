// Close-up of the vault rule board at several moments of its loop (free camera; HUD hidden).
import { open } from './lib.mjs';
const t = await open('board');
await t.start();
const d = (await t.page.evaluate(() => window.__rgSecrets.info().doors))[0];
await t.stand(d.x + Math.sin(d.yaw) * 12, d.z + Math.cos(d.yaw) * 12, d.x, d.z, 10);
const b = await t.page.evaluate(() => { const o = window.__rg.ctx.scene.getObjectByName('vault-board'); const m = o.children[0].children[0]; m.updateWorldMatrix(true, false); const p = m.getWorldPosition(m.position.clone()); const n = m.getWorldDirection(m.position.clone()); return [p.x, p.y, p.z, n.x, n.z]; });
for (const k of [0, 10, 18, 26, 34, 44]) {
  await t.page.evaluate(([b, k]) => {
    const rg = window.__rg; rg.ctx.uiRoot.style.display = 'none';
    rg.step(1 / 60, k === 0 ? 1 : 30, false);
    const c = rg.ctx.camera; c.position.set(b[0] + b[3] * 3.2, b[1] + 0.1, b[2] + b[4] * 3.2); c.lookAt(b[0], b[1], b[2]); rg.render();
  }, [b, k]);
  await t.shot(`board-${k}`, { channels: k === 26 });
}
await t.close();
