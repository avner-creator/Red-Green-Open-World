/**
 * Stream N: buggy workshop and race on the real island.
 * - Workshop: E at the tool cart → turntable menu; too poor = nothing bought; collect gems → buy and
 *   fit the musical horns; Drive puts you in the buggy; a rocket boost fires on the skill key.
 * - Race: E at the booth → countdown → one full (autopiloted) lap against the two friends → podium
 *   → result card → exit leaves you on foot.
 * - Channels: the racing line and boost pads touch only the weak channel, for all 4 lens/eye
 *   combinations, and never live in the main scene.
 * Screenshots (canvas; full, R-only, G-only) go to test-results/buggy-race/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot, channelDiff } from './helpers';
import { VisionLayer, type EyeSettings } from '../../src/types';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/buggy-race';
let page: Page;
let consoleErrors: string[] = [];

/** Save the canvas as full, R-only and G-only PNGs. */
async function shots(name: string): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const img = await canvasShot(page, `${OUT}/${name}-full.png`);
  for (const [c, tag] of [[0, 'R'], [1, 'G']] as const) {
    const o = new PNG({ width: img.width, height: img.height });
    for (let i = 0; i < img.data.length; i += 4) {
      const v = img.data[i + c];
      o.data[i] = o.data[i + 1] = o.data[i + 2] = v;
      o.data[i + 3] = 255;
    }
    writeFileSync(`${OUT}/${name}-${tag}.png`, PNG.sync.write(o));
  }
}

async function press(patch: Record<string, boolean | number>, frames = 1): Promise<void> {
  await page.evaluate(
    ([patch, frames]) => {
      const rg = window.__rg!;
      rg.inject(patch);
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, frames, false);
    },
    [patch, frames] as const,
  );
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 20, false);
  });
});

test.afterAll(async () => {
  await page.close();
});

test('workshop: open at the tool cart, buy only with enough gems, fit parts, drive off', async () => {
  // Walk up to the cart and press E.
  await page.evaluate(() => {
    const rg = window.__rg!;
    const c = window.__rgWorkshop!.console;
    rg.teleport(c[0] + 1.2, c[1] + 0.2, c[2] - 1.2);
    rg.step(1 / 60, 20, false);
  });
  await press({ usePressed: true }, 30);
  const opened = await page.evaluate(() => ({ open: window.__rgWorkshop!.isOpen, mode: window.__rg!.state().playerMode }));
  expect(opened).toEqual({ open: true, mode: 'external' });
  await expect(page.getByTestId('workshop')).toBeVisible();

  // No gems yet: the cheapest card (musical horns) cannot be bought.
  await page.evaluate(() => {
    window.__rgWorkshop!.select(0);
    window.__rgWorkshop!.press();
  });
  expect(await page.evaluate(() => window.__rgWorkshop!.fitted())).toEqual([]);

  // Collect a few gems (walk-in pickups), come back, buy the horns.
  const got = await page.evaluate(() => {
    const rg = window.__rg!;
    const ws = window.__rgWorkshop!;
    ws.close('exit');
    rg.step(1 / 60, 5, false);
    for (const s of rg.ctx.world.gemSpots.slice(0, 6)) {
      rg.teleport(s.position.x, s.position.y - 0.85, s.position.z);
      rg.step(1 / 60, 3, false);
    }
    const c = ws.console;
    rg.teleport(c[0] + 1.2, c[1] + 0.2, c[2] - 1.2);
    rg.step(1 / 60, 20, false);
    return rg.state().gems;
  });
  expect(got).toBeGreaterThanOrEqual(4);
  await press({ usePressed: true }, 30);
  await page.evaluate(() => {
    window.__rgWorkshop!.select(0);
    window.__rgWorkshop!.press();
    window.__rg!.step(1 / 60, 20, false);
  });
  expect(await page.evaluate(() => window.__rgWorkshop!.fitted())).toEqual(['musicalHorns']);
  await expect(page.getByTestId('ws-card-musicalHorns')).toHaveAttribute('data-state', 'fitted');

  // Show off every part on the turntable for the screenshots.
  await page.evaluate(() => {
    const ws = window.__rgWorkshop!;
    for (const id of ['monsterWheels', 'springBumper', 'bubbleExhaust', 'rocketBoost', 'duckOrnament', 'confettiCannon'] as const) ws.give(id);
    window.__rg!.step(1 / 60, 90, false);
    window.__rg!.step(1 / 60, 1);
  });
  await shots('workshop');

  // Drive: the player ends up in the buggy; F plays the horn tune; Q fires the rocket boost.
  await page.evaluate(() => {
    window.__rgWorkshop!.close('drive');
    window.__rg!.step(1 / 60, 40, false);
  });
  const driving = await page.evaluate(() => ({ mode: window.__rg!.state().playerMode, open: window.__rgWorkshop!.isOpen, pos: window.__rg!.state().playerPosition }));
  expect(driving.mode, JSON.stringify(driving)).toBe('driving');
  await press({ flopPressed: true }, 30);
  const boost = await page.evaluate(() => {
    const rg = window.__rg!;
    const car = rg.ctx.vehicles.all[0] as unknown as { speed: number; buggy: { boostLeft: number } };
    rg.inject({ moveY: 1 });
    rg.step(1 / 60, 40, false);
    const before = car.speed;
    rg.inject({ moveY: 1, skillPressed: true });
    rg.step(1 / 60, 1, false);
    const left = car.buggy.boostLeft;
    rg.inject({ moveY: 1 });
    rg.step(1 / 60, 30, false);
    rg.inject(null);
    return { before, left, after: car.speed };
  });
  expect(boost.left).toBeGreaterThan(0.5);
  expect(boost.after).toBeGreaterThan(boost.before + 2);
  expect(consoleErrors).toEqual([]);
});

