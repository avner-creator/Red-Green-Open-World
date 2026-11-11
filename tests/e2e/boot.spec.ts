import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { canvasShot, lumaStdDev } from './helpers';

// Stream I: loading screen, tab-hidden pause, lost-context recovery, wordless failure screens.
// One real boot is shared by the first three tests; the failure tests never build the world.
test.describe('boot (one shared page)', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;
  const consoleErrors: string[] = [];

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    // Record every bar update (the loader writes data-stage / data-progress on #boot).
    await page.addInitScript(() => {
      const log: { stage: string; progress: number; t: number }[] = [];
      (window as unknown as { __bootLog: typeof log }).__bootLog = log;
      new MutationObserver(() => {
        const el = document.getElementById('boot');
        if (!el) return;
        const last = log[log.length - 1];
        const entry = { stage: el.dataset.stage ?? '', progress: Number(el.dataset.progress ?? 0), t: performance.now() };
        if (!last || last.stage !== entry.stage || last.progress !== entry.progress) log.push(entry);
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-stage', 'data-progress'] });
    });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('the loading screen shows first, follows the boot stages, then reveals the title', async () => {
    await page.goto('/?test=1&quality=low', { waitUntil: 'commit' });
    // Inline HTML: visible before the game is ready, already showing the wordmark and the bar.
    await expect(page.locator('#boot')).toBeVisible();
    await expect(page.locator('#boot h1')).toBeVisible();
    await expect(page.locator('#boot-fill')).toBeAttached();
    expect(await page.evaluate(() => window.__rg?.ready === true)).toBe(false);

    await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 90_000 });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 10_000 });
    await expect(page.locator('[data-testid="play"]')).toBeVisible();

    const log = await page.evaluate(() => (window as unknown as { __bootLog: { stage: string; progress: number }[] }).__bootLog);
    const stages = [...new Set(log.map((e) => e.stage).filter(Boolean))];
    expect(stages).toEqual(['code', 'physics', 'world', 'player', 'activities', 'ui', 'frame', 'done']);
    for (let i = 1; i < log.length; i++) expect(log[i].progress).toBeGreaterThanOrEqual(log[i - 1].progress);
    expect(log[log.length - 1].progress).toBe(1);
    expect(consoleErrors).toEqual([]);
  });

  test('a hidden tab pauses the game; coming back keeps it paused for the player', async () => {
    const setHidden = (hidden: boolean): Promise<void> =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await page.evaluate(() => {
      window.__rg!.freeze(true);
      window.__rg!.start();
      window.__rg!.step(1 / 60, 2, false);
    });
    expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('playing');
    await setHidden(true);
    expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('paused');
    await setHidden(false);
    expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('paused');
    await page.evaluate(() => window.__rg!.ctx.session.resume());
    expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('playing');
  });

  test('a lost WebGL context shows the wordless screen and recovers without a reload', async () => {
    await page.evaluate(() => {
      const ext = window.__rg!.ctx.renderer.getContext().getExtension('WEBGL_lose_context');
      (window as unknown as { __loseExt: unknown }).__loseExt = ext;
      ext!.loseContext();
    });
    await expect(page.locator('[data-testid="fail-context"]')).toBeVisible();
    await page.evaluate(() => (window as unknown as { __loseExt: WEBGL_lose_context }).__loseExt.restoreContext());
    await page.waitForSelector('[data-testid="fail-context"]', { state: 'detached', timeout: 20_000 });
    // Same page, same session: draw again and check a real picture came back.
    await page.evaluate(() => {
      window.__rg!.ctx.session.resume();
      window.__rg!.step(1 / 60, 2);
    });
    const img = await canvasShot(page, 'test-results/boot-context-restored.png');
    expect(lumaStdDev(img)).toBeGreaterThan(5);
    expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('a failed download', () => {
  test('shows the wordless retry screen, and retry reloads the game', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.route(/\/build\/world-[^/]*\.js$/, (r) => r.abort());
    await page.goto('/?quality=low');
    await expect(page.locator('[data-testid="fail-load"]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#boot')).toHaveCount(0);
    await page.unroute(/\/build\/world-[^/]*\.js$/);
    await Promise.all([page.waitForEvent('load'), page.locator('[data-testid="fail-retry"]').click()]);
    // Reloaded: the loading screen is back and the failure screen is gone.
    await expect(page.locator('#boot')).toBeAttached();
    await expect(page.locator('[data-testid="fail-load"]')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
});

