/**
 * Glasses play, kind `follow`: Glow-flies (on the booth kit) and Pip's lost toys on one shared
 * page. For each: channel isolation (all 4 lens/eye combinations), answer blindness without the
 * weak eye, a full round to a hit and one to a miss, the draw budget and far-idle. Glow-flies also:
 * the booth from 30 m, the walk-in start, 3-2-1-GO, lamps, time up, the prize and a cancel.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot, SHOTS } from './helpers';
import { VisionLayer } from '../../src/types';
import { channelOnly, channelSpread, expectAnswerBlindWithoutWeakEye, expectDrawBudget, expectLayerOnlyTouchesOwnChannel } from './glasses-helpers';
import { FLY_PRIZE } from '../../src/activities/glasses/glowflies/round';
import type { GlassesSiteInfo } from '../../src/activities/glasses';

test.describe.configure({ mode: 'serial' });

type Logged = { results: { mechanic: string; tier: number; hit: boolean }[]; toasts: string[] };
type W = Window & { __follow?: Logged };

let page: Page;
let consoleErrors: string[] = [];
let sites: GlassesSiteInfo[] = [];
/** Weak-layer pixels the tier-1 trail must cover from the start pad at 640×360. */
const TRAIL_MIN_PIXELS = 400;

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

// ───────────────────────────── Glow-flies (booth kit) ─────────────────────────────

type GfP3 = { x: number; y: number; z: number };
interface GfFly {
  slot: number;
  tier: number;
  state: string;
  x: number;
  y: number;
  z: number;
  screen: { x: number; y: number } | null;
}
interface GfDebug {
  phase: string;
  tier: number;
  out: boolean;
  caught: number;
  nearMisses: number;
  left: number;
  gems: number;
  yaw: number;
  pad: GfP3;
  padBack: GfP3;
  booth: GfP3;
  view: { x: number; z: number; yaw: number };
  flies: GfFly[];
  camHeld: boolean;
  meadowScreen: { x: number; y: number } | null;
  kit: { phase: string; results: boolean[]; fx: Record<string, number>; booth: { frame: number; lamps: string[]; lampMode: string; prompt: string | null } };
}
const GF_OUT = 'test-results/glasses/booth';
const gf = (): Promise<GfDebug> => dbg('glowflies') as Promise<GfDebug>;
const gfForce = (p: Record<string, unknown>): Promise<void> => page.evaluate((q) => window.__rgGlasses!.force('glowflies', q), p);
const gfStep = (n: number): Promise<void> => page.evaluate((k) => window.__rg!.step(1 / 60, k, false), n);

