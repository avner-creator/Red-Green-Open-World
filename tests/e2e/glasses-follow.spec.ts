/**
 * Glasses play, kind `follow`: Glow-flies and Pip's lost toys on one shared page. For each:
 * channel isolation (all 4 lens/eye combinations), answer blindness without the weak eye, a full
 * round to a hit and one to a miss through the test API, the draw budget and far-idle.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot } from './helpers';
import { channelOnly, expectAnswerBlindWithoutWeakEye, expectDrawBudget, expectLayerOnlyTouchesOwnChannel } from './glasses-helpers';
import type { GlassesSiteInfo } from '../../src/activities/glasses';

test.describe.configure({ mode: 'serial' });

type Logged = { results: { mechanic: string; tier: number; hit: boolean }[]; toasts: string[] };
type W = Window & { __follow?: Logged };

let page: Page;
let consoleErrors: string[] = [];
let sites: GlassesSiteInfo[] = [];

async function shots(name: string, dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true });
  const img = await canvasShot(page, `${dir}/${name}-full.png`);
  writeFileSync(`${dir}/${name}-R.png`, PNG.sync.write(channelOnly(img, 0)));
  writeFileSync(`${dir}/${name}-G.png`, PNG.sync.write(channelOnly(img, 1)));
}

async function view(id: string): Promise<void> {
  await page.evaluate((i) => {
    window.__rgGlasses!.goto(i);
    window.__rg!.step(1 / 60, 3, false);
    window.__rg!.step(1 / 60, 1);
  }, id);
}

/** Stand at (fx, fz) facing (tx, tz) and render (the camera follows behind the hero). */
async function look(fx: number, fz: number, tx: number, tz: number): Promise<void> {
  await page.evaluate(
    ([a, b, c, d]) => {
      const rg = window.__rg!;
      rg.teleport(a, rg.ctx.world.heightAt(a, b) + 0.05, b, Math.atan2(c - a, d - b));
      rg.step(1 / 60, 3, false);
      rg.step(1 / 60, 1);
    },
    [fx, fz, tx, tz],
  );
}

/** Site-local → world XZ (as the framework's `siteToWorld`). */
function local(s: GlassesSiteInfo, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(s.yaw);
  const n = Math.sin(s.yaw);
  return { x: s.x + lx * c + lz * n, z: s.z - lx * n + lz * c };
}

const logged = (): Promise<Logged> => page.evaluate(() => JSON.parse(JSON.stringify((window as W).__follow)) as Logged);
const clearLog = (): Promise<void> =>
  page.evaluate(() => {
    const l = (window as W).__follow!;
    l.results.length = 0;
    l.toasts.length = 0;
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- debug snapshots are free-form JSON
const dbg = (id: string): Promise<any> => page.evaluate((i) => window.__rgGlasses!.debug(i), id);

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 5, false);
    const log: Logged = { results: [], toasts: [] };
    (window as W).__follow = log;
    rg.ctx.events.on('glasses:result', (e) => log.results.push({ mechanic: e.mechanic, tier: e.tier, hit: e.hit }));
    rg.ctx.events.on('ui:toast', (e) => log.toasts.push(e.text ?? ''));
  });
  sites = await page.evaluate(() => window.__rgGlasses!.sites());
});

test.afterAll(async () => {
  await page.close();
});

