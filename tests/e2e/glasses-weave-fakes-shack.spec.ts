/**
 * Glasses weave parts `fakes` (the real gem among weak-eye fakes) and `shack` (a dot-picture prize
 * code at the Gear Shack) on one shared page. For each: channel isolation (all 4 lens/eye
 * combinations), answer-blind proofs, a hit and a miss through real play (walking into gems,
 * pressing boxes through the interaction system), the draw budget and nothing attached when far.
 * Screenshots (full, R-only, G-only; 640×360 and 1280×720) go to test-results/glasses/weave/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot, channelDiff } from './helpers';
import { channelOnly, COMBOS, expectAnswerBlindWithoutWeakEye, expectLayerOnlyTouchesOwnChannel, layerFrame, maxOf, setEye } from './glasses-helpers';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/glasses/weave';
const MIRROR_COMBOS = [COMBOS[0], COMBOS[1]];
let page: Page;
let consoleErrors: string[] = [];

type P3 = { x: number; y: number; z: number };
interface ShackDebug {
  active: boolean;
  state: string;
  tier: number;
  round: number;
  answer: number;
  shapes: string[];
  hits: number;
  misses: number;
  gems: number;
  prizeGiven: boolean;
  prizeItem: string | null;
  boxes: P3[];
  stand: P3[];
  view: P3;
  viewYaw: number;
  board: P3;
}
interface FakesDebug {
  active: boolean;
  tier: number;
  hits: number;
  misses: number;
  gems: number;
  spots: (P3 & { id: string; tag: string; ground: number; present: boolean; spent: boolean; blocked: boolean })[];
  armed: null | { spot: number; id: string; answer: number; tier: number; tell: string; decided: boolean; real: P3; corners: P3[]; fakes: (P3 & { poof: number })[] };
}

const wdebug = <T>(id: string): Promise<T> => page.evaluate((i) => window.__rgGlasses!.weave!.debug(i), id) as Promise<T>;
const wforce = (id: string, params: Record<string, unknown>): Promise<void> => page.evaluate(({ i, p }) => window.__rgGlasses!.weave!.force(i, p), { i: id, p: params });
const draws = (id: string): Promise<number> => page.evaluate((i) => window.__rgGlasses!.weave!.draws(i), id);
const wallet = (): Promise<number> => page.evaluate(() => window.__rg!.ctx.profile.wallet);
const step = (n: number): Promise<void> => page.evaluate((k) => window.__rg!.step(1 / 60, k, false), n);
/** Feet on the ground at (x, z). */
const teleport = (x: number, z: number, yaw: number): Promise<void> =>
  page.evaluate(({ x, z, yaw }) => {
    const rg = window.__rg!;
    rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.05, z, yaw);
  }, { x, z, yaw });

async function standAt(x: number, z: number, yaw: number, settle = 40): Promise<void> {
  await teleport(x, z, yaw);
  await page.evaluate((n) => {
    const rg = window.__rg!;
    rg.step(1 / 60, n, false);
    rg.step(1 / 60, 1);
  }, settle);
}

async function shots(name: string, big = false): Promise<PNG> {
  mkdirSync(OUT, { recursive: true });
  const save = (img: PNG, tag: string): void => {
    writeFileSync(`${OUT}/${tag}-R.png`, PNG.sync.write(channelOnly(img, 0)));
    writeFileSync(`${OUT}/${tag}-G.png`, PNG.sync.write(channelOnly(img, 1)));
  };
  await page.evaluate(() => window.__rg!.render());
  const img = await canvasShot(page, `${OUT}/${name}-full.png`);
  save(img, name);
  if (big) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    await page.evaluate(() => window.__rg!.render());
    save(await canvasShot(page, `${OUT}/${name}-720p-full.png`), `${name}-720p`);
    await page.setViewportSize({ width: 640, height: 360 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    await page.evaluate(() => window.__rg!.render());
  }
  return img;
}

interface Seen {
  results: { mechanic: string; kind: string; tier: number; hit: boolean }[];
  unlocked: { itemId: string; source: string }[];
  collected: string[];
}
async function events(): Promise<Seen> {
  return page.evaluate(() => {
    const w = window as unknown as { __weaveE: Seen };
    const out = { results: [...w.__weaveE.results], unlocked: [...w.__weaveE.unlocked], collected: [...w.__weaveE.collected] };
    w.__weaveE.results.length = 0;
    w.__weaveE.unlocked.length = 0;
    w.__weaveE.collected.length = 0;
    return out;
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
    const w = window as unknown as { __weaveE: Seen };
    w.__weaveE = { results: [], unlocked: [], collected: [] };
    rg.ctx.events.on('glasses:result', (e) => w.__weaveE.results.push(e));
    rg.ctx.events.on('item:unlocked', (e) => w.__weaveE.unlocked.push(e));
    rg.ctx.events.on('gem:collected', (e) => w.__weaveE.collected.push(e.id));
  });
});

