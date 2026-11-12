/**
 * QA round 9, both with real key presses:
 * M1: Pip is showing a new player round; the child walks onto the foam race's start ring (a walk-on
 *     start: the ticket is taken while the hero is still walking). From that moment until the race
 *     is over Pip starts no lead and says no "Follow me!"; once it is over the tour goes on.
 * M2: the tour's lead from the trampoline (the hero standing on its bed, where the bounce leaves
 *     them) to Carnival Row gets there with a child who steers after Pip with the keys: no fence
 *     dead end, Carnival Row never marked unreachable.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { boot } from './helpers';

test.describe.configure({ mode: 'serial' });

let page: Page;
let consoleErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page, '&buddy=1'));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 30, 30, false);
  });
});

test.afterAll(async () => {
  await page.close();
});

const held = new Set<string>();
/** Hold exactly these keys (real key events). */
async function keys(want: Set<string>): Promise<void> {
  for (const k of [...held]) {
    if (!want.has(k)) {
      await page.keyboard.up(k);
      held.delete(k);
    }
  }
  for (const k of want) {
    if (!held.has(k)) {
      await page.keyboard.down(k);
      held.add(k);
    }
  }
}

/** The W/A/S/D keys that walk the hero (camera-relative) towards (tx, tz), or none when close. */
async function keysToward(tx: number, tz: number, close = 2.5): Promise<Set<string>> {
  const m = await page.evaluate(([x, z, c]) => {
    const rg = window.__rg!;
    const p = rg.ctx.player.position;
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d <= c) return [0, 0];
    const y = rg.ctx.cameraRig.yaw;
    return [(-dx * Math.cos(y) + dz * Math.sin(y)) / d, (dx * Math.sin(y) + dz * Math.cos(y)) / d];
  }, [tx, tz, close] as const);
  const want = new Set<string>();
  if (m[1] > 0.38) want.add('KeyW');
  if (m[1] < -0.38) want.add('KeyS');
  if (m[0] > 0.38) want.add('KeyD');
  if (m[0] < -0.38) want.add('KeyA');
  return want;
}

/** Run the game for `seconds` (no rendering), in 1/30 s steps. */
const run = (seconds: number): Promise<void> => page.evaluate((s) => window.__rg!.step(1 / 30, Math.round(s * 30), false), seconds);

test('M1: from the walk-on start of the foam race until it is over, Pip leads nowhere', async () => {
  test.setTimeout(240_000);
  const setup = await page.evaluate(() => {
    const rg = window.__rg!;
    const [x, , z] = window.__rgFoam!.pad().at;
    const px = x + 9;
    rg.teleport(px, rg.ctx.world.heightAt(px, z) + 0.3, z, -Math.PI / 2);
    rg.step(1 / 30, 10, false);
    // The intro is over and the trampoline done: the next place done starts the tour's next lead.
    window.__rgBuddy!.tour(['trampoline']);
    rg.step(1 / 30, 10, false);
    return { phase: window.__rgFoam!.phase(), n: window.__rgBuddy!.history().length, lead: window.__rgBuddy!.lead().to, ring: [x, z] as [number, number] };
  });
  expect(setup.phase).toBe('idle');
  expect(setup.lead).toBeNull();

  // Walk onto the ring with the keys (real key presses) until the race starts.
  let phase = 'idle';
  const walk: unknown[] = [];
  for (let i = 0; i < 48 && phase === 'idle'; i++) {
    await keys(await keysToward(setup.ring[0], setup.ring[1], 0.3));
    await run(0.25);
    const s = await page.evaluate(() => ({ phase: window.__rgFoam!.phase(), p: window.__rg!.state().playerPosition.map((v) => +v.toFixed(1)), fill: window.__rgFoam!.pad().fill }));
    phase = s.phase;
    walk.push(s);
  }
  await keys(new Set());
  expect(phase, JSON.stringify(walk)).not.toBe('idle');

  // Countdown and the run: no lead, no "Follow me!" (Pip's how-to lines are fine).
  const seen: { t: number; to: string | null; phase: string; mode: string }[] = [];
  for (let i = 0; i < 25; i++) {
    await run(1);
    const s = await page.evaluate(() => ({ to: window.__rgBuddy!.lead().to, phase: window.__rgFoam!.phase(), mode: window.__rg!.ctx.player.mode }));
    seen.push({ t: i + 1, ...s });
  }
  const after = await page.evaluate((n) => window.__rgBuddy!.history().slice(n), setup.n);
  const info = JSON.stringify({ seen, after });
  expect(seen.every((s) => s.to === null), info).toBe(true);
  expect(after.filter((l) => /^(guide|invite)/.test(l.id)), info).toEqual([]);
  expect(seen.some((s) => s.phase === 'run'), info).toBe(true);
  expect(await page.evaluate(() => window.__rgBuddy!.lead().done), info).toContain('foamCourse');

  // The child leaves the race (R): it is over, so the tour goes on.
  await page.keyboard.press('KeyR');
  let to: string | null = null;
  for (let i = 0; i < 12 && !to; i++) {
    await run(0.5);
    to = await page.evaluate(() => window.__rgBuddy!.lead().to);
  }
  expect(await page.evaluate(() => window.__rgFoam!.phase()), info).toBe('idle');
  expect(to, info).not.toBeNull();
  expect(to).not.toBe('foamCourse');
  expect(consoleErrors).toEqual([]);
});

