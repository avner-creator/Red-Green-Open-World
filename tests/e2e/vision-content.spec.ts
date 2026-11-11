/**
 * The red-green rule with ALL the game's layer content present at once: mega gems, respawn
 * pop-ins, secret stones and arrows, the vault sign (WeakOnly), vault buttons and chest locks
 * (StrongOnly), chest keys (WeakOnly). For each feature, the same frozen frame with and without
 * that one feature may differ only in that feature's channel: zero in the other channel and in
 * blue, for all 4 lens/eye combinations. Features are toggled by name through the test registry
 * of layer objects (`__rg.setLayerObjectsVisible`), so everything else stays on.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { PNG } from 'pngjs';
import { boot, canvasShot, channelDiff } from './helpers';
import type { EyeSettings } from '../../src/types';

test.describe.configure({ mode: 'serial' });

let page: Page;
let consoleErrors: string[] = [];

type V3 = [number, number, number];
const COMBOS: Array<{ eye: Pick<EyeSettings, 'leftLens' | 'weakEye'>; weak: 'r' | 'g'; strong: 'r' | 'g' }> = [
  { eye: { leftLens: 'red', weakEye: 'left' }, weak: 'r', strong: 'g' },
  { eye: { leftLens: 'red', weakEye: 'right' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'left' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'right' }, weak: 'r', strong: 'g' },
];
const maxOf = (d: ReturnType<typeof channelDiff>, c: 'r' | 'g' | 'b'): number => (c === 'r' ? d.maxR : c === 'g' ? d.maxG : d.maxB);

async function cam(from: V3, at: V3, fov = 60): Promise<void> {
  await page.evaluate(
    ({ from, at, fov }) => {
      const c = window.__rg!.ctx.camera;
      c.position.set(...from);
      c.fov = fov;
      c.updateProjectionMatrix();
      c.lookAt(...at);
    },
    { from, at, fov },
  );
}

async function frame(): Promise<PNG> {
  await page.evaluate(() => window.__rg!.render());
  return canvasShot(page);
}

const toggle = (prefix: string, on: boolean): Promise<number> =>
  page.evaluate(({ prefix, on }) => window.__rg!.setLayerObjectsVisible(prefix, on), { prefix, on });

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.ctx.uiRoot.style.display = 'none';
    rg.start();
    rg.step(1 / 60, 10, false);
  });
});

test.afterAll(async () => {
  await page.close();
});

test('every layer feature touches only its own channel with all content present (4 combos)', async () => {
  const setup = await page.evaluate(() => {
    const rg = window.__rg!;
    const s = window.__rgSecrets!.info();
    const chests = window.__rgChests!.info();
    const megas = window.__rgEconomy!.megaSpots;
    // Collect a few gems near spawn, bring them back, and stop mid pop-in (0.6 s).
    const spots = rg.ctx.world.gemSpots.slice(0, 4).map((g) => g.position);
    for (const p of spots) {
      rg.teleport(p.x, p.y - 0.85, p.z);
      rg.step(1 / 60, 2, false);
    }
    window.__rgEconomy!.forceRespawn();
    rg.step(1 / 60, 15, false);
    rg.teleport(0, 40, 9); // park the player out of every view
    rg.step(1 / 60, 1, false);
    const tr = s.paths.find((p) => p.id === 'trampoline')!;
    return {
      names: rg.layerObjects().map((o) => o.name),
      tr: tr.pedestal,
      door: s.doors[1],
      chest: chests[0],
      gem: [spots[0].x, spots[0].y, spots[0].z] as [number, number, number],
      megaTags: megas.map((m) => m.tag),
    };
  });
  // The new attractions really carry mega gems.
  for (const tag of ['bungee', 'silly', 'secret', 'vault']) expect(setup.megaTags, tag).toContain(tag);
  for (const n of ['glow-gems', 'secret-path-trampoline', 'secret-arrows', `vault-${setup.door.id}-weak`, `vault-${setup.door.id}-strong`, 'chest-key', 'chest-symbol', 'chest-trail']) {
    expect(setup.names, n).toContain(n);
  }

  const d = setup.door;
  const fx = d.x + Math.sin(d.yaw) * 9;
  const fz = d.z + Math.cos(d.yaw) * 9;
  const c = setup.chest;
  const g = setup.gem;
  const views: { name: string; from: V3; at: V3; features: { prefix: string; layer: 'weak' | 'strong' }[] }[] = [
    {
      name: 'secret path',
      from: [setup.tr[0] + 4, setup.tr[1] - 4, setup.tr[2] + 16],
      at: [setup.tr[0], setup.tr[1] - 4, setup.tr[2]],
      features: [
        { prefix: 'secret-path-', layer: 'weak' },
        { prefix: 'glow-gems', layer: 'weak' }, // the pedestal's mega gem
      ],
    },
    {
      name: 'vault',
      from: [fx, d.y + 3, fz],
      at: [d.x, d.y + 2.8, d.z],
      features: [
        { prefix: `vault-${d.id}-weak`, layer: 'weak' },
        { prefix: `vault-${d.id}-strong`, layer: 'strong' },
      ],
    },
    {
      name: 'chest',
      from: [c.position[0] + 5, c.position[1] + 4, c.position[2] + 5],
      at: [(c.position[0] + c.key[0]) / 2, c.position[1], (c.position[2] + c.key[2]) / 2],
      features: [
        { prefix: 'chest-symbol', layer: 'strong' }, // the symbol-ring lock hint
        { prefix: 'chest-key', layer: 'weak' },
        { prefix: 'chest-trail', layer: 'weak' }, // the key's arrow trail
      ],
    },
    {
      name: 'respawn pop-in',
      from: [g[0] + 6, g[1] + 2, g[2] + 6],
      at: g,
      features: [{ prefix: 'glow-gems', layer: 'weak' }],
    },
  ];

  const seen = new Map<string, number>();
  for (const v of views) {
    await cam(v.from, v.at);
    for (const combo of COMBOS) {
      await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);
      const on = await frame();
      for (const f of v.features) {
        expect(await toggle(f.prefix, false)).toBeGreaterThan(0);
        const off = await frame();
        await toggle(f.prefix, true);
        const diff = channelDiff(on, off);
        const own = f.layer === 'weak' ? combo.weak : combo.strong;
        const other = f.layer === 'weak' ? combo.strong : combo.weak;
        const tag = `${v.name}: ${f.prefix} ${combo.eye.leftLens}/${combo.eye.weakEye}`;
        expect(maxOf(diff, other), tag).toBe(0);
        expect(diff.maxB, tag).toBe(0);
        seen.set(`${v.name}:${f.prefix}`, Math.min(seen.get(`${v.name}:${f.prefix}`) ?? Infinity, diff[own]));
      }
    }
  }
  // Every feature was really in view (positive control) in every combination.
  for (const [k, n] of seen) expect(n, k).toBeGreaterThan(30);
  await page.evaluate(() => window.__rg!.setEye({ leftLens: 'red', weakEye: 'left' }));
});

/**
 * The attraction streams (bumper arena, carnival, foam course, sky rides, race, Scoops), with all of
 * the above still present: each stream's layer objects, toggled by name, touch only their own
 * channel, never the other channel or blue, for all 4 combos. Objects that only show during a round
 * are checked for leaks here (their own specs play a round and check them in view); the ones that
 * are on screen while idle must also really change their own channel (positive control).
 */