/** Teleport the hero (feet at `p.y`) facing `yaw`, settle the camera, render once. */
async function gfStand(p: GfP3, yaw: number, settle = 30): Promise<void> {
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

/** Full / R-only / G-only at 640×360 and 1280×720 to the booth folder. */
async function gfSave(name: string): Promise<PNG> {
  mkdirSync(GF_OUT, { recursive: true });
  const write = (img: PNG, tag: string): void => {
    writeFileSync(`${GF_OUT}/${tag}-R.png`, PNG.sync.write(channelOnly(img, 0)));
    writeFileSync(`${GF_OUT}/${tag}-G.png`, PNG.sync.write(channelOnly(img, 1)));
  };
  await page.evaluate(() => window.__rg!.render());
  const img = await canvasShot(page, `${GF_OUT}/${name}-full.png`);
  write(img, name);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  await page.evaluate(() => window.__rg!.render());
  write(await canvasShot(page, `${GF_OUT}/${name}-720p-full.png`), `${name}-720p`);
  await page.setViewportSize({ width: 640, height: 360 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  await page.evaluate(() => window.__rg!.render());
  return img;
}

/** A spot ~30 m out on the approach with a clear view of the booth and the pad, facing them. */
async function gfFarSpot(d: GfDebug): Promise<GfP3 & { yaw: number }> {
  return page.evaluate((d) => {
    const w = window.__rg!.ctx.world;
    const g = window.__rgGlasses!;
    const by = w.heightAt(d.booth.x, d.booth.z) + 3.8;
    for (const dist of [30, 28, 32, 26, 24]) {
      for (const off of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2]) {
        const a = d.yaw + off;
        const x = d.pad.x + Math.sin(a) * dist;
        const z = d.pad.z + Math.cos(a) * dist;
        const y = w.heightAt(x, z);
        if (!w.isLand(x, z) || y < w.waterLevel + 0.5) continue;
        if (g.sight({ x, y: y + 2.6, z }, { x: d.booth.x, y: by, z: d.booth.z }) !== null) continue;
        if (g.sight({ x, y: y + 1.5, z }, { x: d.pad.x, y: d.pad.y + 1.2, z: d.pad.z }) !== null) continue;
        const bx = d.booth.x * 0.6 + d.pad.x * 0.4;
        const bz = d.booth.z * 0.6 + d.pad.z * 0.4;
        return { x, y, z, yaw: Math.atan2(bx - x, bz - z) };
      }
    }
    const x = d.pad.x + Math.sin(d.yaw) * 30;
    const z = d.pad.z + Math.cos(d.yaw) * 30;
    return { x, y: w.heightAt(x, z), z, yaw: d.yaw + Math.PI };
  }, d);
}

/** Put the hero's chest on a live fly (a jump through it). */
async function catchFly(f: GfFly): Promise<void> {
  await page.evaluate((q) => {
    window.__rg!.teleport(q.x, q.y - 0.85, q.z);
    window.__rg!.step(1 / 60, 2, false);
  }, f);
}

const liveFly = async (): Promise<GfFly> => {
  for (let k = 0; k < 20; k++) {
    const f = (await gf()).flies.find((x) => x.state === 'alive');
    if (f) return f;
    await gfStep(30);
  }
  throw new Error('no live fly');
};

test('glow-flies: the booth from the trail end, 12 m and 30 m; idle attract at the pad; no flies before a round', async () => {
  await view('glowflies');
  let d = await gf();
  expect(d.phase).toBe('idle');
  expect(d.out).toBe(false);
  expect(d.flies).toEqual([]);
  expect(await page.evaluate(() => window.__rgGlasses!.isBooth('glowflies'))).toBe(true);
  // From the end of the stepping-stone trail and from 12 m on that line: the booth faces the child.
  const arr = await page.evaluate((d) => {
    const w = window.__rg!.ctx.world;
    const s = window.__rgGlasses!.sites().find((x) => x.id === 'glowflies')!;
    const a = s.arrival ?? { x: s.x + Math.sin(s.yaw) * 30, z: s.z + Math.cos(s.yaw) * 30 };
    const l = Math.hypot(a.x - s.x, a.z - s.z) || 1;
    const at = (x: number, z: number) => ({ x, y: w.heightAt(x, z), z, yaw: Math.atan2(d.booth.x * 0.6 + d.pad.x * 0.4 - x, d.booth.z * 0.6 + d.pad.z * 0.4 - z) });
    return { trail: at(a.x, a.z), m12: at(s.x + ((a.x - s.x) / l) * 12, s.z + ((a.z - s.z) / l) * 12) };
  }, d);
  await gfStand(arr.trail, arr.trail.yaw);
  await gfSave('glowflies-arrival');
  await gfStand(arr.m12, arr.m12.yaw);
  const near = await gfSave('glowflies-12m');
  const rect = await page.evaluate(() => window.__rgGlasses!.boardRect('glowflies'));
  expect(rect, 'the booth is on screen from 12 m').not.toBeNull();
  expect(channelSpread(near, rect!, 0), 'marquee R contrast from 12 m').toBeGreaterThan(80);
  expect(channelSpread(near, rect!, 1), 'marquee G contrast from 12 m').toBeGreaterThan(80);
  const spot = await gfFarSpot(d);
  await gfStand(spot, spot.yaw);
  await gfSave('glowflies-30m');
  // Just behind the pad, facing the meadow: attract (demo loops, pad pulses, lamps twinkle).
  await gfStand(d.padBack, d.yaw + Math.PI);
  d = await gf();
  expect(d.kit.phase).toBe('idle');
  expect(d.kit.booth.prompt).toBe('stepPad');
  const f0 = d.kit.booth.frame;
  await gfStep(100);
  expect((await gf()).kit.booth.frame, 'the demo flipbook runs').not.toBe(f0);
  await gfSave('glowflies-pad-idle');
  expect(await page.evaluate(() => window.__rgGlasses!.signDraws('glowflies'))).toBe(1);
  await expectDrawBudget(page, 'glowflies', 3);
});

test('glow-flies: step on the pad → 3-2-1-GO → the flies come out; weak layer only; answer-blind', async () => {
  const d = await gf();
  await gfForce({ seed: 101 });
  await gfStand(d.pad, d.yaw + Math.PI, 4);
  expect((await gf()).kit.phase).toBe('countdown');
  expect((await gf()).out, 'no flies during the countdown').toBe(false);
  await gfSave('glowflies-countdown');
  await gfStep(200);
  const g = await gf();
  expect(g.phase).toBe('play');
  expect(g.out).toBe(true);
  expect(g.flies.length).toBe(3);
  expect(g.flies.every((f) => f.tier === 1)).toBe(true);
  expect(g.kit.booth.prompt).toBe('catch');
  expect(g.left).toBeGreaterThan(25);
  // From the pad (the round's camera: pulled back, lower, wider): the flies well inside the picture.
  await gfStand(d.pad, d.yaw + Math.PI, 60);
  const p = await gf();
  expect(p.camHeld, 'the round camera is on').toBe(true);
  const inView = p.flies.filter((f) => f.state === 'alive' && f.screen && f.screen.x > 0.05 && f.screen.x < 0.95 && f.screen.y > 0.08 && f.screen.y < 0.85);
  console.log(`glow-flies from the pad: meadow at ${JSON.stringify(p.meadowScreen)}, flies ${JSON.stringify(p.flies.map((f) => f.screen))}`);
  expect(p.meadowScreen, 'the air over the meadow in the picture').not.toBeNull();
  expect(p.meadowScreen!.y, 'the meadow air not at the top edge').toBeGreaterThan(0.25);
  expect(p.meadowScreen!.y).toBeLessThan(0.7);
  expect(inView.length, 'flies inside the picture').toBeGreaterThanOrEqual(2);
  await gfSave('glowflies-play');
  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'weak', label: 'glowflies' });
  await expectDrawBudget(page, 'glowflies', 6);
  // Booth clocks pinned: two fly seeds are identical without the weak eye.
  await gfForce({ pin: 0 });
  await expectAnswerBlindWithoutWeakEye(page, { setA: () => gfForce({ seed: 101 }), setB: () => gfForce({ seed: 202 }), label: 'glowflies' });
  expect((await gf()).kit.results).toEqual([]);
});

