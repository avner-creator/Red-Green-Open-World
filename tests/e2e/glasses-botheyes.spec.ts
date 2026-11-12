/**
 * The two both-eye glasses mechanics on one shared page: half-symbol gates (on the booth kit) and
 * dot-picture signs. For each: channel isolation (all 4 lens/eye combinations), answer-blind
 * proofs for the strong eye alone AND for the weak eye alone (both eyes are needed), play through
 * real movement / presses, the draw budget and far-idle. Gates: the booth from 30 m (R-only and
 * G-only contrast), attract mode, step on the pad → 3-2-1-GO, a round of 3 runs (a hit and a miss),
 * lamps, celebration, the prize paid, and a cancelled round. Screenshots (full, R-only, G-only) go
 * to test-results/glasses/booth/ and test-results/glasses/dotsigns/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot, channelDiff } from './helpers';
import { channelOnly, channelSpread, checkPromptClear, COMBOS, expectAnswerBlindWithoutWeakEye, expectDrawBudget, expectLayerOnlyTouchesOwnChannel, layerFrame, maxOf, setEye } from './glasses-helpers';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/glasses';
/** The weak-eye-alone checks run once per weak channel (R, then G) to keep the spec short. */
const MIRROR_COMBOS = [COMBOS[0], COMBOS[1]];
let page: Page;
let consoleErrors: string[] = [];

type P3 = { x: number; y: number; z: number };
interface GatesKit {
  phase: string;
  results: boolean[];
  fx: Record<string, number>;
  camHeld?: boolean;
  booth: { frame: number; lamps: string[]; lampMode: string; padMode: string; prompt: string | null };
}
interface GatesDebug {
  state: string;
  phase: string;
  halvesShown: boolean;
  kit: GatesKit;
  pad: P3;
  padBack: P3;
  far: P3 & { yaw: number };
  booth: P3;
  tier: number;
  round: number;
  answer: number;
  candidates: { left: string; right: string }[];
  weakSide: 'left' | 'right';
  hits: number;
  misses: number;
  gems: number;
  yaw: number;
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
  phase: string;
  roundTier: number;
  dotsShown: boolean;
  kit: GatesKit & { booth: { deviceOn: boolean } };
  pad: P3;
  padBack: P3;
  booth: P3;
  far: P3 & { yaw: number };
  celebrateView: P3 & { yaw: number };
  behind: P3;
}

const debug = <T>(id: string): Promise<T> => page.evaluate((i) => window.__rgGlasses!.debug(i), id) as Promise<T>;
const wallet = (): Promise<number> => page.evaluate(() => window.__rg!.ctx.profile.wallet);
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

// ───────────────────────────── half-symbol gates (booth kit) ─────────────────────────────

const A = { left: 'spiky', right: 'round' };
const B = { left: 'spiky', right: 'square' }; // shares A's left half
const C = { left: 'point', right: 'round' }; // shares A's right half
const CANDS = [B, A, C];
const BOOTH_OUT = 'booth';

/** Run through arch `i` (front → back), a few frames each side. */
async function runThrough(d: GatesDebug, i: number): Promise<void> {
  const facing = d.yaw + Math.PI;
  await teleport(d.arches[i].front, facing);
  await step(2);
  await teleport(d.arches[i].back, facing);
  await step(3);
}
const kitOf = async (): Promise<GatesKit> => (await debug<GatesDebug>('gates')).kit;

/**
 * A spot ~30 m out on the approach side with a clear line of sight to the booth (on land, not in
 * water), facing it.
 */
