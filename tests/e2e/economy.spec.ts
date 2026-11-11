/**
 * Economy e2e: gems are money (combo), mega gems are worth 5, gems respawn, and mega gems are
 * weak-eye-only (channel separation for all 4 lens/eye combinations).
 * One page load for the whole file; simulation steps skip rendering.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { boot, canvasShot, channelDiff } from './helpers';
import { VisionLayer } from '../../src/types';
import type { EyeSettings } from '../../src/types';

test.describe.configure({ mode: 'serial' });

interface Picked { id: string; value?: number; mega?: boolean; combo?: number; gain?: number }

let page: Page;
let consoleErrors: string[] = [];

declare global {
  interface Window {
    __picks?: Picked[];
    __respawned?: string[];
    /** Wallet changes with reason 'gem' (missions may add bonuses of their own). */
    __gemMoney?: number;
  }
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    window.__picks = [];
    window.__respawned = [];
    window.__gemMoney = 0;
    rg.ctx.events.on('wallet:changed', (e) => {
      if (e.reason === 'gem') window.__gemMoney! += e.delta;
    });
    rg.ctx.events.on('gem:collected', (e) => window.__picks!.push({ id: e.id, value: e.value, mega: e.mega, combo: e.combo, gain: e.gain }));
    rg.ctx.events.on('gem:respawned', (e) => window.__respawned!.push(e.id));
    rg.start();
    rg.step(1 / 60, 5, false);
  });
});

test.afterAll(async () => {
  await page.close();
});

/** Put the player's chest (what the pickup tests) on a point and let a few frames run. */
async function touch(p: { x: number; y: number; z: number }): Promise<void> {
  await page.evaluate(({ x, y, z }) => {
    const rg = window.__rg!;
    rg.teleport(x, y - 0.85, z);
    rg.step(1 / 60, 3, false);
  }, p);
}

test('two quick gem pickups fill the wallet with a x2 on the second', async () => {
  const before = await page.evaluate(() => window.__gemMoney!);
  const n = await page.evaluate(() => window.__rg!.ctx.world.gemSpots.length);
  expect(n).toBeGreaterThan(3);
  // Two far-apart gems, one after the other, inside the combo window.
  const [a, b] = await page.evaluate(() => {
    const s = window.__rg!.ctx.world.gemSpots;
    const first = s[0].position;
    let best = 1;
    for (let i = 1; i < s.length; i++) if (s[i].position.distanceTo(first) > s[best].position.distanceTo(first)) best = i;
    return [first, s[best].position].map((v) => ({ x: v.x, y: v.y, z: v.z }));
  });
  await page.evaluate(() => (window.__picks!.length = 0));
  await touch(a);
  await touch(b);
  const r = await page.evaluate(() => ({ picks: window.__picks!.slice(), wallet: window.__gemMoney!, combo: window.__rg!.ctx.economy.combo }));
  expect(r.picks.length).toBeGreaterThanOrEqual(2);
  expect(r.picks[0]).toMatchObject({ mega: false, value: 1, combo: 1, gain: 1 });
  expect(r.picks[1]).toMatchObject({ mega: false, value: 1, combo: 2, gain: 2 });
  const sum = r.picks.reduce((s, p) => s + (p.gain ?? 0), 0);
  expect(r.wallet - before).toBe(sum);
  expect(r.combo.multiplier).toBeGreaterThanOrEqual(2);
});

test('the combo falls back to x1 after the window', async () => {
  const changes = await page.evaluate(() => {
    const rg = window.__rg!;
    const seen: number[] = [];
    const off = rg.ctx.events.on('combo:changed', (e) => seen.push(e.multiplier));
    rg.step(0.1, 40, false); // 4 s > comboWindow
    off();
    return { seen, now: rg.ctx.economy.combo.multiplier };
  });
  expect(changes.now).toBe(1);
  expect(changes.seen[changes.seen.length - 1]).toBe(1);
});

test('a mega gem is worth 5 and is counted in the total', async () => {
  const hook = await page.evaluate(() => window.__rgEconomy!);
  expect(hook.megaSpots.length).toBeGreaterThanOrEqual(8);
  expect(hook.megaSpots.length).toBeLessThanOrEqual(24);
  const total = await page.evaluate(() => window.__rg!.state().gemsTotal);
  expect(total).toBe(hook.gemSpotCount + hook.megaSpots.length);

  const before = await page.evaluate(() => window.__gemMoney!);
  await page.evaluate(() => (window.__picks!.length = 0));
  await touch(hook.megaSpots[0]);
  const r = await page.evaluate(() => ({ picks: window.__picks!.slice(), wallet: window.__gemMoney! }));
  expect(r.picks[0]).toMatchObject({ id: 'mega0', mega: true, value: 5, combo: 1, gain: 5 });
  // The trampoline can carry the player through a neighbouring mega gem too: every pickup is paid.
  expect(r.picks.every((p) => p.mega && p.value === 5)).toBe(true);
  expect(r.wallet - before).toBe(r.picks.reduce((sum, p) => sum + (p.gain ?? 0), 0));
});