test('glow-flies: a timed round: catches light lamps, a fly that gets away is a miss with no lamp, time up → prize', async () => {
  await gfForce({ seed: 101 });
  await clearLog();
  const before = await page.evaluate(() => window.__rg!.ctx.profile.wallet);
  // Catch 1: jump right through a fly → ✓, lamp 0 bright, a bead in the jar.
  await catchFly(await liveFly());
  let d = await gf();
  expect(d.kit.results).toEqual([true]);
  expect(d.kit.booth.lamps[0]).toBe('hit');
  expect(d.kit.fx.pop).toBe(1);
  expect(d.caught).toBe(1);
  let log = await logged();
  expect(log.results).toEqual([{ mechanic: 'glowflies', tier: 1, hit: true }]);
  expect(log.toasts, 'no gems before the prize').toEqual([]);
  // A fly that gets away while the hero is 2 m from it: a miss, but no lamp.
  await clearLog();
  const near = await liveFly();
  await page.evaluate((f) => {
    window.__rg!.teleport(f.x + 2, f.y - 0.85, f.z);
    window.__rg!.step(1 / 60, 1, false);
    window.__rgGlasses!.force('glowflies', { lifeLeft: 0.01 });
    window.__rg!.step(1 / 60, 3, false);
  }, near);
  log = await logged();
  const misses = log.results.filter((r) => !r.hit);
  expect(misses.length).toBeGreaterThanOrEqual(1);
  for (const r of misses) expect(r).toEqual({ mechanic: 'glowflies', tier: 1, hit: false });
  d = await gf();
  expect(d.kit.results).toEqual([true]);
  // The flies come back (4–6 s): two more catches.
  await gfStep(400);
  for (let i = 0; i < 2; i++) await catchFly(await liveFly());
  d = await gf();
  expect(d.kit.results).toEqual([true, true, true]);
  expect(d.kit.booth.lamps.slice(0, 3)).toEqual(['hit', 'hit', 'hit']);
  // Mid-round from the pad, looking over the meadow (lamps 3–4 blink: the clock).
  await gfStand(d.pad, d.yaw + Math.PI, 30);
  await gfSave('glowflies-mid-round');
  // Time's up → 3 of 5 → celebration, then the prize; the flies go home.
  await clearLog();
  await gfForce({ left: 0.05 });
  await gfStep(8);
  d = await gf();
  expect(d.kit.results, 'no result for the catches never made').toEqual([true, true, true]);
  expect(d.phase).toBe('celebrate');
  expect(d.kit.booth.lampMode).toBe('chase');
  expect(d.out).toBe(false);
  expect(d.camHeld, 'the round camera is released').toBe(false);
  // Where the child stands: the kit turns the camera to the booth for the celebration.
  await gfStep(40);
  await gfSave('glowflies-celebrate');
  expect((await logged()).results, 'time up reports nothing').toEqual([]);
  await gfStep(240);
  d = await gf();
  expect(['cooldown', 'idle']).toContain(d.phase);
  expect(d.gems).toBe(FLY_PRIZE[1][3]);
  expect(await page.evaluate(() => window.__rg!.ctx.profile.wallet)).toBe(before + FLY_PRIZE[1][3]);
  expect((await logged()).toasts).toContain(`+${FLY_PRIZE[1][3]}`);
  expect(d.tier).toBe(1);
  await gfStep(120);
  expect((await gf()).kit.phase).toBe('idle');
});