async function farSpot(d: GatesDebug, dists: number[] = [30, 28, 32, 26]): Promise<P3 & { yaw: number }> {
  return page.evaluate(({ d, dists }) => {
    const w = window.__rg!.ctx.world;
    const g = window.__rgGlasses!;
    const by = w.heightAt(d.booth.x, d.booth.z) + 3.8;
    for (const dist of dists) {
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
    return d.far;
  }, { d, dists });
}

test('gates: a booth from 30 m, idle attract at the pad', async () => {
  await page.evaluate(() => window.__rgGlasses!.goto('gates'));
  await step(2);
  let d = await debug<GatesDebug>('gates');
  expect(d.phase).toBe('idle');
  expect(d.halvesShown).toBe(false);
  expect(await page.evaluate(() => window.__rgGlasses!.isBooth('gates'))).toBe(true);
  // From ~30 m on the approach: the marquee reads in R-only and G-only.
  const spot = await farSpot(d);
  await standAt(spot, spot.yaw);
  const far = await shots(BOOTH_OUT, 'gates-30m', true);
  const rect = await page.evaluate(() => window.__rgGlasses!.boardRect('gates'));
  expect(rect, 'the booth is on screen from 30 m').not.toBeNull();
  expect(channelSpread(far, rect!, 0), 'marquee R contrast from 30 m').toBeGreaterThan(80);
  expect(channelSpread(far, rect!, 1), 'marquee G contrast from 30 m').toBeGreaterThan(80);
  // Where children arrive: the end of the stepping-stone trail, and 12 m out on that line.
  const arrive = await page.evaluate(() => {
    const s = window.__rgGlasses!.sites().find((q) => q.id === 'gates')!;
    const a = s.arrival!;
    const w = window.__rg!.ctx.world;
    const l = Math.hypot(a.x - s.x, a.z - s.z);
    const at = (dd: number): { x: number; y: number; z: number; yaw: number } => {
      const x = s.x + ((a.x - s.x) / l) * dd;
      const z = s.z + ((a.z - s.z) / l) * dd;
      return { x, y: w.heightAt(x, z), z, yaw: Math.atan2(s.x - x, s.z - z) };
    };
    return { end: at(s.radius + 0.4), twelve: at(12) };
  });
  await standAt(arrive.end, arrive.end.yaw);
  await shots(BOOTH_OUT, 'gates-trail-end', true);
  await standAt(arrive.twelve, arrive.twelve.yaw);
  await shots(BOOTH_OUT, 'gates-12m', true);
  // Just behind the pad, facing the arches: attract mode (demo loops, pad pulses, lamps twinkle).
  await standAt(d.padBack, d.yaw + Math.PI);
  d = await debug<GatesDebug>('gates');
  expect(d.kit.phase).toBe('idle');
  expect(d.kit.booth.prompt).toBe('stepPad');
  const f0 = d.kit.booth.frame;
  await step(30);
  expect((await kitOf()).booth.frame, 'the demo flipbook runs').not.toBe(f0);
  await shots(BOOTH_OUT, 'gates-pad-idle-low', true);
  // The raised pad stands out of the grass on High too (denser, taller tufts).
  await page.evaluate(() => window.__rg!.ctx.settings.set({ quality: 'high' }));
  await standAt(d.padBack, d.yaw + Math.PI, 20);
  await shots(BOOTH_OUT, 'gates-pad-idle-high', true);
  await page.evaluate(() => window.__rg!.ctx.settings.set({ quality: 'low' }));
  await standAt(d.padBack, d.yaw + Math.PI, 20);
  // One draw call for the booth (and everything static of it) at rest.
  expect(await page.evaluate(() => window.__rgGlasses!.signDraws('gates'))).toBe(1);
  await expectDrawBudget(page, 'gates', 6);
});

test('gates: step on the pad → 3-2-1-GO → a run; each layer only touches its channel', async () => {
  const d = await debug<GatesDebug>('gates');
  await standAt(d.pad, d.yaw + Math.PI, 12);
  let k = await kitOf();
  expect(k.phase).toBe('countdown');
  await shots(BOOTH_OUT, 'gates-countdown', true);
  expect(k.fx.digit ?? 0).toBe(1);
  await step(200);
  const g = await debug<GatesDebug>('gates');
  expect(g.phase).toBe('play');
  expect(g.state).toBe('open');
  expect(g.halvesShown).toBe(true);
  k = g.kit;
  expect(k.booth.prompt).toBe('arch');
  await force('gates', { candidates: CANDS, answer: 1, weakSide: 'left' });
  await standAt(d.pad, d.yaw + Math.PI, 2);
  await shots(BOOTH_OUT, 'gates-run', true);
  // The ONE play prompt is in view from the pad: central safe area, under no HUD element.
  for (const [w, h] of [[640, 360], [1280, 720]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    await page.evaluate(() => window.__rg!.render());
    const c = await checkPromptClear(page, 'gates');
    expect(c.why, `gates prompt at ${w}x${h}`).toEqual([]);
  }
  await page.setViewportSize({ width: 640, height: 360 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'both', label: 'gates' });
  await expectDrawBudget(page, 'gates', 6);
});

test('gates: neither eye alone can tell the answer (booth, lamps and pad identical)', async () => {
  // The booth's animation clocks are pinned, so the demo frame, lamps and pad pulse are equal.
  await force('gates', { pin: 0 });
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

test('gates: a round of 3 runs: a hit and a miss through real movement, lamps, celebration, prize', async () => {
  await events();
  const before = await wallet();
  let d = await debug<GatesDebug>('gates');
  expect(d.phase).toBe('play');
  await force('gates', { candidates: CANDS, answer: 1, weakSide: 'left' });
  // Walking round the outside of an arch does not count.
  const facing = d.yaw + Math.PI;
  await teleport(d.arches[2].front, facing);
  await step(2);
  await teleport(d.arches[2].around, facing);
  await step(2);
  expect((await debug<GatesDebug>('gates')).state).toBe('open');
  // Run 1: through the middle arch (the answer) → ✓, lamp 0 lights.
  await runThrough(d, 1);
  d = await debug<GatesDebug>('gates');
  expect(d.state).toBe('done');
  expect(d.kit.results).toEqual([true]);
  expect(d.kit.booth.lamps[0]).toBe('hit');
  expect(d.kit.fx.pop).toBe(1);
  // Turn round behind the arch: the camera looks back at it (squash, ✓, confetti).
  {
    const b = d.arches[1].back;
    const f = d.arches[1].front;
    // ~3.8 m behind the arch, looking back at it (the shot is taken mid-pop).
    const behind = { x: b.x + (b.x - f.x) * 2.2, y: b.y, z: b.z + (b.z - f.z) * 2.2 };
    behind.y = await page.evaluate((p) => window.__rg!.ctx.world.heightAt(p.x, p.z), behind);
    await standAt(behind, d.yaw, 10);
  }
  await shots(BOOTH_OUT, 'gates-hit', true);
  // The beat ends: "back to the pad".
  await step(60);
  d = await debug<GatesDebug>('gates');
  expect(d.phase).toBe('wait');
  expect(d.kit.booth.prompt).toBe('backToPad');
  expect(d.kit.booth.padMode).toBe('wait');
  // Back on the pad → run 2 (the halves swap sides). A wrong arch → ✗, lamp 1 dim.
  await standAt(d.pad, facing, 4);
  d = await debug<GatesDebug>('gates');
  expect(d.phase).toBe('play');
  expect(d.weakSide).toBe('right');
  await runThrough(d, (d.answer + 1) % 3);
  d = await debug<GatesDebug>('gates');
  expect(d.kit.results).toEqual([true, false]);
  expect(d.kit.booth.lamps.slice(0, 2)).toEqual(['hit', 'miss']);
  await step(60);
  // Mid-round from the pad: the booth with a ✓ and a ✗ lamp.
  await standAt(d.padBack, facing, 30);
  await shots(BOOTH_OUT, 'gates-mid-round', true);
  // Run 3: back on the pad, then the right arch → 2 of 3 → celebration, then the prize.
  await standAt(d.pad, facing, 4);
  d = await debug<GatesDebug>('gates');
  expect(d.phase).toBe('play');
  await runThrough(d, d.answer);
  await step(60);
  d = await debug<GatesDebug>('gates');
  expect(d.phase).toBe('celebrate');
  expect(d.kit.booth.lampMode).toBe('chase');
  expect(d.halvesShown).toBe(false);
  // The child stands beyond the arches facing away: the camera turns back to the booth for the
  // celebration (held, not fought: look input releases it).
  expect(d.kit.camHeld, 'camera held on the celebration').toBe(true);
  expect(await page.evaluate(() => window.__rg!.cameraOverridden())).toBe(true);
  await page.evaluate(() => window.__rg!.step(1 / 60, 75));
  await shots(BOOTH_OUT, 'gates-celebrate', true);
  let ev = await events();
  expect(ev.results).toEqual([
    { mechanic: 'gates', kind: 'lineUp', tier: 1, hit: true },
    { mechanic: 'gates', kind: 'lineUp', tier: 1, hit: false },
    { mechanic: 'gates', kind: 'lineUp', tier: 1, hit: true },
  ]);
  expect(ev.toasts, 'no gems before the prize').toBe(0);
  // The child looks around: the camera is theirs again at once.
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ lookX: 0.05 });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
  });
  expect((await kitOf()).camHeld).toBe(false);
  expect(await page.evaluate(() => window.__rg!.cameraOverridden())).toBe(false);
  await step(240);
  d = await debug<GatesDebug>('gates');
  expect(['cooldown', 'idle']).toContain(d.phase);
  expect(d.gems).toBe(3);
  expect(await wallet()).toBe(before + 3);
  ev = await events();
  expect(ev.toasts).toBe(1);
  // 2 of 3 keeps the tier; the booth goes back to attract.
  expect(d.tier).toBe(1);
  await step(120);
  expect((await kitOf()).phase).toBe('idle');
});

