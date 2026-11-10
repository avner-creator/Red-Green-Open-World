import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { boot } from './helpers';

test.describe.configure({ mode: 'serial' });

// One page for the whole file (a boot costs several seconds on SwiftShader); every test starts a
// fresh session with rg.start().
let page: Page;
let consoleErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
});

test.afterAll(async () => {
  await page.close();
});

test('balloon skydive: ride up, auto-jump, auto-chute, soft landing in walk mode', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3, false);

    // Record the last wind loop intensity and camera override.
    const loops: Record<string, number> = {};
    const setLoop = ctx.audio.setLoop.bind(ctx.audio);
    ctx.audio.setLoop = (name, intensity, pitch) => {
      loops[name] = intensity;
      setLoop(name, intensity, pitch);
    };
    let override: unknown = null;
    const setOverride = ctx.cameraRig.setOverride.bind(ctx.cameraRig);
    ctx.cameraRig.setOverride = (o) => {
      override = o;
      setOverride(o);
    };
    const stunts: { kind: string; stars: number }[] = [];
    ctx.events.on('stunt', (e) => stunts.push({ kind: e.kind, stars: e.stars }));

    const a = ctx.world.anchors.balloon.position;
    const groundAtPad = ctx.world.heightAt(a.x, a.z);
    rg.teleport(a.x + 1.7, groundAtPad + 0.4, a.z, -Math.PI / 2);
    rg.step(1 / 60, 10, false);
    const focus = ctx.interactions.focused?.icon ?? null;
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    const modeAfterUse = ctx.player.mode;

    const canopy = ctx.scene.getObjectByName('canopy');
    let maxAgl = 0;
    let maxAboveDeck = 0;
    let chuteAgl: number | null = null;
    let maxFall = 0;
    let fellBelowTop = false;
    let landedAt = -1;
    const dt = 1 / 30;
    for (let i = 0; i < 60 / dt; i++) {
      rg.step(dt, 1, false);
      const p = ctx.player.position;
      const agl = p.y - ctx.world.heightAt(p.x, p.z);
      maxAgl = Math.max(maxAgl, agl);
      maxAboveDeck = Math.max(maxAboveDeck, p.y - groundAtPad);
      if (maxAboveDeck > 170 && p.y - groundAtPad < maxAboveDeck - 20) fellBelowTop = true;
      maxFall = Math.max(maxFall, -ctx.player.velocity.y);
      if (chuteAgl === null && canopy?.visible) chuteAgl = agl;
      if (ctx.player.mode === 'walk') {
        landedAt = i * dt;
        break;
      }
    }
    // A few walking frames on the ground after the hand-back.
    rg.step(1 / 60, 20, false);
    const p = ctx.player.position;
    return {
      focus,
      modeAfterUse,
      maxAboveDeck,
      maxAgl,
      fellBelowTop,
      chuteAgl,
      maxFall,
      landedAt,
      mode: rg.state().playerMode,
      onLand: ctx.world.isLand(p.x, p.z),
      groundGap: p.y - ctx.world.heightAt(p.x, p.z),
      speed: ctx.player.velocity.length(),
      wind: loops.wind ?? null,
      override,
      rotX: ctx.player.object.rotation.x,
      canopyVisible: canopy?.visible ?? null,
      stunts,
      errors: rg.errors,
    };
  });
  expect(r.focus).toBe('balloon');
  expect(r.modeAfterUse).toBe('external');
  expect(r.maxAboveDeck).toBeGreaterThan(178);
  expect(r.maxAboveDeck).toBeLessThan(186);
  expect(r.fellBelowTop).toBe(true);
  expect(r.chuteAgl).not.toBeNull();
  expect(r.chuteAgl!).toBeLessThanOrEqual(40.5);
  expect(r.chuteAgl!).toBeGreaterThan(25);
  expect(r.maxFall).toBeGreaterThan(30);
  expect(r.maxFall).toBeLessThan(39);
  expect(r.landedAt).toBeGreaterThan(20);
  expect(r.mode).toBe('walk');
  expect(r.onLand).toBe(true);
  expect(Math.abs(r.groundGap)).toBeLessThan(0.6);
  expect(r.speed).toBeLessThan(2);
  expect(r.wind).toBe(0);
  expect(r.override).toBeNull();
  expect(r.rotX).toBe(0);
  expect(r.canopyVisible).toBe(false);
  expect(r.errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('R during the balloon ride respawns at the pad and releases the ride', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3, false);
    const a = ctx.world.anchors.balloon.position;
    const g = ctx.world.heightAt(a.x, a.z);
    rg.teleport(a.x + 1.7, g + 0.4, a.z, -Math.PI / 2);
    rg.step(1 / 60, 5, false);
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 30, 120, false);
    const high = ctx.player.position.y - g;
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 30, false);
    const p = ctx.player.position;
    return { high, mode: ctx.player.mode, dist: Math.hypot(p.x - a.x, p.z - a.z), gap: p.y - ctx.world.heightAt(p.x, p.z) };
  });
  expect(r.high).toBeGreaterThan(30);
  expect(r.mode).toBe('walk');
  expect(r.dist).toBeLessThan(8);
  expect(Math.abs(r.gap)).toBeLessThan(0.6);
  expect(consoleErrors).toEqual([]);
});
