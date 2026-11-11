/**
 * Wardrobe items stay on every hero in every pose: all 10 heroes wear a hat, a face item and a
 * back item, then go through the ride poses (sit, fall, belly-down skydive tilt, flop, dance,
 * wave, cheer) with the floppy wobble running. Each pose: the three items are attached and
 * visible, the hat stays by the head bone, and in the upright poses the face item is in front of
 * the head and the back item behind the torso.
 */
import { expect, test } from '@playwright/test';
import { boot } from './helpers';

const HEROES = ['robot', 'frog', 'panda', 'bee', 'pup', 'flamingo', 'rex', 'fox', 'alpaca', 'trike'];

test('hat, face and back items fit all 10 heroes in every ride pose', async ({ page }) => {
  test.setTimeout(300_000);
  const { consoleErrors } = await boot(page);
  const bad = await page.evaluate(async (heroes) => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    rg.start();
    rg.step(1 / 60, 5, false);
    const out: string[] = [];
    for (const id of ['hat-cone', 'face-googly', 'back-balloons']) {
      ctx.profile.unlock(id, 'shop');
      ctx.economy.equip(ctx.economy.item(id)!.slot, id);
    }
    const V = ctx.player.position.constructor as new (x?: number, y?: number, z?: number) => typeof ctx.player.position;
    const w = (o: { getWorldPosition(v: typeof ctx.player.position): typeof ctx.player.position }): typeof ctx.player.position => o.getWorldPosition(new V());
    for (const hero of heroes) {
      await ctx.player.setCharacter(hero);
      const sp = ctx.world.anchors.spawn;
      rg.teleport(sp.position.x, sp.position.y, sp.position.z, sp.yaw);
      rg.step(1 / 60, 20, false);
      const poses: [string, () => void][] = [
        ['idle', () => undefined],
        ['sit', () => ctx.player.setAnimation('sit')],
        ['fall', () => ctx.player.setAnimation('fall')],
        ['skydive', () => (ctx.player.setAnimation('fall'), ctx.player.setTilt(1.2, 0))],
        ['flop', () => ctx.player.setAnimation('flop')],
        ['dance', () => ctx.player.setAnimation('dance')],
        ['wave', () => ctx.player.setAnimation('wave')],
        ['cheer', () => ctx.player.setAnimation('cheer')],
      ];
      for (const [name, set] of poses) {
        if (name !== 'idle') ctx.player.setExternalController({ update: () => true });
        set();
        rg.step(1 / 60, 30, false);
        const o = ctx.player.object;
        o.updateMatrixWorld(true);
        const head = o.getObjectByName('attach-head');
        const face = o.getObjectByName('attach-face');
        const back = o.getObjectByName('attach-back');
        const hat = o.getObjectByName('gear-fit-head');
        const glasses = o.getObjectByName('gear-fit-face');
        const pack = o.getObjectByName('gear-fit-back');
        if (!head || !face || !back) {
          out.push(`${hero} ${name}: anchor missing`);
          continue;
        }
        for (const [part, g] of [['head', hat], ['face', glasses], ['back', pack]] as const) {
          if (!g || !g.parent) out.push(`${hero} ${name}: no ${part} item`);
          let vis = !!g;
          for (let p = g ?? null; p; p = p.parent) if (!p.visible) vis = false;
          if (!vis) out.push(`${hero} ${name}: ${part} item hidden`);
        }
        const bone = head.parent!;
        const hp = w(head);
        const bp = w(bone);
        if (hp.distanceTo(bp) > 1.2) out.push(`${hero} ${name}: hat ${hp.distanceTo(bp).toFixed(2)} m from its bone`);
        const upright = name === 'idle' || name === 'sit' || name === 'dance' || name === 'wave' || name === 'cheer';
        if (upright) {
          const fwd = new V(Math.sin(ctx.player.yaw), 0, Math.cos(ctx.player.yaw));
          const torso = w(back.parent!);
          const fp = w(face);
          const kp = w(back);
          const headFront = fp.clone().sub(hp).dot(fwd);
          if (headFront < -0.05) out.push(`${hero} ${name}: face item behind the head (${headFront.toFixed(2)})`);
          if (hp.y < torso.y) out.push(`${hero} ${name}: hat below the torso`);
          const backBehind = kp.clone().sub(fp).dot(fwd);
          if (backBehind > 0) out.push(`${hero} ${name}: back item in front of the face`);
        }
        ctx.player.setTilt(0, 0);
      }
      ctx.player.setExternalController(null);
      rg.step(1 / 60, 5, false);
    }
    return out;
  }, HEROES);
  expect(bad).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
