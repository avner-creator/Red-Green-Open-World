import { expect, test } from '@playwright/test';
import { boot, startGame } from './helpers';

// Radio: M cycles stations, the chip shows, the choice survives a reload, no music file loads
// before Play. Audio is silent in test mode, so we assert through the DOM and the radio state.
test.use({ reducedMotion: 'reduce' });
test('radio: M cycles three different stations, chip shows, survives reload', async ({ page }) => {
  test.setTimeout(300_000);
  const audioRequests: string[] = [];
  page.on('request', (r) => {
    if (/\.(ogg|mp3|wav)(\?|$)/.test(r.url())) audioRequests.push(r.url());
  });
  const { consoleErrors } = await boot(page);
  const btn = page.getByTestId('radio-btn');
  const chip = page.getByTestId('radio-chip');
  await expect(btn).toBeHidden(); // title screen: no radio
  expect(audioRequests).toEqual([]);

  await startGame(page);
  await page.evaluate(() => window.__rg?.step(1 / 60, 3, false)); // let the UI see the phase
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAttribute('data-station', 'auto');

  const seen: string[] = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('KeyM');
    await expect(btn).not.toHaveAttribute('data-station', seen[i - 1] ?? 'auto');
    seen.push((await btn.getAttribute('data-station')) ?? '');
  }
  expect(new Set(seen).size).toBe(3);
  expect(seen).not.toContain('auto');
  await expect(chip).toHaveClass(/on/);
  await expect(chip).toHaveAttribute('data-station', seen[2] ?? '');

  const last = seen[2];
  await page.reload();
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 90_000 });
  const saved = await page.evaluate(() => (window as unknown as { __rgRadio: { current(): string } }).__rgRadio.current());
  expect(saved).toBe(last);
  expect(consoleErrors).toEqual([]);
});
