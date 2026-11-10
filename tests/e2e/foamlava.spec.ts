/**
 * Foam Lava course: E at the booth starts a run, a full round (the test bot drives the hero
 * through the real controller and course sim) ends on the result card; a foam fall gives the
 * bubble beard and a checkpoint respawn; R leaves safely; the weak-eye shortcut tiles and stones
 * touch only the weak channel for all 4 lens/eye combinations.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { PNG } from 'pngjs';
import { boot, canvasShot, channelDiff } from './helpers';
import { VisionLayer } from '../../src/types';
import type { EyeSettings } from '../../src/types';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/foam-lava';
let page: Page;
let consoleErrors: string[] = [];

const COMBOS: Array<{ eye: Pick<EyeSettings, 'leftLens' | 'weakEye'>; weak: 'r' | 'g'; strong: 'r' | 'g' }> = [
  { eye: { leftLens: 'red', weakEye: 'left' }, weak: 'r', strong: 'g' },
  { eye: { leftLens: 'red', weakEye: 'right' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'left' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'right' }, weak: 'r', strong: 'g' },
];

/** Single-channel grey copy of a PNG (what one eye sees through its lens). */
function channel(img: PNG, c: 0 | 1): PNG {
  const out = { ...img, data: Buffer.from(img.data) } as PNG;
  for (let i = 0; i < out.data.length; i += 4) out.data[i] = out.data[i + 1] = out.data[i + 2] = img.data[i + c];
  return out;
}

async function saveShots(name: string): Promise<void> {
  const { PNG: P } = await import('pngjs');
  const img = await canvasShot(page, `${OUT}/${name}.png`);
  writeFileSync(`${OUT}/${name}-R.png`, P.sync.write(channel(img, 0)));
  writeFileSync(`${OUT}/${name}-G.png`, P.sync.write(channel(img, 1)));
}

test.beforeAll(async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 10, false);
  });
});

test.afterAll(async () => {
  await page.close();
});

test('E at the booth starts a run; a full round ends on the result card; R leaves', async () => {
  const start = await page.evaluate(() => {
    const rg = window.__rg!;
    const f = window.__rgFoam!;
    const [x, y, z] = f.booth();
    rg.teleport(x, y - 1.15, z);
    rg.step(1 / 60, 10, false);
    const focused = rg.ctx.interactions.focused?.id ?? null;
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 30, false);
    return { focused, phase: f.phase(), mode: rg.ctx.player.mode };
  });
  expect(start.focused).toBe('foam-lava');
  expect(start.phase).toBe('countdown');
  expect(start.mode).toBe('external');
  await expect(page.getByTestId('foamlava-count')).toHaveClass(/on/);
  await expect(page.getByTestId('foamlava-hud')).toHaveClass(/on/);
  // The friend's model loads in the background while the countdown runs.
  await page.waitForFunction(() => window.__rgFoam!.friendReady(), undefined, { timeout: 60_000 });

  // The bot plays the main route through the real controller.
  const run = await page.evaluate(() => {
    const rg = window.__rg!;
    const f = window.__rgFoam!;
    f.autopilot('main');
    let frames = 0;
    let midShot = false;
    while (f.phase() !== 'result' && frames < 60 * 45) {
      rg.step(1 / 60, 30, false);
      frames += 30;
      if (!midShot && f.sim.cp >= 1) midShot = true;
    }
    f.autopilot(null);
    return { phase: f.phase(), result: f.lastResult(), cp: f.sim.cp, falls: f.sim.falls, friend: f.friendReady() };
  });
  expect(run.phase).toBe('result');
  expect(run.cp).toBe(3);
  expect(run.result).not.toBeNull();
  expect(run.result!.time).toBeGreaterThan(10);
  expect(run.result!.time).toBeLessThan(30);
  expect(['gold', 'silver']).toContain(run.result!.medal);
  expect(run.result!.beatFriend).toBe(true);
  expect(run.friend).toBe(true);
  await expect(page.getByTestId('foamlava-result')).toHaveClass(/on/);
  await page.evaluate(() => window.__rg!.step(1 / 60, 40));
  await saveShots('result');
  await page.screenshot({ path: `${OUT}/result-ui.png` });

  // R leaves safely: back on foot next to the booth.
  const left = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 20, false);
    const f = window.__rgFoam!;
    const b = f.booth();
    const p = rg.ctx.player.position;
    return { phase: f.phase(), mode: rg.ctx.player.mode, dist: Math.hypot(p.x - b[0], p.z - b[2]) };
  });
  expect(left.phase).toBe('idle');
  expect(left.mode).toBe('walk');
  expect(left.dist).toBeLessThan(4);
  await expect(page.getByTestId('foamlava-result')).not.toHaveClass(/on/);
});

