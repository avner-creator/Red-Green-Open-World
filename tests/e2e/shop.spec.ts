import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, startGame } from './helpers';

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

/** Fixture items with canvas-drawn pictures, in the 'character' tab (empty in the real catalog). */
async function registerFixtures(page: Page): Promise<void> {
  await page.evaluate(() => {
    const calls: string[] = [];
    (window as unknown as { __previewCalls: string[] }).__previewCalls = calls;
    const draw = (kind: string): string => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      g.lineWidth = 6;
      g.strokeStyle = '#1a1a2a';
      g.lineJoin = 'round';
      if (kind === 'hat') {
        const grad = g.createLinearGradient(30, 10, 100, 110);
        grad.addColorStop(0, '#ffe86a');
        grad.addColorStop(1, '#e07a10');
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(64, 8); g.lineTo(104, 96); g.lineTo(24, 96); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#d0244a';
        g.fillRect(34, 72, 60, 14); g.strokeRect(34, 72, 60, 14);
        g.fillStyle = '#ffffff';
        g.beginPath(); g.ellipse(64, 104, 52, 14, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      } else if (kind === 'cape') {
        const grad = g.createLinearGradient(0, 0, 0, 128);
        grad.addColorStop(0, '#5fb0ff');
        grad.addColorStop(1, '#1d3fa8');
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(40, 14); g.lineTo(88, 14); g.quadraticCurveTo(110, 70, 116, 118);
        g.quadraticCurveTo(64, 100, 12, 118); g.quadraticCurveTo(18, 70, 40, 14); g.fill(); g.stroke();
        g.fillStyle = '#ffd93b';
        g.beginPath(); g.arc(64, 60, 14, 0, Math.PI * 2); g.fill(); g.stroke();
      } else {
        g.fillStyle = '#ff6fb5';
        for (const x of [36, 92]) { g.beginPath(); g.arc(x, 64, 26, 0, Math.PI * 2); g.fill(); g.stroke(); }
        g.fillStyle = '#20243c';
        for (const x of [36, 92]) { g.beginPath(); g.arc(x, 64, 15, 0, Math.PI * 2); g.fill(); }
        g.beginPath(); g.moveTo(58, 60); g.lineTo(70, 60); g.stroke();
      }
      return c.toDataURL('image/png');
    };
    const pic = (id: string, kind: string) => () => {
      calls.push(id);
      return draw(kind);
    };
    window.__rg!.ctx.economy.registerItems([
      { id: 'fx-hat', category: 'character', slot: 'head', name: 'Party hat', icon: 'hat', price: 12, preview: pic('fx-hat', 'hat') },
      { id: 'fx-cape', category: 'character', slot: 'back', name: 'Hero cape', icon: 'cape', price: 99, preview: pic('fx-cape', 'cape') },
      { id: 'fx-specs', category: 'character', slot: 'face', name: 'Pink specs', icon: 'glasses', price: 0, chestOnly: true, preview: pic('fx-specs', 'specs') },
      { id: 'fx-plain', category: 'character', slot: 'face', name: 'Plain specs', icon: 'glasses', price: 7, preview: () => null },
    ]);
  });
}

/**
 * HUD parts that overlap each other, measured with every animation paused at `at` ms (the peak of
 * the combo step and of the "+N" pops), so pops and the badge at full size are checked too.
 */
const hudOverlaps = (page: Page, at = 270): Promise<string[]> =>
  page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = t;
    }
    const sel = [
      '[data-testid="wallet"]', '[data-testid="combo"]', '[data-testid="stars"]', '[data-testid="missions"]', '[data-testid="timer"]',
      '.wf-compass', '[data-testid="help"]', '[data-testid="touch-jump"]', '[data-testid="touch-use"]', '[data-testid="touch-sprint"]',
      '[data-testid="touch-flop"]', '[data-testid="touch-pause"]', '[data-testid="touch-emote"]', '[data-testid="touch-stick"]',
      '[data-testid="touch-skill"]', '[data-testid="skill-chip"]',
    ];
    const rs: [string, DOMRect][] = [];
    for (const s of sel) {
      const e = document.querySelector(s);
      const r = e?.getBoundingClientRect();
      if (e && r && r.width > 0 && getComputedStyle(e).visibility !== 'hidden') rs.push([s, r]);
    }
    document.querySelectorAll('[data-testid="wallet-pop"]').forEach((e, i) => rs.push([`pop${i}`, e.getBoundingClientRect()]));
    const out: string[] = [];
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) {
        const [na, a] = rs[i]!;
        const [nb, b] = rs[j]!;
        if (na.startsWith('pop') && (nb.startsWith('pop') || nb.includes('"wallet"'))) continue;
        if (nb.startsWith('pop') && na.includes('"wallet"')) continue;
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) out.push(`${na} x ${nb}`);
      }
    document.getAnimations().forEach((a) => a.play());
    return out;
  }, at);

