import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot } from './helpers';

const OUT = 'test-results/glasses-ui';
mkdirSync(OUT, { recursive: true });

const BANNED = /\b(good|poor|better|improv\w*|training|exercise\w*|therap\w*|treatment|vision|amblyop\w*|lazy eye|health\w*|patient|score)\b/i;

function channel(png: PNG, c: number): Buffer {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    o.data[i] = o.data[i + 1] = o.data[i + 2] = png.data[i + c] as number;
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

async function save(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.__rg!.render());
  const buf = await page.screenshot({ type: 'png', animations: 'disabled' });
  writeFileSync(`${OUT}/${name}.png`, buf);
  const png = PNG.sync.read(buf);
  writeFileSync(`${OUT}/${name}-R.png`, channel(png, 0));
  writeFileSync(`${OUT}/${name}-G.png`, channel(png, 1));
}


/** Pause menu -> grown-up button -> gate (multiplication answer) -> settings. */
async function openSettings(page: Page): Promise<void> {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    if (rg.state().phase === 'title') rg.ctx.session.start();
    rg.ctx.session.pause();
    rg.step(1 / 60, 2, false);
  });
  await page.getByTestId('pause-grownups').click();
  const answer = await page.evaluate(() => {
    const m = /(\d+) × (\d+)/.exec(document.querySelector('[data-testid="gate-question"]')!.textContent!)!;
    return Number(m[1]) * Number(m[2]);
  });
  await page.locator(`[data-testid="gate-answer"][data-value="${answer}"]`).click();
  await expect(page.getByTestId('settings')).toBeVisible();
}

