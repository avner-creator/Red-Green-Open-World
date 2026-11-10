/**
 * The whole loop in one go, on a brand-new profile (integration check across streams): select
 * the frog -> gems (wallet, combo) -> Gear Shack: buy a hat -> trampoline mega gems -> a mission
 * -> balloon (free) -> second balloon ride costs 5 -> bungee -> Silly Zone flop button -> a
 * secret path reward -> a vault door -> buy the panda in the select -> end screen -> reload keeps
 * wallet, items and hero -> grown-up reset clears the profile. Simulation steps are not rendered.
 */
import { expect, test } from '@playwright/test';
import { boot, startGame } from './helpers';

test('new profile: the whole loop, then reload and reset', async ({ page }) => {
  const { consoleErrors } = await boot(page);
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    const w = window as unknown as { __log: string[] };
    w.__log = [];
    const ev = rg.ctx.events;
    ev.on('mission:completed', (e) => w.__log.push(`mission:${e.mission.kind}`));
    ev.on('ticket:paid', (e) => w.__log.push(`paid:${e.kind}:${e.price}`));
    ev.on('player:flop', () => w.__log.push('flop'));
    ev.on('stunt', (e) => w.__log.push(`stunt:${e.kind}`));
  });
  const log = (): Promise<string[]> => page.evaluate(() => (window as unknown as { __log: string[] }).__log.slice());

  // A new child starts with the frog.
  expect(await page.evaluate(() => window.__rg!.ctx.player.characterId)).toBe('frog');
  await startGame(page);
  const s0 = await page.evaluate(() => ({ phase: window.__rg!.state().phase, wallet: window.__rg!.ctx.profile.wallet, hero: window.__rg!.ctx.player.characterId }));
  expect(s0).toEqual({ phase: 'playing', wallet: 0, hero: 'frog' });

  // Gems: wallet rises, the second quick pickup is a x2 combo.
  const gems = await page.evaluate(() => {
    const rg = window.__rg!;
    for (const g of rg.ctx.world.gemSpots.slice(0, 3)) {
      rg.teleport(g.position.x, g.position.y - 0.85, g.position.z);
      rg.step(1 / 60, 2, false);
    }
    return { wallet: rg.ctx.profile.wallet, combo: rg.ctx.economy.combo.multiplier };
  });
  expect(gems.wallet).toBeGreaterThanOrEqual(5); // 1 + 2 + 3 with the combo
  expect(gems.combo).toBeGreaterThanOrEqual(2);

  // Gear Shack: E at the counter opens the shop; buy the propeller cap.
  await page.evaluate(() => {
    const rg = window.__rg!;
    const a = rg.ctx.world.anchors.gearShack;
    rg.ctx.profile.earn(20, 'test');
    const x = a.position.x + Math.sin(a.yaw) * 1.8;
    const z = a.position.z + Math.cos(a.yaw) * 1.8;
    rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.1, z, a.yaw + Math.PI);
    rg.step(1 / 60, 10, false);
    rg.inject({ usePressed: true, use: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 2);
  });
  await expect(page.getByTestId('shop')).toBeVisible();
  expect(await page.evaluate(() => window.__rg!.ctx.economy.buy('hat-propeller'))).toBe('ok');
  await page.getByTestId('shop-close').click();
  await page.evaluate(() => window.__rg!.step(1 / 60, 3, false));
  expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('playing');

  // Trampoline mega gems (weak-eye only) are on the ride lines; touch two of them.
  const megas = await page.evaluate(() => {
    const rg = window.__rg!;
    const before = rg.ctx.profile.wallet;
    const tr = window.__rgEconomy!.megaSpots.filter((m) => m.tag === 'trampoline').slice(0, 2);
    for (const m of tr) {
      rg.teleport(m.x, m.y - 0.85, m.z);
      rg.step(1 / 60, 2, false);
    }
    rg.ctx.player.respawn();
    rg.step(1 / 60, 5, false);
    return { gained: rg.ctx.profile.wallet - before, tags: window.__rgEconomy!.megaSpots.map((m) => m.tag) };
  });
  expect(megas.gained).toBeGreaterThanOrEqual(10);
  for (const t of ['bungee', 'silly', 'secret', 'vault']) expect(megas.tags).toContain(t);
  expect((await log()).some((l) => l.startsWith('mission:'))).toBe(true);

  // Balloon: first ride free, the next one costs 5.
  const balloon = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const a = ctx.world.anchors.balloon.position;
    const free = ctx.economy.ticketPrice('balloon');
    rg.teleport(a.x + 1.7, ctx.world.heightAt(a.x, a.z) + 0.4, a.z, -Math.PI / 2);
    rg.step(1 / 60, 10, false);
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    const mode = ctx.player.mode;
    ctx.player.respawn(); // R mid-ride hands the player back
    rg.step(1 / 60, 5, false);
    return { free, mode, after: ctx.player.mode, next: ctx.economy.ticketPrice('balloon') };
  });
  expect(balloon).toEqual({ free: 0, mode: 'external', after: 'walk', next: 5 });

  // Bungee (free): E on the platform starts the ride; R hands the player back.
  const bungee = await page.evaluate(() => {
    const rg = window.__rg!;
    const info = window.__rgBungee!.info()!;
    const wallet = rg.ctx.profile.wallet;
    rg.teleport(info.board[0] + 2.6, info.deck + 0.3, info.board[2], -Math.PI / 2);
    rg.step(1 / 60, 20, false);
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 10, false);
    const phase = window.__rgBungee!.phase();
    rg.ctx.player.respawn();
    rg.step(1 / 60, 5, false);
    return { phase, wallet: rg.ctx.profile.wallet - wallet, mode: rg.ctx.player.mode, after: window.__rgBungee!.phase() };
  });
  expect(bungee.phase).not.toBe('idle');
  expect(bungee).toMatchObject({ wallet: 0, mode: 'walk', after: 'idle' });

  // Silly Zone: the flop button flops.
  await page.evaluate(() => {
    const rg = window.__rg!;
    const f = window.__rgSilly!.flopButton();
    rg.teleport(f[0] + 3.5, f[1] + 0.1, f[2], -Math.PI / 2);
    rg.step(1 / 60, 20, false);
    rg.teleport(f[0], f[1] + 0.1, f[2], -Math.PI / 2);
    rg.step(1 / 60, 20, false);
    rg.ctx.player.respawn();
    rg.step(1 / 60, 5, false);
  });
  expect(await log()).toContain('flop');

  // A secret path reward (pays out once) and its mega gem.
  const secret = await page.evaluate(() => {
    const rg = window.__rg!;
    const before = rg.ctx.profile.wallet;
    const [x, y, z] = window.__rgSecrets!.info().paths.find((p) => p.id === 'trampoline')!.pedestal;
    rg.teleport(x, y + 0.05, z);
    rg.step(1 / 60, 20, false);
    return { claimed: window.__rgSecrets!.info().paths.find((p) => p.id === 'trampoline')!.claimed, gained: rg.ctx.profile.wallet - before };
  });
  expect(secret.claimed).toBe(true);
  expect(secret.gained).toBeGreaterThanOrEqual(5);

  // A vault door: press the weak-eye order on the strong-eye buttons, walk in.
  const vault = await page.evaluate(() => {
    const rg = window.__rg!;
    const sec = window.__rgSecrets!;
    const d = sec.info().doors[0];
    for (const b of d.sequence) {
      const [x, z] = sec.standPoint(0, b);
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.1, z, d.yaw + Math.PI);
      rg.step(1 / 60, 12, false);
      rg.inject({ usePressed: true, use: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 2, false);
    }
    rg.step(1 / 60, 100, false);
    const [ix, iz] = sec.insidePoint(0);
    rg.teleport(ix, d.y + 0.1, iz);
    rg.step(1 / 60, 20, false);
    const after = sec.info().doors[0];
    return { open: after.open, treasure: after.treasure };
  });
  expect(vault).toEqual({ open: true, treasure: true });

  // Buy the panda in the hero select (pause -> Hero), with the real wallet.
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.ctx.profile.earn(Math.max(0, 30 - rg.ctx.profile.wallet), 'test');
    rg.ctx.session.pause();
    rg.step(1 / 60, 2, false);
  });
  await page.getByTestId('pause-hero').click();
  await page.getByTestId('csel-panda').click();
  await page.getByTestId('csel-buy').click();
  await page.getByTestId('csel-go').click();
  const bought = await page.evaluate(() => {
    const p = window.__rg!.ctx.profile;
    return { phase: window.__rg!.state().phase, owns: p.owns('panda'), hero: p.equipped('character'), wallet: p.wallet };
  });
  expect(bought).toMatchObject({ phase: 'playing', owns: true, hero: 'panda' });

  // End screen: wallet, missions and outfits; Hero and Wardrobe one click away.
  await page.evaluate(() => {
    window.__rg!.setRemaining(0.05);
    window.__rg!.step(1 / 60, 20);
  });
  await expect(page.getByTestId('end-wallet')).toBeVisible();
  await expect(page.getByTestId('end-missions')).toBeVisible();
  await expect(page.getByTestId('end-hero')).toBeVisible();
  await expect(page.getByTestId('end-wardrobe')).toBeVisible();
  const saved = await page.evaluate(() => window.__rg!.ctx.profile.wallet);

  // Reload: wallet, owned items and the hero persist (only the saved hero's model loads).
  await page.reload();
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 90_000 });
  const back = await page.evaluate(() => {
    const rg = window.__rg!;
    const p = rg.ctx.profile;
    const glbs = performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /characters\/.*\.glb/.test(n));
    return { wallet: p.wallet, hat: p.owns('hat-propeller'), panda: p.owns('panda'), hero: rg.ctx.player.characterId, glbs: glbs.map((g) => g.replace(/^.*\//, '')) };
  });
  // The saved hero loads first and the old default (robot) never does. (Scoops' terrace friends load
  // two more heroes at boot: see the integration report.)
  expect({ ...back, glbs: back.glbs[0] }).toEqual({ wallet: saved, hat: true, panda: true, hero: 'panda', glbs: 'panda.glb' });
  expect(back.glbs).not.toContain('robot.glb');

  // Grown-up reset clears it all: back to a fresh profile and the frog.
  const reset = await page.evaluate(async () => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.ctx.profile.reset();
    rg.step(1 / 60, 3, false);
    for (let i = 0; i < 50 && rg.ctx.player.characterId !== 'frog'; i++) await new Promise((r) => setTimeout(r, 50));
    const p = rg.ctx.profile;
    return { wallet: p.wallet, hat: p.owns('hat-propeller'), panda: p.owns('panda'), hero: rg.ctx.player.characterId };
  });
  expect(reset).toEqual({ wallet: 0, hat: false, panda: false, hero: 'frog' });
  expect(consoleErrors).toEqual([]);
});