test.afterAll(async () => {
  await page.close();
});

// ───────────────────────────── shack ─────────────────────────────

const SHAPES = ['star', 'heart', 'moon'];

test('shack: board and gift boxes at the kiosk, clear of the shop prompt; channels; draws', async () => {
  // First update builds it (the hero is at spawn, ~16 m away: active).
  await step(2);
  const d = await wdebug<ShackDebug>('shack');
  expect(d.active).toBe(true);
  // Every box prompt is > 3.5 m from the shop prompt; the shop still opens from the counter.
  const kiosk = await page.evaluate(() => window.__rg!.interactables().find((i) => i.id === 'gearShack')!.position);
  for (const b of d.boxes) expect(Math.hypot(b.x - kiosk[0], b.z - kiosk[2])).toBeGreaterThan(3.5);
  await standAt(kiosk[0] + (kiosk[0] - 14) * 0.6, kiosk[2] + (kiosk[2] - 2) * 0.6, 0, 10);
  expect(await page.evaluate(() => window.__rg!.ctx.interactions.focused?.id)).toBe('gearShack');
  // Free space: nothing solid between the hero's spot and each box (raycast), the board in view.
  const blocked = await page.evaluate((dd) => {
    const ctx = window.__rg!.ctx;
    const V = ctx.player.position.constructor as new (x: number, y: number, z: number) => typeof ctx.player.position;
    return dd.stand.map((s, i) => {
      const b = dd.boxes[i];
      const o = new V(s.x, s.y + 1.4, s.z);
      const dir = new V(dd.board.x - s.x, dd.board.y - (s.y + 1.4), dd.board.z - s.z);
      const len = dir.length();
      const hit = ctx.physics.raycast(o, dir.normalize(), len - 0.3);
      return hit ? `stand ${i} → board blocked at ${hit.distance.toFixed(2)} (box ${b.x.toFixed(1)},${b.z.toFixed(1)})` : null;
    }).filter(Boolean);
  }, d);
  expect(blocked).toEqual([]);

  await wforce('shack', { shapes: SHAPES, answer: 0, seed: 1234, tier: 1 });
  await standAt(d.view.x, d.view.z, d.viewYaw);
  await shots('shack', true);
  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'both', label: 'shack' });
  const n = await draws('shack');
  expect(n).toBeGreaterThanOrEqual(3);
  expect(n).toBeLessThanOrEqual(4);
});

test('shack: neither eye alone can tell the hidden shape', async () => {
  await expectAnswerBlindWithoutWeakEye(page, {
    setA: () => wforce('shack', { shapes: SHAPES, answer: 0, seed: 1234 }),
    setB: () => wforce('shack', { shapes: SHAPES, answer: 1, seed: 1234 }),
    combos: MIRROR_COMBOS,
    label: 'shack strong eye alone',
  });
  // With the strong layer hidden the two pictures differ in the weak channel only (the weak
  // pattern alone is 50 % noise, proven by the toolkit dot tests).
  for (const combo of MIRROR_COMBOS) {
    await setEye(page, combo.eye);
    await wforce('shack', { shapes: SHAPES, answer: 0, seed: 1234 });
    const a = await layerFrame(page, { weak: true, strong: false });
    await wforce('shack', { shapes: SHAPES, answer: 1, seed: 1234 });
    const b = await layerFrame(page, { weak: true, strong: false });
    const diff = channelDiff(a, b);
    expect(maxOf(diff, combo.strong), 'strong channel identical').toBe(0);
    expect(diff.maxB).toBe(0);
    expect(diff[combo.weak], 'weak dots differ').toBeGreaterThan(30);
  }
  await setEye(page, COMBOS[0].eye);
  await layerFrame(page, { weak: true, strong: true });
});

