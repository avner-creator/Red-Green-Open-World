/**
 * Glasses play: "Odd one out" pedestals and "Line-up" magic-ring bubbles (on the booth kit), on
 * one shared page.
 * For each: the layers touch only their own channel (all 4 lens/eye combos), the answer is
 * invisible without the weak eye (bit-identical frames), a full round to a hit and to a miss
 * through the real input/interaction path, the draw budget, far-idle, and default-camera R/G
 * screenshots (640×360 and 1280×720).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot } from './helpers';
import { channelOnly, channelSpread, expectAnswerBlindWithoutWeakEye, expectDrawBudget, expectLayerOnlyTouchesOwnChannel } from './glasses-helpers';
import { LINEUP_PRIZE } from '../../src/activities/glasses/lineup/constants';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/glasses';
let page: Page;
let consoleErrors: string[] = [];

interface Ev {
  type: string;
  mechanic?: string;
  kind?: string;
  tier?: number;
  hit?: boolean;
  icon?: string;
}

async function events(): Promise<Ev[]> {
  return page.evaluate(() => (window as unknown as { __tellEvents: Ev[] }).__tellEvents.splice(0));
}

/** Full / R-only / G-only of the current frame; `big` also at 1280×720. */
async function save(dir: string, name: string, big = false): Promise<void> {
  mkdirSync(`${OUT}/${dir}`, { recursive: true });
  const write = (img: PNG, tag: string): void => {
    writeFileSync(`${OUT}/${dir}/${tag}-R.png`, PNG.sync.write(channelOnly(img, 0)));
    writeFileSync(`${OUT}/${dir}/${tag}-G.png`, PNG.sync.write(channelOnly(img, 1)));
  };
  write(await canvasShot(page, `${OUT}/${dir}/${name}-full.png`), name);
  if (big) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    await page.evaluate(() => window.__rg!.render());
    write(await canvasShot(page, `${OUT}/${dir}/${name}-720p-full.png`), `${name}-720p`);
    await page.setViewportSize({ width: 640, height: 360 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    await page.evaluate(() => window.__rg!.render());
  }
}

/** Press Use once through the input system; returns the id of the prompt that was focused. */
async function pressUse(): Promise<string | null> {
  return page.evaluate(() => {
    const rg = window.__rg!;
    const f = rg.ctx.interactions.focused;
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    return f?.id ?? null;
  });
}

/** Stand where a child presses the middle button, facing the pedestals, default camera. */
async function standAtButtons(): Promise<void> {
  await page.evaluate(() => {
    const rg = window.__rg!;
    const d = window.__rgGlasses!.debug('oddone') as { stand: number[]; facing: number };
    rg.teleport(d.stand[0], d.stand[1] + 0.05, d.stand[2], d.facing + Math.PI);
    rg.step(1 / 60, 40, false);
    rg.step(1 / 60, 1);
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
    const w = window as unknown as { __tellEvents: Ev[] };
    w.__tellEvents = [];
    rg.ctx.events.on('glasses:result', (e) => w.__tellEvents.push({ type: 'result', ...e }));
    rg.ctx.events.on('ui:toast', (e) => w.__tellEvents.push({ type: 'toast', icon: e.icon }));
  });
});

test.afterAll(async () => {
  await page.close();
});

// ───────────────────────────── Odd one out ─────────────────────────────

test('odd one out: weak shapes touch only the weak channel; answer hidden from the strong eye', async () => {
  await page.evaluate(() => {
    window.__rgGlasses!.goto('oddone');
    window.__rg!.step(1 / 60, 30, false);
    window.__rgGlasses!.force('oddone', { level: 0, answer: 2 });
    window.__rg!.step(1 / 60, 1);
  });
  expect(await page.evaluate(() => window.__rgGlasses!.active('oddone'))).toBe(true);
  await save('oddone', 'approach-level0', true);
  await standAtButtons();
  await page.evaluate(() => {
    window.__rgGlasses!.force('oddone', { level: 0, answer: 1 });
    window.__rg!.render();
  });
  await save('oddone', 'buttons-level0', true);
  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'weak', label: 'oddone' });

  const answer = (a: number) => async (): Promise<void> => {
    await page.evaluate((x) => window.__rgGlasses!.force('oddone', { answer: x }), a);
  };
  for (const level of [0, 6]) {
    await page.evaluate((l) => window.__rgGlasses!.force('oddone', { level: l, answer: 0 }), level);
    await expectAnswerBlindWithoutWeakEye(page, { setA: answer(0), setB: answer(2), label: `oddone level ${level}` });
  }
  await page.evaluate(() => {
    window.__rgGlasses!.force('oddone', { level: 7, answer: 2 });
    window.__rg!.render();
  });
  await save('oddone', 'buttons-level7', true);
});