test('race: booth → countdown → a full lap with two friends → podium → result → exit on foot', async () => {
  test.setTimeout(240_000);
  // Get out, walk to the booth, press E.
  const start = await page.evaluate(() => {
    const rg = window.__rg!;
    const race = window.__rgRace!;
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 20, false);
    race.setLaps(1);
    const g = race.gridView();
    rg.teleport(g[0] + 5, g[1] + 0.3, g[2] - 7);
    rg.step(1 / 60, 10, false);
    return race.start();
  });
  expect(start).toBe(true);
  await page.evaluate(() => window.__rg!.step(1 / 60, 50, false));
  const cd = await page.evaluate(() => ({ phase: window.__rgRace!.phase, mode: window.__rg!.state().playerMode, rivals: window.__rgRace!.state().rivals.length }));
  expect(cd).toEqual({ phase: 'countdown', mode: 'driving', rivals: 2 });
  await expect(page.getByTestId('race-hud')).toBeVisible();
  // The car is held on the grid during the countdown even with the throttle down.
  const held = await page.evaluate(() => {
    const rg = window.__rg!;
    const car = rg.ctx.vehicles.all[0];
    const p0 = car.position.clone();
    rg.inject({ moveY: 1 });
    rg.step(1 / 60, 30, false);
    rg.inject(null);
    rg.step(1 / 60, 1);
    return car.position.distanceTo(p0);
  });
  expect(held).toBeLessThan(0.4);
  await shots('race-start');

  // Race one lap on autopilot (it follows the safe racing line).
  await page.evaluate(() => window.__rgRace!.autopilot(true));
  let st = await page.evaluate(() => window.__rgRace!.state());
  let shot = false;
  for (let i = 0; i < 40 && st.phase !== 'result'; i++) {
    st = await page.evaluate(() => {
      window.__rg!.step(1 / 30, 45, false);
      return window.__rgRace!.state();
    });
    if (!shot && st.phase === 'racing' && st.progress > 30) {
      shot = true;
      await page.evaluate(() => window.__rg!.step(1 / 60, 1));
      await shots('race-racing');
    }
  }
  expect(st.phase).toBe('result');
  expect(st.progress).toBeGreaterThanOrEqual(st.length);
  expect(st.padsHit).toBeGreaterThan(0);
  expect(st.result?.place).toBeGreaterThanOrEqual(1);
  expect(st.result?.place).toBeLessThanOrEqual(3);
  expect(st.result?.stars).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId('race-result')).toBeVisible();
  const podium = await page.evaluate(() => {
    window.__rg!.step(1 / 60, 1);
    return window.__rg!.state().playerMode;
  });
  expect(podium).toBe('external');
  await shots('race-podium');

  // R leaves: on foot in front of the podium, race over, nothing left behind.
  await press({ respawnPressed: true }, 20);
  const after = await page.evaluate(() => ({ phase: window.__rgRace!.phase, mode: window.__rg!.state().playerMode, rivals: window.__rgRace!.state().rivals.length }));
  expect(after).toEqual({ phase: 'idle', mode: 'walk', rivals: 0 });
  await expect(page.getByTestId('race-hud')).toBeHidden();
  expect(consoleErrors).toEqual([]);
});

const COMBOS: Array<{ eye: Pick<EyeSettings, 'leftLens' | 'weakEye'>; weak: 'r' | 'g'; strong: 'r' | 'g' }> = [
  { eye: { leftLens: 'red', weakEye: 'left' }, weak: 'r', strong: 'g' },
  { eye: { leftLens: 'red', weakEye: 'right' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'left' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'right' }, weak: 'r', strong: 'g' },
];

test('racing line and boost pads are weak-eye only (all 4 lens/eye combinations)', async () => {
  // Start a race and look down the track from the grid during the countdown.
  const ok = await page.evaluate(() => {
    const rg = window.__rg!;
    const race = window.__rgRace!;
    race.autopilot(false);
    const g = race.gridView();
    rg.teleport(g[0] + 5, g[1] + 0.3, g[2] - 7);
    rg.step(1 / 60, 10, false);
    const started = race.start();
    rg.step(1 / 60, 60, false);
    // Nothing of the twist may sit in the main (both-eye) scene.
    const leaked = ['race-line', 'race-boost-pad', 'race-weak-eye'].filter((n) => rg.ctx.scene.getObjectByName(n));
    return { started, leaked };
  });
  expect(ok).toEqual({ started: true, leaked: [] });
  const frame = async (weak: boolean): Promise<PNG> => {
    await page.evaluate(
      ({ weak, W }) => {
        const rg = window.__rg!;
        rg.setLayerVisible(W, weak);
        rg.render();
      },
      { weak, W: VisionLayer.WeakOnly },
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
  }
  await page.evaluate((W) => {
    const rg = window.__rg!;
    rg.setLayerVisible(W, true);
    rg.setEye({ leftLens: 'red', weakEye: 'left' });
    window.__rgRace!.exit();
    rg.step(1 / 60, 5, false);
  }, VisionLayer.WeakOnly);
  expect(await page.evaluate(() => window.__rgRace!.phase)).toBe('idle');
  expect(consoleErrors).toEqual([]);
});