test.describe('economy ui', () => {
  test('wallet, combo, missions, kiosk shop, wardrobe, end screen, reset', async ({ page }) => {
    test.setTimeout(150_000);
    const { consoleErrors } = await boot(page);
    await page.evaluate(() => window.__rg!.freeze(true));

    // Title: the wallet chip shows saved gems and rolls up on earn.
    await page.evaluate(() => window.__rg!.ctx.profile.earn(7, 'test'));
    await step(page, 40);
    await expect(page.getByTestId('title-wallet')).toContainText('7');

    await startGame(page);
    expect(await phase(page)).toBe('playing');

    // Fixture items with rendered pictures, in their own tab (the real catalog leaves 'character'
    // empty) so they never queue behind slow real previews; one has no picture (keeps its icon).
    // preview() is only called once a card is shown, asynchronously.
    await registerFixtures(page);
    expect(await page.evaluate(() => (window as unknown as { __previewCalls: string[] }).__previewCalls.length)).toBe(0);

    // Real missions from the economy; drive the HUD cards with events.
    const missions = await page.evaluate(() => {
      const rg = window.__rg!;
      const ms = rg.ctx.economy.missions.map((m) => ({ ...m }));
      rg.ctx.profile.earn(20, 'gem');
      rg.ctx.events.emit('combo:changed', { multiplier: 5, streak: 9 });
      rg.ctx.events.emit('mission:progress', { index: 0, mission: { ...ms[0]!, progress: Math.floor(ms[0]!.target / 2) } });
      rg.ctx.events.emit('mission:completed', { index: 2, mission: { ...ms[2]!, progress: ms[2]!.target, done: true } });
      rg.step(1 / 60, 40);
      return ms;
    });
    expect(missions.length).toBe(3);
    await expect(page.getByTestId('wallet').locator('.n')).toHaveText(String(await wallet(page)));
    await expect(page.getByTestId('combo')).toBeVisible();
    await expect(page.getByTestId('combo')).toContainText('5');
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
    // HUD parts never overlap each other (pops and the x5 badge at their peak included).
    expect(await hudOverlaps(page)).toEqual([]); // 667x375 and tablet: see the touch test below
    // The controls card lists the emote (main's row: C on the keyboard, D-pad Up on a gamepad).
    await page.keyboard.press('KeyH');
    await expect(page.getByTestId('controls-card')).toHaveClass(/on/);
    await expect(page.locator('[data-testid="controls-card"] [data-control="emote"]').first()).toContainText('C');
    await save(page, 'controls-card');
    await page.keyboard.press('KeyH');
    // One emote input (C/G, D-pad Up, touch → InputState.emotePressed → player.emote()): the
    // signature emote with no shop emote equipped, the equipped shop emote otherwise.
    const emoteRuns = await page.evaluate(() => {
      const rg = window.__rg!;
      const gear = window.__rgGear!;
      const sig: string[] = [];
      const off = rg.ctx.events.on('player:emote', (e) => sig.push(e.id));
      const press = (): void => {
        rg.inject({ emotePressed: true });
        rg.step(1 / 60, 1, false);
        rg.inject(null);
        rg.step(1 / 60, 2, false);
      };
      rg.ctx.economy.equip('emote', null);
      press();
      const first = { sig: sig.length, shop: gear.emote() };
      rg.step(1 / 60, 30, false);
      rg.inject({ moveY: 1 }); // moving cancels the signature emote
      rg.step(1 / 60, 3, false);
      rg.inject(null);
      rg.step(1 / 60, 30, false);
      rg.ctx.economy.equip('emote', 'emote-wave');
      press();
      const second = { sig: sig.length, shop: gear.emote() };
      rg.step(1 / 60, 150, false); // let it finish
      rg.ctx.economy.equip('emote', null);
      off();
      return { first, second, after: gear.emote() };
    });
    expect(emoteRuns).toEqual({ first: { sig: 1, shop: null }, second: { sig: 1, shop: 'wave' }, after: null });

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
    await expect(page.getByTestId('shop-tab-outfit')).toBeVisible();
    await expect(page.getByTestId('shop-tab-character')).toBeVisible();
    const fits = async (): Promise<boolean> =>
      page.evaluate(() => {
        const r = document.querySelector('[data-testid="shop"]')!.getBoundingClientRect();
        const se = document.scrollingElement!;
        return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && se.scrollHeight <= innerHeight;
      });
    expect(await fits()).toBe(true);
    await save(page, 'shop');
    const card = (id: string) => page.locator(`[data-testid="shop"] [data-testid="shop-card"][data-item="${id}"]`);
    const chestId = await page.evaluate(() => window.__rg!.ctx.economy.catalog.find((i) => i.chestOnly && i.category === 'outfit')!.id);
    await expect(card('hat-crown')).toHaveAttribute('data-state', 'poor');
    await expect(card(chestId)).toHaveAttribute('data-state', 'chest');
    // Item pictures: the icon at once, then an <img> where a preview exists; the icon where not.
    await page.getByTestId('shop-tab-character').click();
    expect(await page.evaluate(() => (window as unknown as { __previewCalls: string[] }).__previewCalls.length)).toBeLessThanOrEqual(1);
    await expect(card('fx-hat').locator('img.pic')).toHaveCount(1);
    await expect(card('fx-plain').locator('img')).toHaveCount(0);
    await expect(card('fx-plain').locator('.pv .ic')).toHaveCount(1);
    await expect(card('fx-cape')).toHaveAttribute('data-state', 'poor');
    await expect(card('fx-specs')).toHaveAttribute('data-state', 'chest');
    await expect(card('fx-specs').locator('img.pic')).toHaveCount(1);
    await save(page, 'shop-pictures');
    await page.setViewportSize({ width: 667, height: 375 });
    expect(await fits()).toBe(true);
    await page.setViewportSize({ width: 640, height: 360 });

    // Buy: wallet drops, unlock moment, owned + worn.
    const w0 = await wallet(page);
    await card('fx-hat').click();
    await expect(page.getByTestId('unlock-moment')).toBeVisible();
    await expect(page.locator('[data-testid="unlock-moment"] img.pic')).toHaveCount(1);
    expect(await wallet(page)).toBe(w0 - 12);
    await save(page, 'unlock', 1000);
    await dismiss(page);
    await expect(page.getByTestId('unlock-moment')).toBeHidden();
    await expect(card('fx-hat')).toHaveAttribute('data-state', 'equipped');
    expect(await page.evaluate(() => window.__rg!.ctx.profile.equipped('head'))).toBe('fx-hat');

    // Too expensive / chest-only: nothing happens to the wallet.
    await page.getByTestId('shop-tab-outfit').click();
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
    await expect(wcard('hat-crown')).toHaveCount(0);
    await expect(wcard('emote-wave')).toHaveCount(1);
    await expect(wcard('fx-hat').locator('img.pic')).toHaveCount(1);
    await wcard('fx-hat').click();
    expect(await page.evaluate(() => window.__rg!.ctx.profile.equipped('head'))).toBe(null);
    await expect(wcard('fx-hat')).toHaveAttribute('data-state', 'owned');
    await wcard('fx-hat').click();
    expect(await page.evaluate(() => window.__rg!.ctx.profile.equipped('head'))).toBe('fx-hat');
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
    }, 'fx-specs');
    await expect(page.getByTestId('moment-unlock')).toHaveCount(1);
    await expect(page.locator('[data-testid="moment-unlock"] img.pic')).toHaveCount(1);
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
    await expect(page.getByTestId('end-combo')).toContainText('5');
    await expect(page.locator('[data-testid="end-unlocked"] .stk')).toHaveCount(3);
    expect(await page.locator('[data-testid="end-unlocked"] img.pic').count()).toBeGreaterThanOrEqual(2);
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
    expect(await page.evaluate(() => window.__rg!.ctx.profile.owns('fx-hat'))).toBe(false);

    expect(consoleErrors).toEqual([]);
  });
});

