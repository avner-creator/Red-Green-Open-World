/**
 * Cross-system wiring (main.ts glue): UI ↔ core input ↔ session ↔ audio, and the real player on
 * the real trampoline. One page, frozen loop, simulation-only stepping where pixels don't matter.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { boot, startGame } from './helpers';

test.describe.configure({ mode: 'serial' });

let page: Page;
let consoleErrors: string[] = [];

const phase = (): Promise<string> => page.evaluate(() => window.__rg!.state().phase);
const step = (n: number): Promise<void> => page.evaluate((k) => window.__rg!.step(1 / 60, k, false), n);

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  ({ consoleErrors } = await boot(page));
  await page.evaluate(async () => {
    const rg = window.__rg!;
    rg.freeze(true);
    // These checks (outfit on the head bone in every ride pose) are tuned on the robot; a new
    // profile now starts as the frog. The profile is the saved pick (Go in the select uses it).
    rg.ctx.profile.equip('character', 'robot');
    await rg.ctx.player.setCharacter('robot');
    const w = window as unknown as { __rgPauses: number };
    w.__rgPauses = 0;
    rg.ctx.events.on('session:phase', (e) => {
      if (e.phase === 'paused') w.__rgPauses++;
    });
  });
});

test.afterAll(async () => {
  await page.close();
});

const pauses = (): Promise<number> => page.evaluate(() => (window as unknown as { __rgPauses: number }).__rgPauses);

test('Play unlocks audio; Go on the character select starts the session', async () => {
  await page.evaluate(() => {
    const audio = window.__rg!.ctx.audio;
    const w = window as unknown as { __rgUnlocks: number };
    w.__rgUnlocks = 0;
    const orig = audio.unlock.bind(audio);
    audio.unlock = () => {
      w.__rgUnlocks++;
      orig();
    };
  });
  await startGame(page);
  expect(await page.evaluate(() => (window as unknown as { __rgUnlocks: number }).__rgUnlocks)).toBeGreaterThanOrEqual(1);
  expect(await phase()).toBe('playing');
  await step(2);
});

test('keyboard Esc pauses once, and the Esc that resumes does not pause again', async () => {
  await page.keyboard.press('Escape');
  await step(3);
  expect(await phase()).toBe('paused');
  await expect(page.getByTestId('resume')).toBeVisible();
  expect(await pauses()).toBe(1);
  // Esc key-up of the pausing press did not close the pause menu.
  await step(10);
  expect(await phase()).toBe('paused');

  await page.keyboard.press('Escape');
  await step(10);
  expect(await phase()).toBe('playing');
  expect(await pauses()).toBe(1);
});

test('pointer-lock loss pauses once (a trailing Esc key-up does not resume)', async () => {
  // Headless Chromium may really grant the lock on Play/resume; break it like the browser does.
  await page.evaluate(async () => {
    if (!document.pointerLockElement) {
      document.dispatchEvent(new Event('pointerlockchange'));
      return;
    }
    await new Promise<void>((done) => {
      document.addEventListener('pointerlockchange', () => done(), { once: true });
      document.exitPointerLock();
    });
  });
  await page.keyboard.up('Escape');
  await step(5);
  expect(await phase()).toBe('paused');
  expect(await pauses()).toBe(2);
  await page.getByTestId('resume').click();
  await step(5);
  expect(await phase()).toBe('playing');
  expect(await pauses()).toBe(2);
});

test('gamepad Start pauses, and Start again resumes, each exactly once', async () => {
  await page.evaluate(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = { id: 'test pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons };
    (window as unknown as { __rgPad: typeof pad }).__rgPad = pad;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
  });
  const start = (down: boolean): Promise<void> =>
    page.evaluate((d) => {
      const b = (window as unknown as { __rgPad: { buttons: { pressed: boolean; value: number }[] } }).__rgPad.buttons[9];
      b.pressed = d;
      b.value = d ? 1 : 0;
    }, down);

  await step(2);
  await start(true);
  await step(30); // held for half a second: must not toggle back
  expect(await phase()).toBe('paused');
  expect(await pauses()).toBe(3);
  await start(false);
  await step(5);
  await start(true);
  await step(30);
  expect(await phase()).toBe('playing');
  await start(false);
  await step(5);
  expect(await phase()).toBe('playing');
  expect(await pauses()).toBe(3);
  await page.evaluate(() => Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] }));
});

test('holding jump on the trampoline grows the bounce up to ~45 m and awards bigBounce', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const stunts: { kind: string; value: number }[] = [];
    const off = ctx.events.on('stunt', (e) => stunts.push({ kind: e.kind, value: e.value }));
    const a = ctx.world.anchors.trampoline.position;
    rg.teleport(a.x, ctx.world.heightAt(a.x, a.z) + 1.5, a.z);
    rg.inject({ jump: true });
    const apexes: number[] = [];
    let peak = -Infinity;
    let rising = false;
    let lastY = ctx.player.position.y;
    for (let i = 0; i < 60 * 30 && apexes.length < 9; i++) {
      rg.step(1 / 60, 1, false);
      const y = ctx.player.position.y;
      if (y > lastY + 1e-4) rising = true;
      else if (rising && y < lastY - 1e-4) {
        apexes.push(peak);
        rising = false;
        peak = -Infinity;
      }
      peak = Math.max(peak, y);
      lastY = y;
    }
    rg.inject(null);
    off();
    const matY = ctx.world.heightAt(a.x, a.z) + 1;
    return { apexes: apexes.map((y) => y - matY), stunts };
  });
  expect(r.apexes.length).toBeGreaterThanOrEqual(6);
  for (let i = 1; i < 4; i++) expect(r.apexes[i]).toBeGreaterThan(r.apexes[i - 1] + 0.5);
  const top = Math.max(...r.apexes);
  expect(top).toBeGreaterThan(43);
  expect(top).toBeLessThanOrEqual(45.5);
  const big = r.stunts.filter((s) => s.kind === 'bigBounce');
  expect(big.length).toBeGreaterThanOrEqual(3);
  expect(Math.max(...big.map((s) => s.value))).toBeLessThanOrEqual(45.5);
});

/**
 * Play-check: carry a chest key on a full balloon ride (auto-jump, steer along the gem trail,
 * auto-chute, land near the rings), open the chest, then ride again wearing the outfit. Checks
 * that pickups sit on the tilted body, the carried key keeps up and stays weak-eye only, and the
 * outfit stays on the body in every pose.
 */