test('gates: a child who stays past the arch: arrows lead back, then a boing pops them onto the pad; the hit is kept (QA6 m3)', async () => {
  await events();
  let d = await debug<GatesDebug>('gates');
  const facing = d.yaw + Math.PI;
  await standAt(d.padBack, facing, 4);
  await standAt(d.pad, facing, 4);
  await step(200);
  d = await debug<GatesDebug>('gates');
  expect(d.phase).toBe('play');
  await force('gates', { candidates: CANDS, answer: 1, weakSide: 'left' });
  d = await debug<GatesDebug>('gates');
  await runThrough(d, d.answer);
  // Stand ~3 m beyond the arch and do nothing.
  const b = d.arches[d.answer].back;
  const f = d.arches[d.answer].front;
  const beyond = { x: b.x + (b.x - f.x) * 2, y: b.y, z: b.z + (b.z - f.z) * 2 };
  beyond.y = await page.evaluate((p) => window.__rg!.ctx.world.heightAt(p.x, p.z), beyond);
  // Facing away, as a child who just ran through.
  await standAt(beyond, facing, 90);
  d = await debug<GatesDebug>('gates');
  expect(d.phase).toBe('wait');
  const trail = (d.kit as unknown as { trail: number }).trail;
  expect(trail, 'ground arrows lead back to the pad').toBeGreaterThan(2);
  // The nudge (4 s): the camera swings round to show the arrows running back to the pad, and
  // `glasses:wait` names the site (Pip: "Back to the pad!").
  await page.evaluate(() => {
    const w = window as unknown as { __waits: string[] };
    w.__waits = [];
    window.__rg!.ctx.events.on('glasses:wait', (e) => w.__waits.push(e.mechanic));
  });
  await step(4 * 60);
  expect(await page.evaluate(() => (window as unknown as { __waits: string[] }).__waits)).toEqual(['gates']);
  expect(await page.evaluate(() => window.__rg!.cameraOverridden()), 'camera shows the way back').toBe(true);
  await shots(BOOTH_OUT, 'gates-wait-trail', true);
  // No input at all: called back, then popped onto the pad and the next run starts.
  let t = 0;
  while ((await kitOf()).phase === 'wait' && t < 20) {
    await step(30);
    t += 0.5;
  }
  d = await debug<GatesDebug>('gates');
  expect(t, 'the wait is short (QA6: 34 s, then the round was lost)').toBeLessThan(12);
  expect(d.phase).toBe('play');
  expect(d.kit.results).toEqual([true]);
  expect((d.kit as unknown as { onPad: boolean }).onPad).toBe(true);
  expect((d.kit as unknown as { trail: number }).trail).toBe(0);
  expect((await events()).results).toEqual([{ mechanic: 'gates', kind: 'lineUp', tier: 1, hit: true }]);
  // Leave: the round is cancelled and the booth idles for the next test.
  await teleport(d.far, d.far.yaw);
  await step(3);
  expect((await kitOf()).phase).toBe('idle');
});