test.describe('economy ui by touch', () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test('touch HUD fits; kiosk by the use button; tap tab, tap-buy, tap close', async ({ page }) => {
    const { consoleErrors } = await boot(page);
    await startGame(page, true);
    await expect(page.getByTestId('touch-hud')).toBeVisible();
    await registerFixtures(page);
    await page.evaluate(() => {
      const rg = window.__rg!;
      rg.freeze(true);
      rg.ctx.profile.earn(30, 'gem');
      rg.ctx.events.emit('combo:changed', { multiplier: 5, streak: 9 });
      rg.ctx.profile.earn(5, 'gem');
      const ms = rg.ctx.economy.missions;
      if (ms[0]) rg.ctx.events.emit('mission:progress', { index: 0, mission: { ...ms[0], progress: Math.floor(ms[0].target / 2) } });
      const a = rg.ctx.world.anchors.gearShack;
      const x = a.position.x + Math.sin(a.yaw) * 2.4;
      const z = a.position.z + Math.cos(a.yaw) * 2.4;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.2, z, a.yaw + Math.PI);
      rg.step(1 / 60, 40);
    });
    await expect(page.getByTestId('missions')).toBeVisible();
    // Next to the kiosk the use button shows the shop icon.
    await expect(page.getByTestId('touch-use')).toHaveClass(/ready/);
    await save(page, 'touch-hud', 270);
    // Main's touch emote button plays the emote by tap (no shop emote equipped: the signature one).
    await expect(page.getByTestId('touch-emote')).toBeVisible();
    const emotes = await page.evaluate(() => {
      const log: string[] = [];
      window.__rg!.ctx.events.on('player:emote', () => log.push('play'));
      (window as unknown as { __emotes: string[] }).__emotes = log;
      return log.length;
    });
    expect(emotes).toBe(0);
    await page.getByTestId('touch-emote').tap();
    await step(page, 2);
    expect(await page.evaluate(() => (window as unknown as { __emotes: string[] }).__emotes.length)).toBe(1);
    await step(page, 150); // the emote ends (2 s) before walking to the kiosk
    expect(await hudOverlaps(page)).toEqual([]);
    await page.setViewportSize({ width: 1024, height: 768 });
    await step(page, 2);
    expect(await hudOverlaps(page)).toEqual([]);
    await save(page, 'touch-hud-tablet', 300);
    await page.setViewportSize({ width: 667, height: 375 });
    await step(page, 2);

    // Use button → shop; the touch gameplay controls hide while it is open.
    await page.getByTestId('touch-use').tap({ force: true }); // it pulses: never "stable"
    await step(page, 3);
    await expect(page.getByTestId('shop')).toBeVisible();
    expect(await phase(page)).toBe('paused');
    await expect(page.getByTestId('touch-hud')).toBeHidden();
    // Every target is thumb-sized.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="shop"] button')]
        // Layout size (offsetWidth): not shrunk by the panel's pop-in animation.
        .map((b) => [(b as HTMLElement).dataset.testid ?? b.className, (b as HTMLElement).offsetWidth, (b as HTMLElement).offsetHeight] as const)
        .filter(([, w, hgt]) => w > 0 && (w < 44 || hgt < 44))
        .map(([n, w, hgt]) => `${n} ${w}x${hgt}`),
    );
    expect(small).toEqual([]);
    await page.getByTestId('shop-tab-character').tap();
    const w0 = await wallet(page);
    await page.locator('[data-testid="shop"] [data-testid="shop-card"][data-item="fx-hat"]').tap();
    await expect(page.getByTestId('unlock-moment')).toBeVisible();
    expect(await wallet(page)).toBe(w0 - 12);
    await page.getByTestId('unlock-moment').tap();
    await expect(page.getByTestId('unlock-moment')).toBeHidden();
    await expect(page.locator('[data-testid="shop"] [data-testid="shop-card"][data-item="fx-hat"]')).toHaveAttribute('data-state', 'equipped');
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
    await page.getByTestId('shop-close').tap();
    await step(page, 3);
    expect(await phase(page)).toBe('playing');
    await expect(page.getByTestId('touch-hud')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});
