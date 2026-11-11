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
/** Weak-layer pixels the tier-1 trail must cover from the basket at 640×360. */
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

test('glow-flies: a booth from 30 m; idle attract at the pad; no flies before a round', async () => {
  await view('glowflies');
  let d = await gf();
  expect(d.phase).toBe('idle');
  expect(d.out).toBe(false);
  expect(d.flies).toEqual([]);
  expect(await page.evaluate(() => window.__rgGlasses!.isBooth('glowflies'))).toBe(true);
  const spot = await gfFarSpot(d);
  await gfStand(spot, spot.yaw);
  const far = await gfSave('glowflies-30m');
  const rect = await page.evaluate(() => window.__rgGlasses!.boardRect('glowflies'));
  expect(rect, 'the booth is on screen from 30 m').not.toBeNull();
  expect(channelSpread(far, rect!, 0), 'marquee R contrast from 30 m').toBeGreaterThan(80);
  expect(channelSpread(far, rect!, 1), 'marquee G contrast from 30 m').toBeGreaterThan(80);
  // Just behind the pad, facing the meadow: attract (demo loops, pad pulses, lamps twinkle).
  await gfStand(d.padBack, d.yaw + Math.PI);
  d = await gf();
  expect(d.kit.phase).toBe('idle');
  expect(d.kit.booth.prompt).toBe('stepPad');
  const f0 = d.kit.booth.frame;
  await gfStep(30);
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
  expect(g.left).toBeGreaterThan(30);
  await gfStand({ ...d.padBack }, d.yaw + Math.PI, 2);
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
  await gfStand(d.padBack, d.yaw + Math.PI, 20);
  await gfSave('glowflies-mid-round');
  // Time's up → 3 of 5 → celebration, then the prize; the flies go home.
  await clearLog();
  await gfForce({ left: 0.05 });
  await gfStep(8);
  d = await gf();
  expect(d.kit.results).toEqual([true, true, true, false, false]);
  expect(d.kit.booth.lamps.slice(3)).toEqual(['off', 'off']);
  expect(d.phase).toBe('celebrate');
  expect(d.kit.booth.lampMode).toBe('chase');
  expect(d.out).toBe(false);
  await gfStand(d.padBack, Math.atan2(d.booth.x - d.padBack.x, d.booth.z - d.padBack.z), 12);
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

test("Pip's toys: weak prints only, answer-blind, found toy and time-out, budget", async () => {
  const id = 'toys';
  await view(id);
  expect(await page.evaluate((i) => window.__rgGlasses!.active(i), id)).toBe(true);
  await page.evaluate((i) => window.__rgGlasses!.force(i, { seed: 7 }), id);
  const d0 = await dbg(id);
  // From the basket (default camera), the tier-1 trail must show clearly on the weak layer.
  await stand(d0.view);
  const withTrail = await weakCoverage();
  await page.evaluate((i) => {
    window.__rgGlasses!.force(i, { hideTrail: true });
    window.__rg!.render();
  }, id);
  const without = await weakCoverage();
  await page.evaluate((i) => {
    window.__rgGlasses!.force(i, { hideTrail: false });
    window.__rg!.render();
  }, id);
  console.log(`toys: weak coverage from the basket ${withTrail - without} px (${withTrail} with, ${without} without)`);
  expect(withTrail - without, 'trail coverage from the basket').toBeGreaterThan(TRAIL_MIN_PIXELS);
  // Follow it: stand on the second print, looking along the trail (the next prints glow ahead).
  {
    const [p1, p5] = [d0.prints[1], d0.prints[5]];
    const len = Math.hypot(p5.x - p1.x, p5.z - p1.z);
    const side = { x: ((p5.z - p1.z) / len) * 1.6, z: (-(p5.x - p1.x) / len) * 1.6 };
    await look(p1.x + side.x, p1.z + side.z, p5.x + side.x * 0.5, p5.z + side.z * 0.5);
  }
  expect((await dbg(id)).next).toBeGreaterThanOrEqual(1);
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
  // Mid-show (launch): toy + sparkle ring are both drawn.
  await page.evaluate(() => window.__rg!.step(1 / 60, 40, false));
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

/** Default-camera screenshots: the patch with every tier, a catch, the trail from the basket and mid-trail, the toy at the top of its pop. */
async function capture(tag: string): Promise<void> {
  const F = 'test-results/glasses/glowflies';
  const T = 'test-results/glasses/toys';
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
    window.__rgGlasses!.reset('toys');
    window.__rgGlasses!.force('toys', { seed: 7 });
  });
  const d = await dbg('toys');
  await stand(d.view);
  await shots(`${tag}-basket`, T);
  // Mid-trail: follow prints 0–4, then stand on print 5 walking towards print 6.
  await page.evaluate((prints: { x: number; y: number; z: number }[]) => {
    const rg = window.__rg!;
    for (let i = 0; i < 5; i++) {
      rg.teleport(prints[i].x, prints[i].y + 0.05, prints[i].z);
      rg.step(1 / 60, 2, false);
    }
  }, d.prints);
  const [a, b] = [d.prints[5], d.prints[6]];
  await stand({ x: a.x, z: a.z, yaw: Math.atan2(b.x - a.x, b.z - a.z) });
  await shots(`${tag}-midtrail`, T);
  // Walk the prints; the last step faces along the trail, then wait for the top of the pop.
  await page.evaluate((prints: { x: number; y: number; z: number }[]) => {
    const rg = window.__rg!;
    for (let i = 0; i < prints.length; i++) {
      const p0 = prints[Math.max(0, i - 1)];
      const p1 = prints[i];
      rg.teleport(p1.x, p1.y + 0.05, p1.z, i > 0 ? Math.atan2(p1.x - p0.x, p1.z - p0.z) : undefined);
      rg.step(1 / 60, 2, false);
    }
    rg.step(1 / 60, 76, false);
    rg.step(1 / 60, 1);
  }, d.prints);
  expect((await dbg('toys')).state).toBe('found');
  await shots(`${tag}-pop`, T);
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
