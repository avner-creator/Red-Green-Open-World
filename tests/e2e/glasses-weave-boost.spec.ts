/**
 * Glasses weave part `boost` ("turbo tap") on the buggy race, on one shared page: a weak-eye
 * countdown ring over the next boost pad; the child taps Emote as the buggy reaches the pad.
 * Proves: nothing attached / zero draws outside a race and ≤ 2 inside; the layer changes only the
 * weak channel (all 4 lens/eye combinations); answer-blind (two ring states give identical frames
 * without the weak eye); a full autopilot race with NO presses gives zero results and pays
 * nothing and toasts nothing; a hit and a miss through real input during an autopilot race, with the right
 * `glasses:result`, gems, and the buggy's boost calls exactly the race's own. Screenshots (driver's
 * camera; full, R-only, G-only; 640×360 and 1280×720) at ~50 m, ~25 m and on the pad go to
 * test-results/glasses/weave/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot } from './helpers';
import { channelOnly, expectAnswerBlindWithoutWeakEye, expectLayerOnlyTouchesOwnChannel } from './glasses-helpers';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/glasses/weave';
const ID = 'boost';
let page: Page;
let consoleErrors: string[] = [];

interface BoostDebug {
  active: boolean;
  phase: string | null;
  attached: number;
  padsHit: number | null;
  target: number;
  toZone: number | null;
  along: number | null;
  across: number | null;
  inZone: boolean;
  tier: number;
  ringAttached: boolean;
  flashAttached: boolean;
  faceAttached: boolean;
  last: { pad: number; along: number; across: number; outcome: 'hit' | 'miss' | null } | null;
  presses: number;
  hits: number;
  misses: number;
}
type Result = { mechanic: string; kind: string; tier: number; hit: boolean };

const debug = (): Promise<BoostDebug> => page.evaluate((i) => window.__rgGlasses!.weave!.debug(i), ID) as unknown as Promise<BoostDebug>;
const force = (params: Record<string, unknown>): Promise<void> => page.evaluate(({ i, p }) => window.__rgGlasses!.weave!.force(i, p), { i: ID, p: params });
const draws = (): Promise<number> => page.evaluate((i) => window.__rgGlasses!.weave!.draws(i), ID);
/**
 * The gem toasts ("+N") since the last call. The part's only both-eye feedback is `env.pay`, whose
 * toast this is; nothing else on a race with enough gems toasts "+N" with the gem icon (the race
 * does only for a practice run).
 */
const toasts = (): Promise<string[]> =>
  page.evaluate(() => {
    const w = window as unknown as { __toasts: string[] };
    return w.__toasts.splice(0);
  });

/** Emote (button hint) toasts so far this page. */
const hints = (): Promise<number> => page.evaluate(() => (window as unknown as { __hints: number }).__hints);

async function results(): Promise<Result[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __boost: Result[] };
    const out = w.__boost.filter((r) => r.mechanic === 'boost');
    w.__boost.length = 0;
    return out;
  });
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

/** Walk to the grid, start a race of `laps` laps, count down, autopilot on. */
async function startRace(laps: number): Promise<void> {
  const ok = await page.evaluate((laps) => {
    const rg = window.__rg!;
    const race = window.__rgRace!;
    race.setLaps(laps);
    const g = race.gridView();
    rg.teleport(g[0] + 5, g[1] + 0.3, g[2] - 7);
    rg.step(1 / 60, 10, false);
    const started = race.start();
    rg.step(1 / 30, 100, false);
    race.autopilot(true);
    return started && race.phase === 'racing';
  }, laps);
  expect(ok, 'race started').toBe(true);
}

/** Autopilot until the ring stands on a pad whose tap zone is `lo`..`hi` metres ahead. */
async function driveToRing(lo: number, hi: number): Promise<BoostDebug> {
  const d = (await page.evaluate(
    ({ lo, hi }) => {
      const rg = window.__rg!;
      const weave = window.__rgGlasses!.weave!;
      for (let i = 0; i < 60 * 40; i++) {
        const d = weave.debug('boost') as { toZone: number | null; ringAttached: boolean };
        if (d.ringAttached && d.toZone !== null && d.toZone >= lo && d.toZone <= hi) return d;
        rg.step(1 / 60, 1, false);
      }
      return weave.debug('boost');
    },
    { lo, hi },
  )) as unknown as BoostDebug;
  expect(d.ringAttached, `ring ${lo}–${hi} m ahead: ${JSON.stringify(d)}`).toBe(true);
  return d;
}

