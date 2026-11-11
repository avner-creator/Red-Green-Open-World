import { expect, test } from '@playwright/test';
import { boot, startGame } from './helpers';

// Radio: M cycles stations, the chip shows, the choice survives a reload, no music file loads
// before Play. Audio is silent in test mode, so we assert through the radio state and the DOM.
test('radio: M cycles three different stations, chip shows, survives reload', async ({ page }) => {
  test.setTimeout(300_000);
  const audioRequests: string[] = [];
  page.on('request', (r) => {
    if (/\.(ogg|mp3|wav)(\?|$)/.test(r.url())) audioRequests.push(r.url());
  });
  const { consoleErrors } = await boot(page);
  const btn = page.getByTestId('radio-btn');
  await expect(btn).toBeHidden(); // title screen: no radio
  expect(audioRequests).toEqual([]);

  await startGame(page);
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAttribute('data-station', 'auto');

  const seen: string[] = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('KeyM');
    await expect(page.getByTestId('radio-chip')).toHaveClass(/on/);
    seen.push((await btn.getAttribute('data-station')) ?? '');
    await expect(page.getByTestId('radio-chip')).toHaveAttribute('data-station', seen[i] ?? '');
  }
  expect(new Set(seen).size).toBe(3);
  expect(seen).not.toContain('auto');

  // The chip hides itself after about 2 s.
  await expect(page.getByTestId('radio-chip')).not.toHaveClass(/on/, { timeout: 20_000 });

  // The on-screen button works too (3 presses landed on the 3rd station; one more goes to the 4th).
  await btn.click();
  const fourth = (await btn.getAttribute('data-station')) ?? '';
  expect(seen).not.toContain(fourth);

  const last = await btn.getAttribute('data-station');
  await page.reload();
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 90_000 });
  const saved = await page.evaluate(() => (window as unknown as { __rgRadio: { current(): string } }).__rgRadio.current());
  expect(saved).toBe(last);
  expect(consoleErrors).toEqual([]);
});
