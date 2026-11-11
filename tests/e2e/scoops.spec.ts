/**
 * Scoops, the ice-cream shop: a full round (E at the counter → cone → scoops → sauce → topping →
 * the secret jar → chomp → effects, handed back in walk mode), a toppling tower, leaving with R,
 * and the channel test: the secret topping of the day changes only the weak channel, for all 4
 * lens/eye combinations.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { PNG } from 'pngjs';
import { boot, canvasShot, channelDiff } from './helpers';
import type { EyeSettings, InputState } from '../../src/types';

test.describe.configure({ mode: 'serial' });

let page: Page;
let consoleErrors: string[] = [];

const COMBOS: Array<{ eye: Pick<EyeSettings, 'leftLens' | 'weakEye'>; weak: 'r' | 'g'; strong: 'r' | 'g' }> = [
  { eye: { leftLens: 'red', weakEye: 'left' }, weak: 'r', strong: 'g' },
  { eye: { leftLens: 'red', weakEye: 'right' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'left' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'right' }, weak: 'r', strong: 'g' },
];

const info = () => page.evaluate(() => window.__rgScoops!.info());

/** One input edge (pressed for a frame), then `frames` simulation-only frames. */
async function press(patch: Partial<InputState>, frames = 2): Promise<void> {
  await page.evaluate(
    ([p, n]) => {
      const rg = window.__rg!;
      rg.inject(p as Partial<InputState>);
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, n as number, false);
    },
    [patch, frames] as const,
  );
}

async function selectTile(index: number): Promise<void> {
  for (let guard = 0; guard < 12; guard++) {
    const s = await info();
    if (s.build!.selected === index) return;
    await press({ moveX: 1 }, 1);
    await press({ moveX: 0 }, 1);
  }
  throw new Error(`could not select tile ${index}`);
}

/** Stand at the counter and press E; returns once the hero is behind the counter. */
async function openStation(): Promise<void> {
  await page.evaluate(() => {
    const rg = window.__rg!;
    const s = window.__rgScoops!.info();
    rg.teleport(s.customer[0], s.customer[1] + 0.05, s.customer[2], s.site.yaw + Math.PI);
    rg.step(1 / 60, 4, false);
  });
  expect(await page.evaluate(() => window.__rg!.ctx.interactions.focused?.id)).toBe('scoops-counter');
  await press({ usePressed: true }, 60);
  expect((await info()).phase).toBe('build');
  expect((await page.evaluate(() => window.__rg!.state())).playerMode).toBe('external');
}

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

test('a full round: build, find the secret, chomp, get an effect, back in walk mode', async () => {
  await openStation();
  await expect(page.getByTestId('scoops-tiles')).toBeVisible();
  // Cone by mouse/touch: click the chocolate cone tile.
  await page.getByTestId('scoops-tile-1').click();
  let s = await info();
  expect(s.build!.cone).toBe('choco');
  expect(s.build!.stage).toBe('scoops');
  // Two scoops with the keys, waiting for the wobble to settle between them.
  await press({ jumpPressed: true }, 90);
  await press({ moveX: 1 }, 1);
  await press({ moveX: 0 }, 1);
  await press({ jumpPressed: true }, 120);
  s = await info();
  expect(s.build!.scoops).toEqual(['vanilla', 'choc']);
  await press({ usePressed: true }, 2); // → sauce
  await press({ jumpPressed: true }, 2); // fudge → toppings
  s = await info();
  expect(s.build!.sauce).toBe('fudge');
  expect(s.build!.stage).toBe('toppings');
  await selectTile(2); // pickle (giant head)
  await press({ jumpPressed: true }, 2);
  // The secret topping: pick the jar the weak eye would see it in.
  s = await info();
  const jar = s.build!.secretJar;
  expect(jar).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => window.__rgScoops!.secretWorld())).not.toBeNull();
  await page.evaluate(() => {
    const seen: string[] = [];
    window.__rg!.ctx.events.on('glasses:result', (e) => seen.push(`${e.mechanic}:${e.hit}`));
    (window as unknown as { __scGlasses: string[] }).__scGlasses = seen;
  });
  await selectTile(s.tiles.findIndex((t) => t.kind === 'jar' && t.index === jar));
  await press({ jumpPressed: true }, 4);
  s = await info();
  expect(s.build!.secret).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __scGlasses: string[] }).__scGlasses.slice())).toEqual(['scoopsSecret:true']);
  expect(s.build!.toppings).toEqual(['pickle']);
  // Eat (E), watch the chomp, hop back out.
  await press({ usePressed: true }, 10);
  expect((await info()).phase).toBe('eat');
  await page.evaluate(() => window.__rg!.step(1 / 60, 300, false));
  s = await info();
  expect(s.phase).toBe('idle');
  expect(s.cones).toBe(1);
  const ids = s.effects.map((e) => e.id);
  expect(ids).toContain('bigHead');
  const st = await page.evaluate(() => window.__rg!.state());
  expect(st.playerMode).toBe('walk');
  expect(st.stars).toBeGreaterThanOrEqual(2);
  const d = Math.hypot(st.playerPosition[0] - s.customer[0], st.playerPosition[2] - s.customer[2]);
  expect(d).toBeLessThan(0.6);
  // The giant head really grows something on the hero.
  const grown = await page.evaluate(() => {
    let max = 0;
    window.__rg!.ctx.player.object.traverse((o) => {
      if ((o as { isBone?: boolean }).isBone || o.name.startsWith('attach-')) max = Math.max(max, o.scale.x);
    });
    return max;
  });
  expect(grown).toBeGreaterThan(1.5);
});