test('glow-flies: walking away mid-round cancels it; nothing reported; the flies go home', async () => {
  await clearLog();
  const d = await gf();
  await gfStand(d.padBack, d.yaw + Math.PI, 4);
  await gfStand(d.pad, d.yaw + Math.PI, 4);
  expect((await gf()).kit.phase).toBe('countdown');
  await gfStep(200);
  expect((await gf()).out).toBe(true);
  const spot = await gfFarSpot(d);
  await gfStand(spot, spot.yaw, 3);
  const g = await gf();
  expect(g.kit.phase).toBe('idle');
  expect(g.out).toBe(false);
  expect((await logged()).results.filter((r) => r.mechanic === 'glowflies')).toEqual([]);
});

// ───────────────────────────── Pip's lost toys (booth kit) ─────────────────────────────

const TOYS_OUT = 'test-results/glasses/booth';
type P3 = { x: number; y: number; z: number };
type Yawed = P3 & { yaw: number };

/** Full / R-only / G-only screenshots of the current frame; with `big`, 1280×720 too. */
async function boothShots(name: string, big = true): Promise<PNG> {
  mkdirSync(TOYS_OUT, { recursive: true });
  const save = (img: PNG, tag: string): void => {
    writeFileSync(`${TOYS_OUT}/${tag}-R.png`, PNG.sync.write(channelOnly(img, 0)));
    writeFileSync(`${TOYS_OUT}/${tag}-G.png`, PNG.sync.write(channelOnly(img, 1)));
  };
  await page.evaluate(() => window.__rg!.render());
  const img = await canvasShot(page, `${TOYS_OUT}/${name}-full.png`);
  save(img, name);
  if (big) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    await page.evaluate(() => window.__rg!.render());
    save(await canvasShot(page, `${TOYS_OUT}/${name}-720p-full.png`), `${name}-720p`);
    await page.setViewportSize({ width: 640, height: 360 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    await page.evaluate(() => window.__rg!.render());
  }
  return img;
}

/** Stand at a spot facing `yaw`, let the camera settle `settle` frames, render once. */
async function standAt(p: P3, yaw: number, settle = 40): Promise<void> {
  await page.evaluate(
    ({ p, yaw, settle }) => {
      const rg = window.__rg!;
      rg.teleport(p.x, rg.ctx.world.heightAt(p.x, p.z) + 0.05, p.z, yaw);
      rg.step(1 / 60, settle, false);
      rg.step(1 / 60, 1);
    },
    { p, yaw, settle },
  );
}

const stepN = (n: number): Promise<void> => page.evaluate((k) => window.__rg!.step(1 / 60, k, false), n);
const forceToys = (params: Record<string, unknown>): Promise<void> => page.evaluate((p) => window.__rgGlasses!.force('toys', p), params);
const wallet = (): Promise<number> => page.evaluate(() => window.__rg!.ctx.profile.wallet);

/** Press Use (E / gamepad X / tap) through the input state, as a child would. */
async function pressUse(): Promise<void> {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.step(1 / 60, 2, false);
    rg.inject({ usePressed: true, use: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 2, false);
  });
}

