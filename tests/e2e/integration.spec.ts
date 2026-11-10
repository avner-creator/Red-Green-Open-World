/**
 * Cross-system wiring (main.ts glue): UI ↔ core input ↔ session ↔ audio, and the real player on
 * the real trampoline. One page, frozen loop, simulation-only stepping where pixels don't matter.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { boot } from './helpers';

test.describe.configure({ mode: 'serial' });

let page: Page;
let consoleErrors: string[] = [];

const phase = (): Promise<string> => page.evaluate(() => window.__rg!.state().phase);
const step = (n: number): Promise<void> => page.evaluate((k) => window.__rg!.step(1 / 60, k, false), n);

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
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

test('Play unlocks audio and starts the session in one click', async () => {
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
  await page.getByTestId('play').click();
  expect(await page.evaluate(() => (window as unknown as { __rgUnlocks: number }).__rgUnlocks)).toBe(1);
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

test('holding jump on the trampoline grows the bounce up to ~40 m and awards bigBounce', async () => {
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
  for (let i = 1; i < 6; i++) expect(r.apexes[i]).toBeGreaterThan(r.apexes[i - 1] + 0.5);
  const top = Math.max(...r.apexes);
  expect(top).toBeGreaterThan(36);
  expect(top).toBeLessThanOrEqual(41);
  const big = r.stunts.filter((s) => s.kind === 'bigBounce');
  expect(big.length).toBeGreaterThanOrEqual(3);
  expect(Math.max(...big.map((s) => s.value))).toBeLessThanOrEqual(40);
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
