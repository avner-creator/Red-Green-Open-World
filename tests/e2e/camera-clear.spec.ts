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
    // QA6 m7: under the oaks on the plaza's west lawn, and among the pines of the toys meadow.
    out.push({ name: 'west-lawn', x: -10, z: 20 }, { name: 'west-lawn-oak', x: -6, z: 20 });
    out.push({ name: 'toys-meadow-pines', x: -40, z: 82.9 });
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

test('attraction sites, the glasses sites and a gem cluster: camera clear (4 yaws each)', async () => {
  test.setTimeout(300_000);
  const list = await page.evaluate(() => {
    const { world } = window.__rg!.ctx;
    const a = world.anchors as unknown as Record<string, { position: { x: number; z: number }; yaw: number } | undefined>;
    const out: { name: string; x: number; z: number }[] = [];
    const near = (name: string, d: number): void => {
      const q = a[name];
      if (q) out.push({ name, x: q.position.x + Math.sin(q.yaw) * d, z: q.position.z + Math.cos(q.yaw) * d });
    };
    near('carnivalRow', 0);
    near('foamCourse', 8);
    near('iceCream', 6);
    near('airstrip', 6);
    near('raceStart', 5);
    for (const id of ['glowflies', 'oddone', 'lineup', 'toys', 'gates', 'dotsigns']) near(id, 2);
    // The gem with the most other gems within 8 m.
    const gems = world.gemSpots.map((g) => g.position);
    let best = gems[0];
    let bestN = -1;
    for (const g of gems) {
      const n = gems.filter((o) => Math.hypot(o.x - g.x, o.z - g.z) < 8).length;
      if (n > bestN) [best, bestN] = [g, n];
    }
    if (best) out.push({ name: 'gem-cluster', x: best.x, z: best.z });
    return out;
  });
  expect(list.length).toBe(12);
  const report: string[] = [];
  for (const s of list) {
    await page.evaluate(({ x, z }) => {
      const rg = window.__rg!;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.1, z, 0);
      rg.step(1 / 60, 30, false);
    }, s);
    for (let i = 0; i < 4; i++) {
      const r = await page.evaluate((y) => {
        const rg = window.__rg!;
        const cam = window.__rgCamera!;
        cam.setView(y, 0.38);
        rg.step(1 / 60, 45, false);
        return { ...cam.probe(), st: cam.state() };
      }, (i / 4) * Math.PI * 2 + 0.4);
      report.push(`${s.name} yaw${i} blocked=${r.blocked.toFixed(2)} head=${r.headHidden} inside=${r.inside} near=${r.near.toFixed(2)} d=${r.st.distance.toFixed(2)} hits=${r.hits.join(',')}`);
      if (SHOTS) {
        await page.evaluate(() => window.__rg!.render());
        await canvasShot(page, `test-results/camera-clear-${s.name}-${i}.png`);
      }
      expect.soft(r.inside, `${s.name} yaw ${i}: camera inside geometry`).toBe(false);
      expect.soft(r.headHidden, `${s.name} yaw ${i}: hero's head hidden (${r.hits.join(',')})`).toBe(false);
      expect.soft(r.blocked, `${s.name} yaw ${i}: hero hidden (${r.hits.join(',')})`).toBeLessThanOrEqual(0.34);
      expect.soft(r.near, `${s.name} yaw ${i}: camera in the hero's head`).toBeGreaterThan(0.9);
    }
  }
  console.log(report.join('\n'));
});

