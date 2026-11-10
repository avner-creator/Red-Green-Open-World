/**
 * The two both-eye glasses mechanics on one shared page: half-symbol gates and dot-picture signs.
 * For each: channel isolation (all 4 lens/eye combinations), answer-blind proofs for the strong
 * eye alone AND for the weak eye alone (both eyes are needed), a full round to a hit and to a miss
 * through the test API, the draw budget and far-idle. Screenshots (full, R-only, G-only) go to
 * test-results/glasses/gates/ and test-results/glasses/dotsigns/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot, channelDiff } from './helpers';
import { channelOnly, COMBOS, expectAnswerBlindWithoutWeakEye, expectDrawBudget, expectLayerOnlyTouchesOwnChannel, layerFrame, maxOf, setEye } from './glasses-helpers';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/glasses';
/** The weak-eye-alone checks run once per weak channel (R, then G) to keep the spec short. */
const MIRROR_COMBOS = [COMBOS[0], COMBOS[1]];
let page: Page;
let consoleErrors: string[] = [];

type P3 = { x: number; y: number; z: number };
interface GatesDebug {
  state: string;
  tier: number;
  round: number;
  answer: number;
  candidates: { left: string; right: string }[];
  weakSide: 'left' | 'right';
  hits: number;
  misses: number;
  gems: number;
  yaw: number;
  plate: P3;
  approach: P3;
  approachYaw: number;
  arches: { front: P3; back: P3; around: P3 }[];
}
interface DotsDebug {
  state: string;
  tier: number;
  round: number;
  answer: number;
  shapes: string[];
  seed: number;
  hits: number;
  misses: number;
  gems: number;
  yaw: number;
  stand: P3[];
  view: P3;
  approach: P3;
  approachYaw: number;
}

const debug = <T>(id: string): Promise<T> => page.evaluate((i) => window.__rgGlasses!.debug(i), id) as Promise<T>;
const force = (id: string, params: Record<string, unknown>): Promise<void> => page.evaluate(({ i, p }) => window.__rgGlasses!.force(i, p), { i: id, p: params });

/** Teleport the player (feet on the ground) facing `yaw`, let the camera settle, render once. */
async function standAt(p: P3, yaw: number, settle = 40): Promise<void> {
  await page.evaluate(
    ({ p, yaw, settle }) => {
      const rg = window.__rg!;
      rg.teleport(p.x, p.y + 0.05, p.z, yaw);
      rg.step(1 / 60, settle, false);
      rg.step(1 / 60, 1);
    },
    { p, yaw, settle },
  );
}

/** Small simulation steps without rendering (crossings, timers). */
const step = (n: number): Promise<void> => page.evaluate((k) => window.__rg!.step(1 / 60, k, false), n);
const teleport = (p: P3, yaw: number): Promise<void> => page.evaluate(({ p, yaw }) => window.__rg!.teleport(p.x, p.y + 0.05, p.z, yaw), { p, yaw });