test('collected gems come back after the respawn time (and on demand)', async () => {
  // mega0 was collected in the previous test. 46 s later it is back.
  const natural = await page.evaluate(() => {
    const rg = window.__rg!;
    window.__respawned!.length = 0;
    rg.step(0.25, 190, false);
    return window.__respawned!.slice();
  });
  expect(natural).toContain('mega0');

  // On demand: collect a gem, force the respawn, collect it again.
  const g = await page.evaluate(() => {
    const v = window.__rg!.ctx.world.gemSpots[0].position;
    return { x: v.x, y: v.y, z: v.z };
  });
  const r = await page.evaluate(async () => {
    const rg = window.__rg!;
    window.__picks!.length = 0;
    window.__respawned!.length = 0;
    rg.step(0.25, 20, false);
    window.__rgEconomy!.forceRespawn();
    return window.__respawned!.length;
  });
  expect(r).toBe(0); // nothing was collected, nothing to bring back
  await touch(g);
  const picked = await page.evaluate(() => window.__picks!.filter((p) => p.id === 'gem0').length);
  expect(picked).toBe(1);
  const back = await page.evaluate(() => {
    window.__respawned!.length = 0;
    window.__rgEconomy!.forceRespawn();
    return window.__respawned!.slice();
  });
  expect(back).toContain('gem0');
  await touch(g);
  expect(await page.evaluate(() => window.__picks!.filter((p) => p.id === 'gem0').length)).toBe(2);
});

const COMBOS: Array<{ eye: Pick<EyeSettings, 'leftLens' | 'weakEye'>; weak: 'r' | 'g'; strong: 'r' | 'g' }> = [
  { eye: { leftLens: 'red', weakEye: 'left' }, weak: 'r', strong: 'g' },
  { eye: { leftLens: 'red', weakEye: 'right' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'left' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'right' }, weak: 'r', strong: 'g' },
];

const maxOf = (d: ReturnType<typeof channelDiff>, c: 'r' | 'g' | 'b'): number => (c === 'r' ? d.maxR : c === 'g' ? d.maxG : d.maxB);

test('mega gems touch only the weak channel, all 4 lens/eye combinations', async () => {
  // Look at a mega gem on the road in front of the garage from 8 m away (never touching it).
  const view = await page.evaluate(() => {
    const rg = window.__rg!;
    const spots = window.__rgEconomy!.megaSpots;
    const road = spots.filter((q) => q.tag === 'road');
    const s = road[1];
    const picksBefore = window.__picks!.length;
    const px = s.x + 8;
    const yaw = Math.atan2(s.x - px, 0);
    rg.teleport(px, rg.ctx.world.heightAt(px, s.z) + 0.2, s.z, yaw);
    rg.step(1 / 60, 30, false);
    rg.step(1 / 60, 1);
    // Where the mega gem lands on screen (to prove the change is the gem, not something else).
    const p = rg.ctx.player.position.clone().set(s.x, s.y, s.z).project(rg.ctx.camera);
    return { sx: (p.x * 0.5 + 0.5) * window.innerWidth, sy: (1 - (p.y * 0.5 + 0.5)) * window.innerHeight, z: p.z, touched: window.__picks!.length - picksBefore };
  });
  expect(view.z).toBeLessThan(1); // in front of the camera
  expect(view.touched).toBe(0); // we only look at it, nothing is collected

  const frame = async (weak: boolean) => {
    await page.evaluate(({ weak, W }) => {
      const rg = window.__rg!;
      rg.setLayerVisible(W, weak);
      rg.render();
    }, { weak, W: VisionLayer.WeakOnly });
    return canvasShot(page);
  };
  for (const combo of COMBOS) {
    await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);
    const withGem = await frame(true);
    const without = await frame(false);
    const d = channelDiff(withGem, without);
    const label = `${combo.eye.leftLens}/${combo.eye.weakEye}`;
    expect(d[combo.weak], label).toBeGreaterThan(60);
    expect(maxOf(d, combo.strong), label).toBe(0);
    expect(d.maxB, label).toBe(0);

    if (combo === COMBOS[0]) {
      // The weak-channel change sits around the mega gem's screen position.
      let inside = 0;
      let all = 0;
      for (let y = 0; y < withGem.height; y++) {
        for (let x = 0; x < withGem.width; x++) {
          const i = (y * withGem.width + x) * 4;
          if (Math.abs(withGem.data[i] - without.data[i]) <= 2) continue;
          all++;
          if (Math.abs(x - view.sx) < 90 && Math.abs(y - view.sy) < 90) inside++;
        }
      }
      expect(inside / all).toBeGreaterThan(0.3); // other gems (the road line) are in view too
    }
  }
  await page.evaluate(({ W }) => window.__rg!.setLayerVisible(W, true), { W: VisionLayer.WeakOnly });
});