test('odd one out: a hit and a miss through the button prompts; the staircase moves; a nap after the miss', async () => {
  await page.evaluate(() => window.__rgGlasses!.force('oddone', { level: 2, answer: 1 }));
  await standAtButtons();
  await events();
  expect(await pressUse()).toBe('glasses-oddone-1');
  let dbg = await page.evaluate(() => window.__rgGlasses!.debug('oddone'));
  expect(dbg).toMatchObject({ phase: 'feedback', pressed: 1, lastHit: true, level: 3, hits: 1 });
  let ev = await events();
  expect(ev.filter((e) => e.type === 'result')).toEqual([{ type: 'result', mechanic: 'oddone', kind: 'tellApart', tier: 2, hit: true }]);
  expect(ev.some((e) => e.type === 'toast' && e.icon === 'gem')).toBe(true);
  await page.evaluate(() => window.__rg!.step(1 / 60, 12));
  await expectDrawBudget(page, 'oddone', 5);
  await save('oddone', 'hit');

  // Next round after the feedback, then a miss (answer forced away from the middle).
  await page.evaluate(() => window.__rg!.step(1 / 60, 110, false));
  dbg = await page.evaluate(() => window.__rgGlasses!.debug('oddone'));
  expect(dbg).toMatchObject({ phase: 'ask', level: 3 });
  await page.evaluate(() => window.__rgGlasses!.force('oddone', { answer: 0 }));
  expect(await pressUse()).toBe('glasses-oddone-1');
  dbg = await page.evaluate(() => window.__rgGlasses!.debug('oddone'));
  expect(dbg).toMatchObject({ phase: 'feedback', lastHit: false, level: 2, misses: 1 });
  ev = await events();
  expect(ev.filter((e) => e.type === 'result')).toEqual([{ type: 'result', mechanic: 'oddone', kind: 'tellApart', tier: 2, hit: false }]);
  expect(ev.some((e) => e.type === 'toast')).toBe(false);
  // After the feedback the pedestals nap: no prompt for 5 s, then they wake up.
  await page.evaluate(() => window.__rg!.step(1 / 60, 110));
  await save('oddone', 'nap');
  dbg = await page.evaluate(() => window.__rgGlasses!.debug('oddone'));
  expect(dbg).toMatchObject({ phase: 'ask' });
  expect(dbg.nap as number).toBeGreaterThan(3);
  expect(await page.evaluate(() => window.__rg!.ctx.interactions.focused?.id ?? null)).toBeNull();
  await page.evaluate(() => window.__rg!.step(1 / 60, 300, false));
  expect(await page.evaluate(() => window.__rg!.ctx.interactions.focused?.id ?? null)).toBe('glasses-oddone-1');
});

// ───────────────────────────── Line-up (booth kit) ─────────────────────────────

type LuP3 = { x: number; y: number; z: number };
interface LineupKit {
  phase: string;
  results: boolean[];
  fx: Record<string, number>;
  booth: { frame: number; lamps: string[]; lampMode: string; padMode: string; prompt: string | null };
}
interface LineupDebug {
  active: boolean;
  onPad: boolean;
  phase: string;
  pad: number[];
  padYaw: number;
  tier: number;
  wanted: number;
  inside: number;
  pops: number;
  misses: number;
  presses: number;
  gems: number;
  offset: { thetaDeg: number; phiDeg: number };
  promptDevice: string;
  bubbles: { state: string }[];
  kit: LineupKit;
  booth: LuP3;
  padBack: LuP3;
}
const LU_BOOTH = 'booth';
const lineup = (): Promise<LineupDebug> => page.evaluate(() => window.__rgGlasses!.debug('lineup')) as unknown as Promise<LineupDebug>;
const lineupForce = (p: Record<string, unknown>): Promise<void> => page.evaluate((q) => window.__rgGlasses!.force('lineup', q), p);
const luStep = (n: number): Promise<void> => page.evaluate((k) => window.__rg!.step(1 / 60, k, false), n);
const luWallet = (): Promise<number> => page.evaluate(() => window.__rg!.ctx.profile.wallet);