test('shack: the right box gives the session prize (unlock, nothing charged), a wrong one naps, then 1 gem', async () => {
  await events();
  await wforce('shack', { shapes: SHAPES, answer: 2, seed: 77, tier: 1, resetPrize: true });
  let d = await wdebug<ShackDebug>('shack');
  const facing = d.viewYaw;
  const pressAt = async (i: number): Promise<void> => {
    await teleport(d.stand[i].x, d.stand[i].z, facing);
    await step(3);
    await page.evaluate(() => {
      const rg = window.__rg!;
      rg.inject({ usePressed: true, use: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 1, false);
    });
  };
  const before = await wallet();
  await pressAt(2);
  d = await wdebug<ShackDebug>('shack');
  expect(d.state).toBe('done');
  expect(d.hits).toBe(1);
  expect(d.prizeGiven).toBe(true);
  expect(d.prizeItem).toBeTruthy();
  let ev = await events();
  expect(ev.results).toEqual([{ mechanic: 'shack', kind: 'popOut', tier: 1, hit: true }]);
  expect(ev.unlocked).toEqual([{ itemId: d.prizeItem, source: 'chest' }]);
  expect(await page.evaluate((id) => window.__rg!.ctx.profile.owns(id), d.prizeItem!)).toBe(true);
  expect(await wallet(), 'nothing charged').toBe(before);
  // The lid pops open with confetti.
  await step(20);
  await standAt(d.view.x, d.view.z, facing, 4);
  await shots('shack-hit');
  await step(160);
  d = await wdebug<ShackDebug>('shack');
  expect(d.state).toBe('open');
  expect(d.round).toBeGreaterThanOrEqual(1);

  // A wrong box → miss, nap (prompts off), then a new picture; the first hit after it pays 1 gem.
  const wrong = (d.answer + 1) % 3;
  await pressAt(wrong);
  d = await wdebug<ShackDebug>('shack');
  expect(d.misses).toBe(1);
  ev = await events();
  expect(ev.results).toEqual([{ mechanic: 'shack', kind: 'popOut', tier: 2, hit: false }]);
  await step(120);
  expect(await page.evaluate(() => window.__rg!.ctx.interactions.focused)).toBeNull();
  const napRound = d.round;
  await step(300);
  d = await wdebug<ShackDebug>('shack');
  expect(d.round).toBe(napRound + 1);
  expect(d.state).toBe('open');
  const w0 = await wallet();
  await pressAt(d.answer);
  d = await wdebug<ShackDebug>('shack');
  expect(d.hits).toBe(2);
  expect(d.gems).toBe(1);
  expect(await wallet()).toBe(w0 + 1);
  ev = await events();
  expect(ev.results).toEqual([{ mechanic: 'shack', kind: 'popOut', tier: 1, hit: true }]);
  expect(ev.unlocked).toEqual([]);
});

// ───────────────────────────── fakes ─────────────────────────────

let spot = 0;
const yawTo = (from: { x: number; z: number }, to: { x: number; z: number }): number => Math.atan2(to.x - from.x, to.z - from.z);

/** Walk (≤ 0.8 m per frame) from `a` to `b` on the ground, one simulated frame per step. */
async function walk(a: { x: number; z: number }, b: { x: number; z: number }): Promise<void> {
  const yaw = yawTo(a, b);
  await teleport(a.x, a.z, yaw);
  await step(3);
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.8);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    await teleport(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, yaw);
    await step(1);
  }
  await step(2);
}

/** A point `dist` m beyond `p`, on the line from the cluster centre through `p`. */
function outward(d: NonNullable<FakesDebug['armed']>, p: { x: number; z: number }, dist: number): { x: number; z: number } {
  const cx = (d.corners[0].x + d.corners[1].x + d.corners[2].x) / 3;
  const cz = (d.corners[0].z + d.corners[1].z + d.corners[2].z) / 3;
  const l = Math.hypot(p.x - cx, p.z - cz);
  return { x: p.x + ((p.x - cx) / l) * dist, z: p.z + ((p.z - cz) / l) * dist };
}

