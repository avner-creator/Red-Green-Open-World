/**
 * QA4 blocker: a real PLAY click took the headless renderer to 2–3.6 GB and it was killed (a
 * granted pointer lock in headless Chromium does that). After the click at 1280×720 the game must
 * play 10 s with flat JS heap and `renderer.info`, and pointer-lock requests must not loop.
 */
import { expect, test } from '@playwright/test';
import { boot } from './helpers';

test('PLAY click at 1280×720: 10 s of play, memory flat, no lock-request loop', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  let crashed = false;
  page.on('crash', () => (crashed = true));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { consoleErrors } = await boot(page);
  await page.getByTestId('play').click();
  await page.evaluate(() => window.__rg!.step(1 / 60, 1, false));
  await page.waitForFunction(() => window.__rg?.state().phase === 'playing');
  const sample = (): Promise<{ heap: number; geo: number; tex: number; locks: number }> =>
    page.evaluate(() => {
      const m = window.__rg!.ctx.renderer.info.memory;
      const pm = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return {
        heap: Math.round((pm?.usedJSHeapSize ?? 0) / 1e6),
        geo: m.geometries,
        tex: m.textures,
        locks: (window as unknown as { __rgLockRequests: () => number }).__rgLockRequests(),
      };
    });
  // Warm-up second: streamed models attach and first-sight geometry lands.
  await page.evaluate(() => window.__rg!.step(1 / 60, 60, true));
  const a = await sample();
  for (let s = 0; s < 9; s++) await page.evaluate(() => window.__rg!.step(1 / 60, 60, true));
  const b = await sample();
  expect(crashed).toBe(false);
  expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('playing');
  expect(b.geo - a.geo, JSON.stringify({ a, b })).toBeLessThanOrEqual(40);
  expect(b.tex - a.tex, JSON.stringify({ a, b })).toBeLessThanOrEqual(10);
  if (a.heap > 0) expect(b.heap - a.heap, JSON.stringify({ a, b })).toBeLessThan(120);
  expect(b.locks).toBeLessThanOrEqual(2);
  expect(consoleErrors).toEqual([]);
  await page.close();
});