/** Walk the current trail print by print (facing along it). Returns the toy's visibility before the last print. */
async function walkTrail(): Promise<boolean[]> {
  const d = await dbg('toys');
  return page.evaluate((prints: P3[]) => {
    const rg = window.__rg!;
    const seen: boolean[] = [];
    for (let i = 0; i < prints.length; i++) {
      const p0 = prints[Math.max(0, i - 1)];
      const p1 = prints[i];
      rg.teleport(p1.x, p1.y + 0.05, p1.z, i > 0 ? Math.atan2(p1.x - p0.x, p1.z - p0.z) : undefined);
      rg.step(1 / 60, 2, false);
      if (i < prints.length - 1) seen.push((window.__rgGlasses!.debug('toys') as { toyVisible: boolean }).toyVisible);
    }
    return seen;
  }, d.prints);
}

/** A spot ~30 m out on the approach with a clear sight of the booth and the pad, facing them. */
async function farSpot(d: { pad: P3; booth: P3; far: Yawed; yaw: number }): Promise<Yawed> {
  return page.evaluate((d) => {
    const w = window.__rg!.ctx.world;
    const g = window.__rgGlasses!;
    const by = w.heightAt(d.booth.x, d.booth.z) + 3.8;
    for (const dist of [30, 28, 32, 26]) {
      for (const off of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9]) {
        const a = d.yaw + off;
        const x = d.pad.x + Math.sin(a) * dist;
        const z = d.pad.z + Math.cos(a) * dist;
        const y = w.heightAt(x, z);
        if (!w.isLand(x, z) || y < w.waterLevel + 0.5) continue;
        if (g.sight({ x, y: y + 2.6, z }, { x: d.booth.x, y: by, z: d.booth.z }) !== null) continue;
        if (g.sight({ x, y: y + 1.5, z }, { x: d.pad.x, y: d.pad.y + 1.2, z: d.pad.z }) !== null) continue;
        const bx = d.booth.x * 0.55 + d.pad.x * 0.45;
        const bz = d.booth.z * 0.55 + d.pad.z * 0.45;
        return { x, y, z, yaw: Math.atan2(bx - x, bz - z) };
      }
    }
    return d.far;
  }, d);
}