test('balloon: first ride free, then a ticket (denied with 0 gems, paid with 5)', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const log: string[] = [];
    ctx.events.on('ticket:paid', (e) => log.push(`paid:${e.price}:${e.free}`));
    ctx.events.on('ticket:denied', (e) => log.push(`denied:${e.price}`));
    const spent: number[] = [];
    ctx.events.on('wallet:changed', (e) => {
      if (e.reason === 'ticket') spent.push(e.delta);
    });
    const a = ctx.world.anchors.balloon.position;
    const tryRide = (): string => {
      rg.teleport(a.x + 1.7, ctx.world.heightAt(a.x, a.z) + 0.4, a.z, -Math.PI / 2);
      rg.step(1 / 60, 10, false);
      rg.inject({ usePressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      return ctx.player.mode;
    };
    const finishRide = (): boolean => {
      for (let i = 0; i < 4000; i++) {
        rg.step(1 / 20, 1, false);
        if (ctx.player.mode === 'walk' && ctx.player.grounded) return true;
      }
      return false;
    };
    const out: Record<string, unknown> = {};
    // A new session: the first balloon ride is free (even with an empty wallet).
    rg.start();
    rg.step(1 / 60, 3, false);
    ctx.profile.spend(ctx.profile.wallet, 'test');
    out.free = ctx.economy.ticketPrice('balloon');
    out.mode1 = tryRide();
    out.wallet1 = ctx.profile.wallet;
    out.finished = finishRide();
    rg.step(1 / 20, 200, false);
    // Second ride with 0 gems: denied, no ride starts.
    out.price = ctx.economy.ticketPrice('balloon');
    out.mode2 = tryRide();
    // With 5 gems: pays 5 and the ride starts.
    ctx.profile.earn(5, 'test');
    out.mode3 = tryRide();
    out.spent = spent;
    out.log = log;
    return out;
  });
  expect(r.free).toBe(0);
  expect(r.mode1).not.toBe('walk');
  expect(r.wallet1).toBe(0);
  expect(r.finished).toBe(true);
  expect(r.price).toBe(5);
  expect(r.mode2).toBe('walk');
  expect(r.mode3).not.toBe('walk');
  expect(r.spent).toEqual([-5]);
  expect(r.log).toEqual(['paid:0:true', 'denied:5', 'paid:5:false']);
});

test('rocket pad: first launch free, then 0 gems flies a practice launch (no stunt prize), 3 gems pay', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const th = window.__rgThrills!;
    const log: string[] = [];
    const spent: number[] = [];
    const launches: number[] = [];
    ctx.events.on('ticket:denied', (e) => log.push(`denied:${e.price}`));
    ctx.events.on('ticket:paid', (e) => log.push(`paid:${e.price}`));
    ctx.events.on('stunt', (e) => {
      if (e.kind === 'launch') launches.push(e.value);
    });
    ctx.events.on('wallet:changed', (e) => {
      if (e.reason === 'ticket') spent.push(e.delta);
    });
    rg.start();
    rg.step(1 / 60, 5, false); // the rocket pads are built on the first update
    const info = th.rocket()!;
    const pad = info.pads[0];
    ctx.profile.spend(ctx.profile.wallet, 'test');
    const fly = (): void => {
      for (let i = 0; i < 60 * 15 && ctx.player.mode !== 'walk'; i++) rg.step(1 / 60, 1, false);
      rg.step(1 / 60, 150, false); // cooldown
    };
    // Empty wallet: the first launch is free.
    th.launchRocket(0);
    rg.step(1 / 60, 3, false);
    const out: Record<string, unknown> = {};
    out.modeFree = ctx.player.mode;
    fly();
    // Second launch with 0 gems (walk onto the pad): it flies anyway (practice), one denial, and no
    // launch stunt.
    const before = launches.length;
    ctx.profile.spend(ctx.profile.wallet, 'test'); // the free launch's stunt paid a prize
    rg.teleport(pad.x, pad.y + 0.1, pad.z);
    rg.step(1 / 60, 10, false);
    out.modePractice = ctx.player.mode;
    fly();
    out.practiceLaunches = launches.length - before;
    // With 3 gems the same pad launches and pays.
    ctx.profile.earn(3, 'test');
    th.launchRocket(0);
    rg.step(1 / 60, 3, false);
    out.modeLaunched = ctx.player.mode;
    out.spent = spent;
    out.log = log;
    return out;
  });
  expect(r.modeFree).not.toBe('walk');
  expect(r.modePractice).not.toBe('walk');
  expect(r.practiceLaunches, JSON.stringify(r)).toBe(0);
  expect(r.modeLaunched).not.toBe('walk');
  expect(r.spent).toEqual([-3]);
  expect(r.log).toEqual(['paid:0', 'denied:3', 'paid:3']);
});

test('no console errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