test('fakes: four ground spots; a cluster arms on approach; only the weak channel; draws', async () => {
  let d = await wdebug<FakesDebug>('fakes');
  expect(d.spots.length).toBe(4);
  for (const s of d.spots) {
    expect(['plaza', 'beach', 'ranch', 'lighthouse', 'silly']).toContain(s.tag);
    expect(s.y - s.ground).toBeLessThan(1.6);
    for (const o of d.spots) if (o !== s) expect(Math.hypot(o.x - s.x, o.z - s.z)).toBeGreaterThanOrEqual(25);
  }
  spot = 0;
  const s = d.spots[spot];
  // Walk up to 12 m of it: the cluster arms by itself.
  await page.evaluate(() => window.__rgEconomy!.forceRespawn());
  await standAt(s.x + 12, s.z, -Math.PI / 2, 5);
  d = await wdebug<FakesDebug>('fakes');
  expect(d.active).toBe(true);
  expect(d.armed?.spot).toBe(spot);
  for (const c of d.armed!.corners) for (const o of d.armed!.corners) if (c !== o) expect(Math.hypot(c.x - o.x, c.z - o.z)).toBeGreaterThanOrEqual(2);
  expect(await draws('fakes')).toBeLessThanOrEqual(4);
  expect(await draws('fakes')).toBeGreaterThanOrEqual(1);
  // A clear view of the cluster (tier 1: the fakes spin the other way) for the screenshots.
  await wforce('fakes', { spot, answer: 1, angle: 0.4, tier: 1 });
  d = await wdebug<FakesDebug>('fakes');
  const cx = (d.armed!.corners[0].x + d.armed!.corners[1].x + d.armed!.corners[2].x) / 3;
  const cz = (d.armed!.corners[0].z + d.armed!.corners[1].z + d.armed!.corners[2].z) / 3;
  // Stand ~5 m from the cluster (on a side with a clear line), a little to its right, so the
  // default camera shows all three gems beside the hero.
  const from = await page.evaluate(({ cx, cz, corners }) => {
    const ctx = window.__rg!.ctx;
    const V = ctx.player.position.constructor as new (x: number, y: number, z: number) => typeof ctx.player.position;
    const clear = (x: number, z: number, h: number): boolean => {
      const g = ctx.world.heightAt(x, z);
      const o = new V(x, g + h, z);
      const dir = new V(cx - x, ctx.world.heightAt(cx, cz) + 1.2 - (g + h), cz - z);
      const len = dir.length();
      return !ctx.physics.raycast(o, dir.normalize(), len);
    };
    // Looking along a median of the triangle spreads the three gems across the picture.
    const medians = corners.map((c) => Math.atan2(c.z - cz, c.x - cx));
    const angles = [...medians, ...Array.from({ length: 16 }, (_, k) => (k / 16) * Math.PI * 2)];
    for (const a of angles) {
      const fx = Math.cos(a);
      const fz = Math.sin(a);
      // Hero: 5 m out and 2.2 m to the side; camera ~5 m further back.
      const x = cx + fx * 5 + fz * 2.2;
      const z = cz + fz * 5 - fx * 2.2;
      if (clear(x, z, 1.6) && clear(cx + fx * 10.5 + fz * 2.2, cz + fz * 10.5 - fx * 2.2, 3.5)) return { x, z, yaw: Math.atan2(-fx, -fz) };
    }
    return { x: cx + 5, z: cz, yaw: -Math.PI / 2 };
  }, { cx, cz, corners: d.armed!.corners });
  await standAt(from.x, from.z, from.yaw);
  await shots('fakes', true);
  // The still tells, a step closer: tier 2 (5 facets) and tier 3 (no sparkle: no bright table, no stripes).
  await wforce('fakes', { spot, answer: 1, angle: 0.4, tier: 2 });
  await standAt(cx + (from.x - cx) * 0.7, cz + (from.z - cz) * 0.7, from.yaw, 4);
  await shots('fakes-tier2');
  await wforce('fakes', { spot, answer: 1, angle: 0.4, tier: 3 });
  await shots('fakes-tier3', true);
  await wforce('fakes', { spot, answer: 1, angle: 0.4, tier: 1 });
  await standAt(from.x, from.z, from.yaw, 2);
  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'weak', label: 'fakes' });
});

