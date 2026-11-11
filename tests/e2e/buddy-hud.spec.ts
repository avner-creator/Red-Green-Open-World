/**
 * Pip's speech bubble never covers a HUD badge (combo, stars, wallet, timer, compass, touch
 * controls ...) at the phone and desktop sizes we care about, touch and mouse.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SHOTS, boot, startGame } from './helpers';

const SIZES = [
  { w: 667, h: 375 },
  { w: 844, h: 390 },
  { w: 1280, h: 720 },
] as const;

const BADGES = [
  'wallet', 'combo', 'stars', 'timer', 'compass', 'missions', 'skill-chip', 'help', 'prompt', 'mode-strip', 'pip-button',
  'touch-jump', 'touch-sprint', 'touch-pause', 'touch-use',
];

interface R { x: number; y: number; w: number; h: number }

async function rects(page: Page): Promise<{ bubble: R | null; badges: Record<string, R> }> {
  return page.evaluate((ids) => {
    const vis = (el: Element): DOMRect | null => {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (b.width < 2 || b.height < 2 || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return null;
      return b;
    };
    const bb = document.querySelector('[data-testid="pip-bubble"]');
    const b0 = bb ? vis(bb) : null;
    const badges: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const id of ids) {
      const el = document.querySelector(`[data-testid="${id}"]`);
      const b = el ? vis(el) : null;
      if (b) badges[id] = { x: b.left, y: b.top, w: b.width, h: b.height };
    }
    return { bubble: b0 ? { x: b0.left, y: b0.top, w: b0.width, h: b0.height } : null, badges };
  }, BADGES);
}

const hit = (a: R, b: R): boolean => a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1;

for (const touch of [true, false]) {
  for (const s of SIZES) {
    test.describe(`${touch ? 'touch' : 'desktop'} ${s.w}x${s.h}`, () => {
      test.use({ viewport: { width: s.w, height: s.h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });

      test('Pip bubble does not overlap HUD badges', async ({ page }) => {
        test.setTimeout(300_000);
        const { consoleErrors } = await boot(page, '&buddy=1');
        await startGame(page, touch);
        await page.evaluate(() => {
          const rg = window.__rg!;
          rg.freeze(true);
          const sp = rg.ctx.world.anchors.spawn;
          rg.teleport(sp.position.x, sp.position.y + 0.2, sp.position.z, sp.yaw);
          rg.step(1 / 30, 30, false);
          // Combo + stars on screen, then Pip reacts with a bubble.
          rg.ctx.events.emit('combo:changed', { multiplier: 3, streak: 3 });
          rg.ctx.events.emit('stunt', { kind: 'flip', value: 10, stars: 3 } as never);
          rg.ctx.events.emit('gem:collected', { id: 'x', count: 1, total: 9, position: sp.position, combo: 3, value: 1, gain: 3 });
          // Pip's intro waits for the child's actions, so ask (T / tap Pip) for a bubble.
          window.__rgBuddy!.ask();
          rg.step(1 / 30, 45, false);
        });
        const bubble = page.getByTestId('pip-bubble');
        await expect(bubble).toHaveClass(/\bon\b/);
        await page.waitForTimeout(1200); // HUD pop animations settle
        for (let i = 0; i < 4; i++) {
          await page.evaluate(() => window.__rg!.step(1 / 30, 15, false));
          const { bubble: b, badges } = await rects(page);
          expect(b).not.toBeNull();
          for (const [id, r] of Object.entries(badges)) {
            expect(hit(b!, r), `bubble overlaps ${id}: ${JSON.stringify(b)} vs ${JSON.stringify(r)}`).toBe(false);
          }
        }
        if (SHOTS) await page.screenshot({ path: `test-results/buddy/hud-${touch ? 'touch' : 'desktop'}-${s.w}x${s.h}.png` });
        expect(consoleErrors).toEqual([]);
      });
    });
  }
}
