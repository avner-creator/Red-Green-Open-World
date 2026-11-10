/**
 * Glasses-play framework: the six sites in the real world, their pictogram boards (readable in
 * R-only and G-only), far-idle, draw budgets, and the proof helpers the mechanics will use
 * (demonstrated on throwaway layer test objects).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot } from './helpers';
import { channelOnly, channelSpread, expectAnswerBlindWithoutWeakEye, expectDrawBudget, expectLayerOnlyTouchesOwnChannel } from './glasses-helpers';
import { ROADS } from '../../src/world/layout';
import type { GlassesSiteInfo } from '../../src/activities/glasses';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/glasses';
let page: Page;
let consoleErrors: string[] = [];
let sites: GlassesSiteInfo[] = [];

function segDist(px: number, pz: number, a: readonly number[], b: readonly number[]): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2)) : 0;
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 5, false);
  });
  sites = await page.evaluate(() => window.__rgGlasses!.sites());
  mkdirSync(OUT, { recursive: true });
});

test.afterAll(async () => {
  await page.close();
});

test('six valid sites on land, outside every anchor and off the roads', async () => {
  expect(sites.map((s) => s.id)).toEqual(['glowflies', 'oddone', 'lineup', 'toys', 'gates', 'dotsigns']);
  const world = await page.evaluate((ids) => {
    const w = window.__rg!.ctx.world;
    const anchors = Object.entries(w.anchors).map(([name, a]) => ({
      name,
      x: a.position.x,
      z: a.position.z,
      r: a.radius,
      t: a.target ? { x: a.target.x, z: a.target.z, r: a.targetRadius ?? 0 } : null,
    }));
    const pts = window.__rgGlasses!.sites().filter((s) => ids.includes(s.id));
    return { anchors, land: pts.map((s) => w.isLand(s.x, s.z) && s.y > w.waterLevel + 1), spawn: { x: w.anchors.spawn.position.x, z: w.anchors.spawn.position.z } };
  }, sites.map((s) => s.id));
  console.log(sites.map((s) => `${s.id} (${s.x.toFixed(1)}, ${s.y.toFixed(1)}, ${s.z.toFixed(1)}) near ${s.near}`).join('\n'));
  expect(world.land.every(Boolean)).toBe(true);
  for (const s of sites) {
    expect(s.valid, s.id).toBe(true);
    for (const a of world.anchors) {
      expect(Math.hypot(s.x - a.x, s.z - a.z), `${s.id} vs ${a.name}`).toBeGreaterThanOrEqual(a.r + s.radius);
      if (a.t) expect(Math.hypot(s.x - a.t.x, s.z - a.t.z), `${s.id} vs ${a.name} target`).toBeGreaterThanOrEqual(a.t.r + s.radius);
    }
    for (const r of ROADS)
      for (let i = 1; i < r.points.length; i++) expect(segDist(s.x, s.z, r.points[i - 1], r.points[i]) - r.width / 2, `${s.id} vs road ${r.id}`).toBeGreaterThan(s.radius);
  }
  for (const s of sites.slice(0, 3)) {
    const d = Math.hypot(s.x - world.spawn.x, s.z - world.spawn.z);
    expect(d).toBeGreaterThanOrEqual(15);
    expect(d).toBeLessThanOrEqual(45);
  }
});

test('far mechanics are idle; one becomes active on approach', async () => {
  const far = sites[5]; // beside the balloon
  const near = sites[2]; // plaza, west side
  await page.evaluate((id) => {
    window.__rgGlasses!.goto(id);
    window.__rg!.step(1 / 60, 2, false);
  }, near.id);
  expect(await page.evaluate((id) => window.__rgGlasses!.active(id), near.id)).toBe(true);
  expect(await page.evaluate((id) => window.__rgGlasses!.active(id), far.id)).toBe(false);
  await page.evaluate((id) => {
    window.__rgGlasses!.goto(id);
    window.__rg!.step(1 / 60, 2, false);
  }, far.id);
  expect(await page.evaluate((id) => window.__rgGlasses!.active(id), far.id)).toBe(true);
  expect(await page.evaluate((id) => window.__rgGlasses!.active(id), near.id)).toBe(false);
  expect(await page.evaluate((id) => window.__rgGlasses!.debug(id), far.id)).toMatchObject({ active: true });
});

test('each stub stays within the draw budget', async () => {
  for (const s of sites) expect(await expectDrawBudget(page, s.id, 6)).toBeGreaterThanOrEqual(1);
});

test('every board is visible from goto() and reads in R-only and G-only', async () => {
  // Screenshots judge the look: medium quality (shadows, AO) for these frames only.
  await page.evaluate(() => window.__rg!.ctx.settings.set({ quality: 'medium' }));
  for (const s of sites) {
    await page.evaluate((id) => {
      window.__rgGlasses!.goto(id);
      window.__rg!.step(1 / 60, 3, false);
      window.__rg!.step(1 / 60, 1);
    }, s.id);
    const rect = await page.evaluate((id) => window.__rgGlasses!.boardRect(id), s.id);
    expect(rect, `${s.id} board in front of the camera`).not.toBeNull();
    const img = await canvasShot(page, `${OUT}/${s.id}-full.png`);
    writeFileSync(`${OUT}/${s.id}-R.png`, PNG.sync.write(channelOnly(img, 0)));
    writeFileSync(`${OUT}/${s.id}-G.png`, PNG.sync.write(channelOnly(img, 1)));
    const r = rect!;
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    expect(w * h, `${s.id} board on screen`).toBeGreaterThan(600);
    expect(r.x1 - r.x0).toBeGreaterThan(20);
    const spreadR = channelSpread(img, r, 0);
    const spreadG = channelSpread(img, r, 1);
    expect(spreadR, `${s.id} R contrast`).toBeGreaterThan(90);
    expect(spreadG, `${s.id} G contrast`).toBeGreaterThan(90);
  }
  await page.evaluate(() => window.__rg!.ctx.settings.set({ quality: 'low' }));
});

test('proof helpers: channel isolation, answer blindness, on throwaway layer objects', async () => {
  await page.evaluate(() => {
    const rg = window.__rg!;
    window.__rgGlasses!.goto('glowflies');
    rg.step(1 / 60, 3, false);
    rg.step(1 / 60, 1);
    const v = window.__rgVision!;
    v.addTestObject({ layer: 'weak', distance: 6, size: 0.8, offsetX: -1.2, offsetY: 0.6 });
    v.addTestObject({ layer: 'strong', distance: 6, size: 0.8, offsetX: 1.2, offsetY: 0.6 });
  });
  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'both', label: 'test object' });

  // Two "answers": the weak-eye object on the left vs on the right, everything else equal.
  const place = (x: number) => async (): Promise<void> => {
    await page.evaluate((offsetX) => {
      const v = window.__rgVision!;
      v.removeTestObjects();
      v.addTestObject({ layer: 'weak', distance: 6, size: 0.8, offsetX, offsetY: 0.6 });
      v.addTestObject({ layer: 'strong', distance: 6, size: 0.8, offsetX: 0, offsetY: -0.6 });
    }, x);
  };
  await expectAnswerBlindWithoutWeakEye(page, { setA: place(-1.5), setB: place(1.5), label: 'test answer' });
  await page.evaluate(() => window.__rgVision!.removeTestObjects());
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