test('rushing scoops topples the tower; the top splats and two stay on', async () => {
  await openStation();
  await press({ jumpPressed: true }, 30); // waffle
  let fell = false;
  for (let i = 0; i < 5 && !fell; i++) {
    await press({ jumpPressed: true }, 6);
    fell = (await info()).debris > 0;
  }
  for (let i = 0; i < 20 && !fell; i++) {
    await page.evaluate(() => window.__rg!.step(1 / 60, 6, false));
    fell = (await info()).debris > 0;
  }
  expect(fell).toBe(true);
  expect((await info()).build!.scoops.length).toBe(2);
});

test('R leaves the station safely and the hero walks again', async () => {
  expect((await info()).phase).toBe('build');
  await press({ respawnPressed: true }, 60);
  const s = await info();
  expect(s.phase).toBe('idle');
  const st = await page.evaluate(() => window.__rg!.state());
  expect(st.playerMode).toBe('walk');
  expect(Math.hypot(st.playerPosition[0] - s.customer[0], st.playerPosition[2] - s.customer[2])).toBeLessThan(0.6);
  // Walk away a bit (toward the camera, away from the counter): control is really back.
  await page.evaluate(() => window.__rg!.inject({ moveY: -1 }));
  await page.evaluate(() => window.__rg!.step(1 / 60, 30, false));
  await page.evaluate(() => window.__rg!.inject(null));
  const after = await page.evaluate(() => window.__rg!.state());
  expect(Math.hypot(after.playerPosition[0] - st.playerPosition[0], after.playerPosition[2] - st.playerPosition[2])).toBeGreaterThan(1);
});

test('the secret topping changes only the weak channel, all 4 combos', async () => {
  await openStation();
  await press({ jumpPressed: true }, 2); // cone
  await press({ jumpPressed: true }, 2); // a scoop
  await press({ usePressed: true }, 2); // → sauce
  await press({ usePressed: true }, 90); // skip → toppings (camera settles)
  const s = await info();
  expect(s.build!.stage).toBe('toppings');
  expect(await page.evaluate(() => window.__rgScoops!.secretWorld())).not.toBeNull();

  const frame = async (visible: boolean): Promise<PNG> => {
    await page.evaluate((v) => {
      window.__rgScoops!.setSecretVisible(v);
      window.__rg!.render();
    }, visible);
    return canvasShot(page);
  };
  await page.evaluate(() => window.__rg!.step(1 / 60, 1, true));
  for (const combo of COMBOS) {
    await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);
    const withSecret = await frame(true);
    const without = await frame(false);
    const d = channelDiff(withSecret, without);
    const label = `${combo.eye.leftLens}/${combo.eye.weakEye}`;
    expect(d[combo.weak], label).toBeGreaterThan(60);
    expect(combo.strong === 'r' ? d.maxR : d.maxG, label).toBe(0);
    expect(d.maxB, label).toBe(0);
  }
  await page.evaluate(() => {
    window.__rgScoops!.setSecretVisible(null);
    window.__rg!.setEye({ leftLens: 'red', weakEye: 'left' });
  });
  await press({ respawnPressed: true }, 60);
  expect((await info()).phase).toBe('idle');
});

test('no console errors', () => {
  expect(consoleErrors).toEqual([]);
});
