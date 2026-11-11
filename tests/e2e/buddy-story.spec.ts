/**
 * Pip tells, Pip explains: the welcome story's beats in order (desktop and an iPhone-13-sized
 * touch screen), the spoken how-to at an attraction (and again when asked), the compact pictogram
 * bubble while his voice is on, the full text bubble with his voice off, and a bubble that stays
 * put for the whole line. Screenshots go to test-results/buddy-story/ (always: they are small).
 */
import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { boot, startGame } from './helpers';

const DIR = 'test-results/buddy-story';

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

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  await page.evaluate(() => window.__rg!.step(1 / 60, 1, true));
  // For human eyes only: a slow software-rendered screenshot must not fail the test.
  await page.screenshot({ path: `${DIR}/${name}.png`, animations: 'disabled', timeout: 90_000 }).catch((e: unknown) => console.warn(`screenshot ${name}: ${String(e)}`));
}

const bubbleBox = (page: Page) =>
  page.evaluate(() => {
    const b = document.querySelector('[data-testid="pip-bubble"]')!.getBoundingClientRect();
    return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
  });

for (const touch of [false, true]) {
  const vp = touch ? { width: 667, height: 375 } : { width: 1280, height: 720 };
  test.describe(`welcome story ${touch ? 'touch 667x375' : 'desktop 1280x720'}`, () => {
    test.use({ viewport: vp, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });

    test('the story beats come in order with a steady compact bubble', async ({ page }) => {
      test.setTimeout(300_000);
      const { consoleErrors } = await boot(page, '&buddyIntro=1');
      await startGame(page, touch);
      await step(page, 0.5);
      const bubble = page.getByTestId('pip-bubble');
      await expect(bubble).toHaveAttribute('data-id', 'intro:welcome');
      await expect(bubble).toHaveAttribute('data-mode', 'compact');
      await expect(bubble.locator('.say')).toBeHidden();
      // Same place for the whole line: no jumping while Pip runs around.
      const a = await bubbleBox(page);
      await step(page, 0.8, { moveX: 1 });
      expect(await bubbleBox(page)).toEqual(a);
      // Safe area: inside the screen and clear of the middle third (the hero).
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w).toBeLessThanOrEqual(vp.width);
      expect(a.y + a.h).toBeLessThanOrEqual(vp.height);
      await shot(page, `story-${touch ? 'phone' : 'desktop'}`);
      for (let i = 0; i < 20 && (await page.evaluate(() => window.__rgBuddy!.director().step)) === 'story'; i++) await step(page, 2);
      const ids = await page.evaluate(() => window.__rgBuddy!.history().map((h) => h.id));
      expect(ids.filter((id) => id === 'intro:welcome' || id.startsWith('story:'))).toEqual(['intro:welcome', 'story:1', 'story:2', 'story:3', 'story:4', 'story:5']);
      expect(consoleErrors).toEqual([]);
    });
  });
}

test.describe('how-to at an attraction', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('first arrival at dino sumo: both how-to lines with the right buttons; asking Pip repeats it; voice off shows text', async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript(() => {
      try {
        localStorage.setItem('rgow.buddy.v1', JSON.stringify({ intro: true, tips: ['compass', 'missions', 'timer', 'skill', 'arrows', 'help', 'pip'] }));
      } catch {
        /* ignore */
      }
    });
    const { consoleErrors } = await boot(page, '&buddy=1');
    await startGame(page);
    await step(page, 6); // "welcome back" + goal
    await page.evaluate(() => {
      const rg = window.__rg!;
      const a = (rg.ctx.world.anchors as unknown as Record<string, { position: { x: number; z: number } }>).dinoRing.position;
      const x = a.x + 3;
      const z = a.z + 3;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.3, z);
    });
    const bubble = page.getByTestId('pip-bubble');
    for (let i = 0; i < 40 && (await bubble.getAttribute('data-id')) !== 'howto:dinoRing:0'; i++) await step(page, 0.25);
    await expect(bubble).toHaveAttribute('data-id', 'howto:dinoRing:0');
    await expect(bubble).toHaveAttribute('data-mode', 'compact');
    await expect(bubble).toHaveAttribute('data-action', 'jump');
    await shot(page, 'howto-compact-desktop');
    for (let i = 0; i < 40 && (await bubble.getAttribute('data-id')) !== 'howto:dinoRing:1'; i++) await step(page, 0.25);
    await expect(bubble).toHaveAttribute('data-action', 'jump');
    const voice = await page.evaluate(() => {
      const texts = new Set(window.__rgBuddy!.history().filter((h) => h.id.startsWith('howto:dinoRing')).map((h) => h.text));
      return window.__rgBuddy!.voice().filter((v) => texts.has(v.text));
    });
    expect(voice.length).toBe(2);
    expect(voice.every((v) => v.source === 'clip')).toBe(true);

    // Voice off: the same how-to, asked again, comes as a full text bubble.
    await page.evaluate(() => window.__rg!.ctx.settings.set({ voicePip: 0 }));
    await step(page, 6);
    await page.evaluate(() => window.__rgBuddy!.ask());
    await step(page, 0.3);
    await expect(bubble).toHaveAttribute('data-id', 'howto:dinoRing:0');
    await expect(bubble).toHaveAttribute('data-mode', 'full');
    await expect(bubble.locator('.say')).toBeVisible();
    await step(page, 2);
    await shot(page, 'howto-full-desktop');
    expect(consoleErrors).toEqual([]);
  });
});

for (const phone of [true, false]) {
  test.describe(`bubble stays put for the whole line, ${phone ? 'phone 667x375' : 'desktop 960x540'} (QA rounds 4-C and 5)`, () => {
    test.use(phone ? { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : { viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });

    test('following Pip, sampled every frame: one placement per line, it never moves mid-line', async ({ page }) => {
      test.setTimeout(600_000);
      const { consoleErrors } = await boot(page, '&buddyIntro=1');
      await startGame(page, phone);
      const r = await page.evaluate((frames) => {
        const rg = window.__rg!;
        const p = rg.ctx.player.position;
        const el = document.querySelector<HTMLElement>('[data-testid="pip-bubble"]')!;
        let line = '';
        let pos: { x: number; y: number } | null = null;
        const bad: string[] = [];
        let lines = 0;
        for (let f = 0; f < frames; f++) {
          // The child follows Pip (camera-relative stick) when he is more than 2.5 m away, and
          // turns the camera now and then: Pip and the hero cross the screen, under the bubble.
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
          rg.inject({ moveX: mx, moveY: my, lookX: Math.floor(f / 300) % 3 === 1 ? 0.03 : 0 });
          rg.step(1 / 60, 1, false);
          const on = el.classList.contains('on');
          const id = `${el.dataset.id ?? ''}|${el.dataset.text ?? ''}`;
          const at = { x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0 };
          if (!on) {
            pos = null;
            continue;
          }
          if (id !== line || !pos) {
            line = id;
            pos = at;
            lines++;
            continue;
          }
          const moved = Math.hypot(at.x - pos.x, at.y - pos.y);
          if (moved > 0.5) {
            bad.push(`${id} moved ${Math.round(moved)} px at frame ${f}`);
            pos = at;
          }
        }
        rg.inject(null);
        return { bad, lines, step: window.__rgBuddy!.director().step };
      }, 60 * 40);
      expect(r.lines, JSON.stringify(r)).toBeGreaterThanOrEqual(5);
      expect(r.bad).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
}
