/**
 * The third-person camera never hides the hero and never sits inside geometry (QA round 3 Major
 * #1): at known bad spots (under a tree near the spawn, around the carnival row and the ice-cream
 * shop, beside the Gear Shack and a plaza chest) the camera orbits through 8 yaws and each view is
 * checked with three.js raycasts against the real render meshes (`__rgCamera.probe`, independent
 * of the occluder proxies the camera itself uses).
 */
import { expect, test, type Page } from '@playwright/test';
import { boot, canvasShot, SHOTS } from './helpers';

test.describe.configure({ mode: 'serial' });

let page: Page;
let consoleErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 20, false);
  });
});

test.afterAll(async () => {
  await page.close();
});

interface Spot {
  name: string;
  x: number;
  z: number;
}

/** Spots computed in the page from the live world (anchors, chest spots, the nearest oak). */
async function spots(page: Page): Promise<Spot[]> {
  return page.evaluate(() => {
    const { world, scene } = window.__rg!.ctx;
    const a = world.anchors;
    const out: { name: string; x: number; z: number }[] = [];
    // Beside the trunk of the tree nearest to the spawn, and under the crown of one further out
    // (scatter instances: near LOD), standing on the spawn side.
    const sp = a.spawn.position;
    const trees: [number, number, number][] = [];
    scene.traverse((o) => {
      const im = o as import('three').InstancedMesh;
      if (!im.isInstancedMesh || !/^(oak|pine|palm):near/.test(im.name)) return;
      const mat = new (im.matrixWorld.constructor as { new (): import('three').Matrix4 })();
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, mat);
        const e = mat.elements;
        trees.push([e[12], e[14], Math.hypot(e[12] - sp.x, e[14] - sp.z)]);
      }
    });
    trees.sort((p, q) => p[2] - q[2]);
    const toward = (t: [number, number, number], d: number): { x: number; z: number } => ({
      x: t[0] + ((sp.x - t[0]) / t[2]) * d,
      z: t[1] + ((sp.z - t[1]) / t[2]) * d,
    });
    const near = trees.find((t) => t[2] > 6);
    if (near) out.push({ name: 'tree-near-spawn', ...toward(near, 1.2) });
    const far = trees.find((t) => t[2] > 25 && world.isLand(toward(t, 2.6).x, toward(t, 2.6).z));
    if (far) out.push({ name: 'under-crown', ...toward(far, 2.6) });
    const at = (name: string, ax: number, az: number, yaw: number, dist: number): void => {
      out.push({ name, x: ax + Math.sin(yaw) * dist, z: az + Math.cos(yaw) * dist });
    };
    at('carnivalRow-15m', a.carnivalRow.position.x, a.carnivalRow.position.z, -Math.PI / 2, 15);
    at('iceCream-15m', a.iceCream.position.x, a.iceCream.position.z, Math.PI / 2, 15);
    at('gearShack-5m', a.gearShack.position.x, a.gearShack.position.z, a.gearShack.yaw, 5);
    const chest = world.chestSpots.reduce((p, c) => (Math.hypot(c.position.x - sp.x, c.position.z - sp.z) < Math.hypot(p.position.x - sp.x, p.position.z - sp.z) ? c : p));
    at('plaza-chest', chest.position.x, chest.position.z, Math.PI, 2.2);
    return out;
  });
}

test('the camera never sits inside geometry or loses the hero at known bad spots', async () => {
  test.setTimeout(240_000);
  const list = await spots(page);
  expect(list.length).toBeGreaterThanOrEqual(6);
  const report: string[] = [];
  for (const s of list) {
    await page.evaluate(({ x, z }) => {
      const rg = window.__rg!;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.1, z, 0);
      rg.step(1 / 60, 30, false);
    }, s);
    for (let i = 0; i < 8; i++) {
      const yaw = (i / 8) * Math.PI * 2;
      const r = await page.evaluate((y) => {
        const rg = window.__rg!;
        const cam = window.__rgCamera!;
        cam.setView(y, 0.38);
        rg.step(1 / 60, 45, false);
        return { ...cam.probe(), st: cam.state(), pos: rg.ctx.player.position.toArray() };
      }, yaw);
      report.push(`${s.name} yaw${i} blocked=${r.blocked.toFixed(2)} head=${r.headHidden} inside=${r.inside} crown=${r.insideCrown} near=${r.near.toFixed(2)} lift=${r.st.lift.toFixed(2)} d=${r.st.distance.toFixed(2)} last=${JSON.stringify(r.st.lastHit)} tris=${r.st.triangles} caps=${r.st.capsules} hits=${r.hits.join(',')}`);
      if (SHOTS && i % 2 === 0) {
        await page.evaluate(() => window.__rg!.render());
        await canvasShot(page, `test-results/camera-clear-${s.name}-${i}.png`);
      }
      expect.soft(r.inside, `${s.name} yaw ${i}: camera inside geometry`).toBe(false);
      // Low planters/counters may hide the hero's legs; the head and most of the body must show.
      expect.soft(r.headHidden, `${s.name} yaw ${i}: hero's head hidden (${r.hits.join(',')})`).toBe(false);
      expect.soft(r.blocked, `${s.name} yaw ${i}: hero hidden (${r.hits.join(',')})`).toBeLessThanOrEqual(0.34);
      expect.soft(r.near, `${s.name} yaw ${i}: camera in the hero's head`).toBeGreaterThan(0.9);
    }
  }
  console.log(report.join('\n'));
  expect(consoleErrors).toEqual([]);
});

test('no sparkle shards over the hero right after Play (a title-screen pick lands quietly)', async () => {
  const counts = await page.evaluate(async () => {
    const rg = window.__rg!;
    const { session, player, scene } = rg.ctx;
    session.end();
    session.toTitle();
    rg.step(1 / 60, 2, false);
    const next = player.characterId === 'frog' ? 'robot' : 'frog';
    const swapped = player.setCharacter(next);
    rg.start();
    await swapped;
    const sparks = scene.getObjectByName('skill-sparkles') as import('three').InstancedMesh;
    const out: number[] = [];
    for (let i = 0; i < 6; i++) {
      rg.step(1 / 60, 1, false);
      out.push(sparks.visible ? sparks.count : 0);
    }
    return { out, id: player.characterId, next };
  });
  expect(counts.id).toBe(counts.next);
  expect(counts.out.every((n) => n === 0)).toBe(true);
});
