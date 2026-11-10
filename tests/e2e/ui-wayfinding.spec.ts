import { expect, test } from '@playwright/test';
import { boot } from './helpers';

test.describe('ui wayfinding', () => {
  test('compass, controls card and mode strips', async ({ page }) => {
    const { consoleErrors } = await boot(page);
    await page.evaluate(() => {
      window.__rg!.freeze(true);
      window.__rg!.start();
      window.__rg!.step(1 / 60, 30, false);
      window.__rg!.step(1 / 60, 1);
    });

    // Compass: attraction markers only, and they move with the camera yaw.
    const markers = page.getByTestId('compass-marker');
    expect(await markers.count()).toBeGreaterThanOrEqual(5);
    const anchors = await markers.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.anchor));
    expect(anchors.join()).not.toMatch(/gem|key|chest|lock/i);
    const lefts = (): Promise<string[]> => markers.evaluateAll((els) => els.map((e) => (e as HTMLElement).style.left));
    const before = await lefts();
    await page.evaluate(() => {
      const rg = window.__rg!;
      const p = rg.ctx.player.position;
      rg.teleport(p.x, p.y + 0.2, p.z, Math.PI / 2 + rg.ctx.cameraRig.yaw);
      rg.step(1 / 60, 120, false);
      rg.step(1 / 60, 1);
    });
    const after = await lefts();
    expect(after.join('|')).not.toBe(before.join('|'));
    expect(await page.locator('.wf-m.hl').count()).toBe(1);

    // H toggles the controls card; Esc closes it without pausing; the "?" button works too.
    const card = page.getByTestId('controls-card');
    await expect(card).not.toHaveClass(/on/);
    await page.keyboard.press('KeyH');
    await expect(card).toHaveClass(/on/);
    expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('playing');
    await page.keyboard.press('Escape');
    await expect(card).not.toHaveClass(/on/);
    expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('playing');
    await page.getByTestId('help').click();
    await expect(card).toHaveClass(/on/);
    await page.keyboard.press('KeyH');
    await expect(card).not.toHaveClass(/on/);

    // Mode strips follow player:mode.
    const strip = page.getByTestId('mode-strip');
    const root = page.locator('.rg').first();
    const emit = (mode: string, previous: string): Promise<void> =>
      page.evaluate(([m, p]) => window.__rg!.ctx.events.emit('player:mode', { mode: m as 'walk', previous: p as 'walk' }), [mode, previous]);
    await emit('driving', 'walk');
    await expect(strip).toHaveClass(/on/);
    await expect(strip).toHaveAttribute('data-kind', 'driving');
    await expect(root).toHaveAttribute('data-mode', 'driving');
    await expect(page.getByTestId('tutorial')).toBeHidden();
    await emit('external', 'driving');
    await expect(strip).toHaveAttribute('data-kind', 'skydive');
    await emit('walk', 'external');
    await expect(strip).not.toHaveClass(/on/);
    await expect(root).toHaveAttribute('data-mode', 'walk');

    // The pause menu has a Controls button that opens the same card.
    await page.evaluate(() => window.__rg!.ctx.session.pause());
    await page.evaluate(() => window.__rg!.step(1 / 60, 2));
    await page.getByTestId('pause-controls').click();
    await expect(page.locator('[data-screen="controls"]')).toHaveClass(/on/);
    expect(consoleErrors).toEqual([]);
  });
});
