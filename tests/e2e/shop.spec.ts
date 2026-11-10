import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot } from './helpers';

const OUT = 'test-results/shop';
mkdirSync(OUT, { recursive: true });

function channel(png: PNG, c: number): Buffer {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    o.data[i] = o.data[i + 1] = o.data[i + 2] = png.data[i + c] as number;
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

/**
 * Full, R-only and G-only screenshots (what each eye sees through the glasses). CSS animations
 * only advance when SwiftShader produces a frame, so every animation is paused at `at` ms first
 * (deterministic: the moment of an animation we want to judge), then resumed.
 */
async function save(page: Page, name: string, at = 1200): Promise<void> {
  await page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = t;
    }
  }, at);
  const buf = await page.screenshot({ type: 'png' });
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
  writeFileSync(`${OUT}/${name}.png`, buf);
  const png = PNG.sync.read(buf);
  writeFileSync(`${OUT}/${name}-R.png`, channel(png, 0));
  writeFileSync(`${OUT}/${name}-G.png`, channel(png, 1));
}

const step = (page: Page, n = 5): Promise<void> => page.evaluate((k) => window.__rg!.step(1 / 60, k), n);
const phase = (page: Page): Promise<string> => page.evaluate(() => window.__rg!.state().phase);
/** Tap the unlock moment away (it also leaves by itself after ~2 s). */
const dismiss = (page: Page): Promise<void> =>
  page.evaluate(() => (document.querySelector('[data-testid="unlock-moment"].on') as HTMLElement | null)?.click());
const wallet = (page: Page): Promise<number> => page.evaluate(() => window.__rg!.ctx.profile.wallet);

