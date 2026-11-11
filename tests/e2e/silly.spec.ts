/**
 * Silly Zone: pushing the beach ball moves it, the FLOP button flops, a bumper mushroom boings you
 * sideways, the see-saw flings you a few metres, tube characters bend away, plus screenshots
 * (full / R-only / G-only) in test-results/silly/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { SHOTS, boot } from './helpers';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/silly';
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
});

test.afterAll(async () => {
  await page.close();
});

test('pushing the beach ball moves it', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const s = window.__rgSilly!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 30, false);
    const b0 = s.ball();
    // Stand 4 m west of the ball, facing east, and walk into it.
    rg.teleport(b0[0] - 4, b0[1] - 1.4, b0[2], Math.PI / 2);
    rg.step(1 / 60, 10, false);
    const camYaw = ctx.cameraRig.yaw;
    // Camera-relative move: aim the stick at +X whatever the camera yaw is.
    const mx = -Math.cos(camYaw);
    const my = Math.sin(camYaw);
    rg.inject({ moveX: mx, moveY: my });
    rg.step(1 / 60, 150, false);
    rg.inject(null);
    rg.step(1 / 60, 30, false);
    const b1 = s.ball();
    return { moved: Math.hypot(b1[0] - b0[0], b1[2] - b0[2]), dx: b1[0] - b0[0], mode: ctx.player.mode, errors: rg.errors };
  });
  console.log(JSON.stringify(r));
  expect(r.moved).toBeGreaterThan(1.5);
  expect(r.dx).toBeGreaterThan(1);
  expect(r.errors).toEqual([]);
});

test('the FLOP button flops the player', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const s = window.__rgSilly!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3, false);
    let flops = 0;
    const off = ctx.events.on('player:flop', () => flops++);
    const f = s.flopButton();
    rg.teleport(f[0] + 3.5, f[1] + 0.1, f[2], -Math.PI / 2);
    rg.step(1 / 60, 20, false);
    const before = flops;
    rg.teleport(f[0], f[1] + 0.1, f[2], -Math.PI / 2);
    let mode = '';
    for (let i = 0; i < 20 && !mode; i++) {
      rg.step(1 / 60, 1, false);
      if (ctx.player.mode === 'flop') mode = 'flop';
    }
    off();
    return { before, flops, mode, errors: rg.errors };
  });
  expect(r.before).toBe(0);
  expect(r.flops).toBe(1);
  expect(r.mode).toBe('flop');
  expect(r.errors).toEqual([]);
});

test('bumper mushroom boings sideways, see-saw flings, tubes bend away', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const s = window.__rgSilly!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3, false);
    // Bumper: walk into mushroom 0 from the east.
    const m = s.mushrooms()[0];
    rg.teleport(m[0] + 2.2, m[1] + 0.05, m[2], -Math.PI / 2);
    rg.step(1 / 60, 5, false);
    const camYaw = ctx.cameraRig.yaw;
    rg.inject({ moveX: Math.cos(camYaw), moveY: -Math.sin(camYaw) }); // towards −X
    let bump: number[] | null = null;
    for (let i = 0; i < 90 && !bump; i++) {
      rg.step(1 / 60, 1, false);
      const v = ctx.player.velocity;
      if (Math.hypot(v.x, v.z) > 6 && v.y > 2) bump = [v.x, v.y, v.z];
    }
    rg.inject(null);
    rg.step(1 / 60, 90, false);
    // See-saw: step into the cup and wait.
    const cup = s.seesawCup();
    rg.teleport(cup[0], cup[1] + 0.1, cup[2], -Math.PI / 2);
    let maxUp = 0;
    let maxDx = 0;
    const startX = cup[0];
    for (let i = 0; i < 150; i++) {
      rg.step(1 / 60, 1, false);
      maxUp = Math.max(maxUp, ctx.player.position.y - cup[1]);
      maxDx = Math.max(maxDx, startX - ctx.player.position.x);
    }
    const seesawMode = ctx.player.mode;
    // Tubes: stand right next to tube 2 and compare its bend with a far one.
    const t = s.tubes()[2];
    rg.teleport(t[0], t[1] + 0.05, t[2] - 1.0, 0);
    rg.step(1 / 60, 20, false);
    const bend = s.tubeBend();
    return { bump, maxUp, maxDx, seesawMode, bend, errors: rg.errors };
  });
  console.log(JSON.stringify(r));
  expect(r.bump).not.toBeNull();
  expect(r.maxUp).toBeGreaterThan(3);
  expect(r.maxDx).toBeGreaterThan(5);
  expect(r.seesawMode).toBe('walk');
  expect(r.bend[2]).toBeGreaterThan(r.bend[0]);
  expect(r.errors).toEqual([]);
});

test('walk into every solid Silly Zone piece from 8 directions: nothing is passed through', async () => {
  test.setTimeout(480_000);
  const names = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3, false);
    return window.__rgSilly!.solids().map((x) => x.name);
  });
  const fails: string[] = [];
  let runs = 0;
  // One solid per evaluate (SwiftShader steps are slow under load).
  for (const name of names) {
    const r = await page.evaluate((name) => {
      const rg = window.__rg!;
      const ctx = rg.ctx;
      const solid = window.__rgSilly!.solids().find((x) => x.name === name)!;
      const out: string[] = [];
      for (let d = 0; d < 8; d++) {
        const ang = (d / 8) * Math.PI * 2;
        const ux = Math.cos(ang);
        const uz = Math.sin(ang);
        const sx = solid.at[0] + ux * 2.6;
        const sz = solid.at[2] + uz * 2.6;
        rg.teleport(sx, ctx.world.heightAt(sx, sz) + 0.1, sz, Math.atan2(-ux, -uz));
        rg.step(1 / 30, 1, false);
        // Distance to the solid's core (a vertical post, or a short wall along Z for halfZ).
        const hz = solid.halfZ ?? 0;
        const core = (x: number, z: number): number => Math.hypot(x - solid.at[0], Math.max(0, Math.abs(z - solid.at[2]) - hz));
        let minD = Infinity;
        let last = ctx.player.position.clone();
        for (let i = 0; i < 22; i++) {
          const cy = ctx.cameraRig.yaw;
          const p = ctx.player.position;
          // Walk towards the solid's centre (camera-relative stick).
          let dx = solid.at[0] - p.x;
          let dz = solid.at[2] - p.z;
          const l = Math.hypot(dx, dz) || 1;
          dx /= l;
          dz /= l;
          rg.inject({ moveX: -dx * Math.cos(cy) + dz * Math.sin(cy), moveY: dx * Math.sin(cy) + dz * Math.cos(cy), sprint: true });
          rg.step(1 / 30, 1, false);
          const q = ctx.player.position;
          // Sub-sample the step so a fast player cannot skip over the core between frames.
          if (q.y - solid.at[1] < 2.2) {
            for (let k = 1; k <= 4; k++) minD = Math.min(minD, core(last.x + ((q.x - last.x) * k) / 4, last.z + ((q.z - last.z) * k) / 4));
          }
          last = q.clone();
        }
        rg.inject(null);
        if (minD < solid.radius + 0.12) out.push(`${solid.name}@${d}: min ${minD.toFixed(2)}`);
      }
      return { out, errors: rg.errors };
    }, name);
    runs += 8;
    fails.push(...r.out);
    expect(r.errors).toEqual([]);
  }
  console.log(JSON.stringify({ runs, fails }));
  expect(runs).toBeGreaterThanOrEqual(19 * 8);
  expect(fails).toEqual([]);
});

test('the sweeper bar and a wrecking pillow boop a player on the ground (soft hop, back on foot)', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const s = window.__rgSilly!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3, false);
    // Sweeper: stand 3 m from the hub and wait for the bar.
    const h = s.sweeperHub();
    rg.teleport(h[0] + 3, h[1] + 0.05, h[2] - 0.2, 0);
    let sweepUp = 0;
    let sweepSide = 0;
    for (let i = 0; i < 360 && !sweepUp; i++) {
      rg.step(1 / 60, 1, false);
      const v = ctx.player.velocity;
      if (v.y > 4) {
        sweepUp = v.y;
        sweepSide = Math.hypot(v.x, v.z);
      }
    }
    rg.step(1 / 60, 120, false);
    const modeAfterSweep = ctx.player.mode;
    // Pillow: stand right under pillow 0's pivot (the bottom of its swing) and wait for it.
    const px = s.pillows()[0][0];
    const pz = s.solids().find((x) => x.name === 'gantry-1')!.at[2];
    rg.teleport(px, ctx.world.heightAt(px, pz) + 0.05, pz, 0);
    rg.step(1 / 60, 1, false);
    let pillowV = 0;
    let minD = Infinity;
    for (let i = 0; i < 300 && !pillowV; i++) {
      rg.step(1 / 60, 1, false);
      const v = ctx.player.velocity;
      const c = s.pillows()[0];
      const q = ctx.player.position;
      minD = Math.min(minD, Math.hypot(q.x - c[0], q.y + 0.85 - c[1], q.z - c[2]));
      if (v.y > 4) pillowV = Math.hypot(v.x, v.z);
    }
    rg.step(1 / 60, 150, false);
    return { sweepUp, sweepSide, modeAfterSweep, pillowV, minD, mode: ctx.player.mode, errors: rg.errors };
  });
  console.log(JSON.stringify(r));
  expect(r.sweepUp).toBeGreaterThan(4);
  expect(r.sweepSide).toBeGreaterThan(3);
  expect(r.sweepSide).toBeLessThan(12);
  expect(r.modeAfterSweep).toBe('walk');
  expect(r.pillowV).toBeGreaterThan(4);
  expect(r.minD).toBeGreaterThan(0.6);
  expect(r.mode).toBe('walk');
  expect(r.errors).toEqual([]);
});

test('Boop them all: stand on the pad, 3-2-1, bop every lit tube person → win, prize, stamp', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const s = window.__rgSilly!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3, false);
    const stamps: string[] = [];
    const stunts: { kind: string; stars: number }[] = [];
    const tickets: { kind: string; free: boolean }[] = [];
    const offs = [
      ctx.events.on('stamp:earned', (e) => stamps.push(e.id)),
      ctx.events.on('stunt', (e) => stunts.push({ kind: e.kind, stars: e.stars })),
      ctx.events.on('ticket:paid', (e) => tickets.push({ kind: e.kind, free: e.free })),
    ];
    const wallet0 = ctx.profile.wallet;
    // Walk onto the start pad from the entrance side.
    const pad = s.startPad();
    rg.teleport(pad[0], pad[1] + 0.05, pad[2], 0);
    rg.step(1 / 30, 30, false);
    const afterPad = s.round();
    const hudOn = !!document.querySelector('[data-testid="silly-hud"].on');
    rg.step(1 / 30, 100, false); // through the countdown
    const playing = s.round();
    const tubes = s.tubes();
    const bopped: number[] = [];
    for (const t of playing.targets) {
      const b = tubes[t];
      // Approach from the zone centre side and run into it.
      const c = s.sweeperHub();
      let ux = c[0] - b[0];
      let uz = c[2] - b[2];
      const l = Math.hypot(ux, uz);
      ux /= l;
      uz /= l;
      const sx = b[0] + ux * 3;
      const sz = b[2] + uz * 3;
      rg.teleport(sx, ctx.world.heightAt(sx, sz) + 0.1, sz, Math.atan2(-ux, -uz));
      rg.step(1 / 30, 2, false);
      for (let i = 0; i < 45 && s.round().booped <= bopped.length; i++) {
        const cy = ctx.cameraRig.yaw;
        const p = ctx.player.position;
        let dx = b[0] - p.x;
        let dz = b[2] - p.z;
        const ll = Math.hypot(dx, dz) || 1;
        dx /= ll;
        dz /= ll;
        rg.inject({ moveX: -dx * Math.cos(cy) + dz * Math.sin(cy), moveY: dx * Math.sin(cy) + dz * Math.cos(cy) });
        rg.step(1 / 30, 1, false);
      }
      rg.inject(null);
      if (s.round().booped > bopped.length) bopped.push(t);
    }
    const end = s.round();
    const resultOn = !!document.querySelector('[data-testid="silly-result"].on');
    const wallet1 = ctx.profile.wallet;
    rg.step(1 / 30, 200, false);
    const later = s.round();
    offs.forEach((o) => o());
    return { afterPad, hudOn, playing, bopped, end, resultOn, wallet0, wallet1, later, stamps, stunts, tickets, errors: rg.errors };
  });
  console.log(JSON.stringify({ ...r, playing: { ...r.playing, result: null } }));
  expect(r.afterPad.phase).toBe('countdown');
  expect(r.hudOn).toBe(true);
  expect(r.playing.phase).toBe('play');
  expect(r.playing.total).toBe(6);
  expect(r.bopped.length).toBe(6);
  expect(r.end.phase).toBe('done');
  expect(r.end.result).toMatchObject({ win: true, booped: 6, total: 6 });
  expect(r.resultOn).toBe(true);
  expect(r.tickets[0]).toMatchObject({ kind: 'silly', free: true });
  expect(r.wallet1).toBeGreaterThan(r.wallet0);
  expect(r.stamps).toContain('sillyZone');
  expect(r.stunts.some((s) => s.kind === 'bigAir' && s.stars >= 2)).toBe(true);
  expect(r.later.phase).toBe('idle');
  expect(r.errors).toEqual([]);
});

test('Boop them all: a round runs out of time (no bops: no stars, no prize)', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const s = window.__rgSilly!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3, false);
    const pad = s.startPad();
    rg.teleport(pad[0], pad[1] + 0.05, pad[2], 0);
    rg.step(1 / 30, 30, false);
    // Step off the pad and wait out the clock.
    rg.teleport(pad[0] - 3, pad[1] + 0.1, pad[2] - 1, 0);
    rg.step(1 / 30, 3 * 30 + 46 * 30, false);
    const end = s.round();
    const wallet = ctx.profile.wallet;
    // Leaving the zone mid-round ends it quietly.
    s.startRound();
    rg.step(1 / 30, 10, false);
    const a = ctx.world.anchors.sillyZone.position;
    rg.teleport(a.x + 30, ctx.world.heightAt(a.x + 30, a.z) + 0.2, a.z, 0);
    rg.step(1 / 30, 5, false);
    const left = s.round();
    return { end, wallet, left, errors: rg.errors };
  });
  console.log(JSON.stringify(r));
  expect(r.end.phase).toBe('done');
  expect(r.end.result).toMatchObject({ win: false, booped: 0, stars: 0, prize: 0 });
  expect(r.left.phase).toBe('idle');
  expect(r.errors).toEqual([]);
});

test('silly zone screenshots (full / R / G)', async () => {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3, false);
    const a = rg.ctx.world.anchors.sillyZone.position;
    const y = rg.ctx.world.heightAt(a.x, a.z - 15);
    rg.teleport(a.x - 1, y + 0.05, a.z - 15, 0);
    rg.step(1 / 60, 40, true);
  });
  await save('overview');
  // A round in progress: the HUD counter and clock, arrows over the lit tube people.
  await page.evaluate(() => {
    const rg = window.__rg!;
    const s = window.__rgSilly!;
    const pad = s.startPad();
    rg.teleport(pad[0], pad[1] + 0.05, pad[2], 0);
    s.startRound();
    rg.step(1 / 30, 100, false);
    rg.teleport(pad[0], pad[1] + 0.05, pad[2] - 1.5, 0);
    rg.step(1 / 60, 30, true);
  });
  await save('round');
  if (SHOTS) {
    await page.evaluate(() => {
      const rg = window.__rg!;
      const s = window.__rgSilly!;
      const t = s.tubes()[2];
      rg.teleport(t[0] + 0.6, t[1] + 0.05, t[2] - 4, 0);
      rg.step(1 / 60, 40, true);
    });
    await save('tubes');
    await page.evaluate(() => {
      const rg = window.__rg!;
      const s = window.__rgSilly!;
      const cup = s.seesawCup();
      rg.teleport(cup[0], cup[1] + 0.1, cup[2], -Math.PI / 2);
      rg.step(1 / 60, 45, true);
    });
    await save('seesaw-flip');
    await page.evaluate(() => {
      const rg = window.__rg!;
      const s = window.__rgSilly!;
      const m = s.mushrooms()[1];
      rg.teleport(m[0] + 5, m[1] + 0.05, m[2] - 3, -Math.PI / 2 - 0.5);
      rg.step(1 / 60, 40, true);
    });
    await save('mushrooms');
    await page.evaluate(() => {
      const rg = window.__rg!;
      const s = window.__rgSilly!;
      const f = s.flopButton();
      rg.teleport(f[0], f[1] + 0.1, f[2], Math.PI);
      rg.step(1 / 60, 25, true);
    });
    await save('flop');
  }
  expect(consoleErrors).toEqual([]);
});