test("Pip's toys: a booth from 30 m; at the pad press Use → 3-2-1-GO → the trail lights up at the pad", async () => {
  const id = 'toys';
  await view(id);
  expect(await page.evaluate((i) => window.__rgGlasses!.active(i), id)).toBe(true);
  expect(await page.evaluate(() => window.__rgGlasses!.isBooth('toys'))).toBe(true);
  expect(await page.evaluate(() => window.__rgGlasses!.signDraws('toys')), 'booth + basket: one draw').toBe(1);
  let d = await dbg(id);
  expect(d.phase).toBe('idle');
  expect(d.trailShown).toBe(false);
  expect(d.toysShown).toBe(0);
  // From ~30 m on the approach: the marquee reads in R-only and G-only.
  const spot = await farSpot(d);
  await standAt(spot, spot.yaw);
  const far = await boothShots('toys-30m');
  const rect = await page.evaluate(() => window.__rgGlasses!.boardRect('toys'));
  expect(rect, 'the booth is on screen from 30 m').not.toBeNull();
  expect(channelSpread(far, rect!, 0), 'marquee R contrast from 30 m').toBeGreaterThan(80);
  expect(channelSpread(far, rect!, 1), 'marquee G contrast from 30 m').toBeGreaterThan(80);
  // On the pad: attract (demo runs, pad pulses, the device's button floats over the pad).
  await standAt(d.view, d.view.yaw);
  d = await dbg(id);
  expect(d.kit.phase).toBe('idle');
  expect(d.kit.booth.deviceOn, 'press pad: the button pictogram shows').toBe(true);
  expect(d.kit.booth.prompt).toBe(null);
  const f0 = d.kit.booth.frame;
  await stepN(30);
  expect((await dbg(id)).kit.booth.frame, 'the demo flipbook runs').not.toBe(f0);
  await boothShots('toys-pad-idle');
  await expectDrawBudget(page, id, 6);
  // Press Use on the pad → 3-2-1-GO.
  await pressUse();
  d = await dbg(id);
  expect(d.kit.phase).toBe('countdown');
  expect(d.trailShown, 'no trail during the countdown').toBe(false);
  await stepN(20);
  await boothShots('toys-countdown');
  await stepN(200);
  d = await dbg(id);
  expect(d.kit.phase).toBe('play');
  expect(d.state).toBe('trail');
  expect(d.trailShown).toBe(true);
  expect(d.kit.booth.prompt).toBe('follow');
  expect(d.tier).toBe(1);
  expect(d.valid, 'trail passes every ground rule').toBe(true);
  expect(Math.hypot(d.prints[0].x - d.pad.x, d.prints[0].z - d.pad.z), 'the trail starts at the pad').toBeLessThan(2);

  // From the pad (default camera) the tier-1 trail shows clearly on the weak layer, first prints in view.
  await forceToys({ seed: 7 });
  await standAt(d.view, d.view.yaw, 3);
  const inView = await page.evaluate(() => {
    const rg = window.__rg!;
    const t = window.__rgGlasses!.debug('toys') as { prints: P3[] };
    const cam = rg.ctx.camera;
    cam.updateMatrixWorld();
    const V = rg.ctx.player.position.constructor as new (x: number, y: number, z: number) => { project(c: unknown): { x: number; y: number; z: number } };
    return t.prints.slice(0, 4).map((p) => {
      const s = new V(p.x, p.y, p.z).project(cam);
      return Math.abs(s.x) < 1 && Math.abs(s.y) < 1 && s.z < 1;
    });
  });
  expect(inView.filter(Boolean).length, `first prints in view from the pad: ${inView}`).toBeGreaterThanOrEqual(3);
  const withTrail = await weakCoverage();
  await forceToys({ hideTrail: true });
  await page.evaluate(() => window.__rg!.render());
  const without = await weakCoverage();
  await forceToys({ hideTrail: false });
  await page.evaluate(() => window.__rg!.render());
  console.log(`toys: weak coverage from the pad ${withTrail - without} px (${withTrail} with, ${without} without)`);
  expect(withTrail - without, 'trail coverage from the pad').toBeGreaterThan(TRAIL_MIN_PIXELS);
  await boothShots('toys-trail');
  expect((await dbg(id)).toysShown, 'no toy before the last print').toBe(0);

  // The trail touches only the weak channel; booth, lamps, pad and prompt never depend on it.
  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'weak', label: id });
  await forceToys({ pin: 0 });
  const seedA = (): Promise<void> => forceToys({ seed: 7 });
  const seedB = (): Promise<void> => forceToys({ seed: 8 });
  await seedB();
  const dB = await dbg(id);
  expect(dB.toysShown).toBe(0);
  await seedA();
  const dA = await dbg(id);
  expect(Math.hypot(dB.end.x - dA.end.x, dB.end.z - dA.end.z), 'different seeds, different hiding spots').toBeGreaterThan(3);
  await expectAnswerBlindWithoutWeakEye(page, { setA: seedA, setB: seedB, label: id });
  await seedA();
  // On the trail: stand on print 5 walking towards print 6.
  await page.evaluate((prints: P3[]) => {
    const rg = window.__rg!;
    for (let i = 0; i < 5; i++) {
      rg.teleport(prints[i].x, prints[i].y + 0.05, prints[i].z);
      rg.step(1 / 60, 2, false);
    }
  }, dA.prints);
  const [a, b] = [dA.prints[5], dA.prints[6]];
  await standAt(a, Math.atan2(b.x - a.x, b.z - a.z), 3);
  expect((await dbg(id)).next).toBeGreaterThanOrEqual(5);
  await boothShots('toys-midtrail', false);
});

