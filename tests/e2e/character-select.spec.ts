/**
 * Character select: Play opens it, browsing shows the real model in the world, locked characters
 * cannot start, the pick is remembered, and buying (fake wallet) unlocks and starts.
 * Screenshots (opt-in, RG_SHOTS=1) go to test-results/ui/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { SHOTS, boot } from './helpers';

const OUT = 'test-results/ui';
mkdirSync(OUT, { recursive: true });

const phase = (page: Page): Promise<string> => page.evaluate(() => window.__rg!.state().phase);
const charId = (page: Page): Promise<string> => page.evaluate(() => window.__rg!.ctx.player.characterId);
const step = (page: Page, n = 30): Promise<void> => page.evaluate((k) => window.__rg!.step(1 / 60, k, false), n);

function channel(png: PNG, c: number): Buffer {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    o.data[i] = o.data[i + 1] = o.data[i + 2] = png.data[i + c] as number;
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

async function save(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  await step(page, 20);
  await page.evaluate(() => window.__rg!.render());
  const buf = await page.screenshot({ type: 'png', animations: 'disabled' });
  const png = PNG.sync.read(buf);
  const tag = `${page.viewportSize()!.width}`;
  writeFileSync(`${OUT}/${name}-${tag}.png`, buf);
  writeFileSync(`${OUT}/${name}-${tag}-R.png`, channel(png, 0));
  writeFileSync(`${OUT}/${name}-${tag}-G.png`, channel(png, 1));
}

/** Wait for the real model swap (player:character) to land on `id`. */
async function settle(page: Page, id: string): Promise<void> {
  await expect
    .poll(async () => {
      await step(page, 8);
      return charId(page);
    }, { timeout: 60_000 })
    .toBe(id);
}

// RG_VIEW=1920x1080 (or 667x375) renders the screenshots at another size.
const view = /^(\d+)x(\d+)$/.exec(process.env.RG_VIEW ?? '');
if (view) test.use({ viewport: { width: Number(view[1]), height: Number(view[2]) } });