/** Teleport the hero (feet on the ground) facing `yaw`, settle the camera, render once. */
async function luStandAt(p: LuP3, yaw: number, settle = 30, lookY = 0): Promise<void> {
  await page.evaluate(
    ({ p, yaw, settle, lookY }) => {
      const rg = window.__rg!;
      rg.teleport(p.x, p.y + 0.05, p.z, yaw);
      rg.step(1 / 60, settle, false);
      if (lookY) {
        // Look up a little (as a player would, to see the bubbles).
        rg.inject({ lookY });
        rg.step(1 / 60, 12, false);
        rg.inject(null);
        rg.step(1 / 60, 20, false);
      }
      rg.step(1 / 60, 1);
    },
    { p, yaw, settle, lookY },
  );
}

const luPadOf = (d: LineupDebug): LuP3 => ({ x: d.pad[0], y: d.pad[1], z: d.pad[2] });

/** A spot ~30 m out on the approach with a clear view of the booth and the pad, facing them. */
async function luFarSpot(d: LineupDebug): Promise<LuP3 & { yaw: number }> {
  return page.evaluate((d) => {
    const w = window.__rg!.ctx.world;
    const g = window.__rgGlasses!;
    const pad = { x: d.pad[0], y: d.pad[1], z: d.pad[2] };
    const by = w.heightAt(d.booth.x, d.booth.z) + 3.8;
    const approach = d.padYaw - Math.PI;
    for (const dist of [30, 28, 32, 26, 24]) {
      for (const off of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2]) {
        const a = approach + off;
        const x = pad.x + Math.sin(a) * dist;
        const z = pad.z + Math.cos(a) * dist;
        const y = w.heightAt(x, z);
        if (!w.isLand(x, z) || y < w.waterLevel + 0.5) continue;
        if (g.sight({ x, y: y + 2.6, z }, { x: d.booth.x, y: by, z: d.booth.z }) !== null) continue;
        if (g.sight({ x, y: y + 1.5, z }, { x: pad.x, y: pad.y + 1.2, z: pad.z }) !== null) continue;
        const bx = d.booth.x * 0.6 + pad.x * 0.4;
        const bz = d.booth.z * 0.6 + pad.z * 0.4;
        return { x, y, z, yaw: Math.atan2(bx - x, bz - z) };
      }
    }
    const x = pad.x + Math.sin(approach) * 30;
    const z = pad.z + Math.cos(approach) * 30;
    return { x, y: w.heightAt(x, z), z, yaw: d.padYaw };
  }, d);
}

/** Step onto the pad (from just behind it): the walk-in start. */
async function stepOnPad(d: LineupDebug): Promise<void> {
  await luStandAt(d.padBack, d.padYaw, 4);
  await luStandAt(luPadOf(d), d.padYaw, 4, -0.03);
}

/** Through the round's 3-2-1-GO into try `n`'s live bubble. */
async function toLiveBubble(): Promise<void> {
  await luStep(60);
  await lineupForce({ live: true });
  await luStep(1);
}

