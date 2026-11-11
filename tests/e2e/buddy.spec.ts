/**
 * Pip, the puppy buddy: the spoken welcome story on a new profile (compact bubble, gem pickup ->
 * wallet callout),
 * skip, returning players, following, chest hint, no console errors. Opt-in screenshots
 * (`RG_SHOTS=1`): Pip beside the hero, speaking, a HUD callout, on the buggy, in freefall, at
 * 640x360 and 1920x1080, full / R / G in test-results/buddy/.
 *
 * In test mode Pip stays quiet unless `?buddy=1` (talk) or `?buddyIntro=1` (talk + tour).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { SHOTS, boot } from './helpers';

// `window.__rgBuddy` is declared in src/buddy/index.ts (test mode only).
export type { BuddyTestApi } from '../../src/buddy';

async function step(page: Page, seconds: number, inject: Record<string, number | boolean> | null = null): Promise<void> {
  await page.evaluate(
    ([s, inj]) => {
      const rg = window.__rg!;
      rg.inject(inj);
      rg.step(1 / 30, Math.round(s * 30), false);
      rg.inject(null);
    },
    [seconds, inject] as const,
  );
}

async function startFrozen(page: Page): Promise<void> {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 30, 3, false);
  });
}

const director = (page: Page) => page.evaluate(() => window.__rgBuddy!.director());

test.describe('Pip on a brand-new profile', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;
  let consoleErrors: string[] = [];

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    ({ consoleErrors } = await boot(page, '&buddyIntro=1'));
    await startFrozen(page);
  });
  test.afterAll(async () => {
    await page.close();
  });

  test('the welcome story starts with a compact pictogram bubble (Pip says the words)', async () => {
    const bubble = page.getByTestId('pip-bubble');
    await expect(bubble).toHaveClass(/\bon\b/);
    await expect(bubble).toHaveAttribute('data-id', 'intro:welcome');
    expect(await bubble.getAttribute('data-text')).toMatch(/^Hi, I'm Pip! Welcome to Carnival Island/);
    await expect(bubble).toHaveAttribute('data-mode', 'compact');
    await expect(bubble.locator('.pic svg')).toHaveCount(1);
    await expect(bubble.locator('.say')).toBeHidden();
    // The move keys, so a non-reader knows they can walk while Pip talks.
    await expect(bubble.locator('.pipact .cap')).toHaveCount(4);
    // Inside the viewport.
    await step(page, 1.5);
    const box = await bubble.boundingBox();
    const vp = page.viewportSize()!;
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
  });

  test('the child can move during the story; all beats are told, then Pip leads to the trampoline', async () => {
    await step(page, 2, { moveY: 1 });
    expect((await director(page)).step).toBe('story');
    for (let i = 0; i < 20 && (await director(page)).step === 'story'; i++) await step(page, 2);
    expect((await director(page)).step).toBe('follow');
    const said = await page.evaluate(() => window.__rgBuddy!.history().map((h) => h.id));
    expect(said.filter((id) => id === 'intro:welcome' || id.startsWith('story:'))).toEqual(['intro:welcome', 'story:1', 'story:2', 'story:3', 'story:4', 'story:5']);
    expect((await page.evaluate(() => window.__rgBuddy!.lead())).to).toBe('trampoline');
  });

  test('a first gem pickup explains gems with the wallet callout', async () => {
    const got = await page.evaluate(() => {
      const rg = window.__rg!;
      let n = 0;
      const off = rg.ctx.events.on('gem:collected', () => n++);
      for (const s of rg.ctx.world.gemSpots) {
        rg.teleport(s.position.x, s.position.y - 0.85, s.position.z);
        rg.step(1 / 60, 3, false);
        if (n > 0) break;
      }
      off();
      return n;
    });
    expect(got).toBeGreaterThan(0);
    const bubble = page.getByTestId('pip-bubble');
    for (let i = 0; i < 30 && (await bubble.getAttribute('data-id')) !== 'econ:gem'; i++) await step(page, 0.25);
    await expect(bubble).toHaveAttribute('data-id', 'econ:gem');
    await expect(page.getByTestId('pip-callout')).toHaveClass(/\bon\b/);
    const ring = await page.getByTestId('pip-callout').boundingBox();
    const wallet = await page.locator('.hud [data-testid="wallet"]').boundingBox();
    expect(ring && wallet).toBeTruthy();
    expect(ring!.x).toBeLessThanOrEqual(wallet!.x);
    expect(ring!.y).toBeLessThanOrEqual(wallet!.y);
    expect(ring!.x + ring!.width).toBeGreaterThanOrEqual(wallet!.x + wallet!.width);
  });

  test('the jump tip is never said away from the trampoline', async () => {
    const said = await page.evaluate(() => window.__rgBuddy!.history().map((h) => h.id));
    expect(said).not.toContain('intro:jump');
  });

  test('Pip speaks every story line aloud from its recorded clip', async () => {
    const asked = await page.evaluate(() => window.__rgBuddy!.voice());
    const ids = asked.map((r) => r.id);
    expect(ids[0]).toBe('hi-im-pip-welcome-to-carnival-island-a-giant-fun-park');
    expect(ids.indexOf('a-gem-gems-are-money-for-rides-hats-and-gear')).toBeGreaterThan(5);
    // Every clip it asked for is in the shipped manifest (so it plays a clip, not the fallback).
    const clips = await page.evaluate(async () => (await (await fetch('assets/voice/manifest.json')).json()).clips as Record<string, { file: string }>);
    for (const id of ids) expect(clips[id], id).toBeTruthy();
    expect(asked.every((r) => r.source === 'clip')).toBe(true);
    const head = await page.evaluate(async (f) => (await fetch(`assets/voice/${f}`)).status, clips[ids[0]].file);
    expect(head).toBe(200);
  });

  test('no console errors', async () => {
    expect(consoleErrors).toEqual([]);
  });
});

test('the intro can be skipped with a non-game key after 2 s (moving keys never skip)', async ({ page }) => {
  await boot(page, '&buddyIntro=1');
  await startFrozen(page);
  await step(page, 2.5);
  await page.keyboard.press('KeyW');
  await step(page, 0.1);
  expect((await director(page)).step).not.toBe('done');
  await page.keyboard.press('Enter');
  await step(page, 0.1);
  expect((await director(page)).step).toBe('done');
  await expect(page.getByTestId('pip-bubble')).toHaveAttribute('data-text', 'Okay! Have fun!');
  // Saved: a reload does not run the tour again.
  const saved = await page.evaluate(() => localStorage.getItem('rgow.buddy.v1'));
  expect(saved).toContain('"intro":true');
});

test('a returning player gets "welcome back" and a goal, no tour', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('rgow.buddy.v1', JSON.stringify({ intro: true, tips: [] }));
    } catch {
      /* ignore */
    }
  });
  const { consoleErrors } = await boot(page, '&buddyIntro=1');
  await startFrozen(page);
  await step(page, 4);
  const d = await director(page);
  expect(d.step).toBe('done');
  const said = await page.evaluate(() => window.__rgBuddy!.history());
  expect(said[0].id).toBe('returning');
  expect(said.some((s) => s.id.startsWith('goal:'))).toBe(true);
  expect(said.some((s) => s.id.startsWith('intro:'))).toBe(false);
  expect(consoleErrors).toEqual([]);
});