/** Full / R-only / G-only screenshots with the game's default camera; `big` adds 1280×720. */
async function shots(dir: string, name: string, big = false): Promise<PNG> {
  mkdirSync(`${OUT}/${dir}`, { recursive: true });
  const save = (img: PNG, tag: string): void => {
    writeFileSync(`${OUT}/${dir}/${tag}-R.png`, PNG.sync.write(channelOnly(img, 0)));
    writeFileSync(`${OUT}/${dir}/${tag}-G.png`, PNG.sync.write(channelOnly(img, 1)));
  };
  await page.evaluate(() => window.__rg!.render());
  const img = await canvasShot(page, `${OUT}/${dir}/${name}-full.png`);
  save(img, name);
  if (big) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    await page.evaluate(() => window.__rg!.render());
    save(await canvasShot(page, `${OUT}/${dir}/${name}-720p-full.png`), `${name}-720p`);
    await page.setViewportSize({ width: 640, height: 360 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    await page.evaluate(() => window.__rg!.render());
  }
  return img;
}

async function events(): Promise<{ results: { mechanic: string; tier: number; hit: boolean }[]; toasts: number }> {
  return page.evaluate(() => {
    const w = window as unknown as { __bothEyes: { results: { mechanic: string; tier: number; hit: boolean }[]; toasts: number } };
    const out = { results: [...w.__bothEyes.results], toasts: w.__bothEyes.toasts };
    w.__bothEyes.results.length = 0;
    w.__bothEyes.toasts = 0;
    return out;
  });
}

/**
 * Mirror of `expectAnswerBlindWithoutWeakEye`: with the StrongOnly layer hidden, two rounds that
 * differ only in the strong eye's part give bit-identical frames (the weak eye alone cannot tell
 * them apart either). Positive control: shown, they differ in the strong channel only.
 */
async function expectAnswerBlindWithoutStrongEye(setA: () => Promise<void>, setB: () => Promise<void>, label: string): Promise<void> {
  for (const combo of MIRROR_COMBOS) {
    const tag = `${label} ${combo.eye.leftLens}-left, weak ${combo.eye.weakEye}`;
    await setEye(page, combo.eye);
    await setA();
    const a0 = await layerFrame(page, { weak: true, strong: false });
    await setB();
    const b0 = await layerFrame(page, { weak: true, strong: false });
    const blind = channelDiff(a0, b0);
    expect([blind.maxR, blind.maxG, blind.maxB], `${tag}: identical without the strong eye`).toEqual([0, 0, 0]);
    await setA();
    const a1 = await layerFrame(page, { weak: true, strong: true });
    await setB();
    const b1 = await layerFrame(page, { weak: true, strong: true });
    const seen = channelDiff(a1, b1);
    expect(seen[combo.strong], `${tag}: the strong eye's half differs`).toBeGreaterThanOrEqual(30);
    expect(maxOf(seen, combo.weak), `${tag}: weak channel identical`).toBe(0);
    expect(seen.maxB, `${tag}: blue identical`).toBe(0);
  }
  await setEye(page, COMBOS[0].eye);
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
    const w = window as unknown as { __bothEyes: { results: unknown[]; toasts: number } };
    w.__bothEyes = { results: [], toasts: 0 };
    rg.ctx.events.on('glasses:result', (e) => w.__bothEyes.results.push(e));
    rg.ctx.events.on('ui:toast', (e) => {
      if (e.icon === 'gem') w.__bothEyes.toasts++;
    });
  });
});

test.afterAll(async () => {
  await page.close();
});

// ───────────────────────────── half-symbol gates ─────────────────────────────

const A = { left: 'spiky', right: 'round' };
const B = { left: 'spiky', right: 'square' }; // shares A's left half
const C = { left: 'point', right: 'round' }; // shares A's right half
const CANDS = [B, A, C];

test('gates: on the plate, the halves fuse on the sign; each layer only touches its channel', async () => {
  await page.evaluate(() => window.__rgGlasses!.goto('gates'));
  await step(2);
  const d = await debug<GatesDebug>('gates');
  expect(d.state).toBe('open');
  await force('gates', { candidates: CANDS, answer: 1, weakSide: 'left', tier: 1 });
  await standAt(d.plate, d.yaw + Math.PI);
  expect(await page.evaluate(() => window.__rgGlasses!.active('gates'))).toBe(true);
  await shots('gates', 'plate', true);
  await standAt(d.approach, d.approachYaw);
  await shots('gates', 'approach', true);
  await standAt(d.plate, d.yaw + Math.PI);
  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'both', label: 'gates' });
  await expectDrawBudget(page, 'gates', 6);
});

test('gates: neither eye alone can tell the answer', async () => {
  // Weak half differs (left: spiky vs point), strong half (right: round) the same → answer A vs C.
  await expectAnswerBlindWithoutWeakEye(page, {
    setA: () => force('gates', { candidates: CANDS, answer: 1, weakSide: 'left' }),
    setB: () => force('gates', { candidates: CANDS, answer: 2, weakSide: 'left' }),
    label: 'gates strong eye alone',
  });
  // Weak half the same (left: spiky), strong half differs (round vs square) → answer A vs B.
  await expectAnswerBlindWithoutStrongEye(
    () => force('gates', { candidates: CANDS, answer: 1, weakSide: 'left' }),
    () => force('gates', { candidates: CANDS, answer: 0, weakSide: 'left' }),
    'gates weak eye alone',
  );
});

