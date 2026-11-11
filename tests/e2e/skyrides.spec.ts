/**
 * Sky rides (stream O): the stunt-plane sky contest and the friendly dragon, played through to a
 * result with simulation-only stepping, plus the channel test for their weak-eye-only objects in all
 * 4 lens/eye combinations. Screenshots (full, R-only, G-only) go to test-results/sky-rides/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot, channelDiff } from './helpers';
import type { EyeSettings } from '../../src/types';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/sky-rides';
let page: Page;
let consoleErrors: string[] = [];

const COMBOS: Array<{ eye: Pick<EyeSettings, 'leftLens' | 'weakEye'>; weak: 'r' | 'g'; strong: 'r' | 'g' }> = [
  { eye: { leftLens: 'red', weakEye: 'left' }, weak: 'r', strong: 'g' },
  { eye: { leftLens: 'red', weakEye: 'right' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'left' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'right' }, weak: 'r', strong: 'g' },
];

/** Save the canvas as full colour plus R-only and G-only greyscale images. */
function saveChannels(img: PNG, name: string): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}-full.png`, PNG.sync.write(img));
  for (const [c, k] of [['R', 0], ['G', 1]] as const) {
    const out = new PNG({ width: img.width, height: img.height });
    for (let i = 0; i < img.data.length; i += 4) {
      const v = img.data[i + k];
      out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
      out.data[i + 3] = 255;
    }
    writeFileSync(`${OUT}/${name}-${c}.png`, PNG.sync.write(out));
  }
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  // A "kid who tries" for the contest: steers at the next armed hoop (bonus ones too), drops water
  // balloons and does a trick now and then. Installed once on the page.
  await page.evaluate(() => {
    const w = window as unknown as { __kid: (t: number) => Record<string, number | boolean> | null };
    const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
    const ad = (a: number, b: number): number => {
      let d = (b - a) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d <= -Math.PI) d += Math.PI * 2;
      return d;
    };
    w.__kid = (t) => {
      const sky = window.__rgSky!;
      const c = sky.plane.contest;
      if (sky.plane.phase !== 'race' || !c) return null;
      const p = window.__rg!.ctx.player.position;
      const yaw = window.__rg!.ctx.player.yaw;
      let best: { x: number; y: number; z: number } | null = null;
      let bd = Infinity;
      for (const h of [...c.hoops, ...c.bonus]) {
        if (h.cool > 0) continue;
        const dx = h.pos.x - p.x;
        const dz = h.pos.z - p.z;
        const d = Math.hypot(dx, dz);
        const fwd = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / Math.max(d, 1);
        if (fwd < 0.2 || d > 120) continue;
        const sc = d * (1.6 - fwd);
        if (sc < bd) {
          bd = sc;
          best = h.pos;
        }
      }
      const inj: Record<string, number | boolean> = { moveX: 0, moveY: 0 };
      if (best) {
        inj.moveX = clamp(-ad(yaw, Math.atan2(best.x - p.x, best.z - p.z)) * 2.5, -1, 1);
        inj.moveY = clamp((best.y - (p.y + 0.85)) / 5, -1, 1);
      }
      if (Math.floor(t / 7) !== Math.floor((t - 1 / 30) / 7)) inj.skillPressed = true;
      if (Math.floor(t / 0.7) !== Math.floor((t - 1 / 30) / 0.7)) inj.jumpPressed = true;
      return inj;
    };
  });
});

test.afterAll(async () => {
  await page.close();
});

test('stunt plane: E boards, 3-2-1, take-off, a full contest, auto landing, podium, walk mode', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const sky = window.__rgSky!;
    const ctx = rg.ctx;
    const kid = (window as unknown as { __kid: (t: number) => Record<string, number | boolean> | null }).__kid;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3, false);
    const loops: Record<string, number> = {};
    const setLoop = ctx.audio.setLoop.bind(ctx.audio);
    ctx.audio.setLoop = (name, intensity, pitch) => {
      loops[name] = intensity;
      setLoop(name, intensity, pitch);
    };
    let override: unknown = 'unset';
    const setOverride = ctx.cameraRig.setOverride.bind(ctx.cameraRig);
    ctx.cameraRig.setOverride = (o) => {
      override = o;
      setOverride(o);
    };
    let gems = 0;
    ctx.events.on('gem:collected', () => gems++);
    // Walk up to the parked plane.
    rg.teleport(-16, ctx.world.heightAt(-16, 41) + 0.3, 41, Math.PI / 2);
    rg.step(1 / 60, 10, false);
    const focus = ctx.interactions.focused?.id ?? null;
    sky.plane.contestSeconds = 30;
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    const modeAfterUse = ctx.player.mode;
    const phases: string[] = [sky.plane.phase];
    const dt = 1 / 30;
    let t = 0;
    let gemTest: { y: number; picked: boolean } | null = null;
    let maxAgl = 0;
    for (let i = 0; i < 3000 && sky.plane.phase !== 'idle'; i++) {
      if (sky.plane.phase === 'race' && !gemTest) {
        // Gem pickup at speed: line up 40 m before a floating Glow Gem and boost straight through.
        const spot = ctx.world.gemSpots.filter((s) => s.tag === 'skydive' && s.position.y < 85 && s.position.y > 25).sort((a, b) => a.position.y - b.position.y)[0];
        if (spot) {
          const g = spot.position;
          const before = gems;
          sky.plane.testPose(g.x, g.y - 0.85, g.z - 40, 0);
          for (let k = 0; k < 75; k++) {
            rg.inject({ sprint: true });
            rg.step(dt, 1, false);
          }
          rg.inject(null);
          gemTest = { y: g.y, picked: gems > before };
        } else gemTest = { y: -1, picked: true };
      }
      rg.inject(kid(t));
      rg.step(dt, 1, false);
      t += dt;
      const p = ctx.player.position;
      if (sky.plane.phase === 'race') maxAgl = Math.max(maxAgl, p.y - ctx.world.heightAt(p.x, p.z));
      if (phases[phases.length - 1] !== sky.plane.phase) phases.push(sky.plane.phase);
    }
    rg.inject(null);
    rg.step(1 / 60, 20, false);
    const p = ctx.player.position;
    const podium = document.querySelector('[data-testid="sky-podium"]');
    return {
      focus,
      modeAfterUse,
      phases,
      gemTest,
      maxAgl,
      result: sky.plane.lastResult,
      mode: ctx.player.mode,
      onLand: ctx.world.isLand(p.x, p.z),
      groundGap: p.y - ctx.world.heightAt(p.x, p.z),
      distToPlane: Math.hypot(p.x + 12, p.z - 41),
      wind: loops.wind ?? null,
      engine: loops.engine ?? null,
      override,
      podiumOn: podium?.classList.contains('on') ?? false,
      errors: rg.errors,
    };
  });
  console.log(`sky contest (30 s): ${JSON.stringify(r.result)}`);
  expect(r.focus).toBe('sky-plane');
  expect(r.modeAfterUse).toBe('external');
  expect(r.phases).toEqual(['board', 'countdown', 'takeoff', 'race', 'landing', 'rollout', 'idle']);
  expect(r.gemTest?.picked).toBe(true);
  expect(r.maxAgl).toBeGreaterThan(10);
  expect(r.result).not.toBeNull();
  // A kid who tries beats the friends.
  expect(r.result!.place).toBe(1);
  expect(r.result!.score).toBeGreaterThan(10);
  expect(r.result!.stars).toBeGreaterThanOrEqual(1);
  expect(r.mode).toBe('walk');
  expect(r.onLand).toBe(true);
  expect(Math.abs(r.groundGap)).toBeLessThan(0.6);
  expect(r.distToPlane).toBeLessThan(8);
  expect(r.wind).toBe(0);
  expect(r.engine).toBe(0);
  expect(r.override).toBeNull();
  expect(r.podiumOn).toBe(true);
  expect(r.errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('R during the contest leaves safely: on foot beside the plane, nothing left running', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const sky = window.__rgSky!;
    const ctx = rg.ctx;
    rg.teleport(-16, ctx.world.heightAt(-16, 41) + 0.3, 41, Math.PI / 2);
    rg.step(1 / 60, 10, false);
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    for (let i = 0; i < 400 && sky.plane.phase !== 'race'; i++) rg.step(1 / 30, 1, false);
    rg.step(1 / 30, 60, false);
    const high = ctx.player.position.y - ctx.world.heightAt(ctx.player.position.x, ctx.player.position.z);
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 30, false);
    const p = ctx.player.position;
    return {
      high,
      phase: sky.plane.phase,
      mode: ctx.player.mode,
      groundGap: p.y - ctx.world.heightAt(p.x, p.z),
      distToPlane: Math.hypot(p.x + 12, p.z - 41),
      canTake: sky.canTake(),
      contestShown: ctx.scene.getObjectByName('sky-contest')?.visible ?? null,
      rivalsShown: ctx.scene.getObjectByName('sky-rivals')?.visible ?? null,
      errors: rg.errors,
    };
  });
  expect(r.high).toBeGreaterThan(8);
  expect(r.contestShown).toBe(false);
  expect(r.rivalsShown).toBe(false);
  expect(r.phase).toBe('idle');
  expect(r.mode).toBe('walk');
  expect(Math.abs(r.groundGap)).toBeLessThan(0.6);
  expect(r.distToPlane).toBeLessThan(8);
  expect(r.canTake).toBe(true);
  expect(r.errors).toEqual([]);
});

test('friendly dragon: feed a treat, ride, treasure at speed, glide home, land on the roost', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const sky = window.__rgSky!;
    const ctx = rg.ctx;
    let override: unknown = 'unset';
    const setOverride = ctx.cameraRig.setOverride.bind(ctx.cameraRig);
    ctx.cameraRig.setOverride = (o) => {
      override = o;
      setOverride(o);
    };
    rg.teleport(-32.6, ctx.world.heightAt(-32.6, -125.2) + 0.3, -125.2, Math.PI);
    rg.step(1 / 60, 10, false);
    const focus = ctx.interactions.focused?.id ?? null;
    sky.dragon.tourSeconds = 22;
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    const phases: string[] = [sky.dragon.phase];
    let treasureTest: { before: number; after: number } | null = null;
    let maxAgl = 0;
    const dt = 1 / 30;
    for (let i = 0; i < 2400 && sky.dragon.phase !== 'idle'; i++) {
      if (sky.dragon.phase === 'tour' && !treasureTest) {
        // Treasure at speed: aim at a trail treasure from 30 m and swoop through it.
        const spot = sky.dragon.treasureSpots[4];
        const before = sky.dragon.treasure;
        sky.dragon.testPose(spot.x, spot.y - 2.5, spot.z - 30, 0);
        for (let k = 0; k < 60; k++) {
          rg.inject({ sprint: true });
          rg.step(dt, 1, false);
        }
        rg.inject({ jumpPressed: true });
        rg.step(dt, 1, false);
        rg.inject({ skillPressed: true });
        rg.step(dt, 1, false);
        rg.inject(null);
        treasureTest = { before, after: sky.dragon.treasure };
      }
      rg.step(dt, 1, false);
      const p = ctx.player.position;
      if (sky.dragon.phase === 'tour') maxAgl = Math.max(maxAgl, p.y - ctx.world.heightAt(p.x, p.z));
      if (phases[phases.length - 1] !== sky.dragon.phase) phases.push(sky.dragon.phase);
    }
    rg.step(1 / 60, 20, false);
    const p = ctx.player.position;
    return {
      focus,
      phases,
      treasureTest,
      maxAgl,
      befriended: sky.dragon.befriended,
      last: sky.dragon.lastTour,
      mode: ctx.player.mode,
      onLand: ctx.world.isLand(p.x, p.z),
      groundGap: p.y - ctx.world.heightAt(p.x, p.z),
      distToRoost: Math.hypot(p.x + 34, p.z + 130),
      override,
      errors: rg.errors,
    };
  });
  console.log(`dragon tour (22 s): ${JSON.stringify(r.last)}`);
  expect(r.focus).toBe('sky-dragon');
  expect(r.phases).toEqual(['feed', 'mount', 'launch', 'tour', 'return', 'land', 'dismount', 'idle']);
  expect(r.treasureTest!.after).toBeGreaterThan(r.treasureTest!.before);
  expect(r.maxAgl).toBeGreaterThan(12);
  expect(r.befriended).toBe(true);
  expect(r.last).not.toBeNull();
  expect(r.last!.stars).toBeGreaterThanOrEqual(1);
  expect(r.mode).toBe('walk');
  expect(r.onLand).toBe(true);
  expect(Math.abs(r.groundGap)).toBeLessThan(0.6);
  expect(r.distToRoost).toBeLessThan(8);
  expect(r.override).toBeNull();
  expect(r.errors).toEqual([]);
});

test('sky rides never take the player from another ride', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const sky = window.__rgSky!;
    const ctx = rg.ctx;
    const onFoot = sky.canTake();
    const a = ctx.world.anchors.balloon.position;
    rg.teleport(a.x + 1.7, ctx.world.heightAt(a.x, a.z) + 0.4, a.z, -Math.PI / 2);
    rg.step(1 / 60, 5, false);
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 30, 30, false);
    const onBalloon = { mode: ctx.player.mode, canTake: sky.canTake(), plane: sky.plane.phase, dragon: sky.dragon.phase };
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 30, false);
    return { onFoot, onBalloon, after: sky.canTake(), errors: rg.errors };
  });
  expect(r.onFoot).toBe(true);
  expect(r.onBalloon.mode).toBe('external');
  expect(r.onBalloon.canTake).toBe(false);
  expect(r.onBalloon.plane).toBe('idle');
  expect(r.onBalloon.dragon).toBe('idle');
  expect(r.after).toBe(true);
  expect(r.errors).toEqual([]);
});

const maxOf = (d: ReturnType<typeof channelDiff>, c: 'r' | 'g' | 'b'): number => (c === 'r' ? d.maxR : c === 'g' ? d.maxG : d.maxB);

async function frame(skyWeak: boolean): Promise<PNG> {
  await page.evaluate((v) => {
    window.__rgSky!.setWeakVisible(v);
    window.__rg!.render();
  }, skyWeak);
  return canvasShot(page);
}

test('weak-eye-only sky objects touch only the weak channel (all 4 combos), plane and dragon', async () => {
  test.setTimeout(180_000);
  // Plane: fly the contest for a moment with the bonus hoops, golden clouds and best line in view.
  await page.evaluate(() => {
    const rg = window.__rg!;
    const sky = window.__rgSky!;
    const ctx = rg.ctx;
    rg.setEye({ leftLens: 'red', weakEye: 'left', weakStrength: 1, crosstalkLimit: 1, strongContrast: 1 });
    rg.teleport(-16, ctx.world.heightAt(-16, 41) + 0.3, 41, Math.PI / 2);
    rg.step(1 / 60, 10, false);
    sky.plane.contestSeconds = 60;
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    for (let i = 0; i < 400 && sky.plane.phase !== 'race'; i++) rg.step(1 / 30, 1, false);
    // Line up behind a bonus hoop so it fills part of the view.
    const b = sky.plane.contest!.bonus[1];
    const n = b.normal;
    const yaw = Math.atan2(n.x, n.z);
    sky.plane.testPose(b.pos.x - Math.sin(yaw) * 40, b.pos.y - 1.5, b.pos.z - Math.cos(yaw) * 40, yaw);
    rg.step(1 / 60, 40, true);
  });
  for (const [k, combo] of COMBOS.entries()) {
    await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);
    const withSky = await frame(true);
    const without = await frame(false);
    if (k === 0) saveChannels(withSky, 'plane-contest');
    const d = channelDiff(withSky, without);
    const tag = `plane ${combo.eye.leftLens}/${combo.eye.weakEye}`;
    expect(d[combo.weak], tag).toBeGreaterThan(150);
    expect(maxOf(d, combo.strong), tag).toBe(0);
    expect(d.maxB, tag).toBe(0);
  }
  await page.evaluate(() => {
    const rg = window.__rg!;
    window.__rgSky!.setWeakVisible(true);
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 10, false);
  });

  // Dragon: on the tour, looking along the treasure trail with a golden cloud nearby.
  await page.evaluate(() => {
    const rg = window.__rg!;
    const sky = window.__rgSky!;
    const ctx = rg.ctx;
    rg.setEye({ leftLens: 'red', weakEye: 'left' });
    rg.teleport(-32.6, ctx.world.heightAt(-32.6, -125.2) + 0.3, -125.2, Math.PI);
    rg.step(1 / 60, 10, false);
    sky.dragon.tourSeconds = 60;
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    for (let i = 0; i < 400 && sky.dragon.phase !== 'tour'; i++) rg.step(1 / 30, 1, false);
    const a = sky.dragon.treasureSpots[6];
    const b = sky.dragon.treasureSpots[7];
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    sky.dragon.testPose(a.x - Math.sin(yaw) * 22, a.y - 2.8, a.z - Math.cos(yaw) * 22, yaw);
    rg.step(1 / 60, 30, true);
  });
  for (const [k, combo] of COMBOS.entries()) {
    await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);
    const withSky = await frame(true);
    const without = await frame(false);
    if (k === 0) saveChannels(withSky, 'dragon-tour');
    const d = channelDiff(withSky, without);
    const tag = `dragon ${combo.eye.leftLens}/${combo.eye.weakEye}`;
    expect(d[combo.weak], tag).toBeGreaterThan(40);
    expect(maxOf(d, combo.strong), tag).toBe(0);
    expect(d.maxB, tag).toBe(0);
  }
  const errors = await page.evaluate(() => {
    const rg = window.__rg!;
    window.__rgSky!.setWeakVisible(true);
    rg.setEye({ leftLens: 'red', weakEye: 'left' });
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 10, false);
    return rg.errors;
  });
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