test('a big moving instanced mesh and layer objects between camera and hero do not move the camera', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const cam = window.__rgCamera!;
    const { scene, world, camera, player } = rg.ctx;
    // Open paving on the plaza.
    rg.teleport(0, world.heightAt(0, 9) + 0.1, 9, 0);
    cam.setView(0.4, 0.3);
    rg.step(1 / 60, 60, false);
    const base = cam.state().distance;
    // A tree-sized blob of instances half-way between camera and hero (a stand-in for bubbles, dino
    // suits, balloons), cloned from a tree's instanced mesh so no three.js import is needed.
    let tree: import('three').InstancedMesh | null = null;
    scene.traverse((o) => {
      const im = o as import('three').InstancedMesh;
      if (!tree && im.isInstancedMesh && /^oak:near/.test(im.name)) tree = im;
    });
    if (!tree) return { error: 'no tree' };
    const src: import('three').InstancedMesh = tree;
    const mid = player.position.clone().lerp(camera.position, 0.5);
    const blob = (name: string): import('three').InstancedMesh => {
      const m = src.clone();
      m.name = name;
      m.count = 1;
      m.position.set(0, 0, 0);
      m.setMatrixAt(0, src.matrixWorld.clone().makeTranslation(mid.x, mid.y - 2.5, mid.z));
      m.instanceMatrix.needsUpdate = true;
      return m;
    };
    const actor = blob('test-actor');
    scene.add(actor);
    cam.setView(0.4, 0.3);
    rg.step(1 / 60, 60, false);
    const withActor = cam.state().distance;
    actor.removeFromParent();
    // Control: the same blob as world scenery does push the camera in (so the check can fail).
    const scenery = blob('test-scenery');
    scene.getObjectByName('world')!.add(scenery);
    rg.step(1 / 60, 60, false);
    const asScenery = cam.state().distance;
    scenery.removeFromParent();
    rg.step(1 / 60, 60, false);
    // A weak-eye and a strong-eye object right in front of the camera.
    const v = window.__rgVision!;
    v.addTestObject({ layer: 'weak', distance: base * 0.5, size: 2.5 });
    v.addTestObject({ layer: 'strong', distance: base * 0.4, size: 2.5 });
    rg.step(1 / 60, 60, false);
    const withLayers = cam.state().distance;
    v.removeTestObjects();
    return { base, withActor, asScenery, withLayers };
  });
  expect(r).not.toHaveProperty('error');
  const d = r as { base: number; withActor: number; asScenery: number; withLayers: number };
  expect(Math.abs(d.withActor - d.base), JSON.stringify(d)).toBeLessThan(0.05);
  expect(d.asScenery, JSON.stringify(d)).toBeLessThan(d.base - 0.5);
  expect(Math.abs(d.withLayers - d.base), JSON.stringify(d)).toBeLessThan(0.05);
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