/**
 * Autopilot until the buggy is `along` metres from the ring's pad, tap Emote there (keeping the
 * autopilot's steering and throttle for that frame), then keep driving until the race counts the
 * pad. Returns the buggy's boost calls at the pad and the driving mode after.
 */
async function tapAt(along: number): Promise<{ calls: number[][]; padsHit: number; mode: string }> {
  return page.evaluate((along) => {
    const rg = window.__rg!;
    const weave = window.__rgGlasses!.weave!;
    const w = window as unknown as { __boostCalls: number[][] };
    const start = window.__rgRace!.state().padsHit;
    for (let i = 0; i < 60 * 20; i++) {
      const d = weave.debug('boost') as { along: number | null };
      if (d.along !== null && d.along >= along && d.along < along + 1.5) break;
      rg.step(1 / 60, 1, false);
    }
    w.__boostCalls.length = 0;
    const s = rg.ctx.input.state;
    rg.inject({ moveX: s.moveX, moveY: s.moveY, emotePressed: true });
    rg.step(1 / 60, 1, false);
    for (let i = 0; i < 60 * 4 && window.__rgRace!.state().padsHit === start; i++) rg.step(1 / 60, 1, false);
    const calls = w.__boostCalls.slice();
    rg.step(1 / 60, 2, false);
    return { calls, padsHit: window.__rgRace!.state().padsHit - start, mode: rg.state().playerMode };
  }, along);
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
    const w = window as unknown as { __boost: unknown[]; __boostCalls: number[][]; __toasts: string[] };
    w.__boost = [];
    w.__boostCalls = [];
    w.__toasts = [];
    (window as unknown as { __hints: number }).__hints = 0;
    rg.ctx.events.on('ui:toast', (e) => {
      if (e.icon === 'emote') (window as unknown as { __hints: number }).__hints++;
    });
    rg.ctx.events.on('glasses:result', (e) => w.__boost.push(e));
    rg.ctx.events.on('ui:toast', (e) => {
      if (e.icon === 'gem' && /^\+\d+$/.test(e.text ?? '')) w.__toasts.push(e.text!);
    });
    // Record every call of the buggy's boost (the race's pads and surge; the part must add none).
    const car = rg.ctx.vehicles.all.find((v) => v.kind === 'car') as unknown as { buggy: { boost(e: number, s: number, k?: number): void } };
    const orig = car.buggy.boost.bind(car.buggy);
    car.buggy.boost = (e, s, k) => {
      w.__boostCalls.push([e, s, k ?? 0]);
      orig(e, s, k);
    };
  });
});

test.afterAll(async () => {
  await page.close();
});

test('boost: nothing attached and zero draws outside a race', async () => {
  const d = await debug();
  expect(d.active).toBe(false);
  expect(d.attached).toBe(0);
  expect(await draws()).toBe(0);
});

test('boost: a full autopilot race with no presses: ring shown, weak channel only, answer-blind, zero results, nothing paid', async () => {
  test.setTimeout(180_000);
  await results();
  await toasts();
  await startRace(1);
  // The button hint: one Emote toast as the first race of the session counted down.
  expect(await hints()).toBe(1);
  // ~50 m and ~25 m out, then on the pad (the frame is frozen while we look).
  await driveToRing(47, 53);
  // The ring and the Emote face inside it.
  expect(await draws()).toBe(2);
  expect((await debug()).faceAttached).toBe(true);
  await shots('boost-50m');
  await driveToRing(22, 28);
  await shots('boost-25m');
  expect(await page.evaluate(() => ['boostRing', 'boostFlash'].filter((n) => window.__rg!.ctx.scene.getObjectByName(n)))).toEqual([]);
  await expectLayerOnlyTouchesOwnChannel(page, { label: 'boost' });
  await expectAnswerBlindWithoutWeakEye(page, {
    setA: () => force({ t: 0.2 }),
    setB: () => force({ t: 0.8 }),
    label: 'boost ring state',
  });
  // The Emote face is weak-eye only: hidden layer, frames with and without it are identical.
  await expectAnswerBlindWithoutWeakEye(page, {
    setA: () => force({ face: true }),
    setB: () => force({ face: false }),
    label: 'boost emote face',
  });
  await force({ face: true });
  await driveToRing(-1, 1);
  await shots('boost-pad');
  // On to the finish, never pressing: nothing is reported, nothing is paid.
  const end = await page.evaluate(() => {
    const rg = window.__rg!;
    const weave = window.__rgGlasses!.weave!;
    let maxDraws = 0;
    for (let i = 0; i < 200 && window.__rgRace!.phase === 'racing'; i++) {
      rg.step(1 / 30, 15, false);
      maxDraws = Math.max(maxDraws, weave.draws('boost'));
    }
    return { phase: window.__rgRace!.phase, padsHit: window.__rgRace!.state().padsHit, maxDraws };
  });
  expect(end.phase).not.toBe('racing');
  expect(end.padsHit).toBeGreaterThanOrEqual(3);
  expect(end.maxDraws).toBeLessThanOrEqual(2);
  const d = await debug();
  expect([d.presses, d.hits, d.misses]).toEqual([0, 0, 0]);
  expect(await results()).toEqual([]);
  expect(await toasts()).toEqual([]);
  expect(d.attached).toBe(0);
  expect(await draws()).toBe(0);
  expect(await hints()).toBe(1);
});

