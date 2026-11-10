import { expect, test } from '@playwright/test';
import { boot, lumaStdDev, shot } from './helpers';

test('boots, renders a frame, starts a session, no console errors', async ({ page }) => {
  const { consoleErrors } = await boot(page);
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 30);
  });
  const img = await shot(page, 'test-results/smoke.png');
  expect(lumaStdDev(img)).toBeGreaterThan(5);
  const state = await page.evaluate(() => window.__rg!.state());
  expect(state.phase).toBe('playing');
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('session ends when the timer runs out', async ({ page }) => {
  await boot(page);
  const phase = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.setRemaining(0.05);
    rg.step(1 / 60, 10);
    return rg.state().phase;
  });
  expect(phase).toBe('ended');
});