test('gates: leaving mid-round cancels it with no misses for the runs never played', async () => {
  await events();
  const d = await debug<GatesDebug>('gates');
  await standAt(d.padBack, d.yaw + Math.PI, 4);
  await standAt(d.pad, d.yaw + Math.PI, 4);
  expect((await kitOf()).phase).toBe('countdown');
  await step(200);
  expect((await kitOf()).phase).toBe('play');
  await teleport(d.far, d.far.yaw);
  await step(3);
  const k = await kitOf();
  expect(k.phase).toBe('idle');
  expect((await debug<GatesDebug>('gates')).halvesShown).toBe(false);
  expect((await events()).results).toEqual([]);
});

// ───────────────────────────── dot-picture signs (booth kit) ─────────────────────────────

const SHAPES = ['star', 'heart', 'moon'];
const dots = (): Promise<DotsDebug> => debug<DotsDebug>('dotsigns');
/** A spot on the line from the site to its arrival (`dist` m from the site; 0 = the arrival itself, the stepping-stone trail's end), facing the booth. */
async function dotArrivalSpot(id: string, dist: number): Promise<P3 & { yaw: number }> {
  return page.evaluate(
    ({ id, dist }) => {
      const g = window.__rgGlasses!;
      const w = window.__rg!.ctx.world;
      const s = g.sites().find((x) => x.id === id)!;
      const a = s.arrival ?? { x: s.x, z: s.z + 30 };
      const l = Math.hypot(a.x - s.x, a.z - s.z) || 1;
      const x = dist ? s.x + ((a.x - s.x) / l) * dist : a.x;
      const z = dist ? s.z + ((a.z - s.z) / l) * dist : a.z;
      const b = (g.debug(id) as { booth: { x: number; z: number } }).booth;
      const tx = (b.x + s.x) / 2;
      const tz = (b.z + s.z) / 2;
      return { x, y: w.heightAt(x, z), z, yaw: Math.atan2(tx - x, tz - z) };
    },
    { id, dist },
  );
}


