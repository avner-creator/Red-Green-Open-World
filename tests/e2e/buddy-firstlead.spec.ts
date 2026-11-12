/**
 * Robustness of Pip's first lead (spawn → trampoline) to the plaza layout (QA m1): a 16 cm wider map
 * board once sent the first lead round the wrong side, and a child following Pip stuck at the
 * Scoops parlour. The board's collider is moved ±0.5 m in x and z and widened by 0.3 m; in every
 * variant a child who walks straight at Pip whenever he is more than 2.5 m away reaches the
 * trampoline within 60 s.
 */
import { expect, test } from '@playwright/test';
import { MAP_BOARD } from '../../src/world/fill/mapboard';
import { boot } from './helpers';

const VARIANTS: { name: string; dx: number; dz: number; dw: number }[] = [
  { name: 'as built', dx: 0, dz: 0, dw: 0 },
  { name: 'x +0.5', dx: 0.5, dz: 0, dw: 0 },
  { name: 'x -0.5', dx: -0.5, dz: 0, dw: 0 },
  { name: 'z +0.5', dx: 0, dz: 0.5, dw: 0 },
  { name: 'z -0.5', dx: 0, dz: -0.5, dw: 0 },
  { name: 'wider 0.3', dx: 0, dz: 0, dw: 0.3 },
];

test('the first lead reaches the trampoline within 60 s with the map board moved or widened', async ({ page }) => {
  test.setTimeout(400_000);
  const { consoleErrors } = await boot(page);
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 30, 30, false);
  });
  // The board's solid box: the cuboid ~W/2 + 0.35 wide near MAP_BOARD (the guard may nudge it).
  const found = await page.evaluate(([bx, bz]) => {
    const w = window.__rg!.ctx.physics.world;
    let best: { h: number; d: number } | null = null;
    w.colliders.forEach((c) => {
      const t = c.translation();
      const d = Math.hypot(t.x - bx, t.z - bz);
      if (d > 3.5 || c.shapeType() !== window.__rg!.ctx.physics.rapier.ShapeType.Cuboid) return;
      const he = c.halfExtents();
      if (he && he.x > 1.8 && he.x < 2.6 && he.z < 0.5 && he.y > 1.2 && (!best || d < best.d)) best = { h: c.handle, d };
    });
    const b = best as { h: number; d: number } | null;
    if (!b) return null;
    const c = w.getCollider(b.h);
    const t = c.translation();
    const he = c.halfExtents()!;
    (window as unknown as { __board: unknown }).__board = { h: b.h, t: { x: t.x, y: t.y, z: t.z }, he: { x: he.x, y: he.y, z: he.z } };
    return { x: t.x, z: t.z, hx: he.x };
  }, [MAP_BOARD.x, MAP_BOARD.z] as const);
  expect(found, 'map board collider').not.toBeNull();

  const results: { name: string; t: number; info: string }[] = [];
  for (const v of VARIANTS) {
    await page.evaluate((vv) => {
      const rg = window.__rg!;
      const w = rg.ctx.physics.world;
      const b = (window as unknown as { __board: { h: number; t: { x: number; y: number; z: number }; he: { x: number; y: number; z: number } } }).__board;
      const c = w.getCollider(b.h);
      c.setTranslation({ x: b.t.x + vv.dx, y: b.t.y, z: b.t.z + vv.dz });
      c.setHalfExtents({ x: b.he.x + vv.dw / 2, y: b.he.y, z: b.he.z });
      rg.setRemaining(290);
      const sp = rg.ctx.world.anchors.spawn;
      rg.teleport(sp.position.x, sp.position.y + 0.2, sp.position.z, sp.yaw);
      rg.step(1 / 30, 20, false);
      window.__rgBuddy!.invite('trampoline');
    }, v);
    let arrived = -1;
    let info = '';
    for (let i = 0; i < 24 && arrived < 0; i++) {
      // 2.5 s per round trip. The "child": walk towards Pip when he is more than 2.5 m away.
      const r = await page.evaluate(() => {
        const rg = window.__rg!;
        const p = rg.ctx.player.position;
        const t = rg.ctx.world.anchors.trampoline.position;
        let hit = false;
        for (let n = 0; n < 75 && !hit; n++) {
          const b = window.__rgBuddy!.pos();
          const dx = b[0] - p.x;
          const dz = b[2] - p.z;
          const d = Math.hypot(dx, dz);
          const y = rg.ctx.cameraRig.yaw;
          let mx = 0;
          let my = 0;
          if (d > 2.5) {
            mx = (-dx * Math.cos(y) + dz * Math.sin(y)) / d;
            my = (dx * Math.sin(y) + dz * Math.cos(y)) / d;
          }
          rg.inject({ moveX: mx, moveY: my });
          rg.step(1 / 30, 1, false);
          hit = Math.hypot(p.x - t.x, p.z - t.z) < 10.5;
        }
        rg.inject(null);
        const l = window.__rgBuddy!.lead();
        return { hit, hero: [+p.x.toFixed(1), +p.z.toFixed(1)], pip: window.__rgBuddy!.pos().map((x) => +x.toFixed(1)), why: l.why, to: l.to, route: window.__rgBuddy!.route() };
      });
      info = JSON.stringify(r);
      if (r.hit) arrived = (i + 1) * 2.5;
    }
    results.push({ name: v.name, t: arrived, info });
  }
  const summary = JSON.stringify(results);
  if (process.env.RG_DEBUG) console.log(summary);
  for (const r of results) {
    expect(r.t, summary).toBeGreaterThan(0);
    expect(r.t, summary).toBeLessThanOrEqual(60);
  }
  expect(consoleErrors).toEqual([]);
});
