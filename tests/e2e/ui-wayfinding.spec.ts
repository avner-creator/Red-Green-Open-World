import { expect, test } from '@playwright/test';
import { boot } from './helpers';
import { buildTerrain } from '../../src/world/terrain';
import { stoneTrails } from '../../src/world/wayfinding';

test.describe('ui wayfinding', () => {
  test('compass, controls card and mode strips', async ({ page }) => {
    const { consoleErrors } = await boot(page);
    await page.evaluate(() => {
      window.__rg!.freeze(true);
      window.__rg!.start();
      window.__rg!.step(1 / 60, 30, false);
      window.__rg!.step(1 / 60, 1, false);
    });

    // Compass: attraction markers only, and they move with the camera yaw.
    const markers = page.getByTestId('compass-marker');
    expect(await markers.count()).toBeGreaterThanOrEqual(5);
    const anchors = await markers.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.anchor));
    expect(anchors.join()).not.toMatch(/gem|key|chest|lock/i);
    const lefts = (): Promise<string[]> => markers.evaluateAll((els) => els.map((e) => (e as HTMLElement).style.left));
    const before = await lefts();
    await page.evaluate(() => {
      const rg = window.__rg!;
      const p = rg.ctx.player.position;
      rg.teleport(p.x, p.y + 0.2, p.z, Math.PI / 2 + rg.ctx.cameraRig.yaw);
      rg.step(1 / 60, 120, false);
      rg.step(1 / 60, 1, false);
    });
    const after = await lefts();
    expect(after.join('|')).not.toBe(before.join('|'));
    expect(await page.locator('.wf-m.hl').count()).toBe(1);

    // H toggles the controls card; Esc closes it without pausing; the "?" button works too.
    const card = page.getByTestId('controls-card');
    await expect(card).not.toHaveClass(/on/);
    await page.keyboard.press('KeyH');
    await expect(card).toHaveClass(/on/);
    expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('playing');
    await page.keyboard.press('Escape');
    await expect(card).not.toHaveClass(/on/);
    expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('playing');
    await page.getByTestId('help').click();
    await expect(card).toHaveClass(/on/);
    await page.keyboard.press('KeyH');
    await expect(card).not.toHaveClass(/on/);

    // Mode strips follow player:mode.
    const strip = page.getByTestId('mode-strip');
    const root = page.locator('.rg').first();
    const emit = (mode: string, previous: string): Promise<void> =>
      page.evaluate(([m, p]) => window.__rg!.ctx.events.emit('player:mode', { mode: m as 'walk', previous: p as 'walk' }), [mode, previous]);
    await emit('driving', 'walk');
    await expect(strip).toHaveClass(/on/);
    await expect(strip).toHaveAttribute('data-kind', 'driving');
    await expect(root).toHaveAttribute('data-mode', 'driving');
    await expect(page.getByTestId('tutorial')).toBeHidden();
    await emit('external', 'driving');
    await expect(strip).toHaveAttribute('data-kind', 'skydive');
    await emit('walk', 'external');
    await expect(strip).not.toHaveClass(/on/);
    await expect(root).toHaveAttribute('data-mode', 'walk');

    // The pause menu has a Controls button that opens the same card.
    await page.evaluate(() => window.__rg!.ctx.session.pause());
    await page.evaluate(() => window.__rg!.step(1 / 60, 2, false));
    await page.getByTestId('pause-controls').click();
    await expect(page.locator('[data-screen="controls"]')).toHaveClass(/on/);
    expect(consoleErrors).toEqual([]);
  });

  // QA8 m13: the dot-signs trail ended at the back of the booth sign. Every stepping-stone trail must
  // end within 3 m of its attraction's start point (the booth's lead spot, else its start pad) with
  // a clear straight walk from the last stone to it (the live colliders: booth, pedestals, props).
  test('every stepping-stone trail ends near its start point with a clear straight walk', async ({ page }) => {
    const trails = stoneTrails(buildTerrain().roads).map((t) => ({ id: t.id.split(':')[0], name: t.id, end: t.stones[t.stones.length - 1], stones: t.stones }));
    const { consoleErrors } = await boot(page);
    await page.evaluate(() => {
      window.__rg!.freeze(true);
      window.__rg!.start();
      window.__rg!.step(1 / 60, 30, false);
    });
    const res = await page.evaluate((list) => {
      const rg = window.__rg!;
      const g = (window as unknown as { __rgGlasses: { boothPadView(id: string): { x: number; z: number } | null } }).__rgGlasses;
      const V = rg.ctx.camera.position.constructor as new (x?: number, y?: number, z?: number) => import('three').Vector3;
      return list.map((t) => {
        const lead = rg.ctx.scene.getObjectByName(`glasses:${t.id}:lead`);
        const p = lead ? lead.getWorldPosition(new V()) : g.boothPadView(t.id);
        if (!p) return { id: t.id, name: t.name, end: t.end, start: null, dist: Infinity, blocked: ['no start point'] };
        const dist = Math.hypot(p.x - t.end.x, p.z - t.end.z);
        // A hero-wide straight walk: three parallel rays at knee and chest height, each way.
        const blocked: string[] = [];
        const ux = (p.x - t.end.x) / (dist || 1);
        const uz = (p.z - t.end.z) / (dist || 1);
        for (const side of [-0.3, 0, 0.3]) {
          for (const up of [0.45, 1.1]) {
            const ax = t.end.x - uz * side;
            const az = t.end.z + ux * side;
            const bx = p.x - uz * side;
            const bz = p.z + ux * side;
            const ya = rg.ctx.world.heightAt(ax, az) + up;
            const yb = rg.ctx.world.heightAt(bx, bz) + up;
            const dir = new V(bx - ax, yb - ya, bz - az);
            const len = dir.length();
            const hit = rg.ctx.physics.raycast(new V(ax, ya, az), dir.normalize(), len);
            if (hit) blocked.push(`side ${side} up ${up}: hit at ${hit.distance.toFixed(2)} of ${len.toFixed(2)}`);
          }
        }
        // The trail itself is walkable too: stone to stone, nothing in the way.
        for (let i = 1; i < t.stones.length; i++) {
          const a = t.stones[i - 1];
          const b = t.stones[i];
          for (const up of [0.45, 1.1]) {
            const ya = rg.ctx.world.heightAt(a.x, a.z) + up;
            const yb = rg.ctx.world.heightAt(b.x, b.z) + up;
            const dir = new V(b.x - a.x, yb - ya, b.z - a.z);
            const len = dir.length();
            if (rg.ctx.physics.raycast(new V(a.x, ya, a.z), dir.normalize(), len)) blocked.push(`stone ${i - 1}→${i} up ${up}`);
          }
        }
        return { id: t.id, name: t.name, end: t.end, start: { x: p.x, z: p.z }, dist, blocked };
      });
    }, trails);
    const summary = res.map((r) => `${r.name}: end (${r.end.x.toFixed(1)}, ${r.end.z.toFixed(1)}) start ${r.start ? `(${r.start.x.toFixed(1)}, ${r.start.z.toFixed(1)})` : '-'} d ${r.dist.toFixed(2)} ${r.blocked.join('; ')}`).join('\n');
    console.log(summary);
    for (const r of res) {
      expect(r.dist, summary).toBeLessThanOrEqual(3);
      expect(r.blocked, summary).toEqual([]);
    }
    expect(res.map((r) => r.id)).toContain('dotsigns');
    expect(consoleErrors).toEqual([]);
  });
});
