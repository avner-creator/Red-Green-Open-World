/**
 * Glasses weave part `chute` in the balloon skydive, on one shared page: the weak-eye
 * parachute-open ring (timeIt) and the weak-eye gem that only counts through a strong-eye hoop
 * (lineUp). Proves: nothing attached / zero draws outside a skydive and ≤ 4 inside; each layer
 * changes only its own channel (all 4 lens/eye combinations); answer-blind both ways (target
 * height and gem in/out hidden without the weak eye; hoop position hidden without the strong eye);
 * a ring hit and a near miss through the real chute press, a hoop hit and a miss by flying through
 * it, each with the right `glasses:result` and gems; a hands-off fall reports nothing.
 * Screenshots (full, R-only, G-only) go to test-results/glasses/weave/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot, channelDiff } from './helpers';
import { channelOnly, COMBOS, expectAnswerBlindWithoutWeakEye, expectLayerOnlyTouchesOwnChannel, layerFrame, maxOf, setEye } from './glasses-helpers';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/glasses/weave';
const ID = 'chute';
let page: Page;
let consoleErrors: string[] = [];

type P3 = { x: number; y: number; z: number };
interface ChuteDebug {
  active: boolean;
  phase: string | null;
  agl: number | null;
  attached: number;
  ring: { target: number; tier: number; window: number; open: boolean; t: number | null; attached: boolean };
  lastOpen: { agl: number; auto: boolean; outcome: 'hit' | 'miss' | null } | null;
  hoop: { center: P3 | null; tier: number; armed: boolean; gemInside: boolean; attached: boolean; gemAttached: boolean };
  lastHoop: 'hit' | 'miss' | null;
  hits: number;
  misses: number;
}
type Result = { mechanic: string; kind: string; tier: number; hit: boolean };

const debug = (): Promise<ChuteDebug> => page.evaluate((i) => window.__rgGlasses!.weave!.debug(i), ID) as unknown as Promise<ChuteDebug>;
const force = (params: Record<string, unknown>): Promise<void> => page.evaluate(({ i, p }) => window.__rgGlasses!.weave!.force(i, p), { i: ID, p: params });
const draws = (): Promise<number> => page.evaluate((i) => window.__rgGlasses!.weave!.draws(i), ID);
const wallet = (): Promise<number> => page.evaluate(() => window.__rg!.ctx.profile.wallet);
const step = (n: number, dt = 1 / 60): Promise<void> => page.evaluate(({ n, dt }) => window.__rg!.step(dt, n, false), { n, dt });

async function results(): Promise<Result[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __chute: Result[] };
    const out = w.__chute.filter((r) => r.mechanic === 'chute');
    w.__chute.length = 0;
    return out;
  });
}

/** Board the balloon, ride up, jump (Space at the top) and fall `fallSeconds`. */
async function rideToFreefall(fallSeconds = 0.5): Promise<void> {
  const ok = await page.evaluate((fall) => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const weave = window.__rgGlasses!.weave!;
    const a = ctx.world.anchors.balloon.position;
    rg.teleport(a.x + 1.7, ctx.world.heightAt(a.x, a.z) + 0.4, a.z, -Math.PI / 2);
    rg.step(1 / 60, 10, false);
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    for (let i = 0; i < 30 * 20 && weave.debug('chute').phase !== 'top'; i++) rg.step(1 / 30, 1, false);
    rg.step(1 / 30, 10, false);
    rg.inject({ jumpPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, Math.round(fall * 60), false);
    return weave.debug('chute').phase === 'freefall';
  }, fallSeconds);
  expect(ok, 'in freefall').toBe(true);
}

