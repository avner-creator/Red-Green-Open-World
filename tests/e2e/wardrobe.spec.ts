/**
 * The dressing room: open it from the title, the HUD button, the I key and by touch; try on, buy,
 * wear; it persists after a reload; the first free hat comes within the first minute.
 * With RG_SHOTS=1 also saves full / R-only / G-only screenshots (test-results/wardrobe/).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { SHOTS, boot, startGame } from './helpers';

const OUT = 'test-results/wardrobe';
mkdirSync(OUT, { recursive: true });

function channel(png: PNG, c: number): Buffer {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    o.data[i] = o.data[i + 1] = o.data[i + 2] = png.data[i + c] as number;
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

async function save(page: Page, name: string, at = 1200): Promise<void> {
  if (!SHOTS) return;
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

const step = (page: Page, n = 5): Promise<void> => page.evaluate((k) => window.__rg!.step(1 / 60, k, false), n);
const phase = (page: Page): Promise<string> => page.evaluate(() => window.__rg!.state().phase);
const card = (page: Page, id: string) => page.locator(`[data-testid="wardrobe"] [data-testid="shop-card"][data-item="${id}"]`);
const equipped = (page: Page, slot: string): Promise<string | null> =>
  page.evaluate((s) => window.__rg!.ctx.profile.equipped(s as 'head'), slot);
/** Tap the unlock moment away (it also leaves by itself after ~2 s of real time). */
const dismiss = (page: Page): Promise<void> =>
  page.evaluate(() => (document.querySelector('[data-testid="unlock-moment"].on') as HTMLElement | null)?.click());
const stageReady = (page: Page): Promise<void> =>
  page.waitForFunction(() => window.__rgWardrobe?.stageReady() === true, undefined, { timeout: 60_000 }).then(() => undefined);