test('boost: a turbo tap on the pad (hit, gems, flash) and a mistimed one (miss); the race boost is unchanged', async () => {
  test.setTimeout(120_000);
  await page.evaluate(() => {
    const rg = window.__rg!;
    window.__rgRace!.autopilot(false);
    for (let i = 0; i < 40 && window.__rgRace!.phase !== 'result'; i++) rg.step(1 / 30, 15, false);
    window.__rgRace!.exit();
    rg.step(1 / 60, 30, false);
  });
  expect(await page.evaluate(() => window.__rgRace!.phase)).toBe('idle');
  await startRace(3);
  // No second hint in the same session, and none at any pad of the first race.
  expect(await hints()).toBe(1);
  await results();
  await toasts();
  const PAD = [5, 1.1, 3];
  const SURGE = [9, 2.4, 5];
  const okCalls = (calls: number[][]): boolean => JSON.stringify(calls) === JSON.stringify([PAD]) || JSON.stringify(calls) === JSON.stringify([PAD, SURGE]);

  // Hit: tap in the middle of the tier-1 zone, as the buggy reaches the pad.
  await driveToRing(30, 60);
  const hit = await tapAt(-3.2);
  expect(hit.padsHit).toBe(1);
  expect(hit.mode).toBe('driving');
  expect(okCalls(hit.calls), `race boost on a hit: ${JSON.stringify(hit.calls)}`).toBe(true);
  let d = await debug();
  expect(d.last?.outcome, JSON.stringify(d.last)).toBe('hit');
  expect(await results()).toEqual([{ mechanic: 'boost', kind: 'timeIt', tier: 1, hit: true }]);
  expect(await toasts()).toEqual(['+1']);
  expect(d.flashAttached).toBe(true);
  expect(await draws()).toBeLessThanOrEqual(2);

  // Miss: tap 12 m early at the next pad.
  await driveToRing(30, 60);
  const miss = await tapAt(-12);
  expect(miss.padsHit).toBe(1);
  expect(miss.mode).toBe('driving');
  expect(okCalls(miss.calls), `race boost on a miss: ${JSON.stringify(miss.calls)}`).toBe(true);
  d = await debug();
  expect(d.last?.outcome, JSON.stringify(d.last)).toBe('miss');
  expect(await results()).toEqual([{ mechanic: 'boost', kind: 'timeIt', tier: 1, hit: false }]);
  expect(await toasts()).toEqual([]);
  expect([d.hits, d.misses]).toEqual([1, 1]);
});

test('boost: leaving the race detaches everything (zero draws)', async () => {
  await page.evaluate(() => {
    const rg = window.__rg!;
    window.__rgRace!.autopilot(false);
    window.__rgRace!.exit();
    rg.step(1 / 60, 5, false);
  });
  expect(await page.evaluate(() => window.__rgRace!.phase)).toBe('idle');
  const d = await debug();
  expect(d.active).toBe(false);
  expect(d.attached).toBe(0);
  expect(await draws()).toBe(0);
  expect(consoleErrors).toEqual([]);
});