/** Step 1/60 frames until the height above ground is ≤ `agl`, then press Space for one frame. */
async function openChuteAt(agl: number): Promise<void> {
  await page.evaluate(
    ({ agl }) => {
      const rg = window.__rg!;
      const weave = window.__rgGlasses!.weave!;
      for (let i = 0; i < 600; i++) {
        const d = weave.debug('chute') as { agl: number };
        if (d.agl <= agl) break;
        rg.step(1 / 60, 1, false);
      }
      rg.inject({ jumpPressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 3, false);
    },
    { agl },
  );
}

/** A point straight ahead of the camera, `dist` metres out (to put the hoop in the default view). */
async function inView(dist: number, side = 0, up = 0): Promise<P3> {
  return page.evaluate(
    ({ dist, side, up }) => {
      const cam = window.__rg!.ctx.camera;
      const e = cam.matrixWorld.elements;
      const f = { x: -e[8], y: -e[9], z: -e[10] };
      const r = { x: e[0], y: e[1], z: e[2] };
      const u = { x: e[4], y: e[5], z: e[6] };
      const p = cam.position;
      return {
        x: p.x + f.x * dist + r.x * side + u.x * up,
        y: p.y + f.y * dist + r.y * side + u.y * up,
        z: p.z + f.z * dist + r.z * side + u.z * up,
      };
    },
    { dist, side, up },
  );
}

/** Full / R-only / G-only screenshots of the frozen frame, at 640×360 and 1280×720. */
async function shots(name: string): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const save = (img: PNG, tag: string): void => {
    writeFileSync(`${OUT}/${tag}-R.png`, PNG.sync.write(channelOnly(img, 0)));
    writeFileSync(`${OUT}/${tag}-G.png`, PNG.sync.write(channelOnly(img, 1)));
  };
  await page.evaluate(() => window.__rg!.render());
  save(await canvasShot(page, `${OUT}/${name}-full.png`), name);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  await page.evaluate(() => window.__rg!.render());
  save(await canvasShot(page, `${OUT}/${name}-720p-full.png`), `${name}-720p`);
  await page.setViewportSize({ width: 640, height: 360 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  await page.evaluate(() => window.__rg!.render());
}

/** Respawn out of the ride (R) and let the balloon land back on its pad. */
async function endRide(): Promise<void> {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 30, 30 * 17, false);
  });
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 5, false);
    rg.setRemaining(9999);
    rg.ctx.profile.earn(50, 'mission');
    const w = window as unknown as { __chute: unknown[] };
    w.__chute = [];
    rg.ctx.events.on('glasses:result', (e) => w.__chute.push(e));
  });
});

test.afterAll(async () => {
  await page.close();
});

test('chute: nothing attached and zero draws outside a skydive', async () => {
  const d = await debug();
  expect(d.active).toBe(false);
  expect(d.attached).toBe(0);
  expect(await draws()).toBe(0);
});

test('chute: in freefall both cues show; each layer touches only its own channel; ≤ 4 draws', async () => {
  await rideToFreefall(2);
  const d0 = await debug();
  expect(d0.active).toBe(true);
  expect(d0.ring.attached).toBe(true);
  // Ring well before its moment, hoop with the gem inside it in the default skydive view.
  await force({ target: d0.agl! - 30, hoop: await inView(24, 5, -4), gemInside: true });
  await shots('chute-ring-before');
  await force({ target: d0.agl! });
  await shots('chute-ring-moment');
  const d = await debug();
  expect(d.ring.attached && d.hoop.attached && d.hoop.gemAttached).toBe(true);
  expect(await draws()).toBeLessThanOrEqual(4);
  expect(await draws()).toBeGreaterThanOrEqual(3);
  await force({ target: d0.agl! - 30 });
  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'both', label: 'chute' });
});

test('chute: answer-blind both ways (target height, gem in/out, hoop position)', async () => {
  const agl = (await debug()).agl!;
  await expectAnswerBlindWithoutWeakEye(page, {
    setA: () => force({ target: agl - 30 }),
    setB: () => force({ target: agl - 12 }),
    label: 'chute target height',
  });
  const hoopAt = await inView(24, 5, -4);
  await force({ target: agl - 30, hoop: hoopAt });
  await expectAnswerBlindWithoutWeakEye(page, {
    setA: () => force({ gemInside: true }),
    setB: () => force({ gemInside: false }),
    label: 'chute gem in/out',
  });
  // Mirror: without the strong eye, two hoop positions look the same (the gem stays put).
  const hoopB = await inView(28, -6, -5);
  for (const combo of [COMBOS[0], COMBOS[1]]) {
    const tag = `chute hoop position ${combo.eye.leftLens}-left, weak ${combo.eye.weakEye}`;
    await setEye(page, combo.eye);
    // Same gem world position for both: put the orbit angle so the gem sits at the hoop centre of A.
    await force({ hoop: hoopAt, gemInside: true });
    const a0 = await layerFrame(page, { weak: true, strong: false });
    const a1 = await layerFrame(page, { weak: true, strong: true });
    // Move only the hoop: hide the gem's motion by keeping it at A's centre (gem layer → weak only).
    await force({ hoop: hoopB, gemInside: true, keepGemAt: hoopAt });
    const b0 = await layerFrame(page, { weak: true, strong: false });
    const b1 = await layerFrame(page, { weak: true, strong: true });
    const blind = channelDiff(a0, b0);
    expect([blind.maxR, blind.maxG, blind.maxB], `${tag}: identical without the strong eye`).toEqual([0, 0, 0]);
    const seen = channelDiff(a1, b1);
    expect(seen[combo.strong], `${tag}: the hoop moved for the strong eye`).toBeGreaterThanOrEqual(30);
    expect(maxOf(seen, combo.weak), `${tag}: weak channel identical`).toBe(0);
    expect(seen.maxB, `${tag}: blue identical`).toBe(0);
  }
  await setEye(page, COMBOS[0].eye);
  await force({ keepGemAt: null });
});