test('M2: the lead from the trampoline bed to Carnival Row gets there, the child steering by keys', async () => {
  test.setTimeout(300_000);
  // The child walks onto the trampoline, lets the bounces die down and is back on foot on the bed
  // (QA9: the lead started there, 1 m above the ground).
  const start = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.setRemaining(280);
    rg.teleport(53.8, rg.ctx.world.heightAt(53.8, -25.9) + 1.05, -25.9, -2);
    let n = 0;
    rg.step(1 / 30, 30, false);
    while (rg.ctx.player.mode !== 'walk' && n++ < 60 * 30) rg.step(1 / 30, 1, false);
    rg.step(1 / 30, 15, false);
    const ok = window.__rgBuddy!.tour(['trampoline', 'foamCourse'], 'carnivalRow');
    rg.step(1 / 30, 2, false);
    const p = rg.ctx.player.position;
    return { ok, at: [p.x, p.y, p.z], mode: rg.ctx.player.mode, lead: window.__rgBuddy!.lead(), route: window.__rgBuddy!.route() };
  });
  expect(start.ok, JSON.stringify(start)).toBe(true);
  expect(start.lead.to).toBe('carnivalRow');
  expect(start.mode, JSON.stringify(start)).toBe('walk');
  expect(start.at[1] - 18, JSON.stringify(start)).toBeGreaterThan(0.6); // standing on the bed, not the ground

  let arrivedAt = -1;
  let best = Infinity;
  let noProgress = 0;
  let maxNoProgress = 0;
  const trail: unknown[] = [];
  for (let i = 0; i < 240 && arrivedAt < 0; i++) {
    // The child: walk at Pip whenever he is more than 2.5 m away (4 key updates a second).
    const pip = await page.evaluate(() => window.__rgBuddy!.pos());
    await keys(await keysToward(pip[0], pip[2]));
    await run(0.25);
    const s = await page.evaluate(() => {
      const l = window.__rgBuddy!.lead();
      const p = window.__rg!.ctx.player.position;
      const d = l.dest ? Math.hypot(p.x - l.dest[0], p.z - l.dest[1]) : Infinity;
      return { to: l.to, at: l.at, why: l.why, unreachable: l.unreachable, hero: [+p.x.toFixed(1), +p.z.toFixed(1)], d };
    });
    // A dead end (QA9: the blue rail fence by the lamp post): the child gets no closer for long.
    if (s.d < best - 1) {
      best = s.d;
      noProgress = 0;
    } else if (s.to) maxNoProgress = Math.max(maxNoProgress, (noProgress += 0.25));
    if (i % 8 === 0) trail.push({ ...s, pip: [+pip[0].toFixed(1), +pip[2].toFixed(1)] });
    expect(s.unreachable, JSON.stringify(trail)).not.toContain('carnivalRow');
    if (s.at === 'carnivalRow') arrivedAt = (i + 1) * 0.25;
    else expect(s.to, JSON.stringify({ s, trail })).toBe('carnivalRow');
  }
  await keys(new Set());
  if (process.env.RG_DEBUG) console.log('M2 arrived at', arrivedAt, 'longest stretch with no progress', maxNoProgress, JSON.stringify(trail));
  await page.evaluate(() => window.__rg!.render());
  await page.screenshot({ path: 'test-results/buddy-activity-m2-arrived.png' });
  expect(arrivedAt, JSON.stringify(trail)).toBeGreaterThan(0);
  expect(arrivedAt, JSON.stringify(trail)).toBeLessThanOrEqual(25);
  expect(maxNoProgress, JSON.stringify(trail)).toBeLessThanOrEqual(4);
  expect(consoleErrors).toEqual([]);
});