test('Pip follows: within 6 m while the hero walks 30 m, and gives a locked-chest hint', async ({ page }) => {
  const { consoleErrors } = await boot(page, '&buddy=1');
  await startFrozen(page);
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const start = rg.ctx.player.position.clone();
    let maxGap = 0;
    rg.inject({ moveY: 1 });
    for (let i = 0; i < 60 && rg.ctx.player.position.distanceTo(start) < 30; i++) {
      rg.step(1 / 30, 3, false);
      const p = rg.ctx.player.position;
      const b = window.__rgBuddy!.pos();
      maxGap = Math.max(maxGap, Math.hypot(b[0] - p.x, b[2] - p.z));
    }
    rg.inject(null);
    return { walked: rg.ctx.player.position.distanceTo(start), maxGap };
  });
  expect(r.walked).toBeGreaterThan(20);
  expect(r.maxGap).toBeLessThan(6);

  // Next to a chest without its key: "Find the key!".
  await page.evaluate(() => {
    const rg = window.__rg!;
    const c = rg.ctx.world.chestSpots[0];
    const x = c.position.x + 2.2;
    const z = c.position.z;
    rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.3, z);
  });
  await step(page, 5);
  const said = await page.evaluate(() => window.__rgBuddy!.history());
  // The first locked chest: its spoken how-to (find the key, bring it back, matching symbol).
  expect(said.some((s) => s.id === 'howto:chest:0' || s.id.startsWith('chest:'))).toBe(true);
  expect(consoleErrors).toEqual([]);
});