test.describe('economy ui', () => {
  test('wallet, combo, missions, kiosk shop, wardrobe, end screen, reset', async ({ page }) => {
    test.setTimeout(150_000);
    const { consoleErrors } = await boot(page);
    await page.evaluate(() => window.__rg!.freeze(true));

    // Title: the wallet chip shows saved gems and rolls up on earn.
    await page.evaluate(() => window.__rg!.ctx.profile.earn(7, 'test'));
    await step(page, 40);
    await expect(page.getByTestId('title-wallet')).toContainText('7');

    await page.getByTestId('play').click();
    expect(await phase(page)).toBe('playing');

    // Real missions from the economy; drive the HUD cards with events.
    const missions = await page.evaluate(() => {
      const rg = window.__rg!;
      const ms = rg.ctx.economy.missions.map((m) => ({ ...m }));
      rg.ctx.profile.earn(20, 'gem');
      rg.ctx.events.emit('combo:changed', { multiplier: 3, streak: 5 });
      rg.ctx.events.emit('mission:progress', { index: 0, mission: { ...ms[0]!, progress: Math.floor(ms[0]!.target / 2) } });
      rg.ctx.events.emit('mission:completed', { index: 2, mission: { ...ms[2]!, progress: ms[2]!.target, done: true } });
      rg.step(1 / 60, 40);
      return ms;
    });
    expect(missions.length).toBe(3);
    await expect(page.getByTestId('wallet').locator('.n')).toHaveText(String(await wallet(page)));
    await expect(page.getByTestId('combo')).toBeVisible();
    await expect(page.getByTestId('combo')).toContainText('3');
    await expect(page.getByTestId('mission-card')).toHaveCount(3);
    await expect(page.getByTestId('mission-card').nth(0)).toContainText(`/${missions[0]!.target}`);
    await expect(page.getByTestId('mission-card').nth(2)).toHaveAttribute('data-done', 'true');
    // Mega gem: the "+N" pops at the wallet, big.
    await page.evaluate(() => {
      const rg = window.__rg!;
      rg.ctx.profile.earn(5, 'gem');
      rg.ctx.events.emit('gem:collected', { id: 'mg', count: 1, total: 60, position: rg.ctx.player.position.clone(), value: 5, mega: true, combo: 1, gain: 5 });
      rg.step(1 / 60, 2);
    });
    await expect(page.locator('[data-testid="wallet-pop"][data-kind="mega"]')).toHaveCount(1);
    await save(page, 'hud-combo-missions', 300);
    // HUD parts never overlap each other.
    const overlaps = (): Promise<string[]> =>
      page.evaluate(() => {
        const sel = ['[data-testid="wallet"]', '[data-testid="combo"]', '[data-testid="stars"]', '[data-testid="missions"]', '[data-testid="timer"]', '.wf-compass', '[data-testid="help"]'];
        const rs = sel.map((s) => [s, document.querySelector(s)?.getBoundingClientRect()] as const).filter(([, r]) => r && r.width > 0);
        const out: string[] = [];
        for (let i = 0; i < rs.length; i++)
          for (let j = i + 1; j < rs.length; j++) {
            const a = rs[i]![1]!;
            const b = rs[j]![1]!;
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) out.push(`${rs[i]![0]} x ${rs[j]![0]}`);
          }
        return out;
      });
    expect(await overlaps()).toEqual([]);
    await page.setViewportSize({ width: 667, height: 375 });
    expect(await overlaps()).toEqual([]);
    await page.setViewportSize({ width: 640, height: 360 });

    // Combo back to x1: the badge goes away. A denied ticket: a friendly toast with the price.
    await page.evaluate(() => {
      window.__rg!.ctx.events.emit('combo:changed', { multiplier: 1, streak: 0 });
      window.__rg!.ctx.events.emit('ticket:denied', { kind: 'balloon', price: 50, wallet: 3 });
      window.__rg!.step(1 / 60, 2);
    });
    await expect(page.getByTestId('combo')).toBeHidden();
    await expect(page.locator('.toast.deny')).toContainText('50');

    // Walk up to the Gear Shack kiosk and press use: session paused, shop on top.
    await page.evaluate(() => {
      const rg = window.__rg!;
      const a = rg.ctx.world.anchors.gearShack;
      const x = a.position.x + Math.sin(a.yaw) * 2.4;
      const z = a.position.z + Math.cos(a.yaw) * 2.4;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.2, z, a.yaw + Math.PI);
      rg.step(1 / 60, 20, false);
      rg.inject({ usePressed: true, use: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 3);
    });
    await expect(page.getByTestId('shop')).toBeVisible();
    expect(await phase(page)).toBe('paused');
    expect(await page.evaluate(() => window.__rg!.ctx.ui.menuOpen)).toBe(true);
    // Only categories with items get a tab (no 'character' items yet).
    await expect(page.getByTestId('shop-tab-outfit')).toBeVisible();
    await expect(page.getByTestId('shop-tab-character')).toHaveCount(0);
    const fits = async (): Promise<boolean> =>
      page.evaluate(() => {
        const r = document.querySelector('[data-testid="shop"]')!.getBoundingClientRect();
        const se = document.scrollingElement!;
        return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && se.scrollHeight <= innerHeight;
      });
    expect(await fits()).toBe(true);
    await save(page, 'shop');
    await page.setViewportSize({ width: 667, height: 375 });
    expect(await fits()).toBe(true);
    await page.setViewportSize({ width: 640, height: 360 });

    const card = (id: string) => page.locator(`[data-testid="shop"] [data-testid="shop-card"][data-item="${id}"]`);
    const chestId = await page.evaluate(() => window.__rg!.ctx.economy.catalog.find((i) => i.chestOnly && i.category === 'outfit')!.id);
    await expect(card('hat-crown')).toHaveAttribute('data-state', 'poor');
    await expect(card(chestId)).toHaveAttribute('data-state', 'chest');

    // Buy: wallet drops, unlock moment, owned + worn.
    const w0 = await wallet(page);
    await card('hat-propeller').click();
    await expect(page.getByTestId('unlock-moment')).toBeVisible();
    expect(await wallet(page)).toBe(w0 - 12);
    await save(page, 'unlock', 1000);
    await dismiss(page);
    await expect(page.getByTestId('unlock-moment')).toBeHidden();
    await expect(card('hat-propeller')).toHaveAttribute('data-state', 'equipped');
    expect(await page.evaluate(() => window.__rg!.ctx.profile.equipped('head'))).toBe('hat-propeller');

    // Too expensive / chest-only: nothing happens to the wallet.
    await card('hat-crown').click();
    await card(chestId).click();
    expect(await wallet(page)).toBe(w0 - 12);
    expect(await page.evaluate((c) => window.__rg!.ctx.profile.owns('hat-crown') || window.__rg!.ctx.profile.owns(c), chestId)).toBe(false);

    // Another tab by icon; buy a paint with the keyboard.
    await page.getByTestId('shop-tab-paint').click();
    await card('paint-snow').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('unlock-moment')).toBeVisible();
    await dismiss(page);
    expect(await wallet(page)).toBe(w0 - 22);
    await step(page, 30);
    await save(page, 'shop-paint');

    // Esc closes the shop: playing again.
    await page.keyboard.press('Escape');
    await step(page, 3);
    expect(await phase(page)).toBe('playing');
    await expect(page.getByTestId('shop')).toBeHidden();

    // Wardrobe from the pause menu: wear / take off.
    await page.evaluate(() => {
      window.__rg!.ctx.session.pause();
      window.__rg!.step(1 / 60, 2);
    });
    await save(page, 'pause');
    await page.getByTestId('pause-wardrobe').click();
    await expect(page.getByTestId('wardrobe')).toBeVisible();
    const wcard = (id: string) => page.locator(`[data-testid="wardrobe"] [data-testid="shop-card"][data-item="${id}"]`);
    await expect(wcard('hat-crown')).toHaveCount(0);
    await expect(wcard('emote-wave')).toHaveCount(1);
    await wcard('hat-propeller').click();
    expect(await page.evaluate(() => window.__rg!.ctx.profile.equipped('head'))).toBe(null);
    await expect(wcard('hat-propeller')).toHaveAttribute('data-state', 'owned');
    await wcard('hat-propeller').click();
    expect(await page.evaluate(() => window.__rg!.ctx.profile.equipped('head'))).toBe('hat-propeller');
    await save(page, 'wardrobe');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('resume')).toBeVisible();
    await page.getByTestId('resume').click();
    expect(await phase(page)).toBe('playing');

    // Chest unlock: compact moment on the HUD; then missions done and the jackpot.
    await page.evaluate((chest) => {
      const rg = window.__rg!;
      rg.ctx.profile.unlock(chest, 'chest');
      rg.step(1 / 60, 2);
    }, chestId);
    await expect(page.getByTestId('moment-unlock')).toHaveCount(1);
    await save(page, 'hud-chest-unlock', 700);
    await page.evaluate((ms) => {
      const rg = window.__rg!;
      const e = rg.ctx.events;
      e.emit('mission:completed', { index: 0, mission: { ...ms[0]!, progress: ms[0]!.target, done: true } });
      e.emit('mission:completed', { index: 1, mission: { ...ms[1]!, progress: ms[1]!.target, done: true } });
      rg.ctx.profile.earn(15, 'jackpot');
      e.emit('mission:jackpot', { reward: 15 });
      rg.step(1 / 60, 3);
    }, missions);
    await expect(page.getByTestId('moment-jackpot')).toHaveCount(1);
    await save(page, 'hud-jackpot', 700);

    // End screen: earned gems, wallet, missions + jackpot, best combo, unlocked items.
    const earned = await page.evaluate(() => {
      const rg = window.__rg!;
      rg.setRemaining(0.05);
      rg.step(1 / 60, 30);
      return rg.state().earned ?? 0;
    });
    await expect(page.getByTestId('play-again')).toBeVisible();
    await expect(page.getByTestId('end-earned')).toContainText(`+${earned}`);
    await expect(page.getByTestId('end-wallet')).toContainText(String(await wallet(page)));
    await expect(page.getByTestId('end-mission')).toHaveCount(3);
    await expect(page.locator('[data-testid="end-mission"][data-earned="true"]')).toHaveCount(3);
    await expect(page.getByTestId('end-jackpot')).toHaveAttribute('data-earned', 'true');
    await expect(page.getByTestId('end-combo')).toContainText('3');
    await expect(page.locator('[data-testid="end-unlocked"] .stk')).toHaveCount(3);
    await save(page, 'end', 1400);
    const endFits = await page.evaluate(() => {
      const p = document.querySelector('.endp') as HTMLElement;
      const r = p.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight && p.scrollHeight <= p.clientHeight + 1;
    });
    expect(endFits).toBe(true);

    // Grown-up reset of the profile: hold to confirm.
    await page.getByTestId('home').click();
    await page.getByTestId('grownups').click();
    await page.evaluate(() => {
      const m = /(\d+) × (\d+)/.exec(document.querySelector('[data-testid="gate-question"]')!.textContent!)!;
      (document.querySelector(`[data-testid="gate-answer"][data-value="${Number(m[1]) * Number(m[2])}"]`) as HTMLElement).click();
    });
    await page.getByTestId('tab-game').click();
    const hold = page.getByTestId('reset-profile');
    await expect(hold).toBeVisible();
    const before = await wallet(page);
    expect(before).toBeGreaterThan(0);
    const box = (await hold.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.evaluate(() => window.__rg!.step(1 / 60, 60, false));
    expect(await wallet(page)).toBe(before); // 1 s is not enough
    await page.evaluate(() => window.__rg!.step(1 / 60, 150, false));
    await page.mouse.up();
    expect(await wallet(page)).toBe(0);
    expect(await page.evaluate(() => window.__rg!.ctx.profile.owns('hat-propeller'))).toBe(false);

    expect(consoleErrors).toEqual([]);
  });
});
