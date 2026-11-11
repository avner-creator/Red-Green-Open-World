/**
 * Owner bug "it would pause randomly": the pause menu may open ONLY on an explicit pause (Esc /
 * P / gamepad Start / touch pause button) or a hidden tab. 60 s of simulated play with clicks on
 * every HUD element, mashing of every gameplay key, Pip talking, toasts, the Fun Pass and the
 * controls card opening/closing, focus loss and lock loss: `__rg.pauseLog` must stay empty.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { boot, startGame } from './helpers';

test.describe.configure({ mode: 'serial' });

let page: Page;
let consoleErrors: string[] = [];

interface Entry { reason: string; detail: string }
const log = (): Promise<Entry[]> =>
  page.evaluate(() => ((window.__rg as unknown as { pauseLog?: Entry[] }).pauseLog ?? []).map((e) => ({ reason: e.reason, detail: e.detail })));
const phase = (): Promise<string> => page.evaluate(() => window.__rg!.state().phase);
const step = (n: number): Promise<void> => page.evaluate((k) => window.__rg!.step(1 / 60, k, false), n);
/** The browser dropping pointer lock (headless rarely grants it: emulate the event). */
const loseLock = (blurFirst: boolean): Promise<void> =>
  page.evaluate(async (blur) => {
    if (blur) window.dispatchEvent(new Event('blur'));
    if (document.pointerLockElement) {
      await new Promise<void>((done) => {
        document.addEventListener('pointerlockchange', () => done(), { once: true });
        document.exitPointerLock();
      });
    } else document.dispatchEvent(new Event('pointerlockchange'));
  }, blurFirst);
/** Wait out the lock-loss classifier (real time), stepping the game meanwhile. */
const settle = async (): Promise<void> => {
  await page.waitForTimeout(260);
  await step(3);
};

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  page = await browser.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  page.on('console', (m) => { if (m.text().startsWith('DBG')) console.log(m.text()); });
  ({ consoleErrors } = await boot(page));
  await startGame(page);
  await step(5);
});

test.afterAll(async () => {
  await page.close();
});

test('60 s of busy play never opens the pause menu by itself', async () => {
  test.setTimeout(240_000);
  for (let round = 0; round < 12; round++) {
    // ~5 s of game time per round: every gameplay key mashed (Tab = Fun Pass, H/F1 = help card,
    // T = ask Pip), Pip talks, a toast pops, every visible HUD element gets a mouse click; any card
    // left open is closed again with Esc, as a child would.
    await page.evaluate((r) => {
      const rg = window.__rg!;
      const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'Space', 'ShiftLeft', 'KeyE', 'KeyF', 'KeyR', 'KeyQ', 'KeyC', 'KeyG', 'KeyT', 'KeyH', 'Tab', 'F1', 'KeyB', 'Digit1'];
      const key = (type: string, code: string): void => {
        (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
      };
      for (const k of keys) {
        key('keydown', k);
        rg.step(1 / 60, 4, false);
        key('keyup', k);
        rg.step(1 / 60, 3, false);
      }
      window.__rgBuddy?.ask();
      rg.ctx.events.emit('ui:toast', { icon: 'gem', text: `t${r}` });
      rg.step(1 / 60, 20, false);
      const hud = [...document.querySelectorAll<HTMLElement>('.rg [data-testid]')].filter((el) => {
        if (el.closest('.screen, [data-testid="touch-hud"]')) return false;
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      });
      for (const el of hud) {
        const b = el.getBoundingClientRect();
        const o = { bubbles: true, cancelable: true, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2, pointerType: 'mouse', button: 0 };
        el.dispatchEvent(new PointerEvent('pointerdown', o));
        el.dispatchEvent(new MouseEvent('mousedown', o));
        el.dispatchEvent(new PointerEvent('pointerup', o));
        el.dispatchEvent(new MouseEvent('mouseup', o));
        el.dispatchEvent(new MouseEvent('click', o));
        rg.step(1 / 60, 2, false);
        if (rg.state().phase !== 'playing') console.log(`DBG paused after click ${el.dataset.testid}`);
        const openCards = [...document.querySelectorAll<HTMLElement>('.rg .on')].map((x) => x.dataset.testid ?? x.className);
        console.log(`DBG ${el.dataset.testid} open=${openCards.join(',')} lock=${!!document.pointerLockElement}`);
        if (document.querySelector('[data-testid="funpass"].on, [data-testid="controls-card"].on')) {
          key('keydown', 'Escape');
          key('keyup', 'Escape');
          rg.step(1 / 60, 2, false);
          if (rg.state().phase !== 'playing') console.log(`DBG paused after Esc`);
        }
      }
      rg.ctx.canvas.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const left = 300 - (r === 0 ? 0 : 0);
      rg.step(1 / 60, Math.max(0, left - 140 - hud.length * 2), false);
    }, round);
    // Real browser input too (a few trusted presses and a click on the world).
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.mouse.click(320, 120);
    await step(4);
    // The window loses focus (OS notification, alt-tab) and the browser drops pointer lock.
    if (round % 4 === 1) {
      await loseLock(true);
      await settle();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    }
    expect(await phase(), `round ${round}: ${JSON.stringify(await log())}`).toBe('playing');
  }
  expect(await log()).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('lock loss from focus change shows the click hint and keeps playing', async () => {
  await page.evaluate(() => window.__rg!.ctx.input.capturePointer());
  await loseLock(true);
  await settle();
  await step(50); // hint waits 0.6 s
  expect(await phase()).toBe('playing');
  expect(await page.evaluate(() => (window as unknown as { __rgLookHint?: boolean }).__rgLookHint)).toBe(true);
  expect(await log()).toEqual([]);
});

test('Esc that the browser swallows while the Fun Pass is open closes the card, not the game', async () => {
  await page.keyboard.press('Tab');
  await step(3);
  await expect(page.getByTestId('funpass')).toHaveClass(/\bon\b/);
  await loseLock(false); // Chrome: Esc exits the lock, no key-down reaches the page
  await settle();
  expect(await phase()).toBe('playing');
  await expect(page.getByTestId('funpass')).not.toHaveClass(/\bon\b/);
  expect(await log()).toEqual([]);
});

test('explicit pauses are logged with their reason', async () => {
  await loseLock(false); // Esc swallowed by the browser, no card open: pause
  await settle();
  expect(await phase()).toBe('paused');
  await page.getByTestId('resume').click();
  await step(5);
  await page.keyboard.press('Escape');
  await step(3);
  expect(await phase()).toBe('paused');
  expect((await log()).map((e) => e.reason)).toEqual(['lock-esc', 'key']);
});