test('a foam fall: splash, bubble beard, respawn at the checkpoint, the clock keeps running', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const f = window.__rgFoam!;
    f.start();
    rg.step(1 / 60, 200, false); // countdown
    rg.step(1 / 60, 40, false);
    const running = f.phase();
    // Mid-run frame (pace sparkle and blower rings up): the weak layer touches only the weak channel.
    rg.setEye({ leftLens: 'red', weakEye: 'left' });
    rg.step(1 / 60, 1);
    const grab = (): Uint8ClampedArray => {
      const c = document.getElementById('game') as HTMLCanvasElement;
      const g = document.createElement('canvas');
      g.width = c.width;
      g.height = c.height;
      const x = g.getContext('2d')!;
      x.drawImage(c, 0, 0);
      return x.getImageData(0, 0, g.width, g.height).data;
    };
    rg.setLayerVisible(1, true);
    rg.render();
    const on = grab();
    rg.setLayerVisible(1, false);
    rg.render();
    const off = grab();
    rg.setLayerVisible(1, true);
    let weakPx = 0;
    let strongMax = 0;
    let blueMax = 0;
    for (let i = 0; i < on.length; i += 4) {
      if (Math.abs(on[i] - off[i]) > 2) weakPx++;
      strongMax = Math.max(strongMax, Math.abs(on[i + 1] - off[i + 1]));
      blueMax = Math.max(blueMax, Math.abs(on[i + 2] - off[i + 2]));
    }
    // Drop the hero into the foam between the lanes.
    f.sim.p.x = 0;
    f.sim.p.y = 1.6;
    f.sim.p.z = 9;
    f.sim.grounded = false;
    rg.step(1 / 60, 30, false);
    const splashMode = f.sim.mode;
    let beard = false;
    rg.ctx.player.object.traverse((o) => {
      if (o.name === 'bubble-beard') beard = true;
    });
    rg.step(1 / 60, 80);
    return { running, splashMode, beard, mode: f.sim.mode, falls: f.sim.falls, x: f.sim.p.x, z: f.sim.p.z, time: f.sim.time, weakPx, strongMax, blueMax };
  });
  expect(r.weakPx).toBeGreaterThan(20);
  expect(r.strongMax).toBe(0);
  expect(r.blueMax).toBe(0);
  expect(r.running).toBe('run');
  expect(r.splashMode).toBe('splash');
  expect(r.beard).toBe(true);
  expect(r.mode).toBe('run');
  expect(r.falls).toBe(1);
  expect(r.z).toBeLessThan(1.5); // back on the start deck (checkpoint 0)
  expect(r.time).toBeGreaterThan(1.8);
  await saveShots('beard');
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 5, false);
  });
  expect(await page.evaluate(() => window.__rgFoam!.phase())).toBe('idle');
});

test('weak-eye shortcut tiles and stones change only the weak channel (all 4 combos)', async () => {
  await page.evaluate(() => {
    const rg = window.__rg!;
    const f = window.__rgFoam!;
    // Stand on tower A looking back down the course: tiles and stones in view.
    const [x, y, z] = f.toWorld(3.3, 2.35, 41.5);
    const [lx, , lz] = f.toWorld(-1.7, 1, 12);
    rg.teleport(x, y, z, Math.atan2(lx - x, lz - z));
    rg.ctx.cameraRig.setOverride({ distance: 5, height: 3 });
    rg.step(1 / 60, 60, false);
    rg.step(1 / 60, 1);
  });
  const frame = async (weak: boolean, ours = true): Promise<PNG> => {
    await page.evaluate(
      ({ weak, ours, W }) => {
        const rg = window.__rg!;
        rg.setLayerVisible(W, weak);
        window.__rgFoam!.setWeakVisible(ours);
        rg.render();
      },
      { weak, ours, W: VisionLayer.WeakOnly },
    );
    return canvasShot(page);
  };
  for (const combo of COMBOS) {
    await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);
    const on = await frame(true);
    const off = await frame(false);
    const d = channelDiff(on, off);
    const label = `${combo.eye.leftLens}/${combo.eye.weakEye}`;
    expect(d[combo.weak], label).toBeGreaterThan(300);
    expect(combo.strong === 'r' ? d.maxR : d.maxG, label).toBe(0);
    expect(d.maxB, label).toBe(0);
    // Positive control: our objects (not only gems) are what changes the weak channel.
    const noOurs = await frame(true, false);
    expect(channelDiff(on, noOurs)[combo.weak], label).toBeGreaterThan(300);
    await frame(true, true);
  }
  await page.evaluate(() => window.__rg!.setEye({ leftLens: 'red', weakEye: 'left' }));
  await frame(true);
  await saveShots('tiles');
  await page.evaluate(() => window.__rg!.ctx.cameraRig.setOverride(null));
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