test.describe('character select', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;
  let consoleErrors: string[] = [];

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    ({ consoleErrors } = await boot(page));
    await page.evaluate(() => {
      window.__rg!.freeze(true);
      try {
        localStorage.removeItem('rgow.character.v1');
        window.__rg!.ctx.profile.equip('character', 'frog');
      } catch {
        /* ignore */
      }
    });
  });
  test.afterAll(async () => {
    await page.close();
  });

  test('the change-hero button opens the select; browsing shows each character live; locked ones cannot start', async () => {
    await page.getByTestId('title-hero').click();
    await expect(page.getByTestId('csel-go')).toBeVisible();
    expect(await phase(page)).toBe('title');
    // A new profile starts with the frog (the first-run default).
    await settle(page, 'frog');
    await expect(page.getByTestId('csel-name')).toHaveText('HOPPER');
    await expect(page.getByTestId('csel-skill')).toHaveAttribute('data-skill', 'superBounce');
    await save(page, 'select-frog');

    // Browse with the keyboard (the focused chip is the selected one).
    await page.keyboard.press('ArrowLeft');
    await settle(page, 'robot');
    await expect(page.getByTestId('csel-name')).toHaveText('BOLT');
    await save(page, 'select-robot');

    // A priced character shows a padlock and the price, can be previewed, and cannot start.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await settle(page, 'panda');
    await expect(page.getByTestId('csel-locked')).toBeVisible();
    await expect(page.getByTestId('csel-go')).toHaveCount(0);
    await save(page, 'select-locked');
    await page.keyboard.press('Enter'); // choosing a locked card does nothing
    await step(page, 5);
    expect(await phase(page)).toBe('title');

    // Back returns to the title and the saved (default) hero comes back.
    await page.getByTestId('csel-back').click();
    await expect(page.getByTestId('play')).toBeVisible();
    await settle(page, 'frog');
  });

  test('choosing the robot starts the session as the robot, and a reload preselects it', async () => {
    await page.getByTestId('title-hero').click();
    await page.getByTestId('csel-robot').click();
    await settle(page, 'robot');
    await page.getByTestId('csel-go').click();
    expect(await phase(page)).toBe('playing');
    await settle(page, 'robot');
    expect(await page.evaluate(() => window.__rg!.ctx.profile.equipped('character'))).toBe('robot');
    await step(page, 5);
    await expect(page.getByTestId('skill-chip')).toBeVisible();
    await expect(page.getByTestId('skill-chip')).toHaveAttribute('data-skill', 'doubleJump');
    await save(page, 'hud-skill-chip');

    await page.reload();
    await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 90_000 });
    await page.evaluate(() => window.__rg!.freeze(true));
    await settle(page, 'robot');
    await page.getByTestId('title-hero').click();
    await expect(page.getByTestId('csel-robot')).toHaveClass(/sel/);
    await expect(page.getByTestId('csel-name')).toHaveText('BOLT');
    // Change hero, Go (Play alone starts with the saved hero).
    await page.getByTestId('csel-go').click();
    expect(await phase(page)).toBe('playing');
    expect(await charId(page)).toBe('robot');
  });

  test('a character that can be afforded unlocks with a celebration and then starts', async () => {
    await page.evaluate(() => window.__rg!.ctx.session.toTitle());
    await step(page, 5);
    // The real wallet: a fresh profile with 30 gems; Mochi (25) is for sale.
    await page.evaluate(() => {
      const p = window.__rg!.ctx.profile;
      p.reset();
      p.earn(30, 'test');
    });
    await page.getByTestId('title-hero').click();
    await page.getByTestId('csel-panda').click();
    await settle(page, 'panda');
    await expect(page.getByTestId('csel-buy')).toBeVisible();
    await expect(page.getByTestId('csel-go')).toHaveCount(0);
    await save(page, 'select-buy');
    await page.getByTestId('csel-buy').click();
    await expect(page.getByTestId('csel-unlock')).toHaveClass(/on/);
    await save(page, 'unlock');
    await expect(page.getByTestId('csel-go')).toBeVisible();
    await expect(page.getByTestId('csel-wallet')).toHaveText('5');
    await page.getByTestId('csel-go').click();
    expect(await phase(page)).toBe('playing');
    await settle(page, 'panda');
    expect(await page.evaluate(() => window.__rg!.ctx.profile.equipped('character'))).toBe('panda');
    // Same wallet and profile as the shop: paid, owned, worn, and the shop card says so.
    expect(await page.evaluate(() => {
      const p = window.__rg!.ctx.profile;
      return { wallet: p.wallet, owns: p.owns('panda'), worn: p.equipped('character') };
    })).toEqual({ wallet: 5, owns: true, worn: 'panda' });
    await page.evaluate(() => {
      window.__rg!.ctx.events.emit('shop:open', {});
      window.__rg!.step(1 / 60, 3, false);
    });
    await page.getByTestId('shop-tab-character').click();
    await expect(page.locator('[data-testid="shop"] [data-testid="shop-card"][data-item="panda"]')).toHaveAttribute('data-state', 'equipped');
    await expect(page.locator('[data-testid="shop"] [data-testid="shop-card"][data-item="bee"]')).toHaveAttribute('data-state', 'poor');
    await page.getByTestId('shop-close').click();
    await page.evaluate(() => window.__rg!.step(1 / 60, 3, false));
    expect(await phase(page)).toBe('playing');
    // A wipe locks the paid heroes again and swaps back to a free one.
    await page.evaluate(() => window.__rg!.ctx.profile.reset());
    await settle(page, 'frog');
    expect(await page.evaluate(() => [window.__rg!.ctx.profile.owns('panda'), window.__rg!.ctx.profile.equipped('character')])).toEqual([false, 'frog']);
    expect(consoleErrors).toEqual([]);
  });
});
