/**
 * Floppy hero: springy head/arms (visual only). The hero still walks dead straight, the head lags
 * on a sprint start and settles at rest, arms flail in a jump, for all six heroes.
 * Screenshots: test-results/wobble-<hero>-<n>.png.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { boot, canvasShot, startGame } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
let consoleErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  page = await browser.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  ({ consoleErrors } = await boot(page));
  await startGame(page);
});
test.afterAll(async () => {
  await page.close();
});

interface Probe { head: { pitch: number; roll: number } | null; x: number; z: number }
const probe = (): Promise<Probe> =>
  page.evaluate(() => {
    const p = window.__rg!.ctx.player;
    // The player's internal model is reachable through the avatar root's userData in test mode.
    const w = (p.object.userData as { wobble?: { head: { pitch: number; roll: number } } }).wobble;
    return { head: w ? { ...w.head } : null, x: p.position.x, z: p.position.z };
  });

test('walks dead straight, head lags on a sprint start and settles at rest', async () => {
  test.setTimeout(200_000);
  await page.evaluate(() => {
    const rg = window.__rg!;
    const sp = rg.ctx.world.anchors.spawn;
    rg.teleport(sp.position.x, sp.position.y + 0.1, sp.position.z, 0);
    rg.step(1 / 60, 60, false);
  });
  const a = await probe();
  expect(a.head).not.toBeNull();
  expect(Math.abs(a.head!.pitch) + Math.abs(a.head!.roll)).toBeLessThan(0.02);
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.ctx.input.inject({ moveY: 1, sprint: true });
    rg.step(1 / 60, 6, false);
  });
  const b = await probe();
  expect(Math.abs(b.head!.pitch)).toBeGreaterThan(0.02);
  await page.evaluate(() => window.__rg!.step(1 / 60, 90, false));
  const c = await probe();
  await page.evaluate(() => {
    window.__rg!.ctx.input.inject(null);
    window.__rg!.step(1 / 60, 180, false);
  });
  const d = await probe();
  // Straight: yaw 0 → moving along +Z; sideways drift stays tiny (wobble never steers).
  expect(Math.abs(c.x - a.x)).toBeLessThan(0.05);
  expect(c.z - a.z).toBeGreaterThan(3);
  expect(Math.abs(d.head!.pitch) + Math.abs(d.head!.roll)).toBeLessThan(0.03);
});

test('arms flail in a jump for every hero (shots)', async () => {
  test.setTimeout(400_000);
  for (const id of ['robot', 'frog', 'panda', 'bee', 'flamingo', 'rex']) {
    await page.evaluate(async (hero) => {
      const rg = window.__rg!;
      rg.ctx.profile.equip('character', hero);
      await rg.ctx.player.setCharacter(hero as never);
      const sp = rg.ctx.world.anchors.spawn;
      rg.teleport(sp.position.x, sp.position.y + 0.1, sp.position.z, sp.yaw);
      rg.step(1 / 60, 30, false);
      rg.ctx.input.inject({ jumpPressed: true, jump: true });
      rg.step(1 / 60, 22, false);
      rg.ctx.input.inject(null);
      rg.render();
    }, id);
    await canvasShot(page, `test-results/wobble-${id}-air.png`);
    const air = await probe();
    expect(air.head, id).not.toBeNull();
    expect(await page.evaluate(() => window.__rg!.ctx.player.grounded), id).toBe(false);
    expect(await page.evaluate(() => window.__rg!.ctx.player.characterId), id).toBe(id);
    await page.evaluate(() => window.__rg!.step(1 / 60, 90, false));
  }
  expect(consoleErrors).toEqual([]);
});