test('fakes: answer-blind for the strong eye', async () => {
  await expectAnswerBlindWithoutWeakEye(page, {
    setA: () => wforce('fakes', { spot, answer: 0, angle: 0.4 }),
    setB: () => wforce('fakes', { spot, answer: 2, angle: 0.4 }),
    combos: MIRROR_COMBOS,
    label: 'fakes strong eye alone',
  });
});

test('fakes: run into the real gem → hit +2; into a fake → miss, the real gem still pays', async () => {
  await events();
  // Hit: walk in from outside, straight into the real gem.
  await wforce('fakes', { spot, answer: 1, angle: 0.4, tier: 1 });
  let d = await wdebug<FakesDebug>('fakes');
  const real = d.armed!.real;
  const w0 = await wallet();
  await walk(outward(d.armed!, real, 5), real);
  d = await wdebug<FakesDebug>('fakes');
  let ev = await events();
  expect(ev.collected).toEqual([d.spots[spot].id]);
  expect(ev.results).toEqual([{ mechanic: 'fakes', kind: 'tellApart', tier: 1, hit: true }]);
  expect(d.hits).toBe(1);
  expect(d.gems).toBe(2);
  expect(await wallet()).toBeGreaterThanOrEqual(w0 + 3);
  await step(60);
  d = await wdebug<FakesDebug>('fakes');
  expect(d.active, 'fakes poofed and detached').toBe(false);
  expect(await draws('fakes')).toBe(0);
  expect(d.spots[spot].spent).toBe(true);

  // Miss: respawn, re-arm, walk into a fake first.
  await page.evaluate(() => window.__rgEconomy!.forceRespawn());
  await wforce('fakes', { spot, answer: 1, angle: 0.4 });
  d = await wdebug<FakesDebug>('fakes');
  const fake = d.armed!.fakes[0];
  const w1 = await wallet();
  await walk(outward(d.armed!, fake, 5), fake);
  d = await wdebug<FakesDebug>('fakes');
  ev = await events();
  expect(ev.results).toEqual([{ mechanic: 'fakes', kind: 'tellApart', tier: 1, hit: false }]);
  expect(ev.collected).toEqual([]);
  expect(d.misses).toBe(1);
  expect(d.armed?.decided).toBe(true);
  expect(await wallet()).toBe(w1);
  // The real gem is still there and pays as always, with no bonus and no second result.
  await walk(fake, real);
  ev = await events();
  expect(ev.collected).toEqual([d.spots[spot].id]);
  expect(ev.results).toEqual([]);
  expect(await wallet()).toBeGreaterThan(w1);
  expect((await wdebug<FakesDebug>('fakes')).gems).toBe(2);
});

test('both parts attach nothing far away', async () => {
  // The lighthouse headland is far from the shack and (checked) from every fakes spot.
  const d = await wdebug<FakesDebug>('fakes');
  const far = await page.evaluate((spots) => {
    const cands = [{ x: -62, z: -110 }, { x: 120, z: -60 }, { x: -100, z: 100 }];
    return cands.reduce((a, b) => (Math.min(...spots.map((s) => Math.hypot(s.x - b.x, s.z - b.z))) > Math.min(...spots.map((s) => Math.hypot(s.x - a.x, s.z - a.z))) ? b : a));
  }, d.spots);
  await standAt(far.x, far.z, 0, 5);
  for (const id of ['fakes', 'shack']) {
    expect((await wdebug<{ active: boolean }>(id)).active, `${id} idle`).toBe(false);
    expect(await draws(id), `${id} draws`).toBe(0);
  }
  const names = await page.evaluate(() => window.__rg!.layerObjects().map((o) => o.name).filter((n) => n.startsWith('glasses:weave:fakes') || n.startsWith('glasses:weave:shack')));
  expect(names).toEqual([]);
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
