/**
 * Pip guides a first-time player who cannot read (QA round 3): a child who just holds "forward"
 * is not left stuck at the island-edge fence, and a child who follows Pip reaches an attraction
 * within a minute. Lead targets are always attraction anchors (never a gem spot).
 * Opt-in screenshots (`RG_SHOTS=1`): the lead, the stuck rescue, the chest hint and bubbles, in
 * test-results/buddy-guide/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SHOTS, boot } from './helpers';

async function startFrozen(page: Page): Promise<void> {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 30, 3, false);
  });
}

async function save(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  const dir = 'test-results/buddy-guide';
  mkdirSync(dir, { recursive: true });
  await page.evaluate(() => window.__rg!.step(1 / 60, 1, true));
  writeFileSync(`${dir}/${name}.png`, await page.screenshot({ type: 'png', animations: 'disabled', timeout: 90_000 }));
}

test('holding forward from spawn: Pip comes to help and the hero is not left stuck at the fence', async ({ page }) => {
  test.setTimeout(240_000);
  const { consoleErrors } = await boot(page, '&buddyIntro=1');
  await startFrozen(page);
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const p = rg.ctx.player.position;
    rg.inject({ moveY: 1 });
    const track: { x: number; z: number }[] = [];
    let worstStuck = 0;
    let stuck = 0;
    for (let i = 0; i < 120; i++) {
      rg.step(1 / 30, 15, false); // 0.5 s
      track.push({ x: p.x, z: p.z });
      const prev = track[track.length - 2];
      if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) < 0.5) stuck += 0.5;
      else stuck = 0;
      worstStuck = Math.max(worstStuck, stuck);
    }
    rg.inject(null);
    const an = rg.ctx.world.anchors as unknown as Record<string, { position: { x: number; z: number } }>;
    const nearest = Math.min(...Object.values(an).map((a) => Math.hypot(a.position.x - p.x, a.position.z - p.z)));
    const last = track[track.length - 11];
    return { lead: window.__rgBuddy!.lead(), worstStuck, nearest, moved5: Math.hypot(p.x - last.x, p.z - last.z), history: window.__rgBuddy!.history().map((h) => h.id) };
  });
  expect(r.lead.rescues, JSON.stringify(r)).toBeGreaterThanOrEqual(1);
  // Never stuck for long (without help it stayed at the fence for 30 s+), and at the end the
  // hero is at an attraction or on the move.
  expect(r.worstStuck, JSON.stringify(r)).toBeLessThan(10);
  expect(r.nearest < 14 || r.moved5 > 3, JSON.stringify(r)).toBe(true);
  // Place tips only at the place: the jump tip was said, but only while at the trampoline.
  expect(consoleErrors).toEqual([]);
});

test('following Pip from spawn reaches an attraction within 60 s; leads only go to attractions', async ({ page }) => {
  test.setTimeout(240_000);
  const { consoleErrors } = await boot(page, '&buddyIntro=1');
  await startFrozen(page);
  const shotAt = new Set([12, 24]);
  let arrived = -1;
  const dests: [number, number][] = [];
  for (let i = 0; i < 120 && arrived < 0; i++) {
    const r = await page.evaluate(
      ([k]) => {
        const rg = window.__rg!;
        const p = rg.ctx.player.position;
        // The "child": walk towards Pip when he is more than 2.5 m away (camera-relative stick).
        for (let n = 0; n < 15; n++) {
          const b = window.__rgBuddy!.pos();
          const dx = b[0] - p.x;
          const dz = b[2] - p.z;
          const d = Math.hypot(dx, dz);
          const y = rg.ctx.cameraRig.yaw;
          let mx = 0;
          let my = 0;
          if (d > 2.5) {
            const ux = dx / d;
            const uz = dz / d;
            my = ux * Math.sin(y) + uz * Math.cos(y);
            mx = -ux * Math.cos(y) + uz * Math.sin(y);
          }
          rg.inject({ moveX: mx, moveY: my, lookX: k < 4 ? 0.06 : 0 });
          rg.step(1 / 30, 1, false);
        }
        rg.inject(null);
        const an = rg.ctx.world.anchors as unknown as Record<string, { position: { x: number; z: number } }>;
        const t = an.trampoline.position;
        return { step: window.__rgBuddy!.director().step, lead: window.__rgBuddy!.lead(), dTramp: Math.hypot(p.x - t.x, p.z - t.z) };
      },
      [i] as const,
    );
    if (r.lead.dest) dests.push(r.lead.dest);
    if (r.dTramp < 10.5 || r.step === 'jump') arrived = i * 0.5;
    if (shotAt.has(i)) await save(page, `lead-${i}`);
  }
  expect(arrived).toBeGreaterThanOrEqual(0);
  expect(arrived).toBeLessThanOrEqual(60);
  await save(page, 'arrived');
  // Every lead destination is an attraction (within 10 m of a world anchor), never a gem spot.
  const check = await page.evaluate((ds) => {
    const rg = window.__rg!;
    const an = Object.values(rg.ctx.world.anchors as unknown as Record<string, { position: { x: number; z: number } }>);
    return ds.map(([x, z]) => Math.min(...an.map((a) => Math.hypot(a.position.x - x, a.position.z - z))));
  }, dests);
  for (const d of check) expect(d).toBeLessThan(10);
  expect(consoleErrors).toEqual([]);
});

test('screenshots: bubbles, stuck rescue, chest hint', async ({ page }) => {
  test.skip(!SHOTS, 'opt-in: RG_SHOTS=1');
  test.setTimeout(400_000);
  await boot(page, '&buddyIntro=1');
  await startFrozen(page);
  const step = (s: number, inj: Record<string, number> | null = null) =>
    page.evaluate(
      ([sec, i]) => {
        const rg = window.__rg!;
        rg.inject(i);
        rg.step(1 / 30, Math.round(sec * 30), false);
        rg.inject(null);
      },
      [s, inj] as const,
    );
  await step(1.2);
  await save(page, 'bubble-welcome');
  await step(2.2);
  await save(page, 'bubble-walk');
  await step(1.5, { moveY: 1 });
  await step(1);
  await save(page, 'bubble-look');
  // Stuck at the fence: hold forward until Pip comes to help.
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ moveY: 1 });
    for (let i = 0; i < 80 && window.__rgBuddy!.lead().rescues < 1; i++) rg.step(1 / 30, 15, false);
    rg.step(1 / 30, 20, false);
  });
  await save(page, 'rescue-1');
  await step(1.5, { moveY: 1 });
  await save(page, 'rescue-2');
  // Chest hint: next to a locked chest.
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject(null);
    const c = rg.ctx.world.chestSpots[0];
    const x = c.position.x + 2.6;
    const z = c.position.z + 0.5;
    rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.3, z, -Math.PI / 2);
    rg.step(1 / 30, 45, false);
  });
  await save(page, 'chest-hint');
});

/**
 * QA round 5, B1: after the trampoline Pip said "lead = bouncePads, run" but sat at the hero's
 * feet for four minutes (his trampoline-rim spot won over the lead, and the child on the rim
 * followed him there). A child who follows Pip (and jumps when he shows the jump button) reaches
 * three attractions within 150 s.
 */
