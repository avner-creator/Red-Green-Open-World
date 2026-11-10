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
