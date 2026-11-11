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
    const rings = ctx.world.anchors.landingRings.position;
    const ringDist = Math.hypot(ctx.player.position.x - rings.x, ctx.player.position.z - rings.z);
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
      ringDist,
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
  // Hands-off: the freefall drifts along the trail and the canopy autopilot lands in the rings.
  console.log(`hands-off landing ${r.ringDist.toFixed(2)} m from the ring centre`);
  expect(r.ringDist).toBeLessThanOrEqual(12);
  expect(r.stunts.some((s) => s.kind === 'bullseye' && s.stars >= 1)).toBe(true);
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

test('walk into the basket and wait: 3-2-1 countdown, then up (no button press)', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3, false);
    const pad = ctx.world.anchors.balloon.position;
    const hop = ctx.scene.getObjectByName('balloon-hop-pad');
    const g = ctx.world.heightAt(pad.x, pad.z);
    // Start 6 m out on the entrance side (towards spawn) and walk straight at the basket.
    const sp = ctx.world.anchors.spawn.position;
    const l = Math.hypot(sp.x - pad.x, sp.z - pad.z);
    const ux = (sp.x - pad.x) / l;
    const uz = (sp.z - pad.z) / l;
    rg.teleport(pad.x + ux * 6, ctx.world.heightAt(pad.x + ux * 6, pad.z + uz * 6) + 0.1, pad.z + uz * 6, Math.atan2(-ux, -uz));
    rg.step(1 / 30, 2, false);
    let labels = '';
    let boardedAt = -1;
    for (let i = 0; i < 150 && boardedAt < 0; i++) {
      const p = ctx.player.position;
      const near = Math.hypot(p.x - pad.x, p.z - pad.z) < 1.6;
      if (!near) {
        const cy = ctx.cameraRig.yaw;
        let dx = pad.x - p.x;
        let dz = pad.z - p.z;
        const ll = Math.hypot(dx, dz) || 1;
        dx /= ll;
        dz /= ll;
        rg.inject({ moveX: -dx * Math.cos(cy) + dz * Math.sin(cy), moveY: dx * Math.sin(cy) + dz * Math.cos(cy) });
      } else rg.inject(null);
      rg.step(1 / 30, 1, false);
      const el = document.querySelector('[data-testid="skydive-prompt"].on .key');
      const t = el?.textContent ?? '';
      if (t && !labels.endsWith(t)) labels += t;
      if (ctx.player.mode === 'external') boardedAt = i / 30;
    }
    rg.inject(null);
    rg.step(1 / 30, 60, false);
    const up = ctx.player.position.y - g;
    // Release for the next test.
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 30, false);
    return { hop: !!hop, labels, boardedAt, up, errors: rg.errors };
  });
  console.log(JSON.stringify(r));
  expect(r.hop).toBe(true);
  expect(r.labels).toContain('321');
  expect(r.boardedAt).toBeGreaterThan(0);
  expect(r.up).toBeGreaterThan(2);
  expect(r.errors).toEqual([]);
});

test('holding forward for the whole ride still lands on the island near the rings, with a prize', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3, false);
    const stunts: { kind: string; stars: number }[] = [];
    const off = ctx.events.on('stunt', (e) => stunts.push({ kind: e.kind, stars: e.stars }));
    const a = ctx.world.anchors.balloon.position;
    const g = ctx.world.heightAt(a.x, a.z);
    rg.teleport(a.x + 1.7, g + 0.4, a.z, -Math.PI / 2);
    rg.step(1 / 60, 5, false);
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    const wallet0 = ctx.profile.wallet;
    let maxRing = 0;
    let respawned = false;
    const offR = ctx.events.on('player:respawn', () => (respawned = true));
    const rings = ctx.world.anchors.landingRings.position;
    for (let i = 0; i < 90 * 30; i++) {
      // Hold forward (and tap Space now and then, like a child would) the whole time.
      rg.inject({ moveY: 1, jumpPressed: i % 20 === 0 });
      rg.step(1 / 30, 1, false);
      const p = ctx.player.position;
      if (ctx.player.mode === 'external') maxRing = Math.max(maxRing, Math.hypot(p.x - rings.x, p.z - rings.z));
      if (ctx.player.mode === 'walk' && i > 60) break;
    }
    rg.inject(null);
    rg.step(1 / 30, 10, false);
    off();
    offR();
    const p = ctx.player.position;
    return {
      ringDist: Math.hypot(p.x - rings.x, p.z - rings.z),
      maxRing,
      onLand: ctx.world.isLand(p.x, p.z),
      respawned,
      prize: ctx.profile.wallet - wallet0,
      stars: stunts.filter((s) => s.kind === 'bullseye').reduce((n, s) => n + s.stars, 0),
      errors: rg.errors,
    };
  });
  console.log(JSON.stringify(r));
  expect(r.respawned).toBe(false);
  expect(r.onLand).toBe(true);
  expect(r.maxRing).toBeLessThan(75);
  expect(r.ringDist).toBeLessThan(40);
  expect(r.stars > 0 || r.prize > 0).toBe(true);
  expect(r.errors).toEqual([]);
});