test('gates: run through the right arch → hit, wrong arch → miss, the plate starts a new round', async () => {
  await events();
  await force('gates', { candidates: CANDS, answer: 1, weakSide: 'left', tier: 1 });
  let d = await debug<GatesDebug>('gates');
  const facing = d.yaw + Math.PI;
  // Walking round the outside of an arch does not count.
  await teleport(d.arches[2].front, facing);
  await step(2);
  await teleport(d.arches[2].around, facing);
  await step(2);
  expect((await debug<GatesDebug>('gates')).state).toBe('open');
  // Through the middle arch (the answer).
  await teleport(d.arches[1].front, facing);
  await step(2);
  await teleport(d.arches[1].back, facing);
  await step(3);
  d = await debug<GatesDebug>('gates');
  expect(d.state).toBe('done');
  expect(d.hits).toBe(1);
  expect(d.tier).toBe(2);
  expect(d.gems).toBe(3);
  // Turn round behind the arch: the camera now looks back at it (squash, confetti).
  await standAt(d.arches[1].back, d.yaw, 16);
  await shots('gates', 'hit');
  let ev = await events();
  expect(ev.results).toEqual([{ mechanic: 'gates', kind: 'lineUp', tier: 1, hit: true }]);
  expect(ev.toasts).toBe(1);

  // Back on the plate → new round with new symbols and the halves on the other sides.
  const round = d.round;
  await standAt(d.plate, facing, 50);
  d = await debug<GatesDebug>('gates');
  expect(d.round).toBe(round + 1);
  expect(d.state).toBe('open');
  expect(d.weakSide).toBe('right');
  await shots('gates', 'round2');

  // A wrong arch → miss, one step coarser.
  const wrong = (d.answer + 1) % 3;
  await teleport(d.arches[wrong].front, facing);
  await step(2);
  await teleport(d.arches[wrong].back, facing);
  await step(3);
  d = await debug<GatesDebug>('gates');
  expect(d.misses).toBe(1);
  expect(d.tier).toBe(1);
  ev = await events();
  expect(ev.results).toEqual([{ mechanic: 'gates', kind: 'lineUp', tier: 2, hit: false }]);
  expect(ev.toasts).toBe(0);
  // The nap: back on the plate, the next sign waits 3 s.
  await standAt(d.plate, facing, 50);
  expect((await debug<GatesDebug>('gates')).round, 'still napping').toBe(d.round);
  await step(150);
  d = await debug<GatesDebug>('gates');
  expect(d.round).toBe(round + 2);
  expect(d.state).toBe('open');
  // The first hit after a miss pays 1 gem.
  const before = d.gems;
  await teleport(d.arches[d.answer].front, facing);
  await step(2);
  await teleport(d.arches[d.answer].back, facing);
  await step(3);
  d = await debug<GatesDebug>('gates');
  expect(d.hits).toBe(2);
  expect(d.gems - before).toBe(1);
  await events();
});

// ───────────────────────────── dot-picture signs ─────────────────────────────

const SHAPES = ['star', 'heart', 'moon'];

test('dot signs: the picture and the buttons; each layer only touches its channel', async () => {
  await page.evaluate(() => window.__rgGlasses!.goto('dotsigns'));
  await step(2);
  const d = await debug<DotsDebug>('dotsigns');
  await force('dotsigns', { shapes: SHAPES, answer: 0, seed: 1234, tier: 1 });
  await standAt(d.view, d.yaw + Math.PI);
  await shots('dotsigns', 'pedestal', true);
  await standAt(d.approach, d.approachYaw);
  await shots('dotsigns', 'approach', true);
  await standAt(d.view, d.yaw + Math.PI);
  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'both', label: 'dotsigns' });
  await expectDrawBudget(page, 'dotsigns', 6);
});

test('dot signs: neither eye alone can tell the hidden shape', async () => {
  // Same seed, same buttons, different hidden shape: the strong eye's dots are bit-identical.
  await expectAnswerBlindWithoutWeakEye(page, {
    setA: () => force('dotsigns', { shapes: SHAPES, answer: 0, seed: 1234 }),
    setB: () => force('dotsigns', { shapes: SHAPES, answer: 1, seed: 1234 }),
    label: 'dotsigns strong eye alone',
  });
  // With the strong layer hidden the two pictures differ in the weak channel only (the weak
  // pattern alone is 50 % noise: tests/vision/toolkit-dots.test.ts and glasses-dotsigns.test.ts).
  for (const combo of MIRROR_COMBOS) {
    await setEye(page, combo.eye);
    await force('dotsigns', { shapes: SHAPES, answer: 0, seed: 1234 });
    const a = await layerFrame(page, { weak: true, strong: false });
    await force('dotsigns', { shapes: SHAPES, answer: 1, seed: 1234 });
    const b = await layerFrame(page, { weak: true, strong: false });
    const d = channelDiff(a, b);
    expect(maxOf(d, combo.strong), 'strong channel identical').toBe(0);
    expect(d.maxB).toBe(0);
  }
  await setEye(page, COMBOS[0].eye);
  await layerFrame(page, { weak: true, strong: true });
});