test('balloon ride with a carried key, open the chest, ride again wearing the hat', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const THREE_V = ctx.player.position.constructor as new (x?: number, y?: number, z?: number) => typeof ctx.player.position;
    rg.start();
    rg.step(1 / 60, 3, false);
    const collected = new Set<string>();
    const offGem = ctx.events.on('gem:collected', (e) => collected.add(`${e.position.x.toFixed(2)},${e.position.z.toFixed(2)}`));
    const trail = ctx.world.gemSpots.filter((s) => s.tag === 'skydive').map((s) => s.position);
    const isTaken = (p: { x: number; z: number }): boolean => collected.has(`${p.x.toFixed(2)},${p.z.toFixed(2)}`);
    const rings = ctx.world.anchors.landingRings.position;
    const pad = ctx.world.anchors.balloon.position;
    const spin = ctx.player.object.children[0].children[0];
    const head = ctx.player.object.getObjectByName('attach-head')!;
    const centre = new THREE_V();
    const hp = new THREE_V();

    const ride = () => {
      const g = ctx.world.heightAt(pad.x, pad.z);
      rg.teleport(pad.x + 1.7, g + 0.4, pad.z, -Math.PI / 2);
      rg.step(1 / 60, 10, false);
      const focus = ctx.interactions.focused?.id ?? null;
      rg.inject({ usePressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      const canopy = ctx.scene.getObjectByName('canopy')!;
      const gemsBefore = collected.size;
      let maxPickupErr = 0;
      let maxKeyDist = 0;
      let freefallFrames = 0;
      let canopyFrames = 0;
      let headDevFree = 0;
      let headDevCanopy = 0;
      let bellyDown = true;
      let headUp = -Infinity;
      let headFwd = Infinity;
      let maxCamYawChange = 0;
      let lastCamYaw = ctx.cameraRig.yaw;
      let landedAt = -1;
      const dt = 1 / 30;
      ctx.player.object.updateMatrixWorld(true);
      const standHead = head.getWorldPosition(hp).distanceTo(spin.getWorldPosition(centre));
      for (let i = 0; i < 70 / dt; i++) {
        // Steer to the nearest trail gem still below us (camera-relative stick, like a player).
        const p = ctx.player.position;
        let inject: { moveX: number; moveY: number } | null = null;
        if (ctx.player.mode === 'external' && !canopy.visible && ctx.player.velocity.y < -5) {
          let best: { x: number; y: number; z: number } | null = null;
          for (const t of trail) if (!isTaken(t) && t.y < p.y - 1 && (!best || t.y > best.y)) best = t;
          if (best) {
            const dx = best.x - p.x;
            const dz = best.z - p.z;
            const l = Math.hypot(dx, dz);
            if (l > 0.5) {
              const s = Math.sin(ctx.cameraRig.yaw);
              const c = Math.cos(ctx.cameraRig.yaw);
              const k = Math.min(1, l / 4);
              inject = { moveY: (s * dx + c * dz) / l * k, moveX: (-c * dx + s * dz) / l * k };
            }
          }
        }
        if (ctx.player.mode === 'external' && canopy.visible) {
          // Under canopy: steer for the rings like a player would.
          const dx = rings.x - p.x;
          const dz = rings.z - p.z;
          const l = Math.hypot(dx, dz);
          if (l > 2) {
            const s = Math.sin(ctx.cameraRig.yaw);
            const c = Math.cos(ctx.cameraRig.yaw);
            inject = { moveY: (s * dx + c * dz) / l, moveX: (-c * dx + s * dz) / l };
          }
        }
        rg.inject(inject);
        rg.step(dt, 1, false);
        const yawNow = ctx.cameraRig.yaw;
        if (ctx.player.mode === 'external' && !canopy.visible && ctx.player.velocity.y > -1) {
          maxCamYawChange = Math.max(maxCamYawChange, Math.abs(yawNow - lastCamYaw));
        }
        lastCamYaw = yawNow;
        ctx.player.object.updateMatrixWorld(true);
        spin.getWorldPosition(centre);
        const falling = ctx.player.mode === 'external' && ctx.player.velocity.y < -20;
        if (falling) {
          freefallFrames++;
          const pick = new THREE_V(p.x, p.y + 0.85, p.z);
          maxPickupErr = Math.max(maxPickupErr, pick.distanceTo(centre));
          head.getWorldPosition(hp);
          headDevFree = Math.max(headDevFree, Math.abs(hp.distanceTo(centre) - standHead));
          if (freefallFrames > 30) {
            // Head ahead of the centre along the facing direction, not above it.
            const fwd = (hp.x - centre.x) * Math.sin(ctx.player.yaw) + (hp.z - centre.z) * Math.cos(ctx.player.yaw);
            headUp = Math.max(headUp, hp.y - centre.y);
            headFwd = Math.min(headFwd, fwd);
            if (fwd < 0.35) bellyDown = false;
          }
        }
        if (canopy.visible && ctx.player.mode === 'external') {
          canopyFrames++;
          headDevCanopy = Math.max(headDevCanopy, Math.abs(head.getWorldPosition(hp).distanceTo(centre) - standHead));
        }
        const k = window.__rgChests!.info()[0];
        if (k.keyState === 'carried') maxKeyDist = Math.max(maxKeyDist, Math.hypot(k.keyNow[0] - p.x, k.keyNow[1] - p.y, k.keyNow[2] - p.z));
        if (ctx.player.mode === 'walk' && i > 30) {
          landedAt = i * dt;
          break;
        }
      }
      rg.inject(null);
      rg.step(1 / 60, 20, false);
      const q = ctx.player.position;
      return {
        focus,
        landedAt,
        mode: ctx.player.mode,
        ringDist: Math.hypot(q.x - rings.x, q.z - rings.z),
        trailGems: collected.size - gemsBefore,
        maxPickupErr,
        maxKeyDist,
        freefallFrames,
        canopyFrames,
        headDevFree,
        headDevCanopy,
        bellyDown,
        headUp,
        headFwd,
        maxCamYawChange,
        tiltReset: spin.parent!.rotation.x === 0 && spin.parent!.position.lengthSq() === 0,
      };
    };

    // Pick up chest 0's key (hat chest), then ride carrying it.
    const c0 = window.__rgChests!.info()[0];
    rg.teleport(c0.key[0], ctx.world.heightAt(c0.key[0], c0.key[2]) + 0.1, c0.key[2], 0);
    rg.step(1 / 60, 24, false);
    const keyState = window.__rgChests!.info()[0].keyState;
    const ride1 = ride();

    // Open chest 0 by stepping on a button with its symbol.
    const rb = c0.buttons.find((b) => b.symbol === c0.symbol)!;
    const [ox, oz] = window.__rgChests!.sidePoint(0, 1, 4);
    rg.teleport(ox, ctx.world.heightAt(ox, oz) + 0.1, oz, Math.atan2(c0.position[0] - ox, c0.position[2] - oz));
    rg.step(1 / 60, 24, false);
    const chestFocus = ctx.interactions.focused?.id ?? null;
    rg.teleport(rb.x, ctx.world.heightAt(rb.x, rb.z) + 0.1, rb.z, Math.atan2(c0.position[0] - rb.x, c0.position[2] - rb.z));
    rg.step(1 / 60, 40, false);
    const afterOpen = rg.state();
    const hatWorn = head.children.length > 0;

    // The balloon floats back to its pad (~16 s after the jump) before it can be boarded again.
    rg.step(1 / 30, 120, false);
    const ride2 = ride();
    offGem();
    return { keyState, ride1, chestFocus, chests: afterOpen.chests, outfits: afterOpen.outfits, hatWorn, ride2, hatAfter: head.children.length > 0, keyInMainScene: ctx.scene.getObjectByName('chest-key') !== undefined };
  });
  expect(r.keyState).toBe('carried');
  for (const ride of [r.ride1, r.ride2]) {
    expect(ride.focus).toBe('balloon');
    expect(ride.landedAt).toBeGreaterThan(20);
    expect(ride.mode).toBe('walk');
    expect(ride.ringDist).toBeLessThan(20);
    expect(ride.freefallFrames).toBeGreaterThan(60);
    expect(ride.canopyFrames).toBeGreaterThan(60);
    expect(ride.maxPickupErr).toBeLessThan(0.1);
    expect(ride.bellyDown).toBe(true);
    expect(ride.tiltReset).toBe(true);
    expect(ride.maxCamYawChange).toBeGreaterThan(0);
  }
  expect(r.ride1.trailGems).toBeGreaterThanOrEqual(3);
  // The carried key orbits ~1.8 m from the feet; it must keep up at freefall speed.
  expect(r.ride1.maxKeyDist).toBeGreaterThan(1);
  expect(r.ride1.maxKeyDist).toBeLessThan(2.6);
  expect(r.keyInMainScene).toBe(false);
  expect(r.chestFocus).toBe('chest0-lock');
  expect(r.chests).toBe(1);
  expect(r.outfits).toEqual(['hat-explorer']);
  expect(r.hatWorn).toBe(true);
  expect(r.hatAfter).toBe(true);
  // The hat stays on the head bone in every pose (only the animation moves the head a little).
  expect(r.ride2.headDevFree).toBeLessThan(0.15);
  expect(r.ride2.headDevCanopy).toBeLessThan(0.15);
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
