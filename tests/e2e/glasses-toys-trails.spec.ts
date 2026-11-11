/**
 * Pip's lost toys: a valid paw trail exists for every seed at the real site, on the current world,
 * through the real code path (the mechanic's own world probes: terrain, roads, anchors, reserved
 * footprints, colliders, open sky). 200 seeds × the three toys of a session. Also the default
 * camera at the basket with the first prints in view.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot } from './helpers';
import { channelOnly } from './glasses-helpers';

test.describe.configure({ mode: 'serial' });

const SEEDS = 200;
const OUT = 'test-results/glasses/toys';
let page: Page;
let consoleErrors: string[] = [];

interface Row {
  seed: number;
  tier: number;
  valid: boolean;
  prints: number;
  length: number;
  candidate: number;
  /** First print's distance from the basket (m). */
  first: number;
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 5, false);
    window.__rgGlasses!.sites();
  });
});

test.afterAll(async () => {
  await page?.close();
});

test(`every one of ${SEEDS} seeds × 3 toys has a full trail at the real site`, async () => {
  test.setTimeout(240_000);
  const site = await page.evaluate(() => window.__rgGlasses!.sites().find((s) => s.id === 'toys')!);
  expect(site.valid).toBe(true);
  const rows: Row[] = [];
  for (let start = 0; start < SEEDS; start += 25) {
    const batch = await page.evaluate(
      ([from, n]) => {
        const g = window.__rgGlasses!;
        const out: Row[] = [];
        for (let i = from; i < from + n; i++) {
          // Spread like the game's hashed trail seeds.
          const seed = Math.imul(i + 1, 0x9e3779b1) >>> 0;
          for (let found = 0; found < 3; found++) {
            g.force('toys', { found, seed });
            const d = g.debug('toys') as { valid: boolean; prints: { x: number; z: number }[]; length: number; candidate: number; basket: { x: number; z: number }; tier: number };
            out.push({ seed, tier: d.tier, valid: d.valid, prints: d.prints.length, length: d.length, candidate: d.candidate, first: Math.hypot(d.prints[0].x - d.basket.x, d.prints[0].z - d.basket.z) });
          }
        }
        return out;
      },
      [start, Math.min(25, SEEDS - start)] as const,
    );
    rows.push(...batch);
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/trails.json`, JSON.stringify(rows));
  const bad = rows.filter((r) => !r.valid);
  const lengths = rows.map((r) => r.length).sort((a, b) => a - b);
  const cands = new Set(rows.map((r) => r.candidate));
  console.log(`toys trails: ${rows.length - bad.length}/${rows.length} valid; length ${lengths[0].toFixed(1)}–${lengths[lengths.length - 1].toFixed(1)} m (median ${lengths[lengths.length >> 1].toFixed(1)}); ${cands.size} start directions used`);
  expect(bad, `invalid trails: ${JSON.stringify(bad.slice(0, 5))}`).toEqual([]);
  for (const r of rows) {
    expect(r.prints, `seed ${r.seed} tier ${r.tier}`).toBeGreaterThanOrEqual(12);
    expect(r.length, `seed ${r.seed} tier ${r.tier}`).toBeGreaterThanOrEqual(24);
    expect(r.first).toBeLessThan(2);
  }
});

test('the default camera at the basket shows the first prints (weak layer only)', async () => {
  const cover = await page.evaluate(() => {
    const g = window.__rgGlasses!;
    const rg = window.__rg!;
    g.force('toys', { found: 0, seed: 12345 });
    const d = g.debug('toys') as { view: { x: number; z: number; yaw: number }; prints: { x: number; y: number; z: number }[] };
    rg.teleport(d.view.x, rg.ctx.world.heightAt(d.view.x, d.view.z) + 0.05, d.view.z, d.view.yaw);
    rg.step(1 / 60, 3, false);
    rg.step(1 / 60, 1);
    // Which of the first four prints project inside the frame?
    const cam = rg.ctx.camera;
    cam.updateMatrixWorld();
    const V = rg.ctx.player.position.constructor as new (x: number, y: number, z: number) => { project(c: unknown): { x: number; y: number; z: number } };
    return d.prints.slice(0, 4).map((p) => {
      const s = new V(p.x, p.y, p.z).project(cam);
      return Math.abs(s.x) < 1 && Math.abs(s.y) < 1 && s.z < 1;
    });
  });
  mkdirSync(OUT, { recursive: true });
  const img = await canvasShot(page, `${OUT}/basket-full.png`);
  writeFileSync(`${OUT}/basket-R.png`, PNG.sync.write(channelOnly(img, 0)));
  writeFileSync(`${OUT}/basket-G.png`, PNG.sync.write(channelOnly(img, 1)));
  expect(cover.filter(Boolean).length, `first prints in view: ${cover}`).toBeGreaterThanOrEqual(3);
});

test('no errors', async () => {
  expect(consoleErrors).toEqual([]);
});