test('line-up: a booth from 30 m; idle attract at the pad', async () => {
  await page.evaluate(() => window.__rgGlasses!.goto('lineup'));
  await luStep(2);
  let d = await lineup();
  expect(d.phase).toBe('idle');
  expect(await page.evaluate(() => window.__rgGlasses!.isBooth('lineup'))).toBe(true);
  const spot = await luFarSpot(d);
  await luStandAt(spot, spot.yaw);
  const far = await canvasShot(page);
  await save(LU_BOOTH, 'lineup-30m', true);
  const rect = await page.evaluate(() => window.__rgGlasses!.boardRect('lineup'));
  expect(rect, 'the booth is on screen from 30 m').not.toBeNull();
  expect(channelSpread(far, rect!, 0), 'marquee R contrast from 30 m').toBeGreaterThan(80);
  expect(channelSpread(far, rect!, 1), 'marquee G contrast from 30 m').toBeGreaterThan(80);
  // Just behind the pad, facing the bubbles' sky: attract (demo loops, pad pulses, lamps twinkle).
  await luStandAt(d.padBack, d.padYaw);
  d = await lineup();
  expect(d.kit.phase).toBe('idle');
  expect(d.kit.booth.prompt).toBe('stepPad');
  const f0 = d.kit.booth.frame;
  await luStep(30);
  expect((await lineup()).kit.booth.frame, 'the demo flipbook runs').not.toBe(f0);
  await page.evaluate(() => window.__rg!.step(1 / 60, 1));
  await save(LU_BOOTH, 'lineup-pad-idle', true);
  expect(await page.evaluate(() => window.__rgGlasses!.signDraws('lineup'))).toBe(1);
  await expectDrawBudget(page, 'lineup', 3);
});

test('line-up: step on the pad → 3-2-1-GO → a bubble; each layer only its channel; the ring is answer-blind', async () => {
  const d = await lineup();
  await stepOnPad(d);
  let k = (await lineup()).kit;
  expect(k.phase).toBe('countdown');
  await save(LU_BOOTH, 'lineup-countdown', true);
  await luStep(200);
  let g = await lineup();
  expect(g.phase).toBe('play');
  expect(g.onPad).toBe(true);
  expect(g.wanted).toBe(1);
  expect(g.kit.booth.prompt).toBe('press');
  expect(g.promptDevice, 'the play prompt shows the device button').toBe('keyboard');
  await lineupForce({ live: true, aim: 'reticle', target: 0 });
  await page.evaluate(() => window.__rg!.render());
  await save(LU_BOOTH, 'lineup-play', true);
  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'both', label: 'lineup' });
  await expectDrawBudget(page, 'lineup', 6);

  // With the booth's clocks pinned, two ring offsets are identical without the weak eye.
  await lineupForce({ aim: 'none', pin: 0 });
  const at = (theta: number, phi: number) => async (): Promise<void> => lineupForce({ offset: [theta, phi] });
  await expectAnswerBlindWithoutWeakEye(page, { setA: at(6, 40), setB: at(11, 150), label: 'lineup offset' });
  g = await lineup();
  k = g.kit;
  expect(k.results, 'nothing reported yet').toEqual([]);
});