test("Pip's toys: follow the trail → the toy pops out (✓, lamp), flies into its place, its prize", async () => {
  const id = 'toys';
  await clearLog();
  const before = await wallet();
  const seen = await walkTrail();
  expect(seen.every((v) => !v), 'no toy before the last print').toBe(true);
  let d = await dbg(id);
  expect(d.state).toBe('show');
  expect(d.found).toBe(1);
  expect(d.kit.results).toEqual([true]);
  expect(d.kit.booth.lamps[0]).toBe('hit');
  expect(d.kit.fx.pop).toBe(1);
  let log = await logged();
  expect(log.results).toEqual([{ mechanic: id, tier: 1, hit: true }]);
  // The top of the pop, seen from two prints back.
  await stepN(52);
  {
    const p0 = d.prints[d.prints.length - 3];
    await standAt(p0, Math.atan2(d.end.x - p0.x, d.end.z - p0.z), 1);
  }
  await boothShots('toys-pop');
  await expectDrawBudget(page, id, 6);
  // The toy lands in its place, then the prize flies out (+5).
  await stepN(150);
  d = await dbg(id);
  expect(d.inBasket).toBe(1);
  expect(d.toysShown).toBe(1);
  await stepN(200);
  d = await dbg(id);
  expect(d.kit.phase).toBe('idle');
  expect(await wallet()).toBe(before + 5);
  log = await logged();
  expect(log.toasts).toContain('+5');
  // Idle again: lamp 1 lit (one toy home), the next trail is tier 2.
  expect(d.kit.booth.lamps).toEqual(['hit', 'off', 'off']);
  expect(d.kit.booth.lampMode).toBe('manual');
  expect(d.tier).toBe(2);
  expect(d.roundTier).toBe(2);
});

test("Pip's toys: a time-out is a miss (✗); leaving cancels; three toys → the full basket and a bonus; free play after", async () => {
  const id = 'toys';
  let d = await dbg(id);
  // Time-out: press the pad, GO, let the clock run out → a tier-2 miss, the same toy waits.
  await clearLog();
  await standAt(d.view, d.view.yaw, 3);
  await pressUse();
  await stepN(200);
  expect((await dbg(id)).kit.phase).toBe('play');
  await forceToys({ timeLeft: 0.05 });
  await stepN(6);
  const log = await logged();
  expect(log.results).toEqual([{ mechanic: id, tier: 2, hit: false }]);
  d = await dbg(id);
  expect(d.kit.fx.pop).toBe(1);
  expect(d.kit.booth.lamps, 'a miss lights no toy lamp').toEqual(['hit', 'off', 'off']);
  await stepN(320);
  d = await dbg(id);
  expect(d.kit.phase).toBe('idle');
  expect(d.found).toBe(1);
  expect(d.tier).toBe(2);

  // Leaving mid-trail cancels the round quietly (no miss), the trail goes.
  await clearLog();
  await pressUse();
  await stepN(200);
  expect((await dbg(id)).kit.phase).toBe('play');
  const site = sites.find((s) => s.id === id)!;
  await page.evaluate((s) => {
    const rg = window.__rg!;
    const x = s.x + 60;
    rg.teleport(x, rg.ctx.world.heightAt(x, s.z) + 0.3, s.z);
    rg.step(1 / 60, 3, false);
  }, site);
  d = await dbg(id);
  expect(d.kit.phase).toBe('idle');
  expect(d.trailShown).toBe(false);
  expect((await logged()).results).toEqual([]);

  // Toy 2 and toy 3 (straight into play); the third fills the basket: big celebration + bonus.
  await view(id);
  const before = await wallet();
  for (const toy of [1, 2]) {
    await forceToys({ play: true });
    await walkTrail();
    expect((await dbg(id)).found).toBe(toy + 1);
    if (toy === 2) {
      await stepN(Math.round((await dbg(id)).landAt * 60) + 6);
      d = await dbg(id);
      expect(d.celebrating, 'the basket hops').toBe(true);
      expect(d.inBasket).toBe(3);
      await standAt(d.padBack, d.padBack.yaw, 8);
      await boothShots('toys-full-basket');
    }
    await stepN(420);
    expect((await dbg(id)).kit.phase).toBe('idle');
  }
  expect(await wallet()).toBe(before + 7 + 20);
  d = await dbg(id);
  expect(d.done).toBe(true);
  expect(d.kit.booth.lamps).toEqual(['hit', 'hit', 'hit']);
  await standAt(d.view, d.view.yaw, 30);
  await boothShots('toys-all-done', false);

  // Free play: the pad still works, a small prize, the toy lands on top of the pile.
  const b2 = await wallet();
  await pressUse();
  await stepN(200);
  d = await dbg(id);
  expect(d.kit.phase).toBe('play');
  expect(d.free).toBe(true);
  await walkTrail();
  await stepN(420);
  d = await dbg(id);
  expect(await wallet()).toBe(b2 + 2);
  expect(d.topToy).toBeGreaterThanOrEqual(0);
  expect(d.toysShown).toBe(4);
  await page.evaluate(() => window.__rgGlasses!.reset('toys'));
});

