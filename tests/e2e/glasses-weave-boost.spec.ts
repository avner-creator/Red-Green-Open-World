/**
 * Glasses weave part `boost` on the buggy race, on one shared page: the weak-eye beat hoop on the
 * next boost pad. Proves: nothing attached / zero draws outside a race and ≤ 2 inside; the layer
 * changes only the weak channel (all 4 lens/eye combinations); answer-blind (two beat phases give
 * identical frames without the weak eye); a turbo-pad hit and a miss through real (autopilot)
 * driving with the right `glasses:result`, gems, and the race's own pad boost called exactly as
 * before (nothing extra). Screenshots (driver's camera; full, R-only, G-only; 640×360 and
 * 1280×720) of a pad with the beat cold and hot go to test-results/glasses/weave/.
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
  ahead: number | null;
  fade: number;
  t: number;
  hot: boolean;
  tier: number;
  seen: number;
  ringAttached: boolean;
  flashAttached: boolean;
  last: { pad: number; t: number; outcome: 'hit' | 'miss' | null } | null;
  hits: number;
  misses: number;
}
type Result = { mechanic: string; kind: string; tier: number; hit: boolean };

const debug = (): Promise<BoostDebug> => page.evaluate((i) => window.__rgGlasses!.weave!.debug(i), ID) as unknown as Promise<BoostDebug>;
const force = (params: Record<string, unknown>): Promise<void> => page.evaluate(({ i, p }) => window.__rgGlasses!.weave!.force(i, p), { i: ID, p: params });
const draws = (): Promise<number> => page.evaluate((i) => window.__rgGlasses!.weave!.draws(i), ID);
/**
 * Gems the part paid since the last call: wallet earns with reason 'mission' minus the rewards of
 * missions completed meanwhile (the race's own stunts can finish a mission; the autopilot can drive
 * through a gem, which pays with reason 'gem').
 */
const paid = (): Promise<number> =>
  page.evaluate(() => {
    const w = window as unknown as { __earn: number; __missionPaid: number };
    const n = w.__earn - w.__missionPaid;
    w.__earn = 0;
    w.__missionPaid = 0;
    return n;
  });

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

/** Autopilot on until the beat stands fully on a pad `minAhead`..`maxAhead` metres ahead. */
async function driveToBeat(minAhead: number, maxAhead: number): Promise<BoostDebug> {
  const d = (await page.evaluate(
    ({ lo, hi }) => {
      const rg = window.__rg!;
      const weave = window.__rgGlasses!.weave!;
      window.__rgRace!.autopilot(true);
      for (let i = 0; i < 60 * 40; i++) {
        const d = weave.debug('boost') as { ahead: number | null; ringAttached: boolean; fade: number; seen: number };
        if (d.ringAttached && d.fade >= 1 && d.seen >= 0.6 && d.ahead !== null && d.ahead >= lo && d.ahead <= hi) return d;
        rg.step(1 / 60, 1, false);
      }
      return weave.debug('boost');
    },
    { lo: minAhead, hi: maxAhead },
  )) as unknown as BoostDebug;
  expect(d.ringAttached, `beat on a pad ${minAhead}–${maxAhead} m ahead: ${JSON.stringify(d)}`).toBe(true);
  expect(d.ahead!).toBeGreaterThanOrEqual(minAhead);
  expect(d.ahead!).toBeLessThanOrEqual(maxAhead);
  return d;
}

/**
 * Keep driving until the race counts the next pad; returns the boost calls the buggy got then.
 * `arrive` re-aims the beat every frame from the buggy's current speed (the autopilot brakes for
 * bends), so the buggy reaches the pad hot or cold.
 */