/** Press Use once through the input system; returns the id of the prompt that was focused. */
async function useOnce(): Promise<string | null> {
  return page.evaluate(() => {
    const rg = window.__rg!;
    const f = rg.ctx.interactions.focused?.id ?? null;
    rg.inject({ usePressed: true, use: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 1, false);
    return f;
  });
}
/** Stand in front of button `i` (facing the sign) and press it. */
async function pressDot(d: DotsDebug, i: number): Promise<string | null> {
  await teleport(d.stand[i], d.yaw + Math.PI);
  await step(3);
  return useOnce();
}

test('dot signs: a booth from 30 m, attract at the pad, Use on the pad → 3-2-1-GO', async () => {
  await page.evaluate(() => window.__rgGlasses!.goto('dotsigns'));
  await step(2);
  let d = await dots();
  expect(await page.evaluate(() => window.__rgGlasses!.isBooth('dotsigns'))).toBe(true);
  expect([d.phase, d.state, d.dotsShown]).toEqual(['idle', 'idle', false]);
  // From ~20 m on the plaza approach (QA r7 M3; 30 m out is under the race gantry on the east
  // road): the marquee reads in R-only and G-only.
  const spot = await farSpot(d as unknown as GatesDebug, [20, 18, 22, 24]);
  await standAt(spot, spot.yaw);
  const far = await shots(BOOTH_OUT, 'dotsigns-30m', true);
  const rect = await page.evaluate(() => window.__rgGlasses!.boardRect('dotsigns'));
  expect(rect, 'the booth is on screen from 30 m').not.toBeNull();
  expect(channelSpread(far, rect!, 0), 'marquee R contrast from 30 m').toBeGreaterThan(80);
  expect(channelSpread(far, rect!, 1), 'marquee G contrast from 30 m').toBeGreaterThan(80);
  // From the end of the stepping-stone trail (where children arrive) and from 12 m on that line.
  for (const [tag, dist] of [['arrival', 0], ['12m', 12]] as const) {
    const p = await dotArrivalSpot('dotsigns', dist);
    await standAt(p, p.yaw);
    await shots(BOOTH_OUT, `dotsigns-${tag}`, true);
  }
  // From behind the sign: its back is dressed (stripes and the mark), never a blank wall.
  await standAt(d.behind, d.yaw, 30);
  await shots(BOOTH_OUT, 'dotsigns-behind');
  // Behind the pad, facing the sign: attract (demo loops, the pad pulses, the device's button shows).
  await standAt(d.padBack, d.yaw + Math.PI);
  d = await dots();
  expect(d.kit.phase).toBe('idle');
  expect(d.kit.booth.deviceOn).toBe(true);
  const f0 = d.kit.booth.frame;
  await step(90);
  expect((await dots()).kit.booth.frame, 'the demo flipbook runs').not.toBe(f0);
  await shots(BOOTH_OUT, 'dotsigns-pad-idle', true);
  expect(await page.evaluate(() => window.__rgGlasses!.signDraws('dotsigns'))).toBe(1);
  await expectDrawBudget(page, 'dotsigns', 6);
  // No button prompt while the booth is idle; on the pad, Use starts a round.
  await standAt(d.stand[1], d.yaw + Math.PI, 4);
  expect(await page.evaluate(() => window.__rg!.ctx.interactions.focused?.id ?? '')).not.toMatch(/glasses-dotsigns/);
  await standAt(d.pad, d.yaw + Math.PI, 6);
  expect(await useOnce()).toMatch(/^glasses-booth-/);
  d = await dots();
  expect(d.kit.phase).toBe('countdown');
  expect(d.kit.fx.digit ?? 0).toBe(1);
  await page.evaluate(() => window.__rg!.step(1 / 60, 12));
  await shots(BOOTH_OUT, 'dotsigns-countdown', true);
  await step(200);
  d = await dots();
  expect([d.phase, d.state, d.dotsShown]).toEqual(['play', 'open', true]);
  expect(d.kit.booth.prompt).toBe('button');
});

test('dot signs: the picture and the buttons; each layer only touches its channel', async () => {
  const d = await dots();
  await force('dotsigns', { shapes: SHAPES, answer: 0, seed: 1234, tier: 1 });
  await standAt(d.view, d.yaw + Math.PI);
  await shots('dotsigns', 'pedestal', true);
  await shots(BOOTH_OUT, 'dotsigns-play', true);
  await standAt(d.approach, d.approachYaw);
  await shots('dotsigns', 'approach', true);
  await standAt(d.view, d.yaw + Math.PI);
  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'both', label: 'dotsigns' });
  await expectDrawBudget(page, 'dotsigns', 6);
});