test('phone viewport: the race podium/result camera and the plaza chevron walk keep the hero in view (QA5 m5/m9)', async ({ browser }) => {
  test.setTimeout(240_000);
  const ph = await browser.newPage({ viewport: { width: 750, height: 342 } });
  await boot(ph);
  const probe = (): Promise<{ inside: boolean; near: number; headHidden: boolean; hits: string[] }> =>
    ph.evaluate(() => {
      const p = window.__rgCamera!.probe();
      return { inside: p.inside, near: p.near, headHidden: p.headHidden, hits: p.hits };
    });
  await ph.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 20, false);
    // Walking east from the spawn past the plaza chevron sign.
    rg.teleport(0, rg.ctx.world.heightAt(0, 9) + 0.2, 9, 1.75);
    rg.step(1 / 60, 30, false);
  });
  const bad: string[] = [];
  for (let i = 0; i < 6; i++) {
    await ph.evaluate(() => {
      const rg = window.__rg!;
      rg.inject({ moveY: 1 });
      rg.step(1 / 60, 15, false);
      rg.inject(null);
    });
    const r = await probe();
    if (r.inside || r.near <= 0.9 || r.headHidden) bad.push(`chevron walk ${i}: ${JSON.stringify(r)}`);
  }
  // QA6 m7 on the phone: the west lawn's oaks and the toys meadow's pines, 8 yaws each, then the
  // QA walk north into the pines.
  for (const [name, x, z] of [['west-lawn', -10, 20], ['west-lawn-oak', -6, 20], ['toys-meadow', -40, 82.9]] as const) {
    await ph.evaluate(([x0, z0]) => {
      const rg = window.__rg!;
      rg.teleport(x0, rg.ctx.world.heightAt(x0, z0) + 0.1, z0, 0);
      rg.step(1 / 60, 30, false);
    }, [x, z] as const);
    for (let i = 0; i < 8; i++) {
      await ph.evaluate((y) => {
        window.__rgCamera!.setView(y, 0.38);
        window.__rg!.step(1 / 60, 45, false);
      }, (i / 8) * Math.PI * 2);
      const r = await probe();
      if (r.inside || r.near <= 0.9 || r.headHidden) bad.push(`${name} yaw ${i}: ${JSON.stringify(r)}`);
    }
  }
  await ph.evaluate(() => {
    const rg = window.__rg!;
    rg.teleport(-40, rg.ctx.world.heightAt(-40, 80) + 0.3, 80, 0);
    rg.step(1 / 60, 40, false);
  });
  for (let i = 0; i < 8; i++) {
    await ph.evaluate(() => {
      const rg = window.__rg!;
      rg.inject({ moveY: 1 });
      rg.step(1 / 60, 15, false);
      rg.inject(null);
    });
    const r = await probe();
    if (r.inside || r.near <= 0.9 || r.headHidden) bad.push(`toys meadow walk ${i}: ${JSON.stringify(r)}`);
  }
  await ph.evaluate(() => window.__rg!.render());
  await canvasShot(ph, 'test-results/camera-clear-toys-meadow-phone.png');
  // Race one lap on autopilot, then watch the podium and the result card camera orbit.
  const ok = await ph.evaluate(() => {
    const rg = window.__rg!;
    const race = window.__rgRace!;
    race.setLaps(1);
    const g = race.gridView();
    rg.teleport(g[0] + 5, g[1] + 0.3, g[2] - 7);
    rg.step(1 / 60, 10, false);
    if (!race.start()) return 'no start';
    race.autopilot(true);
    for (let i = 0; i < 80 && race.phase !== 'podium' && race.phase !== 'result'; i++) rg.step(1 / 30, 30, false);
    return race.phase;
  });
  expect(['podium', 'result']).toContain(ok);
  for (let i = 0; i < 10; i++) {
    await ph.evaluate(() => window.__rg!.step(1 / 30, 15, false));
    const r = await probe();
    if (r.inside || r.near <= 0.9 || r.headHidden) bad.push(`podium ${i}: ${JSON.stringify(r)}`);
  }
  await ph.evaluate(() => window.__rg!.render());
  await canvasShot(ph, 'test-results/camera-clear-race-result-phone.png');
  await ph.evaluate(() => window.__rgRace!.exit());
  await ph.close();
  expect(bad).toEqual([]);
});

// ───────────── QA6 M2: scenery right behind the hero (Gear Shack board, kiosk and booth walls) ─────────────

interface WallSpot {
  name: string;
  x: number;
  z: number;
  /** Look yaws to test (the camera sits behind the look direction). */
  yaws: number[];
}

/**
 * The QA6 spot beside the Gear Shack's dot-picture board (16, 0), 8 yaws; and the hero's back
 * against three walls (the Gear Shack's back, the Scoops parlour's back, a carnival booth's back),
 * found by a ray from outside towards each structure: hero 0.45 m off the wall, looking away from it
 * (camera pushed into the wall) and ±0.7 rad either side.
 */
async function wallSpots(p: Page): Promise<WallSpot[]> {
  return p.evaluate(() => {
    const { world, physics } = window.__rg!.ctx;
    const a = world.anchors as unknown as Record<string, { position: { x: number; z: number }; yaw: number }>;
    const out: { name: string; x: number; z: number; yaws: number[] }[] = [];
    out.push({ name: 'shack-board-16-0', x: 16, z: 0, yaws: Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2) });
    const back = (name: string, cx: number, cz: number, dirYaw: number): void => {
      const dx = Math.sin(dirYaw);
      const dz = Math.cos(dirYaw);
      const o = world.anchors.spawn.position.clone().set(cx + dx * 9, world.heightAt(cx, cz) + 1.0, cz + dz * 9);
      const hit = physics.raycast(o, o.clone().set(-dx, 0, -dz), 9);
      if (!hit) return;
      const t = hit.distance - 0.45 - 0.35;
      out.push({ name, x: o.x - dx * t, z: o.z - dz * t, yaws: [dirYaw, dirYaw + 0.7, dirYaw - 0.7] });
    };
    const gs = a.gearShack;
    back('shack-back', gs.position.x, gs.position.z, gs.yaw + Math.PI);
    const ic = a.iceCream;
    back('scoops-back', ic.position.x, ic.position.z, ic.yaw + Math.PI);
    const cr = a.carnivalRow;
    back('carnival-back', cr.position.x, cr.position.z, cr.yaw + Math.PI);
    return out;
  });
}