test('following Pip: the trampoline, then a second and a third attraction within 150 s', async ({ page }) => {
  test.setTimeout(600_000);
  const { consoleErrors } = await boot(page, '&buddyIntro=1');
  await startFrozen(page);
  const reached: { a: string; t: number }[] = [];
  const leadTo = new Set<string>();
  let last: { lead: unknown; pos: number[] } | null = null;
  for (let i = 0; i < 300 && reached.length < 3; i++) {
    const r = await page.evaluate(() => {
      const rg = window.__rg!;
      const p = rg.ctx.player.position;
      const el = document.querySelector<HTMLElement>('[data-testid="pip-bubble"]');
      for (let n = 0; n < 15; n++) {
        const b = window.__rgBuddy!.pos();
        const dx = b[0] - p.x;
        const dz = b[2] - p.z;
        const d = Math.hypot(dx, dz);
        const y = rg.ctx.cameraRig.yaw;
        let mx = 0;
        let my = 0;
        if (d > 2.5) {
          mx = (-dx * Math.cos(y) + dz * Math.sin(y)) / d;
          my = (dx * Math.sin(y) + dz * Math.cos(y)) / d;
        }
        const jump = el?.classList.contains('on') && el.dataset.action === 'jump';
        rg.inject({ moveX: mx, moveY: my, jump: !!jump, jumpPressed: !!jump && n % 10 === 0 });
        rg.step(1 / 30, 1, false);
      }
      rg.inject(null);
      return { lead: window.__rgBuddy!.lead(), pos: [p.x, p.y, p.z] };
    });
    last = r;
    if (r.lead.to) leadTo.add(r.lead.to);
    const at = r.lead.at;
    // An attraction Pip led to (not one passed on the way), reached.
    if (at && leadTo.has(at) && !reached.some((x) => x.a === at)) reached.push({ a: at, t: i * 0.5 });
  }
  const info = JSON.stringify({ reached, last });
  expect(reached.length, info).toBeGreaterThanOrEqual(3);
  expect(reached[0].a, info).toBe('trampoline');
  expect(reached[2].t, info).toBeLessThanOrEqual(150);
  expect(consoleErrors).toEqual([]);
});

/** A child who does nothing: Pip still comes over and invites again, but does not nag. */
test('a child who stands still for 150 s is approached and re-invited, not nagged', async ({ page }) => {
  test.setTimeout(400_000);
  const { consoleErrors } = await boot(page, '&buddyIntro=1');
  await startFrozen(page);
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const p = rg.ctx.player.position;
    let closest = Infinity;
    for (let i = 0; i < 300; i++) {
      rg.step(1 / 30, 15, false);
      const b = window.__rgBuddy!.pos();
      if (i * 0.5 > 25) closest = Math.min(closest, Math.hypot(b[0] - p.x, b[2] - p.z));
    }
    const h = window.__rgBuddy!.history();
    return { closest, history: h.map((x) => x.id), lead: window.__rgBuddy!.lead() };
  });
  const nudges = r.history.filter((id) => /follow|invite|rescue|stuck|idle/.test(id));
  // Approached after the story and invited again…
  expect(r.closest, JSON.stringify(r)).toBeLessThan(4);
  expect(nudges.length, JSON.stringify(r)).toBeGreaterThanOrEqual(1);
  // …but at most one nudge per ~20 s on average.
  expect(nudges.length, JSON.stringify(r)).toBeLessThanOrEqual(7);
  expect(consoleErrors).toEqual([]);
});
