import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot } from './helpers';

/** Touch controls on a phone (667×375) and a tablet (1024×768), both landscape. */
const OUT = 'test-results/touch';
mkdirSync(OUT, { recursive: true });

function channel(png: PNG, c: number): Buffer {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    o.data[i] = o.data[i + 1] = o.data[i + 2] = png.data[i + c] as number;
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

async function save(page: Page, name: string): Promise<void> {
  const buf = await page.screenshot({ type: 'png', animations: 'disabled' });
  writeFileSync(`${OUT}/${name}-full.png`, buf);
  const png = PNG.sync.read(buf);
  writeFileSync(`${OUT}/${name}-R.png`, channel(png, 0));
  writeFileSync(`${OUT}/${name}-G.png`, channel(png, 1));
}

type Pt = { x: number; y: number; id?: number };
/** Real touch events (CDP): the browser turns them into pointer events with pointerType "touch". */
async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Pt[]): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })) });
}

const step = (page: Page, n: number, draw = false): Promise<void> =>
  page.evaluate(([k, d]) => window.__rg!.step(1 / 60, k as number, d as boolean), [n, draw] as const);

/** Tap Play with a finger, then stand still on flat ground at the spawn. */
async function startByTouch(page: Page): Promise<void> {
  await page.getByTestId('play').tap();
  await expect(page.getByTestId('touch-hud')).toBeVisible();
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    const s = rg.ctx.world.anchors.spawn;
    rg.teleport(s.position.x, s.position.y + 0.2, s.position.z, s.yaw);
    rg.step(1 / 60, 30, false);
  });
}

