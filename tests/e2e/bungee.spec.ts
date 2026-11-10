/**
 * Bungee bridge: a full jump from the deck to the shore (walk mode at the end, camera handed back,
 * never below ground + 2 m), cancel with R, the winch back up, and screenshots (full / R-only /
 * G-only) of the big moments in test-results/bungee/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { SHOTS, boot } from './helpers';

const OUT = 'test-results/bungee';

function splitChannel(png: PNG, c: number): Buffer {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    const v = png.data[i + c];
    o.data[i] = o.data[i + 1] = o.data[i + 2] = v;
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

async function save(name: string): Promise<void> {
  const buf = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
  const png = PNG.sync.read(buf);
  writeFileSync(`${OUT}/${name}-full.png`, buf);
  writeFileSync(`${OUT}/${name}-R.png`, splitChannel(png, 0));
  writeFileSync(`${OUT}/${name}-G.png`, splitChannel(png, 1));
}

test.describe.configure({ mode: 'serial' });

let page: Page;
let consoleErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  ({ consoleErrors } = await boot(page));
});

test.afterAll(async () => {
  await page.close();
});

test('bungee: E on the bridge, dive, boings, lowered onto the shore in walk mode', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3, false);
    const info = window.__rgBungee!.info()!;
    let override: unknown = 'unset';
    const setOverride = ctx.cameraRig.setOverride.bind(ctx.cameraRig);
    ctx.cameraRig.setOverride = (o) => {
      override = o;
      setOverride(o);
    };
    const loops: Record<string, number> = {};
    const setLoop = ctx.audio.setLoop.bind(ctx.audio);
    ctx.audio.setLoop = (name, intensity, pitch) => {
      loops[name] = intensity;
      setLoop(name, intensity, pitch);
    };
    const stunts: { kind: string; stars: number; value: number }[] = [];
    ctx.events.on('stunt', (e) => stunts.push({ kind: e.kind, stars: e.stars, value: e.value }));
    const deck = info.deck;
    // Stand on the deck in front of the platform.
    rg.teleport(info.board[0] + 2.6, deck + 0.3, info.board[2], -Math.PI / 2);
    rg.step(1 / 60, 20, false);
    const focus = ctx.interactions.focused?.id ?? null;
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    const modeAfterUse = ctx.player.mode;
    const phases: string[] = [];
    let minClear = Infinity;
    let maxRebound = -Infinity;
    let fallStartedAt = -1;
    let bottomSeen = false;
    let fallingFast = false;
    let landedAt = -1;
    const dt = 1 / 30;
    for (let i = 0; i < 40 / dt; i++) {
      rg.step(dt, 1, false);
      const ph = window.__rgBungee!.phase();
      if (phases[phases.length - 1] !== ph) phases.push(ph);
      const p = ctx.player.position;
      if (ph === 'fall') {
        if (fallStartedAt < 0) fallStartedAt = i;
        minClear = Math.min(minClear, p.y - ctx.world.heightAt(p.x, p.z));
        if (ctx.player.velocity.y < -8) fallingFast = true;
        if (fallingFast && ctx.player.velocity.y > 0) bottomSeen = true;
        if (bottomSeen) maxRebound = Math.max(maxRebound, p.y);
      }
      if (ctx.player.mode === 'walk') {
        landedAt = i * dt;
        break;
      }
    }
    const landing = info.landing;
    const p = ctx.player.position;
    const dist = Math.hypot(p.x - landing[0], p.z - landing[2]);
    rg.step(1 / 60, 30, false);
    const q = ctx.player.position;
    return {
      info,
      focus,
      modeAfterUse,
      phases,
      minClear,
      reboundBelowDeck: deck - maxRebound,
      landedAt,
      dist,
      mode: rg.state().playerMode,
      groundGap: q.y - ctx.world.heightAt(q.x, q.z),
      speed: ctx.player.velocity.length(),
      override,
      wind: loops.wind ?? null,
      stunts,
      last: window.__rgBungee!.last(),
      rotX: ctx.player.object.rotation.x,
      errors: rg.errors,
    };
  });
  console.log(JSON.stringify(r));
  expect(r.focus).toBe('bungee');
  expect(r.modeAfterUse).toBe('external');
  expect(r.phases).toEqual(['attach', 'windup', 'fall', 'lower', 'landed', 'idle']);
  expect(r.minClear).toBeGreaterThanOrEqual(2);
  expect(r.reboundBelowDeck).toBeLessThan(6);
  expect(r.landedAt).toBeGreaterThan(8);
  expect(r.dist).toBeLessThan(1.5);
  expect(r.mode).toBe('walk');
  expect(Math.abs(r.groundGap)).toBeLessThan(0.6);
  expect(r.speed).toBeLessThan(2);
  expect(r.override).toBeNull();
  expect(r.wind).toBe(0);
  expect(r.stunts.some((s) => s.kind === 'bungee' && s.stars >= 1)).toBe(true);
  expect(r.errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

/** Start a fresh session, stand in front of the platform and press E. */
async function startJump(): Promise<void> {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3, false);
    const info = window.__rgBungee!.info()!;
    rg.teleport(info.board[0] + 2.6, info.deck + 0.3, info.board[2], -Math.PI / 2);
    rg.step(1 / 60, 20, false);
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
  });
}