// ───────────────────────────── screenshots (RG_SHOTS=1) ─────────────────────────────

function channelPng(png: PNG, c: number): Buffer {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    const v = png.data[i + c];
    o.data[i] = o.data[i + 1] = o.data[i + 2] = v;
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

async function save(page: Page, name: string): Promise<void> {
  const dir = 'test-results/buddy';
  mkdirSync(dir, { recursive: true });
  await page.evaluate(() => window.__rg!.step(1 / 60, 1, true));
  const buf = await page.screenshot({ type: 'png', animations: 'disabled', timeout: 90_000 });
  writeFileSync(`${dir}/${name}-full.png`, buf);
  const png = PNG.sync.read(buf);
  writeFileSync(`${dir}/${name}-R.png`, channelPng(png, 0));
  writeFileSync(`${dir}/${name}-G.png`, channelPng(png, 1));
}

for (const vp of [
  { w: 640, h: 360 },
  { w: 1920, h: 1080 },
]) {
  test(`screenshots ${vp.w}x${vp.h}`, async ({ browser }) => {
    test.skip(!SHOTS, 'opt-in: RG_SHOTS=1');
    test.setTimeout(600_000);
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    await boot(page, '&buddyIntro=1&quality=medium');
    await startFrozen(page);
    const tag = `${vp.w}`;
    // Speaking at spawn (welcome line), beside the hero.
    await step(page, 1.6);
    await save(page, `${tag}-speaking`);
    // Pip beside the hero, quiet (skip the tour: allowed after 2 s).
    await step(page, 0.8);
    await page.keyboard.press('Enter');
    await step(page, 4);
    await save(page, `${tag}-spawn`);
    // HUD callout: ask about the wallet.
    await page.evaluate(() => {
      const el = document.querySelector('.hud [data-testid="wallet"]')!.getBoundingClientRect();
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: el.left + 10, clientY: el.top + 10, pointerType: 'mouse' }));
    });
    await page.keyboard.press('KeyT');
    await step(page, 1.2);
    await save(page, `${tag}-callout`);
    // Riding the buggy.
    await page.evaluate(() => {
      const rg = window.__rg!;
      const car = rg.ctx.vehicles.all[0];
      const q = car.object.quaternion;
      const h = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
      const x = car.position.x + Math.cos(h) * 1.9;
      const z = car.position.z - Math.sin(h) * 1.9;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.3, z, h);
      rg.step(1 / 60, 20, false);
      rg.inject({ usePressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject({ moveY: 1 });
      rg.step(1 / 60, 75, false);
      rg.inject(null);
    });
    await save(page, `${tag}-buggy`);
    // Freefall from the balloon.
    await page.evaluate(() => {
      const rg = window.__rg!;
      rg.inject({ usePressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 30, false);
      const a = rg.ctx.world.anchors.balloon.position;
      rg.teleport(a.x + 1.7, rg.ctx.world.heightAt(a.x, a.z) + 0.4, a.z, -Math.PI / 2);
      rg.step(1 / 60, 10, false);
      rg.inject({ usePressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      for (let i = 0; i < 900 && rg.ctx.player.velocity.y > -14; i++) rg.step(1 / 30, 1, false);
      rg.step(1 / 30, 8, false);
    });
    await save(page, `${tag}-freefall`);
    await page.close();
  });
}