test('chute: hoop hit and miss by flying through it, ring hit through the real chute press', async () => {
  await results();
  const w0 = await wallet();
  // Hoop with the gem inside, right on the fall line half a second ahead: hit (+3).
  console.log(`chute: hoop test starts at ${(await debug()).agl!.toFixed(1)} m above ground`);
  await force({ hoopAhead: 0.4, gemInside: true });
  await step(40);
  let d = await debug();
  expect(d.lastHoop).toBe('hit');
  expect(await results()).toEqual([{ mechanic: 'chute', kind: 'lineUp', tier: 1, hit: true }]);
  expect(await wallet()).toBe(w0 + 3);
  // Again with the gem outside: miss, at the raised tier.
  await force({ hoopAhead: 0.4, gemInside: false });
  await step(40);
  d = await debug();
  expect(d.lastHoop).toBe('miss');
  expect(await results()).toEqual([{ mechanic: 'chute', kind: 'lineUp', tier: 2, hit: false }]);
  expect(await wallet()).toBe(w0 + 3);
  // Ring: target 30 m below; press Space when the height reaches it.
  expect(d.agl!).toBeGreaterThan(70);
  const target = d.agl! - 25;
  await force({ target });
  await openChuteAt(target + 0.5);
  d = await debug();
  expect(d.phase).toBe('canopy');
  expect(d.lastOpen?.outcome).toBe('hit');
  expect(Math.abs(d.lastOpen!.agl - target)).toBeLessThanOrEqual(8);
  expect(await results()).toEqual([{ mechanic: 'chute', kind: 'timeIt', tier: 1, hit: true }]);
  expect(await wallet()).toBe(w0 + 3 + 2);
  expect(d.ring.tier).toBe(2);
  // The weak-eye flash plays round the hero (on the layer); ≤ 4 draws.
  expect(await draws()).toBeLessThanOrEqual(4);
  await endRide();
  d = await debug();
  expect(d.active).toBe(false);
  expect(d.attached).toBe(0);
  expect(await draws()).toBe(0);
});

test('chute: a near-miss open is a miss; a hands-off fall reports nothing', async () => {
  await results();
  await rideToFreefall(0.6);
  let d = await debug();
  expect(d.ring.tier).toBe(2);
  const target = d.agl! - 40;
  await force({ target });
  await openChuteAt(target + 12); // tier 2 window is ±5 m; 12 m early is close but outside
  d = await debug();
  expect(d.lastOpen?.outcome).toBe('miss');
  expect(await results()).toEqual([{ mechanic: 'chute', kind: 'timeIt', tier: 2, hit: false }]);
  expect(d.ring.tier).toBe(1);
  await endRide();

  // Hands-off: auto-jump, assisted fall along the trail, auto-open. The random hoop hangs beside
  // the trail, so nothing is reported.
  await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const a = ctx.world.anchors.balloon.position;
    rg.teleport(a.x + 1.7, ctx.world.heightAt(a.x, a.z) + 0.4, a.z, -Math.PI / 2);
    rg.step(1 / 60, 10, false);
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    for (let i = 0; i < 30 * 30 && (window.__rgGlasses!.weave!.debug('chute') as { phase: string }).phase !== 'canopy'; i++) rg.step(1 / 30, 1, false);
  });
  d = await debug();
  expect(d.phase).toBe('canopy');
  expect(d.lastOpen?.auto).toBe(true);
  expect(d.lastOpen?.outcome).toBeNull();
  expect(d.lastHoop).toBeNull();
  expect(await results()).toEqual([]);
  await endRide();
  expect(consoleErrors).toEqual([]);
});