/** Camera vs hero after a view settles (runs in the page). */
function viewCheck(y: number): { near: number; inside: boolean; fade: number; onScreen: number; inFront: boolean; d: number; hits: string[] } {
  const rg = window.__rg!;
  const cam = window.__rgCamera!;
  cam.setView(y, 0.38);
  rg.step(1 / 60, 45, false);
  const pr = cam.probe();
  const st = cam.state();
  const { camera, player } = rg.ctx;
  camera.updateMatrixWorld();
  // The hero's box (capsule bounds) projected to the screen: how much of it is inside the view.
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let inFront = true;
  for (const [ox, oy, oz] of [[-0.35, 0, -0.35], [0.35, 0, -0.35], [-0.35, 0, 0.35], [0.35, 0, 0.35], [-0.35, 1.7, -0.35], [0.35, 1.7, -0.35], [-0.35, 1.7, 0.35], [0.35, 1.7, 0.35]]) {
    const v = player.position.clone().add(player.position.clone().set(ox, oy, oz)).project(camera);
    if (v.z < -1 || v.z > 1) inFront = false;
    x0 = Math.min(x0, v.x);
    x1 = Math.max(x1, v.x);
    y0 = Math.min(y0, v.y);
    y1 = Math.max(y1, v.y);
  }
  const area = (x1 - x0) * (y1 - y0);
  const vis = Math.max(0, Math.min(1, x1) - Math.max(-1, x0)) * Math.max(0, Math.min(1, y1) - Math.max(-1, y0));
  return { near: pr.near, inside: pr.inside, fade: st.heroFade, onScreen: area > 0 ? vis / area : 0, inFront, d: st.distance, hits: pr.hits };
}

async function checkWallSpots(p: Page, label: string): Promise<string[]> {
  const bad: string[] = [];
  const list = await wallSpots(p);
  expect(list.map((s) => s.name)).toEqual(['shack-board-16-0', 'shack-back', 'scoops-back', 'carnival-back']);
  for (const s of list) {
    await p.evaluate(({ x, z }) => {
      const rg = window.__rg!;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.1, z, 0);
      rg.step(1 / 60, 30, false);
    }, s);
    for (let i = 0; i < s.yaws.length; i++) {
      const r = await p.evaluate(viewCheck, s.yaws[i]);
      const msg = `${label} ${s.name} yaw ${s.yaws[i].toFixed(2)}: ${JSON.stringify(r)}`;
      // At (16, 0) the camera's clear side looks east under the plaza bunting and past the Scoops
      // awning, render-only parts that are not camera occluders (not this check's concern): there
      // only the M2 criteria count (camera out of the hero, hero on screen, not faded).
      const insideCounts = s.name !== 'shack-board-16-0';
      if ((r.inside && !insideCounts) || process.env.RG_CAMLOG) console.log(`(info) ${msg} at ${s.x.toFixed(2)},${s.z.toFixed(2)}`);
      if (r.near <= 0.9 || (insideCounts && r.inside) || !r.inFront || r.onScreen < 0.6 || r.fade > 0.5) bad.push(msg);
      if (SHOTS && i % 2 === 0) {
        await p.evaluate(() => window.__rg!.render());
        await canvasShot(p, `test-results/camera-wall-${label}-${s.name}-${i}.png`);
      }
    }
  }
  return bad;
}