test.describe('glasses ui', () => {
  let page: Page;
  let consoleErrors: string[] = [];
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    ({ consoleErrors } = await boot(page));
  });
  test.afterAll(async () => {
    await page.close();
  });

  test('summary is not reachable without the gate', async () => {
    await page.evaluate(() => {
      const rg = window.__rg!;
      rg.freeze(true);
      rg.ctx.session.start();
      rg.ctx.session.pause();
      rg.step(1 / 60, 2, false);
    });
    await expect(page.getByTestId('resume')).toBeVisible();
    await expect(page.getByTestId('open-summary')).toBeHidden();
    await expect(page.getByTestId('glasses-summary')).toBeHidden();
    await expect(page.getByTestId('auto-challenge')).toBeHidden();
  });

  test('auto challenge toggle, summary, empty state and back', async () => {
    await openSettings(page);

    // Toggle: off by default, on persists, Reset turns it off.
    const toggle = page.getByTestId('auto-challenge');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => window.__rg!.ctx.settings.get().autoChallenge)).toBeFalsy();
    const fits = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="settings"]') as HTMLElement;
      const r = p.getBoundingClientRect();
      const last = document.querySelector('[data-testid="open-summary"]')!.getBoundingClientRect();
      return { overflow: p.scrollHeight > p.clientHeight + 1 || last.bottom > r.bottom, inView: r.top >= 0 && r.bottom <= window.innerHeight };
    });
    expect(fits).toEqual({ overflow: false, inView: true });
    await save(page, 'settings-off');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.__rg!.ctx.settings.get().autoChallenge)).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('rgow.settings.v1'))).toContain('"autoChallenge":true');
    await save(page, 'settings-on');
    const rowText = await page.locator('[data-testid="auto-challenge"]').locator('xpath=ancestor::div[contains(@class,"srow")]').innerText();
    expect(rowText).not.toMatch(BANNED);

    // Keyboard reachable and operable.
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Summary with no summary API data (rows empty): friendly empty state.
    await page.evaluate(() => {
      window.__rg!.ctx.vision.sessionSummary = () => ({ rows: [], seconds: 0, challenge: { enabled: false, level: 0, maxLevel: 6, stepsUp: 0, stepsDown: 0 } });
    });
    await page.getByTestId('open-summary').click();
    await expect(page.getByTestId('glasses-summary')).toBeVisible();
    await expect(page.getByTestId('settings')).toBeHidden();
    await expect(page.getByTestId('summary-empty')).toContainText('Nothing to show yet');
    await expect(page.getByTestId('summary-challenge')).toContainText('Off');
    await page.getByTestId('summary-back').click();
    await expect(page.getByTestId('settings')).toBeVisible();
    await expect(page.getByTestId('glasses-summary')).toBeHidden();

    // Filled summary from a stub.
    await page.evaluate(() => {
      window.__rg!.ctx.vision.sessionSummary = () => ({
        rows: [
          { mechanic: 'glowflies', kind: 'find', tier: 1, hits: 3, misses: 1 },
          { mechanic: 'glowflies', kind: 'find', tier: 3, hits: 0, misses: 2 },
          { mechanic: 'oddone', kind: 'tellApart', tier: 2, hits: 2, misses: 1 },
          { mechanic: 'hatTrick', kind: 'onHero', tier: 1, hits: 1, misses: 0 },
        ],
        seconds: 305,
        challenge: { enabled: true, level: 2, maxLevel: 6, stepsUp: 3, stepsDown: 1 },
      });
    });
    await page.getByTestId('open-summary').click();
    const sum = page.getByTestId('glasses-summary');
    await expect(sum).toBeVisible();
    await expect(page.getByTestId('summary-time')).toContainText('5:05');
    await expect(page.getByTestId('summary-challenge')).toContainText('On · step 2 of 6 · 3 up, 1 down');
    const fly = sum.locator('tr[data-mechanic="glowflies"]');
    await expect(fly.locator('td').nth(0)).toHaveText('Glow-flies');
    await expect(fly.locator('td').nth(1)).toHaveText('3 / 475%');
    await expect(fly.locator('td').nth(2)).toHaveText('0 / 0–');
    await expect(fly.locator('td').nth(3)).toHaveText('0 / 20%');
    await expect(sum.locator('tr[data-mechanic="oddone"] td').nth(0)).toHaveText('Odd one out');
    await expect(sum.locator('tr[data-mechanic="oddone"] td').nth(2)).toHaveText('2 / 367%');
    await expect(sum.locator('tr[data-mechanic="hatTrick"] td').nth(0)).toHaveText('Hat Trick');
    await expect(page.getByTestId('summary-total').locator('td').nth(4)).toHaveText('6 / 1060%');
    const kinds = await sum.locator('tr.kind').allInnerTexts();
    expect(kinds).toEqual(['Find', 'Tell apart', 'On the hero']);
    expect(await sum.innerText()).not.toMatch(BANNED);
    await save(page, 'summary');
    // Esc goes back to settings, not out of the menus.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings')).toBeVisible();
    await expect(sum).toBeHidden();

    // Settings Reset turns the toggle off.
    await page.getByTestId('tab-game').click();
    await page.getByTestId('reset').click();
    await page.getByTestId('reset').click();
    await page.getByTestId('tab-glasses').click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => window.__rg!.ctx.settings.get().autoChallenge)).toBeFalsy();
  });

  test('settings row and summary fit at other sizes', async () => {
    await page.evaluate(() => {
      window.__rg!.ctx.vision.sessionSummary = () => ({
        rows: [
          { mechanic: 'glowflies', kind: 'find', tier: 1, hits: 3, misses: 1 },
          { mechanic: 'oddone', kind: 'tellApart', tier: 2, hits: 2, misses: 1 },
        ],
        seconds: 305,
        challenge: { enabled: true, level: 2, maxLevel: 6, stepsUp: 3, stepsDown: 1 },
      });
    });
    if (await page.getByTestId('settings-done').isVisible()) await page.getByTestId('settings-done').click();
    for (const [w, h] of [[667, 375], [1920, 1080]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await openSettings(page);
      const gap = await page.evaluate(() => {
        const sub = document.querySelector('[data-testid="auto-challenge"]')!.closest('.srow')!.querySelector('.sub')!.getBoundingClientRect();
        const btn = document.querySelector('[data-testid="auto-challenge"]')!.getBoundingClientRect();
        const p = document.querySelector('[data-testid="settings"]')!.getBoundingClientRect();
        const last = document.querySelector('[data-testid="open-summary"]')!.getBoundingClientRect();
        return { gap: btn.top - sub.bottom, fits: last.bottom <= p.bottom };
      });
      expect(gap.gap).toBeGreaterThan(2);
      expect(gap.fits).toBe(true);
      await save(page, `settings-${w}`);
      await page.getByTestId('open-summary').click();
      await expect(page.getByTestId('glasses-summary')).toBeVisible();
      await save(page, `summary-${w}`);
      await page.getByTestId('summary-back').click();
      await page.getByTestId('settings-done').click();
    }
    await page.setViewportSize({ width: 640, height: 360 });
  });

  test('toggle survives a reload', async () => {
    await page.evaluate(() => window.__rg!.ctx.settings.set({ autoChallenge: true }));
    await page.reload();
    await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 90_000 });
    expect(await page.evaluate(() => window.__rg!.ctx.settings.get().autoChallenge)).toBe(true);
    await page.evaluate(() => window.__rg!.ctx.settings.reset());
  });

  test('no console errors', () => {
    expect(consoleErrors).toEqual([]);
  });
});