async function driveOverPad(arrive: 'hot' | 'cold'): Promise<{ calls: number[][]; padsHit: number }> {
  return page.evaluate((arrive) => {
    const rg = window.__rg!;
    const weave = window.__rgGlasses!.weave!;
    const w = window as unknown as { __boostCalls: number[][] };
    const start = window.__rgRace!.state().padsHit;
    w.__boostCalls.length = 0;
    for (let i = 0; i < 60 * 4 && window.__rgRace!.state().padsHit === start; i++) {
      weave.force('boost', { arrive });
      rg.step(1 / 60, 1, false);
    }
    const calls = w.__boostCalls.slice();
    rg.step(1 / 60, 2, false);
    return { calls, padsHit: window.__rgRace!.state().padsHit - start };
  }, arrive);
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
    const w = window as unknown as { __boost: unknown[]; __boostCalls: number[][]; __earn: number; __missionPaid: number };
    w.__boost = [];
    w.__boostCalls = [];
    w.__earn = 0;
    w.__missionPaid = 0;
    rg.ctx.events.on('glasses:result', (e) => w.__boost.push(e));
    rg.ctx.events.on('mission:completed', (e) => (w.__missionPaid += e.mission.reward));
    const profile = rg.ctx.profile;
    const earn = profile.earn.bind(profile);
    profile.earn = (n, reason) => {
      if (reason === 'mission') w.__earn += n;
      earn(n, reason);
    };
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

test('boost: in a race the beat stands on the next pad, weak channel only, ≤ 2 draws, answer-blind', async () => {
  test.setTimeout(120_000);
  const started = await page.evaluate(() => {
    const rg = window.__rg!;
    const race = window.__rgRace!;
    race.setLaps(3);
    const g = race.gridView();
    rg.teleport(g[0] + 5, g[1] + 0.3, g[2] - 7);
    rg.step(1 / 60, 10, false);
    const ok = race.start();
    rg.step(1 / 60, 30, false);
    return ok;
  });
  expect(started).toBe(true);
  // Countdown: nothing yet.
  expect((await debug()).attached).toBe(0);
  await page.evaluate(() => window.__rg!.step(1 / 30, 90, false));
  expect((await debug()).phase).toBe('racing');
  // Past the first pad, clear of the start gantry and the friends.
  await page.evaluate(() => {
    window.__rgRace!.autopilot(true);
    window.__rg!.step(1 / 30, 120, false);
  });
  await driveToBeat(10, 16);
  expect(await draws()).toBeGreaterThanOrEqual(1);
  expect(await draws()).toBeLessThanOrEqual(2);
  // Nothing of the part in the both-eye scene.
  expect(await page.evaluate(() => ['boostBeat', 'boostFlash'].filter((n) => window.__rg!.ctx.scene.getObjectByName(n)))).toEqual([]);

  await force({ phase: 0.3 });
  await shots('boost-cold');
  await force({ phase: 0.75 });
  expect((await debug()).hot).toBe(true);
  await shots('boost-hot');
  await expectLayerOnlyTouchesOwnChannel(page, { label: 'boost' });
  await expectAnswerBlindWithoutWeakEye(page, {
    setA: () => force({ phase: 0.3 }),
    setB: () => force({ phase: 0.75 }),
    label: 'boost beat phase',
  });
});

test('boost: a turbo pad on the beat (hit, gems) and one off it (miss); the race boost is unchanged', async () => {
  test.setTimeout(120_000);
  // From the driver's seat the beat shows early (35 m ahead), hot here.
  await driveToBeat(30, 37);
  await force({ phase: 0.75 });
  await shots('boost-far');
  await results();
  await paid();
  // Earlier pads were judged like any other (by luck); count from here.
  const d0 = await debug();
  await page.evaluate((i) => window.__rgGlasses!.weave!.force(i, { tier: 1 }), ID);
  const PAD = [5, 1.1, 3];
  const SURGE = [9, 2.4, 5];
  const okCalls = (calls: number[][]): boolean => JSON.stringify(calls) === JSON.stringify([PAD]) || JSON.stringify(calls) === JSON.stringify([PAD, SURGE]);

  // Hit: the beat arrives hot as the buggy reaches the pad.
  await driveToBeat(6, 11);
  const hit = await driveOverPad('hot');
  expect(hit.padsHit).toBe(1);
  expect(okCalls(hit.calls), `race boost on a hit: ${JSON.stringify(hit.calls)}`).toBe(true);
  let d = await debug();
  expect(d.last?.outcome, JSON.stringify(d.last)).toBe('hit');
  expect(await results()).toEqual([{ mechanic: 'boost', kind: 'timeIt', tier: 1, hit: true }]);
  expect(await paid()).toBe(1);
  // The weak-eye flash plays on the layer; still ≤ 2 draws.
  expect(d.flashAttached).toBe(true);
  expect(await draws()).toBeLessThanOrEqual(2);
  await page.evaluate(() => window.__rg!.step(1 / 60, 1));
  await shots('boost-flash');

  // Miss: the beat is cold when the buggy reaches the next pad.
  await driveToBeat(6, 11);
  const miss = await driveOverPad('cold');
  expect(miss.padsHit).toBe(1);
  expect(okCalls(miss.calls), `race boost on a miss: ${JSON.stringify(miss.calls)}`).toBe(true);
  d = await debug();
  expect(d.last?.outcome, JSON.stringify(d.last)).toBe('miss');
  expect(await results()).toEqual([{ mechanic: 'boost', kind: 'timeIt', tier: 1, hit: false }]);
  expect(await paid()).toBe(0);
  expect(d.hits - d0.hits).toBe(1);
  expect(d.misses - d0.misses).toBe(1);
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