test('dot signs: neither eye alone can tell the hidden shape (booth, lamps and pad identical)', async () => {
  // The booth's clocks are pinned: demo frame, lamps and pad pulse are equal in every frame.
  await force('dotsigns', { pin: 0 });
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
    const diff = channelDiff(a, b);
    expect(maxOf(diff, combo.strong), 'strong channel identical').toBe(0);
    expect(diff.maxB).toBe(0);
  }
  await setEye(page, COMBOS[0].eye);
  await layerFrame(page, { weak: true, strong: true });
});

test('dot signs: a round of 5 through the buttons: a hit and a miss, lamps, celebration, prize', async () => {
  await events();
  const before = await wallet();
  await force('dotsigns', { shapes: SHAPES, answer: 2, seed: 77 });
  let d = await dots();
  expect(d.phase).toBe('play');
  // Picture 1: the hidden shape is on the right button → ✓, lamp 0 lights, the sign does a flourish.
  expect(await pressDot(d, 2)).toBe('glasses-dotsigns-2');
  d = await dots();
  expect([d.state, d.hits]).toEqual(['done', 1]);
  expect(d.kit.results).toEqual([true]);
  expect(d.kit.booth.lamps[0]).toBe('hit');
  expect(d.kit.fx.pop).toBe(1);
  let ev = await events();
  expect(ev.results).toEqual([{ mechanic: 'dotsigns', kind: 'popOut', tier: 1, hit: true }]);
  expect(ev.toasts, 'no gems before the prize').toBe(0);
  await standAt(d.view, d.yaw + Math.PI, 8);
  await shots(BOOTH_OUT, 'dotsigns-hit', true);
  // Picture 2: a wrong button → ✗, a dim lamp; the right one bobs.
  await step(90);
  d = await dots();
  expect([d.phase, d.state, d.round]).toEqual(['play', 'open', 2]);
  expect(await pressDot(d, (d.answer + 1) % 3)).toBe(`glasses-dotsigns-${(d.answer + 1) % 3}`);
  d = await dots();
  expect(d.misses).toBe(1);
  expect(d.kit.booth.lamps.slice(0, 2)).toEqual(['hit', 'miss']);
  ev = await events();
  expect(ev.results).toEqual([{ mechanic: 'dotsigns', kind: 'popOut', tier: 1, hit: false }]);
  await step(90);
  await standAt(d.padBack, d.yaw + Math.PI, 20);
  await shots(BOOTH_OUT, 'dotsigns-mid-round', true);
  // Pictures 3–5 right: 4 of 5 at tier 1 → the prize for 4, and finer pictures next round.
  for (let t = 0; t < 3; t++) {
    d = await dots();
    expect([d.phase, d.state]).toEqual(['play', 'open']);
    expect(await pressDot(d, d.answer)).toBe(`glasses-dotsigns-${d.answer}`);
    await step(90);
  }
  d = await dots();
  expect(d.phase).toBe('celebrate');
  expect(d.kit.booth.lampMode).toBe('chase');
  expect(d.dotsShown).toBe(false);
  await standAt(d.celebrateView, d.celebrateView.yaw, 10);
  await shots(BOOTH_OUT, 'dotsigns-celebrate', true);
  ev = await events();
  expect(ev.results.map((r) => r.hit)).toEqual([true, true, true]);
  expect(ev.results.every((r) => r.tier === 1)).toBe(true);
  expect(ev.toasts).toBe(0);
  await step(240);
  d = await dots();
  expect(['cooldown', 'idle']).toContain(d.phase);
  expect(d.gems).toBe(6);
  expect(await wallet()).toBe(before + 6);
  expect((await events()).toasts).toBe(1);
  expect(d.roundTier, '4 of 5: finer pictures next round').toBe(2);
  await step(120);
  expect((await dots()).kit.phase).toBe('idle');
});