test('glow-flies: weak layer only, answer-blind, catch and fly-off, budget', async () => {
  const id = 'glowflies';
  await view(id);
  expect(await page.evaluate((i) => window.__rgGlasses!.active(i), id)).toBe(true);
  await page.evaluate((i) => window.__rgGlasses!.force(i, { seed: 101 }), id);
  // Stand at the patch's edge on the approach side, looking in.
  const site = sites.find((s) => s.id === id)!;
  const from = local(site, 1, 7.5);
  await look(from.x, from.z, site.x, site.z);
  await shots('flies', 'test-results/glasses/glowflies');

  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'weak', label: id });
  const seedA = async (): Promise<void> => page.evaluate((i) => window.__rgGlasses!.force(i, { seed: 101 }), id);
  const seedB = async (): Promise<void> => page.evaluate((i) => window.__rgGlasses!.force(i, { seed: 202 }), id);
  await expectAnswerBlindWithoutWeakEye(page, { setA: seedA, setB: seedB, label: id });

  // Catch: put the hero's chest on a fly.
  await seedA();
  await clearLog();
  const d = await dbg(id);
  const fly = d.flies.find((f: { state: string }) => f.state === 'alive');
  expect(fly).toBeTruthy();
  expect(d.tiers.filter((n: number) => n > 0).length, 'a mix of tiers in the air').toBeGreaterThanOrEqual(2);
  await page.evaluate((f) => {
    window.__rg!.teleport(f.x, f.y - 0.85, f.z);
    window.__rg!.step(1 / 60, 1, false);
  }, fly);
  let log = await logged();
  expect(log.results).toContainEqual({ mechanic: id, tier: fly.tier, hit: true });
  expect(log.toasts).toContain(`+${fly.gems}`);
  const after = await dbg(id);
  expect(after.caught).toBeGreaterThanOrEqual(1);
  expect(after.flies[fly.slot].state).toBe('gone');
  await page.evaluate(() => window.__rg!.step(1 / 60, 8));
  await shots('catch', 'test-results/glasses/glowflies');
  await expectDrawBudget(page, id, 6);

  // Outside the patch a timed-out fly is renewed quietly: no miss.
  await clearLog();
  await page.evaluate((s) => {
    window.__rg!.teleport(s.x + 30, s.y + 1, s.z);
    window.__rgGlasses!.force('glowflies', { lifeLeft: 0.01 });
    window.__rg!.step(1 / 60, 3, false);
  }, sites.find((s) => s.id === id)!);
  log = await logged();
  expect(log.results.filter((r) => r.mechanic === id)).toEqual([]);

  // Inside the patch it flies off: a miss with its tier.
  const before = await dbg(id);
  const alive = before.flies.filter((f: { state: string }) => f.state === 'alive');
  await page.evaluate((s) => {
    const back = s.yaw + Math.PI;
    window.__rg!.teleport(s.x + Math.sin(back) * 6.6, s.y + 0.5, s.z + Math.cos(back) * 6.6);
    window.__rgGlasses!.force('glowflies', { lifeLeft: 0.01 });
    window.__rg!.step(1 / 60, 3, false);
  }, sites.find((s) => s.id === id)!);
  log = await logged();
  const misses = log.results.filter((r) => r.mechanic === id && !r.hit);
  expect(misses.length).toBeGreaterThanOrEqual(1);
  expect(misses.length).toBeLessThanOrEqual(alive.length);
  for (const r of misses) expect([1, 2, 3]).toContain(r.tier);
});

