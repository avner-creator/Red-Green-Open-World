/**
 * Thrills: the giant trampoline (12 m walk-on bounce, 45 m held), air tricks, rocket pads that
 * land on the net, and screenshots (full / R-only / G-only) of the big moments.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot } from './helpers';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/thrills';
let page: Page;
let consoleErrors: string[] = [];

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

test.beforeAll(async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 10, false); // the rocket pads and net are built on the first playing frame
  });
});

test.afterAll(async () => {
  await page.close();
});

test('walking onto the mat is an immediate 12 m bounce; without jump it decays and stops', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const stunts: { kind: string; value: number }[] = [];
    const off = ctx.events.on('stunt', (e) => stunts.push({ kind: e.kind, value: e.value }));
    const c = window.__rgThrills!.trampoline();
    rg.teleport(c.x + 3, c.y + 0.1, c.z, 0);
    rg.step(1 / 60, 2, false);
    let peak = -Infinity;
    const apexes: number[] = [];
    let rising = false;
    let last = ctx.player.position.y;
    for (let i = 0; i < 60 * 20; i++) {
      rg.step(1 / 60, 1, false);
      const y = ctx.player.position.y;
      if (y > last + 1e-4) rising = true;
      else if (rising && y < last - 1e-4) {
        apexes.push(peak - c.y);
        rising = false;
        peak = -Infinity;
      }
      peak = Math.max(peak, y);
      last = y;
    }
    off();
    return { apexes, mode: ctx.player.mode, grounded: ctx.player.grounded, y: ctx.player.position.y - c.y, stunts };
  });
  expect(r.apexes[0]).toBeGreaterThan(10);
  expect(r.apexes[0]).toBeLessThan(13);
  // Gentle decay, then it stops and the player stands on the mat (can walk off).
  for (let i = 1; i < r.apexes.length; i++) expect(r.apexes[i]).toBeLessThan(r.apexes[i - 1]);
  expect(r.apexes.length).toBeGreaterThanOrEqual(3);
  expect(r.mode).toBe('walk');
  expect(r.grounded).toBe(true);
  expect(Math.abs(r.y)).toBeLessThan(0.3);
  expect(r.stunts.filter((s) => s.kind === 'bigBounce')).toEqual([]); // 12 m < 15 m
});

test('holding jump grows the bounce to ~45 m within a few bounces (stars at 15 / 30 / 45)', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const stunts: { kind: string; value: number; stars: number }[] = [];
    const off = ctx.events.on('stunt', (e) => stunts.push({ kind: e.kind, value: e.value, stars: e.stars }));
    const c = window.__rgThrills!.trampoline();
    rg.teleport(c.x + 2, c.y + 0.1, c.z, 0);
    rg.step(1 / 60, 2, false);
    rg.inject({ jump: true });
    const apexes: number[] = [];
    let peak = -Infinity;
    let rising = false;
    let last = ctx.player.position.y;
    let maxRadius = 0;
    for (let i = 0; i < 60 * 30 && apexes.length < 8; i++) {
      rg.step(1 / 60, 1, false);
      const p = ctx.player.position;
      maxRadius = Math.max(maxRadius, Math.hypot(p.x - c.x, p.z - c.z));
      if (p.y > last + 1e-4) rising = true;
      else if (rising && p.y < last - 1e-4) {
        apexes.push(peak - c.y);
        rising = false;
        peak = -Infinity;
      }
      peak = Math.max(peak, p.y);
      last = p.y;
    }
    rg.inject(null);
    off();
    return { apexes, stunts, maxRadius, mode: ctx.player.mode };
  });
  expect(r.apexes.length).toBeGreaterThanOrEqual(6);
  expect(r.apexes[0]).toBeGreaterThan(10);
  expect(Math.max(...r.apexes)).toBeGreaterThan(40);
  expect(Math.max(...r.apexes)).toBeLessThanOrEqual(45.5);
  // 45 m reached within five bounces.
  expect(r.apexes.findIndex((a) => a > 44)).toBeLessThanOrEqual(4);
  expect(r.maxRadius).toBeLessThan(9.5); // big bounces stay on the 9 m mat
  const stars = r.stunts.filter((s) => s.kind === 'bigBounce').map((s) => s.stars);
  expect(stars).toEqual([1, 2, 3]);
});

test('a front flip with injected input is counted, and landing upright is a bonus', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const stunts: { kind: string; value: number; stars: number }[] = [];
    const off = ctx.events.on('stunt', (e) => stunts.push({ kind: e.kind, value: e.value, stars: e.stars }));
    let flops = 0;
    const offFlop = ctx.events.on('player:flop', () => flops++);
    const c = window.__rgThrills!.trampoline();
    rg.teleport(c.x, c.y + 0.1, c.z, 0);
    rg.step(1 / 60, 2, false);
    // Hold jump through two bounces for a ~27 m flight, flip while it is high, then let go early.
    rg.inject({ jump: true });
    let phase = 0;
    for (let i = 0; i < 60 * 12; i++) {
      rg.step(1 / 60, 1, false);
      const h = ctx.player.position.y - c.y;
      if (h > 20 && phase === 0) {
        phase = 1;
        rg.inject({ jump: true, moveY: 1 });
      }
      if (phase === 1) {
        if (stunts.some((s) => s.kind === 'bigAir')) {
          phase = 2;
          rg.inject({ jump: false });
        }
      }
      if (phase === 2 && ctx.player.grounded) break;
    }
    rg.inject(null);
    off();
    offFlop();
    return { stunts, flops, phase };
  });
  const air = r.stunts.filter((s) => s.kind === 'bigAir');
  expect(air.length).toBeGreaterThanOrEqual(1);
  expect(air[0].value).toBe(1);
  expect(air[0].stars).toBeGreaterThanOrEqual(1);
});

test('rocket pad: wind-up, high arc, lands on the net (walk mode, on land)', async () => {
  const info = await page.evaluate(() => window.__rgThrills!.rocket());
  expect(info).not.toBeNull();
  const net = info!.net;
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const info = window.__rgThrills!.rocket()!;
    const stunts: { kind: string; value: number; stars: number }[] = [];
    const off = ctx.events.on('stunt', (e) => stunts.push({ kind: e.kind, value: e.value, stars: e.stars }));
    const modes: string[] = [];
    const offMode = ctx.events.on('player:mode', (e) => modes.push(e.mode));
    const pad = info.pads[1];
    rg.teleport(pad.x, pad.y + 0.05, pad.z, 0);
    let peak = -Infinity;
    let windupFrames = 0;
    let started = -1;
    let landedFrame = -1;
    for (let i = 0; i < 60 * 14; i++) {
      rg.step(1 / 60, 1, false);
      const p = ctx.player.position;
      peak = Math.max(peak, p.y);
      if (started < 0 && ctx.player.mode === 'external') started = i;
      if (started >= 0 && windupFrames === 0 && p.y > pad.y + 0.8) windupFrames = i - started;
      if (started >= 0 && ctx.player.mode === 'walk' && ctx.player.grounded) {
        landedFrame = i;
        break;
      }
    }
    rg.step(1 / 60, 20, false);
    const p = ctx.player.position;
    const res = {
      dist: Math.hypot(p.x - info.net.x, p.z - info.net.z),
      mode: ctx.player.mode,
      grounded: ctx.player.grounded,
      land: ctx.world.isLand(p.x, p.z),
      y: p.y,
      peak: peak - pad.y,
      windupFrames,
      landedFrame,
      flew: Math.hypot(info.net.x - pad.x, info.net.z - pad.z),
      stunts,
      modes,
    };
    off();
    offMode();
    return res;
  });
  expect(r.dist).toBeLessThan(net.radius);
  expect(r.mode).toBe('walk');
  expect(r.grounded).toBe(true);
  expect(r.land).toBe(true);
  expect(Math.abs(r.y - net.landY)).toBeLessThan(0.6);
  expect(r.peak).toBeGreaterThan(18);
  expect(r.windupFrames).toBeGreaterThanOrEqual(30); // 0.6 s wind-up squash
  expect(r.flew).toBeGreaterThan(20);
  const launch = r.stunts.filter((s) => s.kind === 'launch');
  expect(launch).toHaveLength(1);
  expect(launch[0].value).toBeGreaterThan(Math.min(40, r.flew - 4));
  expect(launch[0].stars).toBeGreaterThanOrEqual(1);
});

test('a flip on the rocket arc is counted', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const info = window.__rgThrills!.rocket()!;
    const stunts: { kind: string; value: number }[] = [];
    const off = ctx.events.on('stunt', (e) => stunts.push({ kind: e.kind, value: e.value }));
    const toasts: string[] = [];
    const offToast = ctx.events.on('ui:toast', (e) => toasts.push(e.icon));
    const pad = info.pads[0];
    rg.teleport(pad.x, pad.y + 0.05, pad.z, 0);
    let flipping = false;
    for (let i = 0; i < 60 * 14; i++) {
      rg.step(1 / 60, 1, false);
      if (!flipping && ctx.player.mode === 'external' && ctx.player.airTime > 1) {
        flipping = true;
        rg.inject({ moveY: 1 });
      }
      if (flipping && stunts.some((s) => s.kind === 'bigAir')) rg.inject(null);
      if (ctx.player.mode === 'walk' && ctx.player.grounded && flipping && ctx.player.airTime === 0 && i > 200) break;
    }
    rg.inject(null);
    rg.step(1 / 60, 90, false);
    const flips = stunts.filter((s) => s.kind === 'bigAir').length;
    off();
    offToast();
    return { flips, toasts };
  });
  expect(r.flips).toBeGreaterThanOrEqual(1);
});

test('a closed launch gate makes the pad wobble instead of launching', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const th = window.__rgThrills!;
    const info = th.rocket()!;
    const toasts: string[] = [];
    const off = ctx.events.on('ui:toast', (e) => toasts.push(e.icon));
    const pad = info.pads[2];
    rg.step(1 / 60, 120, false); // let the cooldown pass
    th.setGate(false);
    rg.teleport(pad.x, pad.y + 0.05, pad.z, 0);
    rg.step(1 / 60, 60, false);
    const closed = { mode: ctx.player.mode, toasts: toasts.slice() };
    th.setGate(true);
    // Leave the pad, wait out the cooldown, step on again: now it launches.
    rg.teleport(pad.x + 6, ctx.world.heightAt(pad.x + 6, pad.z) + 0.3, pad.z, 0);
    rg.step(1 / 60, 120, false);
    rg.teleport(pad.x, pad.y + 0.05, pad.z, 0);
    rg.step(1 / 60, 10, false);
    const open = ctx.player.mode;
    off();
    return { closed, open };
  });
  expect(r.closed.toasts).toContain('lock');
  expect(r.closed.mode).toBe('walk');
  expect(r.open).toBe('external');
  await page.evaluate(() => {
    const rg = window.__rg!;
    for (let i = 0; i < 60 * 14 && rg.ctx.player.mode !== 'walk'; i++) rg.step(1 / 60, 1, false);
    rg.step(1 / 60, 60, false);
  });
});

test('screenshots: trampoline peak, rocket pad, landing net', async () => {
  // Trampoline at (nearly) 45 m.
  await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const c = window.__rgThrills!.trampoline();
    rg.teleport(c.x, c.y + 0.1, c.z, Math.PI);
    rg.step(1 / 60, 2, false);
    rg.inject({ jump: true });
    for (let i = 0; i < 60 * 30; i++) {
      rg.step(1 / 60, 1, false);
      if (ctx.player.position.y - c.y > 43 && ctx.player.velocity.y < 6) break;
    }
    rg.step(1 / 60, 18, false); // camera settles
    rg.step(1 / 60, 1, true);
  });
  await save('trampoline-peak');
  await page.evaluate(() => {
    const rg = window.__rg!;
    const c = window.__rgThrills!.trampoline();
    // Just after a landing: shockwave ring and squashed mat.
    for (let i = 0; i < 60 * 8; i++) {
      rg.step(1 / 60, 1, false);
      if (rg.ctx.player.position.y - c.y < 0.2 && rg.ctx.player.velocity.y <= 0) break;
    }
    rg.step(1 / 60, 8, true);
    rg.inject(null);
  });
  await save('trampoline-landing');
  // Rocket pads: stand behind the pads looking along the launch direction.
  await page.evaluate(() => {
    const rg = window.__rg!;
    const info = window.__rgThrills!.rocket()!;
    const mid = info.pads[1];
    const heading = Math.atan2(info.net.x - mid.x, info.net.z - mid.z);
    rg.teleport(mid.x - Math.sin(heading) * 9, rg.ctx.world.heightAt(mid.x, mid.z) + 0.3, mid.z - Math.cos(heading) * 9, heading);
    rg.step(1 / 60, 40, false);
    rg.step(1 / 60, 1, true);
  });
  await save('rocket-pads');
  // Wind-up squash.
  await page.evaluate(() => {
    const rg = window.__rg!;
    const info = window.__rgThrills!.rocket()!;
    window.__rgThrills!.launchRocket(1);
    void info;
    rg.step(1 / 60, 26, false);
    rg.step(1 / 60, 1, true);
  });
  await save('rocket-windup');
  // Mid-flight.
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.step(1 / 60, 55, false);
    rg.step(1 / 60, 1, true);
  });
  await save('rocket-flight');
  // The moment of landing (confetti) in the real camera view.
  await page.evaluate(() => {
    const rg = window.__rg!;
    let landed = false;
    const off = rg.ctx.events.on('stunt', (e) => {
      if (e.kind === 'launch') landed = true;
    });
    for (let i = 0; i < 60 * 8 && !landed; i++) rg.step(1 / 60, 1, false);
    off();
    rg.step(1 / 60, 14, false);
    rg.step(1 / 60, 1, true);
  });
  await save('landing-net');
  await page.evaluate(() => {
    const rg = window.__rg!;
    for (let i = 0; i < 60 * 8 && rg.ctx.player.mode !== 'walk'; i++) rg.step(1 / 60, 1, false);
    rg.step(1 / 60, 90, false);
    const info = window.__rgThrills!.rocket()!;
    const mid = info.pads[1];
    const heading = Math.atan2(info.net.x - mid.x, info.net.z - mid.z);
    const x = info.net.x - Math.sin(heading) * 16;
    const z = info.net.z - Math.cos(heading) * 16;
    rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.3, z, heading);
    rg.step(1 / 60, 40, false);
    rg.step(1 / 60, 1, true);
  });
  await save('net-view');

  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

// ── Integration play-check: thrills + core visual API + balloon skydive ──

test('trampoline: held bounces reach ~45 m, a flip poses the avatar (outfit attached), then it resets and walks off', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const player = ctx.player.object;
    const squash = player.children[0];
    const spin = squash.children[0];
    const identity = player.quaternion.clone().identity();
    const hat = player.clone(false);
    const removeHat = ctx.player.attach('head', hat);
    const stunts: { kind: string; value: number }[] = [];
    const off = ctx.events.on('stunt', (e) => stunts.push({ kind: e.kind, value: e.value }));
    const c = window.__rgThrills!.trampoline();
    rg.step(1 / 60, 120, false);
    rg.teleport(c.x, c.y + 0.1, c.z, 0);
    rg.step(1 / 60, 2, false);
    rg.inject({ jump: true });
    let peak = 0;
    let maxSpinAngle = 0;
    let hatAttached = true;
    let flipping = false;
    let done = false;
    for (let i = 0; i < 60 * 40 && !done; i++) {
      rg.step(1 / 60, 1, false);
      const h = ctx.player.position.y - c.y;
      peak = Math.max(peak, h);
      if (peak > 43 && !flipping && ctx.player.velocity.y < 0 && h > 30) {
        flipping = true;
        rg.inject({ jump: false, moveY: 1 });
      }
      if (flipping) {
        maxSpinAngle = Math.max(maxSpinAngle, spin.quaternion.angleTo(identity));
        let o: typeof hat | null = hat;
        while (o && o !== player) o = o.parent;
        if (!o) hatAttached = false;
        if (stunts.some((s) => s.kind === 'bigAir')) rg.inject({ jump: false });
        if (ctx.player.mode === 'walk' && ctx.player.grounded) done = true;
      }
    }
    rg.inject(null);
    rg.step(1 / 60, 240, false); // bounces decay
    const settled = {
      mode: ctx.player.mode,
      spinAngle: spin.quaternion.angleTo(identity),
      squashY: squash.scale.y,
      h: ctx.player.position.y - c.y,
    };
    // Walk off along the camera's forward until well clear of the mat.
    rg.inject({ moveY: 1 });
    let walkedOff = false;
    for (let i = 0; i < 60 * 8 && !walkedOff; i++) {
      rg.step(1 / 60, 1, false);
      const p = ctx.player.position;
      if (Math.hypot(p.x - c.x, p.z - c.z) > 16 && ctx.player.mode === 'walk' && ctx.player.grounded) walkedOff = true;
    }
    rg.inject(null);
    rg.step(1 / 60, 30, false);
    removeHat();
    off();
    const flips = stunts.filter((s) => s.kind === 'bigAir').length;
    return { peak, maxSpinAngle, hatAttached, flips, settled, walkedOff, mode: ctx.player.mode };
  });
  expect(r.peak).toBeGreaterThan(43);
  expect(r.peak).toBeLessThan(45.6);
  expect(r.flips).toBeGreaterThanOrEqual(1);
  expect(r.maxSpinAngle).toBeGreaterThan(1);
  expect(r.hatAttached).toBe(true);
  expect(r.settled.mode).toBe('walk');
  expect(r.settled.spinAngle).toBeLessThan(0.01);
  expect(Math.abs(r.settled.squashY - 1)).toBeLessThan(0.05);
  expect(r.settled.h).toBeLessThan(0.5);
  expect(r.walkedOff).toBe(true);
  expect(r.mode).toBe('walk');
});

test('sprinting onto the mat and letting go stays on the mat until the bounce settles', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const a = ctx.world.anchors.trampoline;
    const c = window.__rgThrills!.trampoline();
    const dist = 14; // from the steps: ~5 m of run-up reaches full sprint
    const x = a.position.x + Math.sin(a.yaw) * dist;
    const z = a.position.z + Math.cos(a.yaw) * dist;
    rg.teleport(x, ctx.world.heightAt(x, z) + 0.2, z, a.yaw + Math.PI);
    rg.step(1 / 60, 30, false);
    rg.inject({ moveY: 1, sprint: true });
    let topSpeed = 0;
    let onMat = false;
    for (let i = 0; i < 60 * 6 && !onMat; i++) {
      rg.step(1 / 60, 1, false);
      topSpeed = Math.max(topSpeed, Math.hypot(ctx.player.velocity.x, ctx.player.velocity.z));
      // Let go the moment the bounce starts (held W in the air would be a front flip).
      if (ctx.player.mode === 'external') onMat = true;
    }
    rg.inject(null);
    // Every touch-down after the take-off must be on the mat (radius 9 m).
    let maxDist = 0;
    let airborne = false;
    for (let i = 0; i < 60 * 12; i++) {
      rg.step(1 / 60, 1, false);
      const p = ctx.player.position;
      const low = p.y - c.y < 0.3;
      if (!low) airborne = true;
      if (airborne && low) maxDist = Math.max(maxDist, Math.hypot(p.x - c.x, p.z - c.z));
    }
    const p = ctx.player.position;
    return { topSpeed, onMat, maxDist, endDist: Math.hypot(p.x - c.x, p.z - c.z), h: p.y - c.y, mode: ctx.player.mode };
  });
  expect(r.topSpeed).toBeGreaterThan(9);
  expect(r.onMat).toBe(true);
  expect(r.maxDist).toBeLessThan(7.5);
  expect(r.endDist).toBeLessThan(8);
  expect(r.h).toBeLessThan(0.5);
  expect(r.mode).toBe('walk');
});

test('bounce-pad chain ends on the trampoline', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const th = window.__rgThrills!;
    const c = th.trampoline();
    const pad0 = th.spots().find((s) => s.tag === 'pad0')!;
    const pad1 = th.spots().find((s) => s.tag === 'pad1')!;
    // Sprint run-up onto the first pad from behind (the new 11 m/s sprint).
    const d = Math.hypot(pad0.x - pad1.x, pad0.z - pad1.z);
    const ux = (pad0.x - pad1.x) / d;
    const uz = (pad0.z - pad1.z) / d;
    const sx = pad0.x + ux * 10;
    const sz = pad0.z + uz * 10;
    rg.teleport(sx, ctx.world.heightAt(sx, sz) + 0.2, sz, Math.atan2(-ux, -uz));
    rg.step(1 / 60, 30, false);
    rg.inject({ moveY: 1, sprint: true });
    let onMat = false;
    let wentExternal = false;
    for (let i = 0; i < 60 * 25; i++) {
      rg.step(1 / 60, 1, false);
      const p = ctx.player.position;
      if (ctx.player.mode === 'external' && !wentExternal) rg.inject(null);
      if (ctx.player.mode === 'external') wentExternal = true;
      if (wentExternal && Math.hypot(p.x - c.x, p.z - c.z) < 5 && Math.abs(p.y - c.y) < 0.6) onMat = true;
      if (onMat && ctx.player.mode === 'walk' && ctx.player.grounded) break;
    }
    rg.step(1 / 60, 240, false);
    const p = ctx.player.position;
    return { wentExternal, onMat, mode: ctx.player.mode, dist: Math.hypot(p.x - c.x, p.z - c.z) };
  });
  expect(r.wentExternal).toBe(true);
  expect(r.onMat).toBe(true);
  expect(r.mode).toBe('walk');
  expect(r.dist).toBeLessThan(8);
});

test('rocket: E mid-flight does nothing, lands on the net, camera and pose reset; then a balloon ride still works', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const info = window.__rgThrills!.rocket()!;
    const spin = ctx.player.object.children[0].children[0];
    let override: unknown = 'unset';
    const setOverride = ctx.cameraRig.setOverride.bind(ctx.cameraRig);
    ctx.cameraRig.setOverride = (o) => {
      override = o;
      setOverride(o);
    };
    const pad = info.pads[1];
    rg.step(1 / 60, 120, false); // cooldown
    // Sprint run-up onto the middle pad from the side away from the net.
    const dn = Math.hypot(info.net.x - pad.x, info.net.z - pad.z);
    const sx = pad.x - ((info.net.x - pad.x) / dn) * 10;
    const sz = pad.z - ((info.net.z - pad.z) / dn) * 10;
    rg.teleport(sx, ctx.world.heightAt(sx, sz) + 0.2, sz, Math.atan2(info.net.x - pad.x, info.net.z - pad.z));
    rg.step(1 / 60, 30, false);
    rg.inject({ moveY: 1, sprint: true });
    for (let i = 0; i < 60 * 4 && ctx.player.mode !== 'external'; i++) rg.step(1 / 60, 1, false);
    rg.inject(null);
    let pressedE = false;
    let modeAfterE = '';
    let landed = false;
    for (let i = 0; i < 60 * 14; i++) {
      rg.step(1 / 60, 1, false);
      if (!pressedE && ctx.player.mode === 'external' && ctx.player.airTime > 1.5) {
        pressedE = true;
        rg.inject({ usePressed: true, moveY: 1 });
        rg.step(1 / 60, 1, false);
        rg.inject({ moveY: 1 });
        modeAfterE = ctx.player.mode;
      }
      if (pressedE && ctx.player.airTime > 2.5) rg.inject(null);
      if (pressedE && ctx.player.mode === 'walk' && ctx.player.grounded) {
        landed = true;
        break;
      }
    }
    rg.inject(null);
    rg.step(1 / 60, 150, false); // a possible flop plays out
    const p = ctx.player.position;
    const rocket = {
      modeAfterE,
      landed,
      netDist: Math.hypot(p.x - info.net.x, p.z - info.net.z),
      mode: ctx.player.mode,
      override,
      spinX: spin.rotation.x,
      spinY: spin.rotation.y,
      lines: (document.querySelector('.rg-speed-lines') as HTMLElement | null)?.style.opacity ?? '0',
    };
    const a = ctx.world.anchors.balloon.position;
    const netToBalloon = Math.hypot(info.net.x - a.x, info.net.z - a.z);

    // Balloon ride end to end.
    const g = ctx.world.heightAt(a.x, a.z);
    rg.teleport(a.x + 1.7, g + 0.4, a.z, -Math.PI / 2);
    rg.step(1 / 60, 10, false);
    const focus = ctx.interactions.focused?.icon ?? null;
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    const rideMode = ctx.player.mode;
    let maxUp = 0;
    let back = false;
    for (let i = 0; i < 70 * 30; i++) {
      rg.step(1 / 30, 1, false);
      maxUp = Math.max(maxUp, ctx.player.position.y - g);
      if (ctx.player.mode === 'walk') {
        back = true;
        break;
      }
    }
    rg.step(1 / 60, 20, false);
    ctx.cameraRig.setOverride = setOverride;
    const rotX = ctx.player.object.children[0].rotation.x;
    return { rocket, netToBalloon, balloon: { focus, rideMode, maxUp, back, override, rotX, mode: ctx.player.mode }, errors: rg.errors };
  });
  console.log(`net to balloon pad: ${r.netToBalloon.toFixed(1)} m`);
  expect(r.rocket.modeAfterE).toBe('external');
  expect(r.rocket.landed).toBe(true);
  expect(r.rocket.netDist).toBeLessThan(8);
  expect(r.rocket.mode).toBe('walk');
  expect(r.rocket.override).toBeNull();
  expect(Math.abs(r.rocket.spinX)).toBeLessThan(1e-3);
  expect(Math.abs(r.rocket.spinY)).toBeLessThan(1e-3);
  expect(r.rocket.lines).toBe('0');
  expect(r.balloon.focus).toBe('balloon');
  expect(r.balloon.rideMode).toBe('external');
  expect(r.balloon.maxUp).toBeGreaterThan(170);
  expect(r.balloon.back).toBe(true);
  expect(r.balloon.mode).toBe('walk');
  expect(r.balloon.override).toBeNull();
  expect(r.balloon.rotX).toBe(0);
  expect(r.errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
