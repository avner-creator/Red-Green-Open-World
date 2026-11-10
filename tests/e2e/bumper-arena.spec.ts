/**
 * Bubble Ball and Dino Sumo (Stream L): a full round of each from the booth to the result card and
 * back to walking, a replay, and canvas-readback channel tests: the weak-eye bonus pieces (Bubble
 * Ball's hoops and ball sparkle, Dino Sumo's magic water balloons) change only the weak channel —
 * the strong channel and blue stay bit-identical — for all 4 lens/eye combinations.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot, channelDiff } from './helpers';
import type { EyeSettings } from '../../src/types';

test.describe.configure({ mode: 'serial' });

let page: Page;
let consoleErrors: string[] = [];
const OUT = 'test-results/bumper-arena';

const COMBOS: Array<{ eye: Pick<EyeSettings, 'leftLens' | 'weakEye'>; weak: 'r' | 'g'; strong: 'r' | 'g' }> = [
  { eye: { leftLens: 'red', weakEye: 'left' }, weak: 'r', strong: 'g' },
  { eye: { leftLens: 'red', weakEye: 'right' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'left' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'right' }, weak: 'r', strong: 'g' },
];
const maxOf = (d: ReturnType<typeof channelDiff>, c: 'r' | 'g' | 'b'): number => (c === 'r' ? d.maxR : c === 'g' ? d.maxG : d.maxB);

/** Save the canvas as full + R-only + G-only images. */
function saveChannels(img: PNG, name: string): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}-full.png`, PNG.sync.write(img));
  for (const [c, tag] of [
    [0, 'R'],
    [1, 'G'],
  ] as const) {
    const o = new PNG({ width: img.width, height: img.height });
    for (let i = 0; i < img.data.length; i += 4) {
      o.data[i] = o.data[i + 1] = o.data[i + 2] = img.data[i + c];
      o.data[i + 3] = 255;
    }
    writeFileSync(`${OUT}/${name}-${tag}.png`, PNG.sync.write(o));
  }
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3, false);
  });
});

test.afterAll(async () => {
  await page.close();
});

test('Bubble Ball: E at the booth, friends join, a full 60 s match to the result card, R leaves', async () => {
  const r = await page.evaluate(async () => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const bb = window.__rgBubbleBall!;
    const stunts: { stars: number }[] = [];
    const toasts: string[] = [];
    const offs = [ctx.events.on('stunt', (e) => stunts.push({ stars: e.stars })), ctx.events.on('ui:toast', (e) => toasts.push(`${e.icon}:${e.text ?? ''}`))];
    const [bx, , bz] = bb.booth();
    rg.teleport(bx, ctx.world.heightAt(bx, bz) + 0.1, bz);
    rg.step(1 / 60, 10, false);
    const focus = ctx.interactions.focused?.id ?? null;
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    const modeAfterUse = ctx.player.mode;
    // Friends load once (real network time), then the 3-2-1.
    for (let i = 0; i < 400 && bb.phase() === 'loading'; i++) {
      rg.step(1 / 60, 1, false);
      await new Promise((res) => setTimeout(res, 25));
    }
    const phaseAfterLoad = bb.phase();
    const startClock = bb.match()?.clock ?? -1;
    // Play: roll at the far goal, weaving, hopping now and then.
    let maxDist = 0;
    const p0 = ctx.player.position.clone();
    let frames = 0;
    for (let i = 0; i < 2400 && bb.phase() === 'match'; i++) {
      rg.inject({ moveY: 1, moveX: Math.sin(i / 25) * 0.6, sprint: true, jumpPressed: i % 40 === 0 });
      rg.step(1 / 20, 1, false);
      maxDist = Math.max(maxDist, ctx.player.position.distanceTo(p0));
      frames++;
    }
    rg.inject(null);
    rg.step(1 / 60, 20, false);
    rg.step(1 / 60, 1);
    const m = bb.match();
    const result = {
      focus,
      modeAfterUse,
      phaseAfterLoad,
      startClock,
      maxDist,
      frames,
      phaseEnd: bb.phase(),
      score: m ? [m.home, m.away] : null,
      card: document.querySelector('[data-testid="bubbleball-hud-result"]')?.classList.contains('on') ?? false,
      stunts: stunts.length,
      lastStars: stunts.at(-1)?.stars ?? 0,
      toasts,
      friends: bb.friendsLoaded(),
      triangles: bb.triangles(),
    };
    offs.forEach((o) => o());
    return result;
  });
  saveChannels(await canvasShot(page), 'e2e-bubble-result');
  expect(r.focus).toBe('bubbleball');
  expect(r.modeAfterUse).toBe('external');
  expect(r.phaseAfterLoad).toBe('match');
  expect(r.startClock).toBe(60);
  expect(r.friends).toBeGreaterThanOrEqual(5);
  expect(r.maxDist).toBeGreaterThan(5);
  expect(r.phaseEnd).toBe('result');
  expect(r.card).toBe(true);
  expect(r.lastStars).toBeGreaterThanOrEqual(1);
  expect(r.toasts.some((t) => t.startsWith('check:'))).toBe(true);
  expect(r.triangles).toBeLessThan(40_000);

  // R leaves: back on foot beside the booth.
  const after = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 30, false);
    const [bx, , bz] = window.__rgBubbleBall!.booth();
    const p = rg.ctx.player.position;
    return { mode: rg.ctx.player.mode, phase: window.__rgBubbleBall!.phase(), dist: Math.hypot(p.x - bx, p.z - bz), card: document.querySelector('[data-testid="bubbleball-hud-result"]')?.classList.contains('on') };
  });
  expect(after.mode).toBe('walk');
  expect(after.phase).toBe('idle');
  expect(after.dist).toBeLessThan(5);
  expect(after.card).toBe(false);
});

test('Bubble Ball: the bonus hoop and the charged-ball sparkle touch only the weak channel (all 4 combos)', async () => {
  const ok = await page.evaluate(async () => {
    const rg = window.__rg!;
    const bb = window.__rgBubbleBall!;
    bb.start(); // friends are cached now
    for (let i = 0; i < 200 && bb.phase() === 'loading'; i++) {
      rg.step(1 / 60, 1, false);
      await new Promise((res) => setTimeout(res, 10));
    }
    rg.step(1 / 60, 30, false);
    // A hoop right ahead of the hero (the camera looks down the pitch), and a charged ball.
    bb.ring(2.5, 0.6);
    bb.charge();
    rg.step(1 / 60, 30, false);
    rg.step(1 / 60, 1);
    return bb.phase() === 'match' && !!bb.match()?.ring;
  });
  expect(ok).toBe(true);
  const frame = async (on: boolean): Promise<PNG> => {
    await page.evaluate((v) => {
      window.__rgBubbleBall!.layer(v);
      window.__rg!.render();
    }, on);
    return canvasShot(page);
  };
  for (const combo of COMBOS) {
    await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);
    const withLayer = await frame(true);
    const without = await frame(false);
    const d = channelDiff(withLayer, without);
    const tag = `${combo.eye.leftLens}/${combo.eye.weakEye}`;
    expect(d[combo.weak], tag).toBeGreaterThan(300);
    expect(maxOf(d, combo.strong), tag).toBe(0);
    expect(d.maxB, tag).toBe(0);
    if (combo.weak === 'r' && combo.eye.leftLens === 'red') saveChannels(withLayer, 'e2e-bubble-weak');
  }
  await page.evaluate(() => {
    const rg = window.__rg!;
    window.__rgBubbleBall!.layer(true);
    rg.setEye({ leftLens: 'red', weakEye: 'left' });
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 5, false);
  });
  expect(await page.evaluate(() => window.__rgBubbleBall!.phase())).toBe('idle');
});

test('Dino Sumo: the magic water balloons touch only the weak channel (all 4 combos)', async () => {
  const setup = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const ds = window.__rgDinoSumo!;
    const p = ds.world(0, 0, -10.5);
    const c = ds.world(0, 1.5, 0);
    rg.teleport(p[0], ctx.world.heightAt(p[0], p[2]) + 0.1, p[2], Math.atan2(c[0] - p[0], c[2] - p[2]));
    rg.step(1 / 60, 90, false);
    rg.step(1 / 60, 1);
    return ds.balloons().filter((b) => b.kind === 'weak').length;
  });
  expect(setup).toBeGreaterThan(0);
  const frame = async (on: boolean): Promise<PNG> => {
    await page.evaluate((v) => {
      window.__rgDinoSumo!.layer(v);
      window.__rg!.render();
    }, on);
    return canvasShot(page);
  };
  for (const combo of COMBOS) {
    await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);
    const withLayer = await frame(true);
    const without = await frame(false);
    const d = channelDiff(withLayer, without);
    const tag = `${combo.eye.leftLens}/${combo.eye.weakEye}`;
    expect(d[combo.weak], tag).toBeGreaterThan(40);
    expect(maxOf(d, combo.strong), tag).toBe(0);
    expect(d.maxB, tag).toBe(0);
    if (combo.weak === 'r' && combo.eye.leftLens === 'red') saveChannels(withLayer, 'e2e-sumo-idle');
  }
  await page.evaluate(() => {
    window.__rgDinoSumo!.layer(true);
    window.__rg!.setEye({ leftLens: 'red', weakEye: 'left' });
  });
});

test('Dino Sumo: a full 45 s round to the result card; E plays again (beat ring + balloons weak-only, 4 combos); R leaves', async () => {
  const r = await page.evaluate(async () => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const ds = window.__rgDinoSumo!;
    const [bx, , bz] = ds.booth();
    rg.teleport(bx, ctx.world.heightAt(bx, bz) + 0.1, bz);
    rg.step(1 / 60, 10, false);
    const focus = ctx.interactions.focused?.id ?? null;
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    for (let i = 0; i < 400 && ds.phase() === 'loading'; i++) {
      rg.step(1 / 60, 1, false);
      await new Promise((res) => setTimeout(res, 25));
    }
    const phaseAfterLoad = ds.phase();
    let maxPoints = 0;
    for (let i = 0; i < 2000 && ds.phase() === 'round'; i++) {
      rg.inject({ moveY: 1, moveX: Math.cos(i / 18), sprint: i % 3 === 0, jumpPressed: i % 12 === 0 });
      rg.step(1 / 20, 1, false);
      maxPoints = Math.max(maxPoints, ...(ds.state()?.points ?? [0]));
    }
    rg.inject(null);
    rg.step(1 / 60, 20, false);
    rg.step(1 / 60, 1);
    const st = ds.state();
    return {
      focus,
      phaseAfterLoad,
      phaseEnd: ds.phase(),
      clock: st?.clock ?? -1,
      maxPoints,
      mode: ctx.player.mode,
      card: document.querySelector('[data-testid="dinosumo-hud-result"]')?.classList.contains('on') ?? false,
    };
  });
  saveChannels(await canvasShot(page), 'e2e-sumo-result');
  expect(r.focus).toBe('dinosumo');
  expect(r.phaseAfterLoad).toBe('round');
  expect(r.phaseEnd).toBe('result');
  expect(r.clock).toBe(0);
  expect(r.maxPoints).toBeGreaterThan(0);
  expect(r.mode).toBe('external');
  expect(r.card).toBe(true);

  const again = await page.evaluate(() => {
    const rg = window.__rg!;
    const ds = window.__rgDinoSumo!;
    rg.step(1 / 60, 30, false); // the card ignores presses for its first moment
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    const phase = ds.phase();
    const clock = ds.state()?.clock;
    rg.step(1 / 60, 60 * 4, false);
    rg.step(1 / 60, 1);
    return { phase, clock };
  });
  saveChannels(await canvasShot(page), 'e2e-sumo-round');
  // Replays cost a ticket only when the economy is present; without it the game is free.
  expect(again.phase).toBe('round');
  expect(again.clock).toBe(45);
  // Live round: the weak-eye beat ring round the hero and the magic balloons, all 4 combos.
  expect(await page.evaluate(() => window.__rg!.ctx.vision.channels().weak)).toBe('r');
  for (const combo of COMBOS) {
    await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);
    const shots: PNG[] = [];
    for (const v of [true, false]) {
      await page.evaluate((on) => {
        window.__rgDinoSumo!.layer(on);
        window.__rg!.render();
      }, v);
      shots.push(await canvasShot(page));
    }
    const d = channelDiff(shots[0], shots[1]);
    const tag = `${combo.eye.leftLens}/${combo.eye.weakEye}`;
    expect(d[combo.weak], tag).toBeGreaterThan(100);
    expect(maxOf(d, combo.strong), tag).toBe(0);
    expect(d.maxB, tag).toBe(0);
  }
  await page.evaluate(() => {
    window.__rgDinoSumo!.layer(true);
    window.__rg!.setEye({ leftLens: 'red', weakEye: 'left' });
  });
  const left = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 20, false);
    return { mode: rg.ctx.player.mode, phase: window.__rgDinoSumo!.phase() };
  });
  expect(left).toEqual({ mode: 'walk', phase: 'idle' });
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