/** Stand at a spot facing `yaw` (default third-person camera behind the hero) and render. */
async function stand(v: { x: number; z: number; yaw: number }): Promise<void> {
  await page.evaluate((q) => {
    const rg = window.__rg!;
    rg.teleport(q.x, rg.ctx.world.heightAt(q.x, q.z) + 0.05, q.z, q.yaw);
    rg.step(1 / 60, 3, false);
    rg.step(1 / 60, 1);
  }, v);
}

/** Weak-layer coverage (pixels) of the last render. */
const weakCoverage = (): Promise<number> => page.evaluate((W) => window.__rgChallenge!.layerCoverage(W).pixels, VisionLayer.WeakOnly);

/** Default-camera screenshots: the patch with every tier and a catch (the toys booth shots are in its own tests). */
async function capture(tag: string): Promise<void> {
  const F = 'test-results/glasses/glowflies';
  // Glow-flies in a round (the flies only come out during one): the meadow from the pad, a catch.
  await page.evaluate(() => {
    window.__rgGlasses!.reset('glowflies');
    window.__rgGlasses!.force('glowflies', { seed: 33 });
    window.__rgGlasses!.force('glowflies', { play: true });
  });
  await stand((await dbg('glowflies')).view);
  expect((await dbg('glowflies')).out, 'flies out in a round').toBe(true);
  await shots(`${tag}-patch`, F);
  // A catch: run into a fly, then a few frames of the burst.
  const flies = (await dbg('glowflies')).flies.filter((f: { state: string }) => f.state === 'alive');
  const fly = flies[0];
  await page.evaluate((f) => {
    const rg = window.__rg!;
    const p = rg.ctx.player.position;
    rg.teleport(f.x, f.y - 0.85, f.z, Math.atan2(f.x - p.x, f.z - p.z));
    rg.step(1 / 60, 9, false);
    rg.step(1 / 60, 1);
  }, fly);
  await shots(`${tag}-catch`, F);

  await page.evaluate(() => {
    window.__rgGlasses!.reset('glowflies');
    window.__rgGlasses!.reset('toys');
  });
}

test('screenshots from the default camera (640×360; 1280×720 with RG_SHOTS=1)', async () => {
  await capture('640');
  if (SHOTS) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => window.__rg!.step(1 / 60, 2, false));
    await capture('1280');
    await page.setViewportSize({ width: 640, height: 360 });
    await page.evaluate(() => window.__rg!.step(1 / 60, 2, false));
  }
});

test('both are idle when the player is far; no errors', async () => {
  const gf = sites.find((s) => s.id === 'glowflies')!;
  const ty = sites.find((s) => s.id === 'toys')!;
  // Explicitly > 75 m from both sites (on land if possible).
  const at = await page.evaluate(
    ([a, b]) => {
      const rg = window.__rg!;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      let pt = { x: mx + 100, z: mz };
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * Math.PI * 2;
        const c = { x: mx + Math.cos(ang) * 100, z: mz + Math.sin(ang) * 100 };
        if (rg.ctx.world.isLand(c.x, c.z) && rg.ctx.world.heightAt(c.x, c.z) > rg.ctx.world.waterLevel + 0.5) {
          pt = c;
          break;
        }
      }
      rg.teleport(pt.x, rg.ctx.world.heightAt(pt.x, pt.z) + 0.1, pt.z);
      rg.step(1 / 60, 2, false);
      const p = rg.ctx.player.position;
      return { x: p.x, z: p.z };
    },
    [gf, ty],
  );
  for (const s of [gf, ty]) {
    const dist = Math.hypot(s.x - at.x, s.z - at.z);
    expect(dist, `${s.id}: player is far`).toBeGreaterThan(75);
    expect(await page.evaluate((i) => window.__rgGlasses!.active(i), s.id), `${s.id} idle at ${dist.toFixed(0)} m`).toBe(false);
    expect((await dbg(s.id)).active).toBe(false);
    expect(await expectDrawBudget(page, s.id, 6)).toBeGreaterThanOrEqual(1);
  }
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