/** Step until `pred` is true (or `max` seconds), then render one frame. */
async function stepUntil(fn: string, max: number): Promise<void> {
  await page.evaluate(
    ([src, maxT]) => {
      const rg = window.__rg!;
      const pred = new Function('rg', 'b', `return (${src});`) as (rg: unknown, b: unknown) => boolean;
      for (let t = 0; t < (maxT as number); t += 1 / 30) {
        if (pred(rg, window.__rgBungee)) break;
        rg.step(1 / 30, 1, false);
      }
      rg.step(1 / 60, 1, true);
    },
    [fn, max] as const,
  );
}

test('R cancels the bungee safely onto the deck and hands the camera back', async () => {
  await startJump();
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const info = window.__rgBungee!.info()!;
    rg.step(1 / 30, 190, false); // attach, wind-up (auto dive at 4 s), mid-fall
    const during = window.__rgBungee!.phase();
    const low = ctx.player.position.y;
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 30, false);
    const p = ctx.player.position;
    return { during, low, deck: info.deck, mode: ctx.player.mode, phase: window.__rgBungee!.phase(), y: p.y, x: p.x, board: info.board, errors: rg.errors };
  });
  expect(['fall', 'lower']).toContain(r.during);
  expect(r.low).toBeLessThan(r.deck - 5);
  expect(r.mode).toBe('walk');
  expect(r.phase).toBe('idle');
  expect(Math.abs(r.y - r.deck)).toBeLessThan(0.6);
  expect(r.x).toBeGreaterThan(r.board[0]);
  expect(r.errors).toEqual([]);
});

test('the winch on the shore hauls you back up to the deck', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3, false);
    const info = window.__rgBungee!.info()!;
    rg.teleport(info.winch[0] + 1.2, info.landing[1] + 0.2, info.winch[2] + 0.5, 0);
    rg.step(1 / 60, 30, false);
    const focus = ctx.interactions.focused?.id ?? null;
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    let maxY = -Infinity;
    for (let i = 0; i < 8 * 30 && ctx.player.mode !== 'walk'; i++) {
      rg.step(1 / 30, 1, false);
      maxY = Math.max(maxY, ctx.player.position.y);
    }
    rg.step(1 / 60, 30, false);
    return { focus, mode: ctx.player.mode, y: ctx.player.position.y, deck: info.deck, maxY, errors: rg.errors };
  });
  expect(r.focus).toBe('bungee-winch');
  expect(r.mode).toBe('walk');
  expect(Math.abs(r.y - r.deck)).toBeLessThan(0.6);
  expect(r.errors).toEqual([]);
});

test('bungee screenshots (full / R / G)', async () => {
  await startJump();
  await stepUntil("b.phase() === 'windup'", 3);
  await stepUntil('false', 0.6);
  await save('windup');
  await stepUntil("b.phase() === 'fall' && rg.ctx.player.velocity.y < -14", 6);
  await save('dive');
  if (SHOTS) {
    await stepUntil("rg.ctx.player.velocity.y > 0", 4);
    await save('bottom');
    await stepUntil("b.phase() === 'lower'", 12);
    await stepUntil('false', 2.5);
    await save('lower');
    await stepUntil("b.phase() === 'landed'", 6);
    await save('landed');
  }
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 10, true);
  });
  await save('platform');
  expect(consoleErrors).toEqual([]);
});