test("Pip's toys: weak prints only, answer-blind, found toy and time-out, budget", async () => {
  const id = 'toys';
  await view(id);
  expect(await page.evaluate((i) => window.__rgGlasses!.active(i), id)).toBe(true);
  await page.evaluate((i) => window.__rgGlasses!.force(i, { seed: 7 }), id);
  const d0 = await dbg(id);
  // Follow it: stand on the second print, looking along the trail (the next prints glow ahead).
  {
    const [p1, p5] = [d0.prints[1], d0.prints[5]];
    const len = Math.hypot(p5.x - p1.x, p5.z - p1.z);
    const side = { x: ((p5.z - p1.z) / len) * 1.6, z: (-(p5.x - p1.x) / len) * 1.6 };
    await look(p1.x + side.x, p1.z + side.z, p5.x + side.x * 0.5, p5.z + side.z * 0.5);
  }
  expect((await dbg(id)).next).toBeGreaterThanOrEqual(1);
  await shots('trail', 'test-results/glasses/toys');
  expect(d0.valid, 'trail passes every ground rule').toBe(true);
  expect(d0.toysShown, 'no toy before the last print').toBe(0);
  expect(d0.toyVisible).toBe(false);

  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'weak', label: id });
  const seedA = async (): Promise<void> => page.evaluate((i) => window.__rgGlasses!.force(i, { seed: 7 }), id);
  const seedB = async (): Promise<void> => page.evaluate((i) => window.__rgGlasses!.force(i, { seed: 8 }), id);
  await seedB();
  const dB = await dbg(id);
  expect(dB.toysShown).toBe(0);
  expect(Math.hypot(dB.end.x - d0.end.x, dB.end.z - d0.end.z), 'different seeds, different hiding spots').toBeGreaterThan(3);
  await expectAnswerBlindWithoutWeakEye(page, { setA: seedA, setB: seedB, label: id });

  // Follow the prints to the end → the toy pops out (tier 1, 5 gems).
  await seedA();
  await clearLog();
  const prints = (await dbg(id)).prints as { x: number; y: number; z: number }[];
  for (let i = 0; i < prints.length; i++) {
    await page.evaluate((p) => {
      window.__rg!.teleport(p.x, p.y + 0.05, p.z);
      window.__rg!.step(1 / 60, 2, false);
    }, prints[i]);
    if (i < prints.length - 1) expect((await dbg(id)).toyVisible, `no toy at print ${i}`).toBe(false);
  }
  let log = await logged();
  expect(log.results).toContainEqual({ mechanic: id, tier: 1, hit: true });
  expect(log.toasts).toContain('+5');
  let d = await dbg(id);
  expect(d.state).toBe('found');
  expect(d.toysShown).toBe(1);
  // Watch the toy hop out, from a little way back along the trail.
  await page.evaluate(
    ([e, b]) => {
      const rg = window.__rg!;
      const len = Math.hypot(e.x - b.x, e.z - b.z);
      const fx = b.x + ((e.z - b.z) / len) * 0.8;
      const fz = b.z - ((e.x - b.x) / len) * 0.8;
      rg.teleport(fx, rg.ctx.world.heightAt(fx, fz) + 0.05, fz, Math.atan2(e.x - fx, e.z - fz));
      rg.step(1 / 60, 32, false);
      rg.step(1 / 60, 1);
    },
    [d.end, prints[prints.length - 3]],
  );
  await shots('found', 'test-results/glasses/toys');
  await expectDrawBudget(page, id, 6);

  // Into the basket, then a new tier-2 trail.
  await page.evaluate(() => window.__rg!.step(1 / 60, 300, false));
  d = await dbg(id);
  expect(d.found).toBe(1);
  expect(d.state).toBe('trail');
  expect(d.tier).toBe(2);
  expect(d.toysShown).toBe(1);
  expect(d.valid).toBe(true);

  // Time-out: start the trail, then let the clock run out → a tier-2 miss and a fresh trail.
  await clearLog();
  await page.evaluate((p) => {
    window.__rg!.teleport(p.x, p.y + 0.05, p.z);
    window.__rg!.step(1 / 60, 2, false);
    window.__rgGlasses!.force('toys', { timeLeft: 0.05 });
    window.__rg!.step(1 / 60, 6, false);
  }, d.prints[0]);
  log = await logged();
  expect(log.results).toContainEqual({ mechanic: id, tier: 2, hit: false });
  await page.evaluate(() => window.__rg!.step(1 / 60, 150, false));
  const d2 = await dbg(id);
  expect(d2.state).toBe('trail');
  expect(d2.tier).toBe(2);
  expect(d2.seed).not.toBe(d.seed);
});

test('both are idle when the player is far; no errors', async () => {
  const far = sites.reduce((a, b) => {
    const gf = sites.find((s) => s.id === 'glowflies')!;
    const ty = sites.find((s) => s.id === 'toys')!;
    const da = Math.min(Math.hypot(a.x - gf.x, a.z - gf.z), Math.hypot(a.x - ty.x, a.z - ty.z));
    const db = Math.min(Math.hypot(b.x - gf.x, b.z - gf.z), Math.hypot(b.x - ty.x, b.z - ty.z));
    return db > da ? b : a;
  });
  await page.evaluate((s) => {
    window.__rg!.teleport(s.x, s.y + 0.1, s.z);
    window.__rg!.step(1 / 60, 2, false);
  }, far);
  for (const id of ['glowflies', 'toys']) {
    const s = sites.find((x) => x.id === id)!;
    const dist = Math.hypot(s.x - far.x, s.z - far.z);
    if (dist > 75) expect(await page.evaluate((i) => window.__rgGlasses!.active(i), id), `${id} idle at ${dist.toFixed(0)} m`).toBe(false);
    expect(await expectDrawBudget(page, id, 6)).toBeGreaterThanOrEqual(1);
  }
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