test.describe('touch', () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test('phone: play, joystick moves, look, jump, pause', async ({ page }) => {
    const { consoleErrors } = await boot(page);
    await startByTouch(page);
    const cdp = await page.context().newCDPSession(page);

    // Stick: finger down in the left zone and pushed up = walk forward.
    const p0 = await page.evaluate(() => window.__rg!.state().playerPosition);
    await touch(cdp, 'touchStart', [{ x: 120, y: 290 }]);
    await touch(cdp, 'touchMove', [{ x: 122, y: 200 }]);
    await step(page, 3);
    const mv = await page.evaluate(() => ({ x: window.__rg!.ctx.input.state.moveX, y: window.__rg!.ctx.input.state.moveY }));
    expect(mv.y).toBeGreaterThan(0.8);
    await step(page, 60, true);
    await save(page, 'phone-stick');
    const p1 = await page.evaluate(() => window.__rg!.state().playerPosition);
    expect(Math.hypot(p1[0] - p0[0], p1[2] - p0[2])).toBeGreaterThan(2);

    // Second finger drags on the right side while the stick is held: the camera turns.
    const yaw0 = await page.evaluate(() => window.__rg!.ctx.cameraRig.yaw);
    await touch(cdp, 'touchStart', [{ x: 122, y: 200, id: 0 }, { x: 480, y: 180, id: 1 }]);
    for (let x = 500; x <= 580; x += 20) await touch(cdp, 'touchMove', [{ x: 122, y: 200, id: 0 }, { x, y: 180, id: 1 }]);
    await step(page, 2);
    const yaw1 = await page.evaluate(() => window.__rg!.ctx.cameraRig.yaw);
    expect(Math.abs(yaw1 - yaw0)).toBeGreaterThan(0.2);
    await touch(cdp, 'touchEnd', []);
    await step(page, 2);
    expect(await page.evaluate(() => window.__rg!.ctx.input.state.moveY)).toBe(0);

    // Jump button.
    await step(page, 30);
    await page.evaluate(() => {
      const w = window as unknown as { __jumped?: boolean };
      w.__jumped = false;
      window.__rg!.ctx.events.on('player:jump', () => (w.__jumped = true));
    });
    await page.getByTestId('touch-jump').tap();
    await step(page, 2);
    expect(await page.evaluate(() => (window as unknown as { __jumped?: boolean }).__jumped)).toBe(true);
    await step(page, 60);

    // Sprint toggles on and off.
    await page.getByTestId('touch-sprint').tap();
    await step(page, 1);
    await expect(page.getByTestId('touch-sprint')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('touch-sprint').tap();
    await step(page, 1);
    await expect(page.getByTestId('touch-sprint')).toHaveAttribute('aria-pressed', 'false');

    // Pause and resume by touch; the touch HUD hides under the menu.
    await page.getByTestId('touch-pause').tap();
    await step(page, 2, true);
    expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('paused');
    await expect(page.locator('[data-screen="pause"]')).toBeVisible();
    await expect(page.getByTestId('touch-hud')).toBeHidden();
    await save(page, 'phone-pause');
    await page.getByTestId('resume').tap();
    await step(page, 2, true);
    expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('playing');
    await expect(page.getByTestId('touch-hud')).toBeVisible();

    // HUD shot with the stick held (knob drawn) and the first-play hints faded.
    await touch(cdp, 'touchStart', [{ x: 120, y: 290 }]);
    await touch(cdp, 'touchMove', [{ x: 160, y: 250 }]);
    await step(page, 2, true);
    await save(page, 'phone-hud');
    await touch(cdp, 'touchEnd', []);

    // Grown-up settings are reachable and fit by touch: pause → gate (hold) → settings.
    await page.getByTestId('touch-pause').tap();
    await step(page, 2);
    await page.getByTestId('pause-grownups').tap();
    const hold = page.getByTestId('gate-hold');
    await expect(hold).toBeVisible();
    const box = (await hold.boundingBox())!;
    await touch(cdp, 'touchStart', [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }]);
    await step(page, 190);
    await touch(cdp, 'touchEnd', []);
    const settings = page.getByTestId('settings');
    await expect(settings).toBeVisible();
    const sb = (await settings.boundingBox())!;
    expect(sb.y).toBeGreaterThanOrEqual(0);
    expect(sb.y + sb.height).toBeLessThanOrEqual(375 + 1);
    expect(sb.x + sb.width).toBeLessThanOrEqual(667 + 1);
    await page.waitForTimeout(400);
    await save(page, 'phone-settings');
    // Rows that don't fit (very short screens) scroll with a finger swipe.
    const scroller = settings.locator('.panes');
    const sc = await scroller.evaluate((el) => ({ over: el.scrollHeight > el.clientHeight + 2 }));
    if (sc.over) {
      const r = (await scroller.boundingBox())!;
      const x = r.x + r.width / 2;
      await touch(cdp, 'touchStart', [{ x, y: r.y + r.height - 20 }]);
      for (let k = 1; k <= 6; k++) await touch(cdp, 'touchMove', [{ x, y: r.y + r.height - 20 - k * 25 }]);
      await touch(cdp, 'touchEnd', []);
      await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    }
    // The Game tab fits too.
    await page.getByTestId('tab-game').tap();
    await page.waitForTimeout(400);
    await save(page, 'phone-settings-game');

    const errs = await page.evaluate(() => window.__rg!.errors);
    expect(errs).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('portrait asks to rotate, keyboard hides the touch HUD; skydive by touch', async ({ page }) => {
    await boot(page);
    await startByTouch(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await step(page, 2, true);
    await expect(page.getByTestId('touch-rotate')).toBeVisible();
    expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('paused');
    await save(page, 'phone-portrait');
    await page.setViewportSize({ width: 667, height: 375 });
    await step(page, 2);
    await expect(page.getByTestId('touch-rotate')).toBeHidden();
    await page.getByTestId('resume').tap();
    await step(page, 2);
    await expect(page.getByTestId('touch-hud')).toBeVisible();
    await page.keyboard.press('KeyW');
    await step(page, 2);
    await expect(page.getByTestId('touch-hud')).toBeHidden();

    // Skydive with the same controls: Use boards the balloon, the jump button (cued) jumps out,
    // the stick steers the fall, and the landing hands back walk mode.
    const cdp = await page.context().newCDPSession(page);
    await page.evaluate(() => {
      const rg = window.__rg!;
      const a = rg.ctx.world.anchors.balloon.position;
      rg.teleport(a.x + 1.7, rg.ctx.world.heightAt(a.x, a.z) + 0.4, a.z, -Math.PI / 2);
      rg.step(1 / 60, 10, false);
    });
    // Any touch brings the touch HUD back after the keyboard hid it.
    await touch(cdp, 'touchStart', [{ x: 333, y: 120 }]);
    await touch(cdp, 'touchEnd', []);
    await step(page, 1);
    await expect(page.getByTestId('touch-hud')).toBeVisible();
    await expect(page.getByTestId('touch-use')).toHaveClass(/ready/);
    await page.getByTestId('touch-use').tap({ force: true }); // it pulses while ready
    await step(page, 1);
    expect(await page.evaluate(() => window.__rg!.ctx.player.mode)).toBe('external');
    // Ride up until the "jump out" prompt shows.
    await page.waitForFunction(() => {
      window.__rg!.step(1 / 30, 15, false);
      return !!document.querySelector('.rg-sky-prompt.on');
    }, undefined, { polling: 50, timeout: 60_000 });
    await step(page, 12);
    await step(page, 1, true);
    await expect(page.getByTestId('touch-jump')).toHaveClass(/cue/);
    await save(page, 'phone-skydive-prompt');
    await page.getByTestId('touch-jump').tap({ force: true });
    await step(page, 30);
    const fall0 = await page.evaluate(() => {
      const p = window.__rg!.ctx.player;
      return { vy: p.velocity.y, x: p.position.x, z: p.position.z };
    });
    expect(fall0.vy).toBeLessThan(-3);
    await touch(cdp, 'touchStart', [{ x: 120, y: 290 }]);
    await touch(cdp, 'touchMove', [{ x: 200, y: 290 }]);
    await step(page, 60);
    await touch(cdp, 'touchEnd', []);
    const fall1 = await page.evaluate(() => window.__rg!.ctx.player.position);
    expect(Math.hypot(fall1.x - fall0.x, fall1.z - fall0.z)).toBeGreaterThan(3);
    await page.waitForFunction(() => {
      window.__rg!.step(1 / 30, 30, false);
      return window.__rg!.ctx.player.mode === 'walk';
    }, undefined, { polling: 50, timeout: 60_000 });
    expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  });
});

test.describe('touch tablet', () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test('tablet HUD', async ({ page }) => {
    await boot(page);
    await save(page, 'tablet-title');
    await startByTouch(page);
    const cdp = await page.context().newCDPSession(page);
    await touch(cdp, 'touchStart', [{ x: 180, y: 600 }]);
    await touch(cdp, 'touchMove', [{ x: 230, y: 540 }]);
    await step(page, 20, true);
    await save(page, 'tablet-hud');
    await touch(cdp, 'touchEnd', []);

    // Driving uses the same controls: Use gets in, the stick drives, Use gets out.
    await page.evaluate(() => {
      const rg = window.__rg!;
      const car = rg.ctx.vehicles.all[0];
      const q = car.object.quaternion;
      const h = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
      const x = car.position.x + Math.cos(h) * 1.9;
      const z = car.position.z - Math.sin(h) * 1.9;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.3, z, h);
      rg.step(1 / 60, 20, false);
    });
    await expect(page.getByTestId('touch-use')).toHaveClass(/ready/);
    await page.getByTestId('touch-use').tap({ force: true }); // it pulses while ready
    await step(page, 30);
    expect(await page.evaluate(() => window.__rg!.state().playerMode)).toBe('driving');
    await touch(cdp, 'touchStart', [{ x: 180, y: 600 }]);
    await touch(cdp, 'touchMove', [{ x: 180, y: 500 }]);
    await step(page, 90);
    await step(page, 1, true);
    expect(await page.evaluate(() => window.__rg!.ctx.vehicles.all[0]!.speed)).toBeGreaterThan(3);
    await save(page, 'tablet-driving');
    await touch(cdp, 'touchEnd', []);
    await step(page, 60);
    await page.getByTestId('touch-use').tap({ force: true }); // it pulses while ready
    await step(page, 30);
    expect(await page.evaluate(() => window.__rg!.state().playerMode)).toBe('walk');
    const errs = await page.evaluate(() => window.__rg!.errors);
    expect(errs).toEqual([]);
  });
});