test('line-up: a round of 5 bubbles through Use: pops, a missed tap, a time-out, lamps, celebration, prize', async () => {
  await events();
  const before = await luWallet();
  // 1: ring on the bubble → pop, ✓, lamp 0 bright, the ring jumps.
  await lineupForce({ aim: 'reticle', target: 0, live: true });
  await luStep(2);
  let d = await lineup();
  expect(d.inside).toBe(0);
  const off0 = d.offset.thetaDeg;
  expect(await pressUse()).toBe('glasses-lineup-pad');
  await luStep(6);
  d = await lineup();
  expect(d.pops).toBe(1);
  expect(d.kit.results).toEqual([true]);
  expect(d.kit.booth.lamps[0]).toBe('hit');
  expect(d.kit.fx.pop).toBe(1);
  expect(d.offset.thetaDeg).not.toBeCloseTo(off0, 3);
  await page.evaluate(() => window.__rg!.step(1 / 60, 1));
  await save(LU_BOOTH, 'lineup-hit', true);
  // 2: the bubble parked in the screen centre (never inside the ring): a tap misses → ✗.
  await toLiveBubble();
  await lineupForce({ aim: 'centre' });
  await luStep(2);
  expect(await pressUse()).toBe('glasses-lineup-pad');
  d = await lineup();
  expect(d.kit.results).toEqual([true, false]);
  expect(d.kit.booth.lamps.slice(0, 2)).toEqual(['hit', 'miss']);
  // 3: a bubble left alone floats away → ✗ (a time-out). Off the pad nothing times out.
  await toLiveBubble();
  await lineupForce({ onPad: false, age: 11.9 });
  await luStep(60);
  expect((await lineup()).kit.results).toEqual([true, false]);
  await lineupForce({ onPad: null });
  await luStep(10);
  d = await lineup();
  expect(d.kit.results).toEqual([true, false, false]);
  expect(d.misses).toBe(2);
  // Mid-round from just behind the pad: the booth with a ✓ and two ✗ lamps.
  await luStep(20);
  await luStandAt(d.padBack, d.padYaw, 20);
  await save(LU_BOOTH, 'lineup-mid-round', true);
  await luStandAt(luPadOf(d), d.padYaw, 4, -0.03);
  // 4 and 5: two more pops → 3 of 5 → celebration, then the prize (tier 1, 3 pops).
  for (let i = 0; i < 2; i++) {
    await toLiveBubble();
    await lineupForce({ aim: 'reticle', target: 0 });
    await luStep(2);
    expect(await pressUse()).toBe('glasses-lineup-pad');
  }
  await luStep(50);
  d = await lineup();
  expect(d.kit.results).toEqual([true, false, false, true, true]);
  expect(d.phase).toBe('celebrate');
  expect(d.kit.booth.lampMode).toBe('chase');
  await lineupForce({ aim: 'none' });
  await luStandAt(d.padBack, d.padYaw, 10);
  await save(LU_BOOTH, 'lineup-celebrate', true);
  const ev = await events();
  expect(ev.filter((e) => e.type === 'result')).toEqual([
    { type: 'result', mechanic: 'lineup', kind: 'lineUp', tier: 1, hit: true },
    { type: 'result', mechanic: 'lineup', kind: 'lineUp', tier: 1, hit: false },
    { type: 'result', mechanic: 'lineup', kind: 'lineUp', tier: 1, hit: false },
    { type: 'result', mechanic: 'lineup', kind: 'lineUp', tier: 1, hit: true },
    { type: 'result', mechanic: 'lineup', kind: 'lineUp', tier: 1, hit: true },
  ]);
  expect(ev.some((e) => e.type === 'toast'), 'no gems before the prize').toBe(false);
  await luStep(240);
  d = await lineup();
  expect(['cooldown', 'idle']).toContain(d.phase);
  expect(d.gems).toBe(LINEUP_PRIZE[1][3]);
  expect(await luWallet()).toBe(before + LINEUP_PRIZE[1][3]);
  expect((await events()).some((e) => e.type === 'toast' && e.icon === 'gem')).toBe(true);
  // 3 of 5 keeps tier 1; the booth goes back to attract.
  expect(d.tier).toBe(1);
  await luStep(120);
  expect((await lineup()).kit.phase).toBe('idle');
});

test('line-up: walking away mid-round cancels it with no results for the bubbles never played', async () => {
  await events();
  const d = await lineup();
  await stepOnPad(d);
  expect((await lineup()).kit.phase).toBe('countdown');
  await luStep(200);
  expect((await lineup()).phase).toBe('play');
  const spot = await luFarSpot(d);
  await luStandAt(spot, spot.yaw, 3);
  const k = (await lineup()).kit;
  expect(k.phase).toBe('idle');
  expect((await lineup()).bubbles.every((b) => b.state === 'empty' || b.state === 'drift')).toBe(true);
  expect((await events()).filter((e) => e.type === 'result')).toEqual([]);
});

test('both mechanics stay within the draw budget and go idle when the player is far', async () => {
  await expectDrawBudget(page, 'oddone', 5);
  await expectDrawBudget(page, 'lineup', 5);
  // For each: walk off 85 m (any direction with land under it), beyond the far-idle radius.
  for (const id of ['oddone', 'lineup']) {
    const far = await page.evaluate((me) => {
      const rg = window.__rg!;
      const w = rg.ctx.world;
      const m = window.__rgGlasses!.sites().find((s) => s.id === me)!;
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2;
        const x = m.x + Math.sin(a) * 85;
        const z = m.z + Math.cos(a) * 85;
        if (!w.isLand(x, z) || w.heightAt(x, z) < w.waterLevel + 1) continue;
        rg.teleport(x, w.heightAt(x, z) + 0.1, z);
        break;
      }
      rg.step(1 / 60, 2, false);
      const p = rg.ctx.player.position;
      return Math.hypot(p.x - m.x, p.z - m.z);
    }, id);
    expect(far, id).toBeGreaterThan(70);
    expect(await page.evaluate((me) => window.__rgGlasses!.active(me), id), id).toBe(false);
  }
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