test('QA6 M2 desktop: hero beside the Gear Shack board and with their back to walls: camera clear', async () => {
  test.setTimeout(240_000);
  expect(await checkWallSpots(page, 'desktop')).toEqual([]);
});

test('QA6 M2 phone (750×342 touch): hero beside the Gear Shack board and with their back to walls', async ({ browser }) => {
  test.setTimeout(240_000);
  const ph = await browser.newPage({ viewport: { width: 750, height: 342 }, hasTouch: true });
  const { consoleErrors: errs } = await boot(ph);
  await ph.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 20, false);
  });
  const bad = await checkWallSpots(ph, 'phone');
  await ph.close();
  expect(bad).toEqual([]);
  expect(errs).toEqual([]);
});

test('QA6 M2: walking past the Gear Shack board from 8 directions never stalls for 3 s', async () => {
  test.setTimeout(240_000);
  const bad: string[] = [];
  // Through the QA stall spot (16.4, 0.1), and out from (16, 0), like a child steering: head for the
  // goal, veer off to one side for a moment when blocked.
  const runs: { from: [number, number]; to: [number, number] }[] = [];
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    runs.push({ from: [16.4 + Math.sin(t) * 7, 0.1 + Math.cos(t) * 7], to: [16.4 - Math.sin(t) * 7, 0.1 - Math.cos(t) * 7] });
    runs.push({ from: [16, 0], to: [16 + Math.sin(t) * 5, Math.cos(t) * 5] });
  }
  for (const run of runs) {
    const r = await page.evaluate(({ from, to }) => {
      const rg = window.__rg!;
      const cam = window.__rgCamera!;
      const p = rg.ctx.player.position;
      rg.teleport(from[0], rg.ctx.world.heightAt(from[0], from[1]) + 0.1, from[1], Math.atan2(to[0] - from[0], to[1] - from[1]));
      rg.step(1 / 60, 10, false);
      const trail: [number, number][] = [];
      let veer = 0;
      let veerT = 0;
      let side = 1;
      let longest = 0;
      let still = 0;
      let mark: [number, number] = [p.x, p.z];
      for (let f = 0; f < 60 * 20; f += 5) {
        const dx = to[0] - p.x;
        const dz = to[1] - p.z;
        if (Math.hypot(dx, dz) < 1.2) {
          rg.inject(null);
          return { ok: true, t: f / 60, longest, at: [p.x, p.z] };
        }
        const h = Math.atan2(dx, dz) + veer;
        if (veerT > 0) veerT -= 5 / 60;
        else veer = 0;
        const yaw = cam.state().yaw;
        const s = Math.sin(yaw);
        const c = Math.cos(yaw);
        const wx = Math.sin(h);
        const wz = Math.cos(h);
        rg.inject({ moveY: s * wx + c * wz, moveX: -c * wx + s * wz });
        rg.step(1 / 60, 5, false);
        trail.push([p.x, p.z]);
        // Blocked for half a second: veer 70° to one side (alternating) for a second.
        if (trail.length >= 6) {
          const q = trail[trail.length - 6];
          if (Math.hypot(p.x - q[0], p.z - q[1]) < 0.3 && veerT <= 0) {
            veer = side * 1.2;
            veerT = 1;
            side = -side;
          }
        }
        // Longest time spent within 0.6 m of one point.
        if (Math.hypot(p.x - mark[0], p.z - mark[1]) > 0.6) {
          mark = [p.x, p.z];
          still = 0;
        } else {
          still += 5 / 60;
          longest = Math.max(longest, still);
        }
      }
      rg.inject(null);
      return { ok: false, t: 20, longest, at: [p.x, p.z] };
    }, run);
    // Not reaching a goal that sits inside a building is fine as long as the hero kept moving.
    const gained = Math.hypot(run.to[0] - run.from[0], run.to[1] - run.from[1]) - Math.hypot(run.to[0] - r.at[0], run.to[1] - r.at[1]);
    if ((!r.ok && gained < 3) || r.longest >= 3) bad.push(`${JSON.stringify(run)}: ${JSON.stringify(r)}`);
  }
  expect(bad).toEqual([]);
});
