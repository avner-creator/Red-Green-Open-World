import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot } from './helpers';
const OUT = '/tmp/claude-0/-home-user-red-green-open-world/1d4a328d-a2e1-5902-849d-d3e85c49404c/scratchpad/fit';

test('fit of every wardrobe item on the new heroes, standing and seated', async ({ page }) => {
  test.setTimeout(1_500_000);
  mkdirSync(OUT, { recursive: true });
  await boot(page);
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.start();
    rg.step(1 / 60, 10, false);
    rg.ctx.uiRoot.style.display = 'none';
  });
  const items = await page.evaluate(() => {
    const c = window.__rg!.ctx.economy.catalog;
    const by = (s: string): string[] => c.filter((i) => i.slot === s).map((i) => i.id);
    return { head: by('head'), face: by('face'), back: by('back') };
  });
  const n = Math.max(items.head.length, items.face.length, items.back.length);
  console.log('items', items.head.length, items.face.length, items.back.length);
  const CW = 160;
  const CH = 200;
  for (const hero of ['pup', 'fox', 'alpaca', 'trike']) {
    for (const pose of ['stand', 'sit'] as const) {
      const grid = new PNG({ width: CW * n, height: CH * 2 });
      for (let k = 0; k < n; k++) {
        const look = [items.head[k % items.head.length]!, items.face[k % items.face.length]!, items.back[k % items.back.length]!];
        for (let v = 0; v < 2; v++) {
          await page.evaluate(
            async ({ hero, look, pose, v }) => {
              const rg = window.__rg!;
              const ctx = rg.ctx;
              if (ctx.player.characterId !== hero) await ctx.player.setCharacter(hero);
              for (const id of look) {
                ctx.profile.unlock(id, 'shop');
                ctx.economy.equip(ctx.economy.item(id)!.slot, id);
              }
              const sp = ctx.world.anchors.spawn;
              if (pose === 'sit') {
                ctx.player.setExternalController({ update: () => undefined } as never);
                ctx.player.setAnimation('sit');
              } else ctx.player.setExternalController(null);
              rg.teleport(sp.position.x, sp.position.y, sp.position.z, sp.yaw);
              rg.step(1 / 60, 40, false);
              const pl = ctx.player;
              const head = pl.object.getObjectByName('attach-head') ?? pl.object;
              const hp = head.getWorldPosition(pl.position.clone());
              const fx = Math.sin(pl.yaw);
              const fz = Math.cos(pl.yaw);
              const c = ctx.camera;
              const d = 2.6;
              // v0: front three-quarter; v1: back three-quarter (back item).
              const k = v === 0 ? 1 : -1;
              c.position.set(hp.x + k * (fx * d + fz * 1.0), hp.y + 0.3, hp.z + k * (fz * d - fx * 1.0));
              c.fov = 50;
              c.updateProjectionMatrix();
              c.lookAt(hp.x, hp.y - 0.45, hp.z);
              rg.render();
            },
            { hero, look, pose, v },
          );
          const shot = PNG.sync.read(await page.screenshot({ type: 'png', animations: 'disabled' }));
          PNG.bitblt(shot, grid, (shot.width - CW) / 2, (shot.height - CH) / 2, CW, CH, k * CW, v * CH);
        }
      }
      writeFileSync(`${OUT}/${hero}-${pose}.png`, PNG.sync.write(grid));
    }
  }
});