test('dot signs: a straight walk to the pad from the plaza side, the lead point and the trail end; E only at the faced pedestal (QA r7 M3, m9)', async () => {
  const d = await dots();
  const site = await page.evaluate(() => window.__rgGlasses!.sites().find((s) => s.id === 'dotsigns')!);
  const lead = (d as unknown as { lead: P3 }).lead;
  // Pip's dot-signs destination reads the empty marker `glasses:dotsigns:lead`: it is the lead spot.
  const marker = await page.evaluate(() => {
    const o = window.__rg!.ctx.scene.getObjectByName('glasses:dotsigns:lead');
    return o ? { x: o.position.x, z: o.position.z } : null;
  });
  expect(marker, 'lead marker').not.toBeNull();
  expect(Math.hypot(marker!.x - lead.x, marker!.z - lead.z)).toBeLessThan(0.01);
  // Walk with real move input, steered at the pad every frame (a child walking straight at it).
  const walk = (from: { x: number; z: number }, via: { x: number; z: number } | null = null): Promise<{ t: number; d: number }> =>
    page.evaluate(
      ({ from, pad, via }) => {
        const rg = window.__rg!;
        const ctx = rg.ctx;
        rg.teleport(from.x, ctx.world.heightAt(from.x, from.z) + 0.1, from.z, Math.atan2(pad.x - from.x, pad.z - from.z));
        rg.step(1 / 60, 20, false);
        const f = ctx.camera.position.clone();
        let t = 0;
        let dd = Infinity;
        let goal = via ?? pad;
        for (; t < 20; t += 1 / 60) {
          const p = ctx.player.position;
          if (goal !== pad && Math.hypot(goal.x - p.x, goal.z - p.z) < 0.8) goal = pad;
          dd = Math.hypot(pad.x - p.x, pad.z - p.z);
          if (dd < 0.6) break;
          const dx = goal.x - p.x;
          const dz = goal.z - p.z;
          const dg = Math.hypot(dx, dz);
          ctx.camera.getWorldDirection(f);
          const yaw = Math.atan2(f.x, f.z);
          const s = Math.sin(yaw);
          const c = Math.cos(yaw);
          rg.inject({ moveY: (s * dx + c * dz) / dg, moveX: (-c * dx + s * dz) / dg });
          rg.step(1 / 60, 1, false);
        }
        rg.inject(null);
        rg.step(1 / 60, 2, false);
        return { t: +t.toFixed(2), d: +dd.toFixed(2) };
      },
      { from, pad: d.pad, via },
    );
  const plaza = await walk({ x: 62.5, z: 8 });
  const fromLead = await walk(lead);
  const fromRoad = await walk({ x: 50, z: 13 });
  // The park path's trail end is behind the sign: a child walks round its end (the side away
  // from the booth), then to the pad.
  const side = { x: d.stand[2].x + Math.sin(d.yaw + Math.PI / 2) * 2.4 - Math.sin(d.yaw) * 1.2, z: d.stand[2].z + Math.cos(d.yaw + Math.PI / 2) * 2.4 - Math.cos(d.yaw) * 1.2 };
  const fromTrail = await walk(site.arrival!, side);
  console.log('dot signs walks', JSON.stringify({ lead, plaza, fromLead, fromRoad, fromTrail }));
  expect(plaza.t, 'from Pip’s old point (62.5, 8)').toBeLessThan(4);
  expect(fromLead.t, 'from the lead point').toBeLessThan(3);
  expect(fromRoad.t, 'from the east road (plaza side)').toBeLessThan(6);
  expect(fromTrail.t, 'from the trail end, round the sign').toBeLessThan(8);

  // E answers only the pedestal the hero stands at and faces.
  await force('dotsigns', { play: true, shapes: SHAPES, answer: 1, seed: 5 });
  const misses0 = (await dots()).misses;
  const sx = Math.sin(d.yaw + Math.PI);
  const sz = Math.cos(d.yaw + Math.PI);
  // Between two pedestals (on their line), facing the sign: no button.
  const gap = { x: (d.stand[0].x + d.stand[1].x) / 2 + sx * 0.6, y: d.stand[0].y, z: (d.stand[0].z + d.stand[1].z) / 2 + sz * 0.6 };
  await standAt(gap, d.yaw + Math.PI, 3);
  expect(await page.evaluate(() => window.__rg!.ctx.interactions.focused?.id ?? '')).not.toMatch(/glasses-dotsigns/);
  // In front of the middle pedestal but walking along the row: no button.
  await standAt(d.stand[1], d.yaw + Math.PI / 2, 3);
  expect(await page.evaluate(() => window.__rg!.ctx.interactions.focused?.id ?? '')).not.toMatch(/glasses-dotsigns/);
  // At the right pedestal, facing it: that one.
  await standAt(d.stand[2], d.yaw + Math.PI, 3);
  expect(await page.evaluate(() => window.__rg!.ctx.interactions.focused?.id ?? '')).toBe('glasses-dotsigns-2');
  expect((await dots()).misses).toBe(misses0);
});

test('dot signs: walking away mid-round cancels it with no misses for the pictures never shown', async () => {
  await events();
  let d = await dots();
  // A finer picture in view for the record (a round forced straight into play at tier 3).
  await force('dotsigns', { play: true, tier: 3, shapes: SHAPES, answer: 0, seed: 1234 });
  await standAt(d.view, d.yaw + Math.PI);
  await shots('dotsigns', 'tier3', true);
  expect((await dots()).phase).toBe('play');
  await teleport(d.far, d.far.yaw);
  await step(3);
  d = await dots();
  expect([d.kit.phase, d.state, d.dotsShown]).toEqual(['idle', 'idle', false]);
  expect((await events()).results).toEqual([]);
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
