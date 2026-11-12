/**
 * QA8 m12: a menu left open silenced Pip for the whole session. In the real game: the wardrobe
 * (opened from play: the session pauses under it) left alone gets ONE gentle "close it" cue after
 * ~12 s (the close key and a ring round the close button), and Pip never talks over the pause menu.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { boot, startGame } from './helpers';

const bubble = (page: Page): Promise<{ on: boolean; id: string; action: string }> =>
  page.evaluate(() => {
    const b = document.querySelector<HTMLElement>('[data-testid="pip-bubble"]');
    return { on: !!b?.classList.contains('on') || b?.dataset.mode === 'none', id: b?.dataset.id ?? '', action: b?.dataset.action ?? '' };
  });

/** Step `seconds` of frozen time, half a second at a time, and collect every bubble line id. */
async function run(page: Page, seconds: number): Promise<string[]> {
  const ids: string[] = [];
  for (let t = 0; t < seconds; t += 0.5) {
    await page.evaluate(() => window.__rg!.step(1 / 60, 30, false));
    const b = await bubble(page);
    if (b.on && b.id && ids.at(-1) !== b.id) ids.push(b.id);
  }
  return ids;
}

test('a wardrobe left open gets a gentle close cue; the pause menu gets none', async ({ page }) => {
  test.setTimeout(240_000);
  const { consoleErrors } = await boot(page, '&buddy=1');
  await startGame(page);
  // A returning player (no story) who has been playing a little.
  await run(page, 6);

  // The wardrobe from play: the session pauses under it.
  await page.keyboard.press('KeyI');
  await page.evaluate(() => window.__rg!.step(1 / 60, 2, false));
  expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('paused');
  await expect(page.locator('[data-screen="wardrobe"]')).toHaveClass(/on/);
  const early = await run(page, 10);
  expect(early).not.toContain('menu:close');
  const later = await run(page, 5);
  expect(later).toContain('menu:close');
  const b = await bubble(page);
  if (b.id === 'menu:close') {
    expect(b.action).toBe('close');
    await expect(page.getByTestId('pip-callout')).toHaveClass(/on/);
  }
  // Only once in a while: not again within the next 20 s.
  const after = await run(page, 20);
  expect(after.filter((id) => id === 'menu:close').length).toBeLessThanOrEqual(1);

  // Closed: play resumes.
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__rg!.step(1 / 60, 2, false));
  expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('playing');

  // The pause menu: Pip says nothing over it, however long it stays open.
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__rg!.step(1 / 60, 2, false));
  expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('paused');
  const paused = await run(page, 30);
  expect(paused).not.toContain('menu:close');
  expect(consoleErrors).toEqual([]);
});
