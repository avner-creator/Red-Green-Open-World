import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot } from './helpers';

const OUT = 'test-results/ui';
mkdirSync(OUT, { recursive: true });

function channel(png: PNG, c: number): Buffer {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    o.data[i] = o.data[i + 1] = o.data[i + 2] = png.data[i + c] as number;
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

async function save(page: Page, name: string): Promise<void> {
  // Let CSS animations settle without advancing the game.
  await page.waitForTimeout(1100);
  const buf = await page.screenshot({ type: 'png' });
  writeFileSync(`${OUT}/${name}.png`, buf);
  const png = PNG.sync.read(buf);
  writeFileSync(`${OUT}/${name}-R.png`, channel(png, 0));
  writeFileSync(`${OUT}/${name}-G.png`, channel(png, 1));
}

const step = (page: Page, n = 5): Promise<void> => page.evaluate((k) => window.__rg!.step(1 / 60, k), n);

test.describe('ui', () => {
  test('title, play, hud, pause, end, gate, settings', async ({ page }) => {
    const { consoleErrors } = await boot(page);
    await page.evaluate(() => window.__rg!.freeze(true));
    await step(page);
    await save(page, 'title');

    // Play starts the session in one click.
    await page.getByTestId('play').click();
    expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('playing');
    await step(page);
    await save(page, 'tutorial');
    // The tutorial is a compact strip low on the screen: well under 45% wide, never over the middle.
    const tut = (await page.getByTestId('tutorial').boundingBox())!;
    const vp = page.viewportSize()!;
    expect(tut.width / vp.width).toBeLessThan(0.34);
    expect(tut.height / vp.height).toBeLessThan(0.2);
    expect(tut.y).toBeGreaterThan(vp.height * 0.7);
    expect(tut.x + tut.width).toBeLessThan(vp.width * 0.5);

    // HUD counters react to events.
    await page.evaluate(() => {
      const rg = window.__rg!;
      rg.ctx.session.setTotals({ gems: 60 });
      rg.ctx.events.emit('gem:collected', { id: 'g1', count: 3, total: 60, position: rg.ctx.player.position.clone() });
      rg.ctx.events.emit('stunt', { kind: 'bigBounce', value: 22, stars: 2 });
      rg.ctx.events.emit('ui:toast', { icon: 'key' });
      rg.step(1 / 60, 4);
    });
    await expect(page.getByTestId('gems')).toHaveText('3/60');
    await expect(page.getByTestId('stars')).toHaveText('2');
    await page.evaluate(() => window.__rg!.setRemaining(25));
    await step(page);
    await expect(page.getByTestId('timer')).toContainText('0:25');
    await save(page, 'hud');

    // Pause menu
    await page.evaluate(() => {
      window.__rg!.ctx.session.pause();
      window.__rg!.step(1 / 60, 2);
    });
    await expect(page.getByTestId('resume')).toBeVisible();
    expect(await page.evaluate(() => window.__rg!.ctx.ui.menuOpen)).toBe(true);
    await save(page, 'pause');

    // Gate blocks settings until passed
    await page.getByTestId('pause-grownups').click();
    await expect(page.getByTestId('gate-hold')).toBeVisible();
    await expect(page.getByTestId('settings')).toBeHidden();
    await save(page, 'gate');
    const wrong = await page.evaluate(() => {
      const q = document.querySelector('[data-testid="gate-question"]')!.textContent!;
      const m = /(\d+) × (\d+)/.exec(q)!;
      return Number(m[1]) * Number(m[2]);
    });
    const options = await page.getByTestId('gate-answer').evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.value)));
    const bad = options.find((o) => o !== wrong)!;
    await page.locator(`[data-testid="gate-answer"][data-value="${bad}"]`).click();
    await expect(page.getByTestId('settings')).toBeHidden();
    const q2 = await page.evaluate(() => {
      const m = /(\d+) × (\d+)/.exec(document.querySelector('[data-testid="gate-question"]')!.textContent!)!;
      return Number(m[1]) * Number(m[2]);
    });
    await page.locator(`[data-testid="gate-answer"][data-value="${q2}"]`).click();
    await expect(page.getByTestId('settings')).toBeVisible();
    await save(page, 'settings');

    // Two tabs, nothing scrolls at 640x360.
    const fits = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="settings"]') as HTMLElement;
      const r = p.getBoundingClientRect();
      return { overflow: p.scrollHeight > p.clientHeight + 1, inView: r.top >= 0 && r.bottom <= window.innerHeight };
    });
    expect(fits).toEqual({ overflow: false, inView: true });
    await page.getByTestId('tab-game').click();
    await save(page, 'settings-game');
    await page.getByTestId('quality-high').click();
    await page.getByTestId('tab-glasses').click();
    await page.getByTestId('weak-right').click();
    const s = await page.evaluate(() => window.__rg!.ctx.settings.get());
    expect(s.quality).toBe('high');
    expect(s.eye.weakEye).toBe('right');
    expect(await page.evaluate(() => localStorage.getItem('rgow.settings.v1'))).toContain('"high"');
    // Calibration (src/vision) takes over the screen; settings hide until it closes.
    const calOpen = (): Promise<boolean> => page.evaluate(() => window.__rgVision!.calibrationOpen());
    await page.getByTestId('calibrate').click();
    expect(await calOpen()).toBe(true);
    const cal = page.getByRole('dialog', { name: 'Glasses calibration' });
    await expect(cal).toBeVisible();
    await expect(page.getByTestId('settings')).toBeHidden();
    await expect(page.getByTestId('timer')).toBeHidden(); // no HUD over the test pattern
    expect(await page.evaluate(() => window.__rg!.ctx.ui.menuOpen)).toBe(true);
    expect(await page.evaluate(() => document.querySelector('.rgv-cal')!.contains(document.activeElement))).toBe(true);
    await save(page, 'calibration');
    // Esc closes only the calibration: back to settings (focused), still paused.
    await page.keyboard.press('Escape');
    expect(await calOpen()).toBe(false);
    await expect(cal).toHaveCount(0);
    await expect(page.getByTestId('settings')).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('[data-testid="settings"]')!.contains(document.activeElement))).toBe(true);
    await step(page, 3);
    expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('paused');
    // The Done button works the same way.
    await page.getByTestId('calibrate').click();
    await page.getByRole('button', { name: 'Done' }).click();
    expect(await calOpen()).toBe(false);
    await expect(page.getByTestId('settings')).toBeVisible();
    await step(page, 3);
    expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('paused');
    await page.getByTestId('settings-done').click();
    await expect(page.getByTestId('resume')).toBeVisible();
    await page.evaluate(() => window.__rg!.ctx.settings.reset());

    // Resume, then end the session
    await page.getByTestId('resume').click();
    expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('playing');
    await page.evaluate(() => {
      const rg = window.__rg!;
      rg.ctx.events.emit('outfit:unlocked', { outfitId: 'hat_party' });
      rg.setRemaining(0.05);
      rg.step(1 / 60, 30);
    });
    await expect(page.getByTestId('play-again')).toBeVisible();
    // 2 stars earned this run: exactly one gold header star, the rest dotted; the hat shows.
    expect(await page.locator('[data-testid="end-stars"] .hstar.earned').count()).toBe(1);
    expect(await page.locator('[data-testid="end-stars"] .hstar.empty').count()).toBe(2);
    expect(await page.locator('.stk.outfit.earned').count()).toBe(1);
    await save(page, 'end');
    await page.getByTestId('play-again').click();
    expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('playing');
    expect(await page.evaluate(() => window.__rg!.state().gems)).toBe(0);

    expect(consoleErrors).toEqual([]);
  });

  test('end screen shows what was earned (fake events)', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__rg!.freeze(true));
    await page.getByTestId('play').click();
    await page.evaluate(() => {
      const rg = window.__rg!;
      const e = rg.ctx.events;
      rg.ctx.session.setTotals({ gems: 20, chests: 4 });
      e.emit('chest:opened', { chestId: 'c1', outfitId: 'cape_gold' });
      e.emit('chest:opened', { chestId: 'c2', outfitId: 'glasses_star' });
      e.emit('outfit:unlocked', { outfitId: 'cape_gold' });
      e.emit('outfit:unlocked', { outfitId: 'glasses_star' });
      e.emit('outfit:unlocked', { outfitId: 'ghost_unknown' });
      e.emit('stunt', { kind: 'bigBounce', value: 22, stars: 4 });
      rg.setRemaining(0.05);
      rg.step(1 / 60, 30);
    });
    await expect(page.getByTestId('play-again')).toBeVisible();
    expect(await page.locator('.stk.outfit.earned').count()).toBe(2);
    expect(await page.locator('.stk.outfit.empty').count()).toBe(2);
    await expect(page.getByTestId('stickers').locator('.stk').nth(1)).toContainText('2/');
    await save(page, 'end-earned');
  });

  test('tutorial fades after the player moves and looks', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__rg!.freeze(true));
    await page.getByTestId('play').click();
    await page.evaluate(() => window.__rg!.step(1 / 60, 5));
    await expect(page.getByTestId('tutorial')).toHaveClass(/on/);
    await page.evaluate(() => window.__rg!.step(1 / 60, 480));
    await expect(page.getByTestId('tutorial')).not.toHaveClass(/on/);
  });

  test('1080p views', async ({ page }) => {
    test.setTimeout(420_000); // software WebGL at 1920x1080 is slow
    await page.setViewportSize({ width: 1920, height: 1080 });
    await boot(page);
    await page.evaluate(() => window.__rg!.freeze(true));
    await step(page);
    await save(page, 'title-1080');
    await page.getByTestId('play').click();
    await page.evaluate(() => {
      const rg = window.__rg!;
      rg.ctx.session.setTotals({ gems: 60 });
      rg.ctx.events.emit('gem:collected', { id: 'g1', count: 3, total: 60, position: rg.ctx.player.position.clone() });
      rg.ctx.events.emit('interact:focus', { target: { id: 'x', icon: 'chest', position: () => rg.ctx.player.position.clone(), radius: 3, onUse: () => {} } });
      rg.step(1 / 60, 5);
    });
    await save(page, 'hud-1080');
    await page.evaluate(() => {
      window.__rg!.ctx.session.pause();
      window.__rg!.step(1 / 60, 2);
    });
    await save(page, 'pause-1080');
    await page.getByTestId('pause-grownups').click();
    await page.evaluate(() => {
      const m = /(\d+) × (\d+)/.exec(document.querySelector('[data-testid="gate-question"]')!.textContent!)!;
      (document.querySelector(`[data-testid="gate-answer"][data-value="${Number(m[1]) * Number(m[2])}"]`) as HTMLElement).click();
    });
    await expect(page.getByTestId('settings')).toBeVisible();
    await save(page, 'settings-1080');
    await page.getByTestId('tab-game').click();
    await save(page, 'settings-game-1080');
    await page.getByTestId('settings-done').click();
    await page.getByTestId('resume').click();
    await page.evaluate(() => {
      const rg = window.__rg!;
      rg.ctx.events.emit('chest:opened', { chestId: 'c1', outfitId: 'hat_party' });
      rg.ctx.events.emit('stunt', { kind: 'bigBounce', value: 22, stars: 4 });
      rg.setRemaining(0.05);
      rg.step(1 / 60, 30);
    });
    await expect(page.getByTestId('play-again')).toBeVisible();
    await save(page, 'end-1080');
  });

  test('keyboard navigation and credits', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__rg!.freeze(true));
    await step(page);
    // Play is focused; arrow moves to a corner button; Enter opens credits.
    await page.keyboard.press('ArrowDown');
    const id = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.testid);
    expect(['grownups', 'credits']).toContain(id);
    await page.getByTestId('credits').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('credits-back')).toBeVisible();
    await save(page, 'credits');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('play')).toBeVisible();
  });

  test('the hold button opens the gate', async ({ page }) => {
    await boot(page);
    await page.getByTestId('grownups').click();
    const hold = page.getByTestId('gate-hold');
    await expect(hold).toBeVisible();
    // The hold timer runs on game frames (dt-clamped), so drive it with deterministic 1/60 s
    // steps instead of wall-clock time: SwiftShader frames take far longer than 1/60 s.
    await page.evaluate(() => window.__rg!.freeze(true));
    const box = (await hold.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // 2.5 s of holding is not enough...
    await page.evaluate(() => window.__rg!.step(1 / 60, 150, false));
    await expect(page.getByTestId('settings')).toBeHidden();
    // ...3 s is.
    await page.evaluate(() => window.__rg!.step(1 / 60, 40));
    await expect(page.getByTestId('settings')).toBeVisible();
    await page.mouse.up();
  });
});