test('dot signs: press the hidden shape → hit, a wrong one → miss, a new picture follows', async () => {
  await events();
  await force('dotsigns', { shapes: SHAPES, answer: 2, seed: 77, tier: 1 });
  let d = await debug<DotsDebug>('dotsigns');
  const facing = d.yaw + Math.PI;
  const pressAt = async (i: number): Promise<void> => {
    await teleport(d.stand[i], facing);
    await step(3);
    await page.evaluate(() => {
      const rg = window.__rg!;
      rg.inject({ usePressed: true, use: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 1, false);
    });
  };
  await pressAt(2);
  d = await debug<DotsDebug>('dotsigns');
  expect(d.state).toBe('done');
  expect(d.hits).toBe(1);
  expect(d.tier).toBe(2);
  expect(d.gems).toBe(3);
  await standAt(d.view, facing, 20);
  await shots('dotsigns', 'hit');
  let ev = await events();
  expect(ev.results).toEqual([{ mechanic: 'dotsigns', kind: 'popOut', tier: 1, hit: true }]);
  expect(ev.toasts).toBe(1);
  const round = d.round;
  await step(140);
  d = await debug<DotsDebug>('dotsigns');
  expect(d.round).toBe(round + 1);
  expect(d.state).toBe('open');

  const wrong = (d.answer + 1) % 3;
  await pressAt(wrong);
  d = await debug<DotsDebug>('dotsigns');
  expect(d.misses).toBe(1);
  expect(d.tier).toBe(1);
  ev = await events();
  expect(ev.results).toEqual([{ mechanic: 'dotsigns', kind: 'popOut', tier: 2, hit: false }]);
  expect(ev.toasts).toBe(0);
  // The nap: buttons sink, every prompt is off, a press does nothing, for 5 s.
  await step(140);
  const nap = await debug<DotsDebug & { sink: number }>('dotsigns');
  expect(nap.round).toBe(d.round);
  expect(nap.sink).toBeGreaterThan(0.5);
  expect(await page.evaluate(() => window.__rg!.ctx.interactions.focused)).toBeNull();
  await pressAt(d.answer);
  expect((await debug<DotsDebug>('dotsigns')).hits).toBe(1);
  await step(200);
  d = await debug<DotsDebug>('dotsigns');
  expect(d.round).toBe(nap.round + 1);
  // The first hit after a miss pays 1 gem.
  const before = d.gems;
  await pressAt(d.answer);
  d = await debug<DotsDebug>('dotsigns');
  expect(d.hits).toBe(2);
  expect(d.gems - before).toBe(1);
  await events();
  // A finer picture in view for the record.
  await force('dotsigns', { shapes: SHAPES, answer: 0, seed: 1234, tier: 3 });
  await standAt(d.view, facing);
  await shots('dotsigns', 'tier3', true);
});

test('both are idle when the player is far', async () => {
  const far = await page.evaluate(() => {
    const all = window.__rgGlasses!.sites();
    const g = all.find((s) => s.id === 'gates')!;
    const d = all.find((s) => s.id === 'dotsigns')!;
    const dist = (s: { x: number; z: number }): number => Math.min(Math.hypot(s.x - g.x, s.z - g.z), Math.hypot(s.x - d.x, s.z - d.z));
    return all.reduce((a, b) => (dist(b) > dist(a) ? b : a)).id;
  });
  await page.evaluate((id) => {
    window.__rgGlasses!.goto(id);
    window.__rg!.step(1 / 60, 3, false);
  }, far);
  for (const id of ['gates', 'dotsigns']) {
    expect(await page.evaluate((i) => window.__rgGlasses!.active(i), id), `${id} idle near ${far}`).toBe(false);
    expect(await debug<{ active: boolean }>(id)).toMatchObject({ active: false });
  }
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
