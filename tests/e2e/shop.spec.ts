import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import type { MissionState, ShopItem } from '../../src/types';
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
const T0 = Date.now();
async function save(page: Page, name: string, at = 1200): Promise<void> {
  console.log('save', name, Date.now() - T0);
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

const ITEMS: ShopItem[] = [
  { id: 'hat_star', category: 'outfit', slot: 'head', name: 'Star hat', icon: 'hat', price: 5 },
  { id: 'cape_bolt', category: 'outfit', slot: 'back', name: 'Bolt cape', icon: 'cape', price: 40 },
  { id: 'glasses_gold', category: 'outfit', slot: 'face', name: 'Gold glasses', icon: 'glasses', price: 30, chestOnly: true },
  { id: 'pack_rocket', category: 'outfit', slot: 'back', name: 'Rocket pack', icon: 'backpack', price: 15 },
  { id: 'hat_crown', category: 'outfit', slot: 'head', name: 'Crown', icon: 'hat', price: 100 },
  { id: 'paint_sun', category: 'paint', slot: 'carColor', name: 'Sun paint', icon: 'car', price: 8, swatch: '#ffb02e' },
  { id: 'paint_sky', category: 'paint', slot: 'carColor', name: 'Sky paint', icon: 'car', price: 12, swatch: '#3aa0ff' },
  { id: 'trail_spark', category: 'trail', slot: 'trail', name: 'Sparkles', icon: 'trail', price: 10, swatch: '#fff07a' },
  { id: 'emote_wave', category: 'emote', slot: 'emote', name: 'Wave', icon: 'emote', price: 0 },
];

const MISSIONS: MissionState[] = [
  { id: 'm1', kind: 'collectGems', icon: 'gem', target: 10, reward: 5, progress: 4, done: false },
  { id: 'm2', kind: 'bounceHeight', icon: 'trampoline', target: 30, reward: 8, progress: 12, done: false },
  { id: 'm3', kind: 'openChest', icon: 'chest', target: 1, reward: 5, progress: 0, done: false },
];

test.describe('economy ui', () => {
  test('wallet, combo, missions, shop, wardrobe, end screen', async ({ page }) => {
    test.setTimeout(150_000);
    const { consoleErrors } = await boot(page);
    await page.evaluate(() => window.__rg!.freeze(true));

    // Title: the wallet chip shows saved gems and rolls up on earn.
    await page.evaluate(() => window.__rg!.ctx.profile.earn(7, 'test'));
    await step(page, 40);
    await expect(page.getByTestId('title-wallet')).toContainText('7');

    await page.getByTestId('play').click();
    expect(await phase(page)).toBe('playing');
    await page.evaluate(
      ({ items, missions }) => {
        const rg = window.__rg!;
        rg.ctx.economy.registerItems(items);
        rg.ctx.profile.earn(20, 'gem');
        rg.ctx.events.emit('combo:changed', { multiplier: 3, streak: 5 });
        missions.forEach((m, index) => rg.ctx.events.emit('mission:progress', { index, mission: m }));
        rg.ctx.events.emit('mission:completed', { index: 2, mission: { ...missions[2]!, progress: 1, done: true } });
        rg.step(1 / 60, 40);
      },
      { items: ITEMS, missions: MISSIONS },
    );
    expect(await wallet(page)).toBe(27);
    await expect(page.getByTestId('wallet')).toContainText('27');
    await expect(page.getByTestId('combo')).toBeVisible();
    await expect(page.getByTestId('combo')).toContainText('3');
    await expect(page.getByTestId('mission-card')).toHaveCount(3);
    await expect(page.getByTestId('mission-card').nth(0)).toContainText('4/10');
    await expect(page.getByTestId('mission-card').nth(1)).toContainText('12/30m');
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
    // Combo back to ×1: the badge goes away.
    await page.evaluate(() => {
      window.__rg!.ctx.events.emit('combo:changed', { multiplier: 1, streak: 0 });
      window.__rg!.step(1 / 60, 2);
    });
    await expect(page.getByTestId('combo')).toBeHidden();
    console.log('lap combo', Date.now() - T0);

    // Ticket denied: friendly toast with the price, the wallet shakes.
    await page.evaluate(() => {
      window.__rg!.ctx.events.emit('ticket:denied', { kind: 'balloon', price: 50, wallet: 32 });
      window.__rg!.step(1 / 60, 2);
    });
    await expect(page.locator('.toast.deny')).toContainText('50');
    console.log('lap deny', Date.now() - T0);

    // The kiosk opens the Gear Shack: session paused, shop on top.
    await page.evaluate(() => {
      window.__rg!.ctx.events.emit('shop:open', {});
      window.__rg!.step(1 / 60, 3);
    });
    await expect(page.getByTestId('shop')).toBeVisible();
    console.log('lap shopvis', Date.now() - T0);
    expect(await phase(page)).toBe('paused');
    expect(await page.evaluate(() => window.__rg!.ctx.ui.menuOpen)).toBe(true);
    // Only categories with items get a tab (no 'character' items registered).
    await expect(page.locator('[data-testid^="shop-tab-"]')).toHaveCount(4);
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

    const card = (id: string) => page.locator(`[data-testid="shop-card"][data-item="${id}"]`);
    await expect(card('hat_crown')).toHaveAttribute('data-state', 'poor');
    await expect(card('glasses_gold')).toHaveAttribute('data-state', 'chest');
    await expect(card('emote_wave')).toHaveCount(0); // other tab

    // Buy: wallet drops, unlock moment, owned + worn.
    await card('hat_star').click();
    await expect(page.getByTestId('unlock-moment')).toBeVisible();
    expect(await wallet(page)).toBe(27);
    await save(page, 'unlock', 1000);
    await dismiss(page);
    await expect(page.getByTestId('unlock-moment')).toBeHidden();
    await expect(card('hat_star')).toHaveAttribute('data-state', 'equipped');
    expect(await page.evaluate(() => window.__rg!.ctx.profile.equipped('head'))).toBe('hat_star');

    // Too expensive / chest-only: nothing happens to the wallet.
    await card('hat_crown').click();
    await card('glasses_gold').click();
    expect(await wallet(page)).toBe(27);
    expect(await page.evaluate(() => window.__rg!.ctx.profile.owns('hat_crown') || window.__rg!.ctx.profile.owns('glasses_gold'))).toBe(false);

    // Another tab by icon; buy a paint with the keyboard.
    await page.getByTestId('shop-tab-paint').click();
    await card('paint_sun').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('unlock-moment')).toBeVisible();
    await dismiss(page);
    expect(await wallet(page)).toBe(19);
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
    await page.getByTestId('pause-wardrobe').click();
    await expect(page.getByTestId('wardrobe')).toBeVisible();
    const wcard = (id: string) => page.locator(`[data-testid="wardrobe"] [data-testid="shop-card"][data-item="${id}"]`);
    await expect(wcard('hat_crown')).toHaveCount(0);
    await expect(wcard('emote_wave')).toHaveAttribute('data-state', 'owned');
    await wcard('hat_star').click();
    expect(await page.evaluate(() => window.__rg!.ctx.profile.equipped('head'))).toBe(null);
    await expect(wcard('hat_star')).toHaveAttribute('data-state', 'owned');
    await wcard('emote_wave').click();
    await wcard('hat_star').click();
    expect(await page.evaluate(() => window.__rg!.ctx.profile.equipped('head'))).toBe('hat_star');
    expect(await page.evaluate(() => window.__rg!.ctx.profile.equipped('emote'))).toBe('emote_wave');
    await save(page, 'wardrobe');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('resume')).toBeVisible();
    await page.getByTestId('resume').click();
    expect(await phase(page)).toBe('playing');

    // Chest unlock: compact moment on the HUD; then missions done and the jackpot.
    await page.evaluate(
      ({ missions }) => {
        const rg = window.__rg!;
        const e = rg.ctx.events;
        rg.ctx.profile.unlock('glasses_gold', 'chest');
        e.emit('mission:completed', { index: 0, mission: { ...missions[0]!, progress: 10, done: true } });
        e.emit('mission:completed', { index: 1, mission: { ...missions[1]!, progress: 31, done: true } });
        rg.ctx.profile.earn(15, 'jackpot');
        e.emit('mission:jackpot', { reward: 15 });
        rg.step(1 / 60, 3);
      },
      { missions: MISSIONS },
    );
    await expect(page.getByTestId('moment-jackpot')).toHaveCount(1);
    await save(page, 'hud-jackpot', 700);

    // End screen: earned gems, wallet, missions + jackpot, best combo, unlocked items.
    await page.evaluate(() => {
      const rg = window.__rg!;
      rg.setRemaining(0.05);
      rg.step(1 / 60, 30);
    });
    await expect(page.getByTestId('play-again')).toBeVisible();
    await expect(page.getByTestId('end-earned')).toContainText('+40');
    await expect(page.getByTestId('end-wallet')).toContainText('34');
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
    const box = (await hold.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.evaluate(() => window.__rg!.step(1 / 60, 60, false));
    expect(await wallet(page)).toBe(34); // 1 s is not enough
    await page.evaluate(() => window.__rg!.step(1 / 60, 150, false));
    await page.mouse.up();
    expect(await wallet(page)).toBe(0);
    expect(await page.evaluate(() => window.__rg!.ctx.profile.owns('hat_star'))).toBe(false);

    expect(consoleErrors).toEqual([]);
  });
});
