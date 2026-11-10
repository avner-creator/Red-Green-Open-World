/**
 * QA (economy): weak-eye secrecy of everything the gem economy draws, for all 4 lens/eye
 * combinations. `economy.spec.ts` proves it for one still mega gem; this covers what moves:
 * normal gems with halos, the pickup burst, the mega burst, and the respawn pop-in, and checks
 * that the main (both-eye) frame is identical whether or not an uncollected gem is nearby.
 * One page load; simulation steps skip rendering.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { PNG } from 'pngjs';
import { boot, canvasShot, channelDiff } from './helpers';
import { VisionLayer } from '../../src/types';
import type { EyeSettings } from '../../src/types';

test.describe.configure({ mode: 'serial' });

const COMBOS: Array<{ eye: Pick<EyeSettings, 'leftLens' | 'weakEye'>; weak: 'r' | 'g'; strong: 'r' | 'g' }> = [
  { eye: { leftLens: 'red', weakEye: 'left' }, weak: 'r', strong: 'g' },
  { eye: { leftLens: 'red', weakEye: 'right' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'left' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'right' }, weak: 'r', strong: 'g' },
];
const maxOf = (d: ReturnType<typeof channelDiff>, c: 'r' | 'g' | 'b'): number => (c === 'r' ? d.maxR : c === 'g' ? d.maxG : d.maxB);

let page: Page;
let consoleErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 5, false);
  });
});
test.afterAll(async () => {
  await page.close();
});

/** Render the current frame with and without the weak-eye layer, for every lens/eye combination. */
async function expectWeakOnly(label: string, minWeak: number): Promise<void> {
  for (const combo of COMBOS) {
    await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);
    const grab = async (weak: boolean): Promise<PNG> => {
      await page.evaluate(({ weak, W }) => {
        window.__rg!.setLayerVisible(W, weak);
        window.__rg!.render();
      }, { weak, W: VisionLayer.WeakOnly });
      return canvasShot(page);
    };
    const withLayer = await grab(true);
    const without = await grab(false);
    const d = channelDiff(withLayer, without);
    const name = `${label} ${combo.eye.leftLens}/${combo.eye.weakEye}`;
    expect(d[combo.weak], `${name}: weak channel changes`).toBeGreaterThan(minWeak);
    expect(maxOf(d, combo.strong), `${name}: strong channel untouched`).toBe(0);
    expect(d.maxB, `${name}: blue untouched`).toBe(0);
  }
  await page.evaluate((W) => window.__rg!.setLayerVisible(W, true), VisionLayer.WeakOnly);
}

/** Stand `dist` m from a point, looking at it, and let the camera settle. */
async function lookAt(p: { x: number; y: number; z: number }, dist: number): Promise<void> {
  await page.evaluate(({ p, dist }) => {
    const rg = window.__rg!;
    const px = p.x + dist;
    const yaw = Math.atan2(p.x - px, 0);
    rg.teleport(px, rg.ctx.world.heightAt(px, p.z) + 0.2, p.z, yaw);
    rg.step(1 / 60, 40, false);
  }, { p, dist });
}

test('a normal gem and its halo touch only the weak channel', async () => {
  const g = await page.evaluate(() => {
    const v = window.__rg!.ctx.world.gemSpots[10].position;
    return { x: v.x, y: v.y, z: v.z };
  });
  await lookAt(g, 5);
  await expectWeakOnly('gem', 20);
});

test('the pickup burst (normal and mega) touches only the weak channel', async () => {
  // Collect a normal gem, then look at the burst while it is alive (0.55 s).
  const g = await page.evaluate(() => {
    const v = window.__rg!.ctx.world.gemSpots[20].position;
    return { x: v.x, y: v.y, z: v.z };
  });
  await page.evaluate((g) => {
    const rg = window.__rg!;
    rg.teleport(g.x, g.y - 0.85, g.z);
    rg.step(1 / 60, 3, false);
  }, g);
  expect(await page.evaluate(() => window.__rg!.state().gems)).toBeGreaterThanOrEqual(1);
  await expectWeakOnly('burst', 20);

  const mega = await page.evaluate(() => window.__rgEconomy!.megaSpots[1]);
  await page.evaluate((m) => {
    const rg = window.__rg!;
    rg.step(0.1, 10, false); // old burst gone
    rg.teleport(m.x, m.y - 0.85, m.z);
    rg.step(1 / 60, 3, false);
  }, mega);
  await expectWeakOnly('mega burst', 20);
});

test('the respawn pop-in touches only the weak channel', async () => {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.step(0.1, 10, false);
  });
  const g = await page.evaluate(() => {
    const v = window.__rg!.ctx.world.gemSpots[20].position; // collected above
    return { x: v.x, y: v.y, z: v.z };
  });
  await lookAt(g, 5);
  await page.evaluate(() => {
    window.__rgEconomy!.forceRespawn();
    window.__rg!.step(1 / 60, 12, false); // mid pop-in (0.6 s)
  });
  await expectWeakOnly('respawn', 20);
});

test('with the weak layer hidden, an uncollected gem changes nothing in the main frame', async () => {
  // Same view, same camera: gem standing there vs. gem collected. Only the region around the gem
  // is compared (the world around it animates). Any difference would be a both-eye clue.
  const g = await page.evaluate(() => {
    const v = window.__rg!.ctx.world.gemSpots[30].position;
    return { x: v.x, y: v.y, z: v.z };
  });
  const view = async (): Promise<PNG> => {
    await lookAt(g, 5);
    return await page.evaluate((W) => {
      const rg = window.__rg!;
      rg.setLayerVisible(W, false);
      rg.render();
      return null;
    }, VisionLayer.WeakOnly).then(() => canvasShot(page));
  };
  const proj = await page.evaluate((g) => {
    const rg = window.__rg!;
    const p = rg.ctx.player.position.clone().set(g.x, g.y, g.z).project(rg.ctx.camera);
    return { sx: (p.x * 0.5 + 0.5) * window.innerWidth, sy: (1 - (p.y * 0.5 + 0.5)) * window.innerHeight };
  }, g);
  const before = await view();
  // Collect it, wait for its burst to end, come back.
  await page.evaluate((g) => {
    const rg = window.__rg!;
    rg.teleport(g.x, g.y - 0.85, g.z);
    rg.step(1 / 60, 3, false);
    rg.step(0.1, 20, false);
  }, g);
  expect(await page.evaluate(() => window.__rg!.state().gems)).toBeGreaterThanOrEqual(1);
  const after = await view();
  await page.evaluate((W) => window.__rg!.setLayerVisible(W, true), VisionLayer.WeakOnly);
  let maxDiff = 0;
  let changed = 0;
  for (let y = Math.max(0, Math.floor(proj.sy - 40)); y < Math.min(before.height, proj.sy + 40); y++) {
    for (let x = Math.max(0, Math.floor(proj.sx - 40)); x < Math.min(before.width, proj.sx + 40); x++) {
      const i = (y * before.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(before.data[i + c] - after.data[i + c]);
        if (d > 2) changed++;
        if (d > maxDiff) maxDiff = d;
      }
    }
  }
  expect(changed, `max diff ${maxDiff}`).toBeLessThan(30);
});

test('no console errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