test.describe('dressing room', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('title dress-up, try on, buy, wear; HUD button and I key in play; persists after reload', async ({ page }) => {
    test.setTimeout(240_000);
    const { consoleErrors } = await boot(page);
    if (SHOTS) await page.evaluate(() => window.__rgGear!.enablePreviews(true));
    // Six goofy items are free from the first second.
    const free = await page.evaluate(() => ['hat-cone', 'hat-chef', 'face-googly', 'face-moustache', 'face-clown', 'back-balloons'].filter((id) => window.__rg!.ctx.profile.owns(id)).length);
    expect(free).toBe(6);

    // Title: a big dress-up button with a changing goofy teaser.
    await expect(page.getByTestId('title-wardrobe')).toBeVisible();
    await save(page, 'title', 600);
    await page.getByTestId('title-wardrobe').click();
    await expect(page.getByTestId('wardrobe')).toBeVisible();
    await stageReady(page);
    await expect(page.getByTestId('shop-tab-head')).toBeVisible();
    await expect(page.getByTestId('shop-tab-face')).toBeVisible();
    await expect(page.getByTestId('shop-tab-back')).toBeVisible();

    // Wear a free hat: worn on the profile and on the stage hero.
    await card(page, 'hat-cone').click();
    expect(await equipped(page, 'head')).toBe('hat-cone');
    expect(await page.evaluate(() => window.__rgWardrobe!.stage().head)).toBe('hat-cone');
    await expect(card(page, 'hat-cone')).toHaveAttribute('data-state', 'equipped');

    // Try on a dream item: on the stage only, with the price and how many gems are missing.
    await card(page, 'hat-viking').click();
    expect(await page.evaluate(() => window.__rgWardrobe!.stage().head)).toBe('hat-viking');
    expect(await equipped(page, 'head')).toBe('hat-cone');
    await expect(page.getByTestId('wardrobe-need')).toBeVisible();
    await page.waitForTimeout(700);
    await save(page, 'dress-try-viking');

    // Earn a little, try a cheap one, buy it with the big BUY button: confetti, worn at once.
    await page.evaluate(() => window.__rg!.ctx.profile.earn(10, 'test'));
    await card(page, 'hat-pizza').click();
    await expect(page.getByTestId('wardrobe-buy')).toBeVisible();
    await page.getByTestId('wardrobe-buy').click({ force: true }); // it pulses: never "stable"
    await expect(page.getByTestId('unlock-moment')).toBeVisible();
    expect(await page.evaluate(() => window.__rg!.ctx.profile.wallet)).toBe(6);
    expect(await equipped(page, 'head')).toBe('hat-pizza');
    await save(page, 'dress-bought', 500);
    await dismiss(page);
    // Pressing a locked tile twice buys it too (one more press after trying it on).
    await page.getByTestId('shop-tab-face').click();
    await card(page, 'face-bigglasses').click();
    await card(page, 'face-bigglasses').click();
    await dismiss(page);
    expect(await equipped(page, 'face')).toBe('face-bigglasses');
    expect(await page.evaluate(() => window.__rg!.ctx.profile.wallet)).toBe(1);
    // Keyboard: tab to the next category with E/Q is the nav's job; arrows move between tiles.
    await page.getByTestId('shop-tab-back').click();
    await card(page, 'back-balloons').focus();
    await page.keyboard.press('Enter');
    expect(await equipped(page, 'back')).toBe('back-balloons');
    await page.waitForTimeout(700);
    await save(page, 'dress-back');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('wardrobe')).toBeHidden();
    expect(await phase(page)).toBe('title');

    // In play: the HUD hanger button opens it (paused), Esc closes it (playing again).
    await startGame(page);
    await expect(page.getByTestId('hud-wardrobe')).toBeVisible();
    // The button is on top of everything in its corner (with the mouse captured for looking around,
    // desktop players use the I key; the button itself is for touch and a free mouse).
    expect(
      await page.evaluate(() => {
        const b = document.querySelector('[data-testid="hud-wardrobe"]')!.getBoundingClientRect();
        return !!document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('[data-testid="hud-wardrobe"]');
      }),
    ).toBe(true);
    await page.evaluate(() => document.exitPointerLock());
    await page.getByTestId('hud-wardrobe').click({ force: true }); // it pops when something is new
    await step(page, 2);
    await expect(page.getByTestId('wardrobe')).toBeVisible();
    expect(await phase(page)).toBe('paused');
    await page.keyboard.press('Escape');
    await step(page, 2);
    expect(await phase(page)).toBe('playing');
    // The I key.
    await page.keyboard.press('KeyI');
    await step(page, 2);
    await expect(page.getByTestId('wardrobe')).toBeVisible();
    await page.getByTestId('wardrobe-close').click();
    await step(page, 2);
    expect(await phase(page)).toBe('playing');
    // A "new!" badge when something becomes affordable; seen once the room is opened.
    await page.evaluate(() => window.__rg!.ctx.profile.earn(20, 'test'));
    await step(page, 20);
    await expect(page.getByTestId('hud-wardrobe-new')).toHaveClass(/on/);
    await save(page, 'hud', 400);
    await page.keyboard.press('KeyI');
    await step(page, 2);
    await expect(page.getByTestId('wardrobe')).toBeVisible();
    await page.keyboard.press('Escape');
    await step(page, 20);
    await expect(page.getByTestId('hud-wardrobe-new')).not.toHaveClass(/on/);
    // In the buggy the button is off (never strand the hero mid-ride).
    const offInCar = await page.evaluate(() => {
      const rg = window.__rg!;
      const car = rg.ctx.vehicles.all.find((v) => v.kind === 'car');
      if (!car) return 'no car';
      rg.teleport(car.position.x + 1.6, car.position.y + 0.3, car.position.z);
      rg.step(1 / 60, 10, false);
      rg.inject({ usePressed: true, use: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 30, false);
      return rg.ctx.player.mode;
    });
    if (offInCar === 'driving') {
      await expect(page.getByTestId('hud-wardrobe')).toHaveClass(/off/);
      // One clean disabled state (QA6 m11): something new is waiting, yet no "!" and no key cap.
      await page.evaluate(() => window.__rg!.ctx.profile.earn(60, 'test'));
      await step(page, 20);
      await expect(page.getByTestId('hud-wardrobe-new')).toBeHidden();
      await expect(page.locator('[data-testid="hud-wardrobe"] .wb-key')).toBeHidden();
      await page.keyboard.press('KeyI');
      await step(page, 2);
      expect(await phase(page)).toBe('playing');
      // On foot again: the badge is back.
      await page.evaluate(() => {
        const rg = window.__rg!;
        rg.inject({ usePressed: true, use: true });
        rg.step(1 / 60, 1, false);
        rg.inject(null);
        rg.step(1 / 60, 40, false);
      });
      if ((await page.evaluate(() => window.__rg!.ctx.player.mode)) === 'walk') {
        await step(page, 20);
        await expect(page.getByTestId('hud-wardrobe-new')).toHaveClass(/on/);
        await expect(page.getByTestId('hud-wardrobe-new')).toBeVisible();
      }
    }

    // Reload: still wearing the bought hat (saved profile), on the player in the world.
    await page.reload();
    await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 90_000 });
    expect(await equipped(page, 'head')).toBe('hat-pizza');
    expect(await page.evaluate(() => window.__rgGear!.attached())).toEqual({ head: 'hat-pizza', face: 'face-bigglasses', back: 'back-balloons' });
    expect(consoleErrors).toEqual([]);
  });

  test('every tile gets its own picture, also after an earlier opening without previews and after a tab switch', async ({ page }) => {
    test.setTimeout(180_000);
    const { consoleErrors } = await boot(page);
    // First opening with previews off (the test-mode default): tiles show icons.
    await page.getByTestId('title-wardrobe').click();
    await expect(page.getByTestId('wardrobe')).toBeVisible();
    await page.waitForTimeout(2500); // the picture queue runs through every tile (no pictures yet)
    await page.getByTestId('wardrobe-close').click();
    // Previews on (as in a real build), open again: pictures must arrive, each item its own (QA5 M4).
    await page.evaluate(() => window.__rgGear!.enablePreviews(true));
    await page.getByTestId('title-wardrobe').click();
    const distinct = (): Promise<number> =>
      page.evaluate(() => new Set([...document.querySelectorAll<HTMLImageElement>('[data-testid="wardrobe-grid"] img')].map((i) => i.src)).size);
    await expect.poll(distinct, { timeout: 90_000, intervals: [1000] }).toBeGreaterThanOrEqual(6);
    await page.getByTestId('shop-tab-face').click();
    await expect.poll(distinct, { timeout: 60_000, intervals: [1000] }).toBeGreaterThanOrEqual(4);
    await page.getByTestId('wardrobe-close').click();
    expect(consoleErrors).toEqual([]);
  });

  test('the first free hat arrives within the first minute', async ({ page }) => {
    const { consoleErrors } = await boot(page);
    const r = await page.evaluate(() => {
      const rg = window.__rg!;
      rg.ctx.profile.reset();
      window.__rgGear!.enableGifts(true);
      rg.start();
      const owned = [rg.ctx.profile.owns('hat-duck')];
      rg.step(1 / 30, 30 * 26, false); // 26 s of play, no gem picked up
      owned.push(rg.ctx.profile.owns('hat-duck'));
      return { owned, head: rg.ctx.profile.equipped('head'), worn: window.__rgGear!.attached().head };
    });
    expect(r).toEqual({ owned: [false, true], head: 'hat-duck', worn: 'hat-duck' });
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('dressing room by touch', () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test('tap the HUD hanger, tap a tile, tap close', async ({ page }) => {
    const { consoleErrors } = await boot(page);
    await startGame(page, true);
    if (SHOTS) await page.evaluate(() => window.__rgGear!.enablePreviews(true));
    await expect(page.getByTestId('touch-hud')).toBeVisible();
    // The hanger button sits above the touch look zone.
    expect(
      await page.evaluate(() => {
        const b = document.querySelector('[data-testid="hud-wardrobe"]')!.getBoundingClientRect();
        return !!document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('[data-testid="hud-wardrobe"]');
      }),
    ).toBe(true);
    await page.getByTestId('hud-wardrobe').tap({ force: true });
    await step(page, 3);
    await expect(page.getByTestId('wardrobe')).toBeVisible();
    await expect(page.getByTestId('touch-hud')).toBeHidden();
    expect(await phase(page)).toBe('paused');
    await stageReady(page);
    await card(page, 'hat-chef').tap();
    expect(await equipped(page, 'head')).toBe('hat-chef');
    // Thumb-sized targets, nothing scrolls the page.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="wardrobe"] button')]
        .map((b) => [(b as HTMLElement).dataset.testid ?? b.className, (b as HTMLElement).offsetWidth, (b as HTMLElement).offsetHeight] as const)
        .filter(([, w, hgt]) => w > 0 && (w < 44 || hgt < 44))
        .map(([n, w, hgt]) => `${n} ${w}x${hgt}`),
    );
    expect(small).toEqual([]);
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
    await page.waitForTimeout(800);
    await save(page, 'touch-dress');
    await page.getByTestId('wardrobe-close').tap();
    await step(page, 3);
    expect(await phase(page)).toBe('playing');
    await expect(page.getByTestId('touch-hud')).toBeVisible();
    await save(page, 'touch-hud', 300);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('goofy items on every hero in the world (RG_SHOTS=1 only)', () => {
  test.use({ viewport: { width: 640, height: 400 } });
  test.skip(!SHOTS, 'screenshots for humans');

  test('twelve outfits on six heroes, full / R / G', async ({ page }) => {
    test.setTimeout(900_000);
    const { consoleErrors } = await boot(page, '&quality=medium');
    await page.evaluate(() => {
      const rg = window.__rg!;
      rg.start();
      rg.step(1 / 60, 10, false);
    });
    const looks: [string, string, string, string][] = [
      ['robot', 'hat-viking', 'face-googly', 'back-butterfly'],
      ['frog', 'hat-duck', 'face-moustache', 'back-balloons'],
      ['panda', 'hat-sombrero', 'face-hearts', 'back-plush'],
      ['bee', 'hat-unicorn', 'face-bigglasses', 'back-dragon'],
      ['flamingo', 'hat-chef', 'face-snorkel', 'back-flag'],
      ['rex', 'hat-dino', 'face-clown', 'back-turtle'],
      ['robot', 'hat-octopus', 'face-disguise', 'back-soda'],
      ['frog', 'hat-tricorn', 'face-mask', 'back-windup'],
      ['panda', 'hat-fishbowl', 'face-beard', 'back-snail'],
      ['bee', 'hat-tophat', 'face-visor', 'back-surf'],
      ['flamingo', 'hat-jester', 'face-clown', 'back-butterfly'],
      ['rex', 'hat-cone', 'face-googly', 'back-balloons'],
    ];
    for (const [n, [hero, ...items]] of looks.entries()) {
      for (const side of ['front', 'back'] as const) {
        if (side === 'back' && n % 2) continue;
        await page.evaluate(
          async ({ hero, items, side }) => {
            const rg = window.__rg!;
            const ctx = rg.ctx;
            await ctx.player.setCharacter(hero);
            const sp = ctx.world.anchors.spawn;
            rg.teleport(sp.position.x, sp.position.y, sp.position.z, sp.yaw);
            for (const id of items) {
              ctx.profile.unlock(id, 'shop');
              ctx.economy.equip(ctx.economy.item(id)!.slot, id);
            }
            rg.step(1 / 60, 50, false);
            const pl = ctx.player;
            const p = pl.position;
            const fx = Math.sin(pl.yaw);
            const fz = Math.cos(pl.yaw);
            const k = side === 'front' ? 1 : -1;
            const d = hero === 'rex' ? 4.2 : 3.2;
            const c = ctx.camera;
            ctx.uiRoot.style.display = 'none';
            c.position.set(p.x + k * (fx * d + fz * 1.1), p.y + 1.8, p.z + k * (fz * d - fx * 1.1));
            c.fov = 42;
            c.updateProjectionMatrix();
            c.lookAt(p.x, p.y + (hero === 'rex' ? 1.3 : 1.15), p.z);
            rg.render();
          },
          { hero, items, side },
        );
        const buf = await page.screenshot({ type: 'png', animations: 'disabled' });
        const name = `world-${String(n + 1).padStart(2, '0')}-${hero}-${side}`;
        writeFileSync(`${OUT}/${name}.png`, buf);
        if (n < 2 || hero === 'rex') {
          const png = PNG.sync.read(buf);
          writeFileSync(`${OUT}/${name}-R.png`, channel(png, 0));
          writeFileSync(`${OUT}/${name}-G.png`, channel(png, 1));
        }
      }
    }
    expect(consoleErrors).toEqual([]);
  });
});
