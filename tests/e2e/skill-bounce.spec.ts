/**
 * Character skills meet bouncy things: a ground-pound onto the trampoline goes straight to the
 * 45 m maximum, a super-bounce gives +25% on the first bounce, and the double jump never breaks a
 * trampoline flight (skills are walk-mode only).
 */
import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.describe.configure({ mode: 'serial' });

let page: Page;
let consoleErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 10, false);
  });
});

test.afterAll(async () => {
  expect(consoleErrors).toEqual([]);
  await page.close();
});

/** Fresh session with character `id`, standing still at the spawn. */
async function fresh(id: string): Promise<void> {
  await page.evaluate(async (id) => {
    const rg = window.__rg!;
    rg.inject(null);
    rg.start();
    rg.step(1 / 60, 10, false);
    await rg.ctx.player.setCharacter(id);
    rg.step(1 / 60, 30, false);
  }, id);
}

test('rex: a ground-pound onto the mat gives the maximum bounce at once', async () => {
  await fresh('rex');
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const c = window.__rgThrills!.trampoline();
    const stars: number[] = [];
    const off = ctx.events.on('stunt', (e) => {
      if (e.kind === 'bigBounce') stars.push(e.stars);
    });
    rg.teleport(c.x + 2, c.y + 7, c.z, 0);
    rg.step(1 / 60, 8, false);
    rg.inject({ skill: true, skillPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    let peak = -Infinity;
    let wentExternal = false;
    for (let i = 0; i < 60 * 6; i++) {
      rg.step(1 / 60, 1, false);
      if (ctx.player.mode === 'external') wentExternal = true;
      if (wentExternal) {
        const y = ctx.player.position.y;
        if (y < peak - 0.5) break; // past the first apex
        peak = Math.max(peak, y);
      }
    }
    off();
    rg.step(1 / 60, 60 * 20, false); // let the chain die away
    return { apex: peak - c.y, wentExternal, stars, boost: ctx.player.skill.bounceBoost };
  });
  expect(r.wentExternal).toBe(true);
  expect(r.apex).toBeGreaterThanOrEqual(43);
  expect(r.apex).toBeLessThanOrEqual(45.5);
  expect(r.stars.length).toBeGreaterThan(0); // big-bounce stunt cheer (the gate may merge the stars)
  expect(r.boost).toBe(1);
});

test('frog: a super-bounce onto the mat starts higher than a normal first bounce', async () => {
  await fresh('frog');
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const p = ctx.player;
    const c = window.__rgThrills!.trampoline();
    /** Height of the first trampoline apex from now (null if no bounce started). */
    const firstApex = (): number | null => {
      let peak = -Infinity;
      let ext = false;
      for (let i = 0; i < 60 * 8; i++) {
        rg.step(1 / 60, 1, false);
        if (p.mode === 'external') ext = true;
        if (ext) {
          if (p.position.y < peak - 0.5) return peak - c.y;
          peak = Math.max(peak, p.position.y);
        }
      }
      return null;
    };
    // Normal: walk-on bounce.
    rg.teleport(c.x + 2, c.y + 0.1, c.z, 0);
    const normal = firstApex();
    // Let the chain die away: the frog stands on the mat at rest.
    for (let i = 0; i < 60 * 30 && !(p.mode === 'walk' && p.grounded); i++) rg.step(1 / 60, 1, false);
    rg.step(1 / 60, 20, false);
    const rested = p.mode === 'walk' && p.grounded;
    // Charge and spring from the resting mat.
    rg.inject({ skill: true, skillPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject({ skill: true });
    rg.step(1 / 60, 30, false);
    rg.inject(null);
    rg.step(1 / 60, 3, false);
    const boostInAir = p.skill.bounceBoost;
    const springY = p.position.y - c.y;
    const boosted = firstApex();
    rg.step(1 / 60, 60 * 20, false);
    return { normal, rested, boostInAir, springY, boosted };
  });
  expect(r.rested, JSON.stringify(r)).toBe(true);
  expect(r.boostInAir, JSON.stringify(r)).toBe(1.25);
  expect(r.normal).not.toBeNull();
  expect(r.boosted).not.toBeNull();
  expect(r.normal!).toBeLessThan(13);
  expect(r.boosted!).toBeGreaterThan(r.normal! * 1.15);
  expect(r.boosted!).toBeLessThanOrEqual(45.5);
});

test('robot: jump presses during a trampoline flight are not double jumps or tricks', async () => {
  await fresh('robot');
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const p = ctx.player;
    const c = window.__rgThrills!.trampoline();
    const skills: string[] = [];
    const tricks: number[] = [];
    const offS = ctx.events.on('player:skill', (e) => skills.push(e.id));
    const offT = ctx.events.on('stunt', (e) => {
      if (e.kind === 'bigAir') tricks.push(e.value);
    });
    rg.teleport(c.x + 2, c.y + 0.1, c.z, 0);
    rg.step(1 / 60, 3, false);
    let leftFlight = false;
    let maxY = -Infinity;
    // Mash jump (fresh presses every 10 frames, held between) for 8 s of bouncing.
    for (let i = 0; i < 60 * 8; i++) {
      rg.inject(i % 10 === 0 ? { jump: true, jumpPressed: true } : { jump: true });
      rg.step(1 / 60, 1, false);
      if (p.mode !== 'external') leftFlight = true;
      maxY = Math.max(maxY, p.position.y - c.y);
    }
    rg.inject(null);
    offS();
    offT();
    rg.step(1 / 60, 60 * 25, false);
    return { skills, tricks, leftFlight, maxY, mode: p.mode };
  });
  expect(r.skills).toEqual([]);
  expect(r.tricks).toEqual([]);
  expect(r.leftFlight).toBe(false);
  expect(r.maxY).toBeGreaterThan(25); // holding jump still grows the bounce
  expect(r.mode).toBe('walk');
});

test('rex in the buggy: the tail lies low along the deck and the head stays on top', async () => {
  await fresh('rex');
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const p = rg.ctx.player;
    const car = rg.ctx.vehicles.all[0];
    const q = car.object.quaternion;
    const h = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
    const x = car.position.x + Math.cos(h) * 1.9;
    const z = car.position.z - Math.sin(h) * 1.9;
    rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.3, z, h);
    rg.step(1 / 60, 20, false);
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 90, false);
    p.object.updateWorldMatrix(true, true);
    const y = (name: string): number => {
      const o = p.object.getObjectByName(name);
      return o ? o.getWorldPosition(o.position.clone()).y : NaN;
    };
    const out = { mode: p.mode, tail: y('Tail5'), head: y('Head') };
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 30, false);
    return out;
  });
  expect(r.mode).toBe('driving');
  expect(r.head - r.tail).toBeGreaterThan(0.4);
});