const STREAMS: { anchor: string; prefixes: string[]; mustSee: string[] }[] = [
  { anchor: 'bubbleArena', prefixes: ['bubbleball-bonus-ring', 'bubbleball-charge'], mustSee: [] },
  { anchor: 'dinoRing', prefixes: ['dinosumo-weak-balloons', 'dinosumo-beat-ring'], mustSee: ['dinosumo-weak-balloons'] },
  { anchor: 'carnivalRow', prefixes: ['carnival-balloonPop-weak', 'carnival-ringToss-weak', 'carnival-duckPond-weak', 'carnival-strengthBell-weak', 'carnival-glowDodge-weak'], mustSee: [] },
  { anchor: 'foamCourse', prefixes: ['foam-lava-weak'], mustSee: ['foam-lava-weak'] },
  { anchor: 'dragonRoost', prefixes: ['sky-dragon-weak'], mustSee: [] },
  { anchor: 'raceStart', prefixes: ['race-weak-eye'], mustSee: [] }, // the line is built on the first race
  { anchor: 'iceCream', prefixes: ['Scoops.secret'], mustSee: [] },
];

test('attraction streams: every layer object touches only its own channel (4 combos)', async () => {
  const seen: Record<string, number> = {};
  for (const st of STREAMS) {
    const view = await page.evaluate((name) => {
      const a = window.__rg!.ctx.world.anchors[name as 'spawn'];
      if (!a) return null;
      const p = a.position;
      const d = Math.max(10, a.radius * 1.4);
      return { from: [p.x + d * 0.7, p.y + d * 0.9, p.z + d * 0.7] as V3, at: [p.x, p.y, p.z] as V3 };
    }, st.anchor);
    expect(view, st.anchor).not.toBeNull();
    if (!view) continue;
    await cam(view.from, view.at);
    for (const combo of COMBOS) {
      await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);
      const on = await frame();
      for (const prefix of st.prefixes) {
        expect(await toggle(prefix, false), prefix).toBeGreaterThan(0);
        const off = await frame();
        await toggle(prefix, true);
        const diff = channelDiff(on, off);
        const tag = `${st.anchor}: ${prefix} ${combo.eye.leftLens}/${combo.eye.weakEye}`;
        expect.soft(maxOf(diff, combo.strong), tag).toBe(0);
        expect.soft(diff.maxB, tag).toBe(0);
        seen[prefix] = Math.min(seen[prefix] ?? Infinity, diff[combo.weak]);
      }
    }
  }
  console.log('[vision-content] streams own-channel diff', JSON.stringify(seen));
  for (const st of STREAMS) for (const p of st.mustSee) expect.soft(seen[p], `${p} in view`).toBeGreaterThan(30);
  await page.evaluate(() => window.__rg!.setEye({ leftLens: 'red', weakEye: 'left' }));
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
