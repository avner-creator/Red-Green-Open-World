/**
 * Pip's lost toys: a valid paw trail exists for every seed at the real site, on the current world,
 * through the real code path (the mechanic's own world probes: terrain, roads, anchors, reserved
 * footprints, colliders, open sky). 200 seeds × the three toys of a session. Also the default
 * camera on the start pad with the first prints in view.
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
  /** First print's distance from the start pad's centre (m). */
  first: number;
  /** The hidden spot (world XZ) and the farthest any print or the spot gets from the site centre. */
  end: { x: number; z: number };
  reach: number;
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
      ([from, n, site]) => {
        const g = window.__rgGlasses!;
        const out: Row[] = [];
        for (let i = from; i < from + n; i++) {
          // Spread like the game's hashed trail seeds.
          const seed = Math.imul(i + 1, 0x9e3779b1) >>> 0;
          for (let found = 0; found < 3; found++) {
            g.force('toys', { found, seed });
            const d = g.debug('toys') as { valid: boolean; prints: { x: number; z: number }[]; end: { x: number; z: number }; length: number; candidate: number; pad: { x: number; z: number }; tier: number };
            const reach = Math.max(...[...d.prints, d.end].map((p) => Math.hypot(p.x - site.x, p.z - site.z)));
            out.push({ seed, tier: d.tier, valid: d.valid, prints: d.prints.length, length: d.length, candidate: d.candidate, first: Math.hypot(d.prints[0].x - d.pad.x, d.prints[0].z - d.pad.z), end: { x: d.end.x, z: d.end.z }, reach });
          }
        }
        return out;
      },
      [start, Math.min(25, SEEDS - start), site] as const,
    );
    rows.push(...batch);
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/trails.json`, JSON.stringify(rows));
  const bad = rows.filter((r) => !r.valid);
  const lengths = rows.map((r) => r.length).sort((a, b) => a - b);
  const cands = new Set(rows.map((r) => r.candidate));
  console.log(`toys trails: ${rows.length - bad.length}/${rows.length} valid; length ${lengths[0].toFixed(1)}–${lengths[lengths.length - 1].toFixed(1)} m (median ${lengths[lengths.length >> 1].toFixed(1)}); ${cands.size} start directions used`);
  const xs = rows.map((r) => r.end.x);
  const zs = rows.map((r) => r.end.z);
  const reach = Math.max(...rows.map((r) => r.reach));
  console.log(`toys hiding spots: x ${Math.min(...xs).toFixed(0)}…${Math.max(...xs).toFixed(0)}, z ${Math.min(...zs).toFixed(0)}…${Math.max(...zs).toFixed(0)}; farthest ${reach.toFixed(1)} m from the site centre`);
  // A round is cancelled only past the kit's leave radius (55 m): every trail stays well inside it.
  expect(reach).toBeLessThan(50);
  expect(bad, `invalid trails: ${JSON.stringify(bad.slice(0, 5))}`).toEqual([]);
  for (const r of rows) {
    expect(r.prints, `seed ${r.seed} tier ${r.tier}`).toBeGreaterThanOrEqual(12);
    expect(r.length, `seed ${r.seed} tier ${r.tier}`).toBeGreaterThanOrEqual(24);
    expect(r.first).toBeLessThan(2);
  }
});

test('the default camera on the start pad shows the first prints', async () => {
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
  const img = await canvasShot(page, `${OUT}/pad-full.png`);
  writeFileSync(`${OUT}/pad-R.png`, PNG.sync.write(channelOnly(img, 0)));
  writeFileSync(`${OUT}/pad-G.png`, PNG.sync.write(channelOnly(img, 1)));
  expect(cover.filter(Boolean).length, `first prints in view: ${cover}`).toBeGreaterThanOrEqual(3);
});

/**
 * The toy's big moment is in view: for 30 trails, the hero arrives at the last print walking along
 * the trail; the DEFAULT camera behind them settles (camera collision included) and has a clear
 * line (colliders AND scene meshes: trunks, canopies, the world fill) to the spot and to the top
 * of the pop, and is not pulled in towards the hero by anything.
 */
test('the default camera behind a child arriving at the end sees the pop (30 trails)', async () => {
  test.setTimeout(120_000);
  const rows = await page.evaluate(() => {
    const g = window.__rgGlasses!;
    const rg = window.__rg!;
    const out: { seed: number; tier: number; camDist: number; blocked: string[] }[] = [];
    for (let i = 0; i < 30; i++) {
      const seed = Math.imul(i + 7, 0x85ebca6b) >>> 0;
      g.force('toys', { found: i % 3, seed });
      const d = g.debug('toys') as { tier: number; prints: { x: number; y: number; z: number }[]; end: { x: number; y: number; z: number } };
      const [a, b] = [d.prints[d.prints.length - 2], d.prints[d.prints.length - 1]];
      rg.teleport(b.x, b.y + 0.05, b.z, Math.atan2(b.x - a.x, b.z - a.z));
      rg.step(1 / 60, 45, false);
      const cam = rg.ctx.camera.getWorldPosition(rg.ctx.player.position.clone());
      const p = rg.ctx.player.position;
      const camDist = Math.hypot(cam.x - p.x, cam.z - p.z);
      const blocked: string[] = [];
      for (const h of [0.6, 3.4]) {
        const hit = g.sight({ x: cam.x, y: cam.y, z: cam.z }, { x: d.end.x, y: d.end.y + h, z: d.end.z });
        if (hit) blocked.push(`${h} m: ${hit}`);
      }
      out.push({ seed, tier: d.tier, camDist, blocked });
    }
    g.force('toys', { found: 0 });
    return out;
  });
  const dists = rows.map((r) => r.camDist).sort((x, y) => x - y);
  console.log(`toys pop view: ${rows.filter((r) => !r.blocked.length).length}/30 clear; camera ${dists[0].toFixed(2)}–${dists[dists.length - 1].toFixed(2)} m behind the hero`);
  for (const r of rows) {
    expect(r.blocked, `seed ${r.seed} tier ${r.tier}: line to the pop`).toEqual([]);
    expect(r.camDist, `seed ${r.seed} tier ${r.tier}: camera not pulled in`).toBeGreaterThan(dists[dists.length - 1] * 0.85);
  }
});

test('no errors', async () => {
  expect(consoleErrors).toEqual([]);
});
