/**
 * QA round 6 m5: gamepad Start must toggle pause. With an emulated standard pad: Start pauses,
 * Start again (pressed quickly, as a child does) resumes; holding Start never flips back and forth;
 * B still resumes too.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { boot, startGame } from './helpers';

test.describe.configure({ mode: 'serial' });

let page: Page;
let consoleErrors: string[] = [];
const phase = (): Promise<string> => page.evaluate(() => window.__rg!.state().phase);
const step = (n: number): Promise<void> => page.evaluate((k) => window.__rg!.step(1 / 60, k, false), n);
const button = (i: number, down: boolean): Promise<void> =>
  page.evaluate(
    ([i, d]) => {
      const pad = (window as unknown as { __rgPad: { buttons: { pressed: boolean; touched: boolean; value: number }[]; timestamp: number } }).__rgPad;
      pad.buttons[i] = { pressed: d, touched: d, value: d ? 1 : 0 };
      pad.timestamp++;
    },
    [i, down] as const,
  );
/** A quick tap: 3 frames down, 3 frames up (about 0.1 s). */
const tap = async (i: number): Promise<void> => {
  await button(i, true);
  await step(3);
  await button(i, false);
  await step(3);
};

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  await startGame(page);
  await page.evaluate(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = { id: 'test pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons };
    (window as unknown as { __rgPad: typeof pad }).__rgPad = pad;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
  });
  await step(5);
});

test.afterAll(async () => {
  await page.close();
});

test('Start pauses and a quick second Start resumes (toggle), several times in a row', async () => {
  expect(await phase()).toBe('playing');
  for (let i = 0; i < 3; i++) {
    await tap(9);
    await step(2);
    expect(await phase(), `round ${i}: first Start`).toBe('paused');
    await tap(9);
    await step(2);
    expect(await phase(), `round ${i}: second Start`).toBe('playing');
    await step(4);
  }
});

test('holding Start does not flip back; B still resumes', async () => {
  await button(9, true);
  await step(40);
  expect(await phase()).toBe('paused');
  await button(9, false);
  await step(4);
  expect(await phase()).toBe('paused');
  await tap(1);
  await step(2);
  expect(await phase()).toBe('playing');
  expect(consoleErrors).toEqual([]);
});
