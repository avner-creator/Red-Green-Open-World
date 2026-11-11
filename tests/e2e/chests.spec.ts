/**
 * Chests: the both-eye lock plays through the real game (key + arrow trail = weak eye, the right symbol = strong eye, the buttons = both eyes),
 * the layers stay in their channels, and the outfits show on the robot.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { SHOTS, boot, canvasShot, channelDiff, shot } from './helpers';
import { VisionLayer } from '../../src/types';
import type { EyeSettings } from '../../src/types';
import type { ChestInfo } from '../../src/activities/chests';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/chests';
let page: Page;
let consoleErrors: string[] = [];

const maxOf = (d: ReturnType<typeof channelDiff>, c: 'r' | 'g' | 'b'): number => (c === 'r' ? d.maxR : c === 'g' ? d.maxG : d.maxB);

const info = (): Promise<ChestInfo[]> => page.evaluate(() => window.__rgChests!.info());

/** Put the player on the ground at x,z facing `yaw`, let the world settle, render. */
async function stand(x: number, z: number, yaw: number, render = true): Promise<void> {
  await page.evaluate(
    ({ x, z, yaw, render }) => {
      const rg = window.__rg!;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.1, z, yaw);
      rg.step(1 / 60, 24, false);
      rg.step(1 / 60, 1, render);
    },
    { x, z, yaw, render },
  );
}

async function use(): Promise<void> {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ usePressed: true, use: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 2, false);
  });
}

const yawToward = (fx: number, fz: number, tx: number, tz: number): number => Math.atan2(tx - fx, tz - fz);

function splitChannel(png: PNG, c: number): Buffer {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    o.data[i] = o.data[i + 1] = o.data[i + 2] = png.data[i + c];
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

async function save(name: string): Promise<void> {
  if (!SHOTS) return;
  const buf = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
  const png = PNG.sync.read(buf);
  writeFileSync(`${OUT}/${name}-full.png`, buf);
  writeFileSync(`${OUT}/${name}-R.png`, splitChannel(png, 0));
  writeFileSync(`${OUT}/${name}-G.png`, splitChannel(png, 1));
}

async function frame(layers: { weak: boolean; strong: boolean }): Promise<PNG> {
  await page.evaluate(
    ({ weak, strong, W, S }) => {
      const rg = window.__rg!;
      rg.setLayerVisible(W, weak);
      rg.setLayerVisible(S, strong);
      rg.render();
    },
    { ...layers, W: VisionLayer.WeakOnly, S: VisionLayer.StrongOnly },
  );
  return canvasShot(page);
}

test.beforeAll(async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  ({ consoleErrors } = await boot(page, '&quality=low'));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 20, false);
  });
});

test.afterAll(async () => {
  await page.close();
});

test('six chests, keys on land 6.5-11.5 m away, six buttons each (every symbol twice)', async () => {
  const chests = await info();
  expect(chests).toHaveLength(6);
  expect(await page.evaluate(() => window.__rg!.state().chestsTotal)).toBe(6);
  const checks = await page.evaluate(() => {
    const w = window.__rg!.ctx.world;
    return window.__rgChests!.info().map((c) => ({
      dist: Math.hypot(c.key[0] - c.position[0], c.key[2] - c.position[2]),
      land: w.isLand(c.key[0], c.key[2]),
      above: c.key[1] - w.heightAt(c.key[0], c.key[2]),
    }));
  });
  for (const c of checks) {
    expect(c.land).toBe(true);
    expect(c.dist).toBeGreaterThan(6.3);
    expect(c.dist).toBeLessThan(11.7);
    expect(c.above).toBeGreaterThan(0.8);
  }
  expect(new Set(chests.map((c) => c.symbol)).size).toBeGreaterThan(1);
  for (const c of chests) {
    expect(c.buttons).toHaveLength(6);
    for (const sym of [0, 1, 2]) expect(c.buttons.filter((b) => b.symbol === sym)).toHaveLength(2);
  }
});

/** World x,z of the right-symbol button of chest `c` that is nearest to the point `px,pz`. */
const nearestRight = (c: ChestInfo, px: number, pz: number): { x: number; z: number } => {
  const mine = c.buttons.filter((b) => b.symbol === c.symbol);
  return mine.sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz))[0];
};

const restart = async (): Promise<void> => {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.start();
    rg.step(1 / 60, 3, false);
  });
};

test('hints once, boing without key, wrong shape sinks, right shape opens; restart resets', async () => {
  await restart();
  await page.evaluate(() => {
    const ctx = window.__rg!.ctx;
    const log: string[] = [];
    ctx.events.on('chest:key', (e) => log.push(`key:${e.chestId}`));
    ctx.events.on('chest:opened', (e) => log.push(`opened:${e.chestId}:${e.outfitId}`));
    ctx.events.on('outfit:unlocked', (e) => log.push(`unlocked:${e.outfitId}`));
    ctx.events.on('outfit:equipped', (e) => log.push(`equipped:${e.outfitId}:${e.slot}`));
    ctx.events.on('ui:toast', (e) => {
      if (e.text) log.push(`toast:${e.icon}:${e.text}`);
    });
    (window as unknown as { __log: string[] }).__log = log;
  });
  const log = (): Promise<string[]> => page.evaluate(() => (window as unknown as { __log: string[] }).__log.slice());

  const c = (await info())[0];
  const right = c.buttons.filter((b) => b.symbol === c.symbol);
  const wrong = c.buttons.filter((b) => b.symbol !== c.symbol);

  // Far away: no hint. Walk up (4 m out): "Find the key!" once, however long we stay. The prompt
  // shows the key icon.
  await stand(c.position[0] + 30, c.position[2], 0, false);
  expect(await log()).toEqual([]);
  const [ax, az] = await page.evaluate(([i]) => window.__rgChests!.sidePoint(i, 1, 4.2), [0]);
  await stand(ax, az, 0, false);
  await page.evaluate(() => window.__rg!.step(1 / 60, 60, false));
  expect(await log()).toEqual(['toast:key:Find the key!']);
  expect(await page.evaluate(() => window.__rg!.ctx.interactions.focused?.icon ?? null)).toBe('key');
  // Both-eye hints: the key badge over the chest and the dotted area hint; no key chip yet.
  let ci = (await info())[0];
  expect(ci.badge).toBe('find');
  expect(ci.dots.shown).toBe(true);
  expect(ci.dots.count).toBeGreaterThan(8);
  expect(ci.carriedKeyVisible).toBe(false);
  expect((await page.evaluate(() => window.__rgChests!.hud())).keyChip).toBe(false);
  // The key is inside the dotted circle, but not at its centre.
  const fromCentre = Math.hypot(ci.key[0] - ci.area[0], ci.key[2] - ci.area[1]);
  expect(fromCentre).toBeGreaterThan(1);
  expect(fromCentre).toBeLessThan(ci.area[2]);

  // Without the key, buttons just boing: right shape included.
  await stand(right[0].x, right[0].z, 0, false);
  await use();
  expect(await page.evaluate(() => window.__rg!.state().chests)).toBe(0);
  expect((await info())[0].open).toBe(false);
  expect((await info())[0].wrongTries).toBe(0);

  // Walk into the key: it bobs over the hero for both eyes, the HUD shows a key chip and a
  // key → chest pictogram; the dots go away.
  await stand(c.key[0], c.key[2], 0, false);
  expect((await info())[0].keyState).toBe('carried');
  expect(await log()).toContain('key:chest0');
  ci = (await info())[0];
  expect(ci.carriedKeyVisible).toBe(true);
  expect(ci.dots.shown).toBe(false);
  expect(await page.evaluate(() => window.__rgChests!.hud())).toEqual({ keyChip: true, picto: 'key>chest' });
  const overHead = await page.evaluate(() => window.__rg!.ctx.player.position.y);
  expect(ci.keyNow[1] - overHead).toBeGreaterThan(1.8);

  // Back at the chest with the key: "Step on the right shape!" once; the prompt shows a foot on a tile
  // (the real action), the tiles pulse and the one E would press stands up (QA5 m4).
  await stand(ax, az, 0, false);
  await page.evaluate(() => window.__rg!.step(1 / 60, 60, false));
  expect((await log()).filter((l) => l.startsWith('toast:step'))).toEqual(['toast:step:Step on the right shape!']);
  expect((await log()).filter((l) => l.startsWith('toast:key'))).toEqual(['toast:key:Find the key!']);
  expect(await page.evaluate(() => window.__rg!.ctx.interactions.focused?.icon ?? null)).toBe('step');
  await expect(page.getByTestId('prompt')).toHaveClass(/\bon\b/);
  expect((await info())[0].badge).toBe('use');

  // A wrong shape: friendly wobble, the button sinks for 2 s, nothing opens, no penalty, try again.
  await stand(wrong[0].x, wrong[0].z, 0, false);
  let now = (await info())[0];
  expect(now.open).toBe(false);
  expect(now.keyState).toBe('carried');
  expect(now.wrongTries).toBe(1);
  expect(now.buttons[c.buttons.findIndex((b) => b.x === wrong[0].x)].sunk).toBe(true);
  await use(); // pressing at a sunk button does nothing
  expect((await info())[0].wrongTries).toBe(1);
  await page.evaluate(() => window.__rg!.step(1 / 60, 140, false));
  now = (await info())[0];
  expect(now.buttons.some((b) => b.sunk)).toBe(false);
  await stand(wrong[1].x, wrong[1].z, 0, false);
  expect((await info())[0].wrongTries).toBe(2);
  expect((await info())[0].open).toBe(false);

  // The right shape opens it: the outfit is unlocked and equipped.
  await stand(right[1].x, right[1].z, 0, false);
  await page.evaluate(() => window.__rg!.step(1 / 60, 10, false));
  const st = await page.evaluate(() => window.__rg!.state());
  expect(st.chests).toBe(1);
  expect(st.outfits).toEqual(['hat-explorer']);
  expect((await info())[0].open).toBe(true);
  expect((await info())[0].badge).toBe(null);
  expect(await page.evaluate(() => window.__rgChests!.hud())).toEqual({ keyChip: false, picto: 'chest>hat' });
  expect(await log()).toEqual([
    'toast:key:Find the key!',
    'key:chest0',
    'toast:step:Step on the right shape!',
    'opened:chest0:hat-explorer',
    'unlocked:hat-explorer',
    'equipped:hat-explorer:head',
  ]);

  // The outfit is saved in the profile and worn through the gear applier.
  expect(await page.evaluate(() => window.__rgGear!.attached().head)).toBe('hat-explorer');
  expect(await page.evaluate(() => window.__rg!.ctx.profile.owns('hat-explorer'))).toBe(true);

  // Restart: closed again, key back; the saved outfit stays on (it persists between sessions).
  await restart();
  const again = await page.evaluate(() => ({ s: window.__rg!.state(), c: window.__rgChests!.info()[0] }));
  expect(again.s.chests).toBe(0);
  expect(again.s.outfits).toEqual([]);
  expect(await page.evaluate(() => window.__rgGear!.attached().head)).toBe('hat-explorer');
  expect(again.c.open).toBe(false);
  expect(again.c.keyState).toBe('ground');
  expect(again.c.wrongTries).toBe(0);
  expect(await page.evaluate(() => window.__rg!.state().chestsTotal)).toBe(6);
});

test('opens from every direction (stepping on the shape from 4 sides, and with E)', async () => {
  for (let dir = 0; dir < 4; dir++) {
    await restart();
    const i = dir; // a different chest each time
    const c = (await info())[i];
    await stand(c.key[0], c.key[2], 0, false);
    expect((await info())[i].keyState).toBe('carried');
    // Come in from side `dir`: the right button nearest that approach.
    const [ax, az] = await page.evaluate(([n, d]) => window.__rgChests!.sidePoint(n, d, 4.5), [i, dir]);
    const b = nearestRight(c, ax, az);
    if (dir % 2 === 0) {
      await stand(b.x, b.z, 0, false); // step on it
    } else {
      // First E right at the chest, facing it (QA6 m2): nothing is pressed, no try is spent.
      const dx = b.x - c.position[0];
      const dz = b.z - c.position[2];
      const l = Math.hypot(dx, dz);
      const nx = c.position[0] + (dx / l) * 1.2;
      const nz = c.position[2] + (dz / l) * 1.2;
      await stand(nx, nz, yawToward(nx, nz, c.position[0], c.position[2]), false);
      expect((await info())[i].eTile).toBe(-1);
      await use();
      await page.evaluate(() => window.__rg!.step(1 / 60, 10, false));
      expect((await info())[i].open).toBe(false);
      expect((await info())[i].wrongTries).toBe(0);
      // 0.95 m outward from the button (not on it), facing it, then press E: that button counts.
      const fx = b.x + (dx / l) * 0.95;
      const fz = b.z + (dz / l) * 0.95;
      await stand(fx, fz, yawToward(fx, fz, b.x, b.z), false);
      expect((await info())[i].open).toBe(false);
      // The tile E would press is the highlighted one: this right button.
      expect((await info())[i].eTile).toBe(c.buttons.findIndex((bb) => bb.x === b.x && bb.z === b.z));
      await use();
    }
    await page.evaluate(() => window.__rg!.step(1 / 60, 10, false));
    expect((await info())[i].open, `chest ${i} from side ${dir}`).toBe(true);
    expect(await page.evaluate(() => window.__rg!.state().chests)).toBe(1);
  }
});

test('the key and the arrow trail live only in the weak channel, the symbols only in the strong channel', async () => {
  await restart();
  const c = (await info())[0];
  const allCombos: Array<{ eye: Pick<EyeSettings, 'leftLens' | 'weakEye'>; weak: 'r' | 'g'; strong: 'r' | 'g' }> = [
    { eye: { leftLens: 'red', weakEye: 'left' }, weak: 'r', strong: 'g' },
    { eye: { leftLens: 'red', weakEye: 'right' }, weak: 'g', strong: 'r' },
    { eye: { leftLens: 'green', weakEye: 'left' }, weak: 'g', strong: 'r' },
    { eye: { leftLens: 'green', weakEye: 'right' }, weak: 'r', strong: 'g' },
  ];
  const kx = c.key[0] - c.position[0];
  const kz = c.key[2] - c.position[2];
  const kl = Math.hypot(kx, kz);
  for (const combo of allCombos) {
    const label = `${combo.eye.leftLens}-left/${combo.eye.weakEye}-weak`;
    await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);

    // Key view: stand 3.5 m short of the key, looking at it.
    const px = c.key[0] + (kx / kl) * 3.5;
    const pz = c.key[2] + (kz / kl) * 3.5;
    await stand(px, pz, yawToward(px, pz, c.key[0], c.key[2]), false); // frame() renders
    const all = await frame({ weak: true, strong: true });
    const noWeak = await frame({ weak: false, strong: true });
    const dw = channelDiff(all, noWeak);
    expect(dw[combo.weak], `key ${label}`).toBeGreaterThan(150);
    expect(maxOf(dw, combo.strong), `key leaks ${label}`).toBe(0);
    expect(dw.maxB, `key blue ${label}`).toBe(0);

    // Trail view: 6 m out from the chest toward the key, looking along it (key is a bit further).
    const tx = c.position[0] + (kx / kl) * 3.3;
    const tz = c.position[2] + (kz / kl) * 3.3;
    await stand(tx, tz, yawToward(tx, tz, c.key[0], c.key[2]), false);
    await page.evaluate(() => window.__rgChests!.setKeyVisible(true));
    // Hide only the key model to isolate the trail pixels; both are weak-layer, so also compare the whole layer.
    const withTrail = await frame({ weak: true, strong: true });
    await page.evaluate(() => window.__rgChests!.setKeyVisible(false));
    const noKeyNoTrail = await frame({ weak: true, strong: true });
    const dt = channelDiff(withTrail, noKeyNoTrail);
    expect(dt[combo.weak], `trail ${label}`).toBeGreaterThan(150);
    expect(maxOf(dt, combo.strong), `trail leaks ${label}`).toBe(0);
    expect(dt.maxB, `trail blue ${label}`).toBe(0);
    await page.evaluate(() => window.__rgChests!.setKeyVisible(true));

    // Symbol view: 4.5 m out from the chest, camera on the chest, floating + lid symbol.
    const sx = c.position[0] - (kx / kl) * 4.5;
    const sz = c.position[2] - (kz / kl) * 4.5;
    await stand(sx, sz, yawToward(sx, sz, c.position[0], c.position[2]), false);
    const withSym = await frame({ weak: true, strong: true });
    const noStrong = await frame({ weak: true, strong: false });
    const ds = channelDiff(withSym, noStrong);
    expect(ds[combo.strong], `symbol ${label}`).toBeGreaterThan(150);
    expect(maxOf(ds, combo.weak), `symbol leaks ${label}`).toBe(0);
    expect(ds.maxB, `symbol blue ${label}`).toBe(0);
  }
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.setEye({ leftLens: 'red', weakEye: 'left' });
    rg.setLayerVisible(1, true);
    rg.setLayerVisible(2, true);
  });
});

test('the six buttons are the same for both eyes and give nothing away', async () => {
  // Both-eye objects show in every layer combination identically: hiding both eye layers changes
  // nothing about the buttons, and every cushion is the same mesh/colour (only the symbol differs).
  const r = await page.evaluate(() => {
    const ctx = window.__rg!.ctx;
    const meshes = ctx.scene.children.filter((o) => o.name === 'chest-buttons') as unknown as Array<{ count: number; castShadow: boolean }>;
    return { n: meshes.length, shadows: meshes.some((m) => m.castShadow), counts: meshes.map((m) => m.count) };
  });
  expect(r.n).toBe(4); // 1 cushion mesh + 3 symbol meshes, for all chests
  expect(r.shadows).toBe(false);
  // Buttons draw only for chests near the camera (compacted each frame): whole rings of six, every
  // cushion with exactly one symbol, never more than the six chests' 36.
  const [cushions, ...symbols] = r.counts;
  expect(cushions % 6).toBe(0);
  expect(cushions).toBeLessThanOrEqual(36);
  expect(symbols.reduce((a, b) => a + b, 0)).toBe(cushions);
  expect(await page.evaluate(() => window.__rg!.ctx.scene.getObjectByName('chest-symbol') !== undefined)).toBe(false);
  expect(await page.evaluate(() => window.__rg!.ctx.scene.getObjectByName('chest-trail') !== undefined)).toBe(false);
});

/** Free camera for screenshots: placed after the last step, then the same state is re-rendered. */
async function cam(from: [number, number, number], at: [number, number, number], fov = 60): Promise<void> {
  if (!SHOTS) return; // only frames screenshots (and a render costs seconds on SwiftShader)
  await page.evaluate(
    ({ from, at, fov }) => {
      const rg = window.__rg!;
      const c = rg.ctx.camera;
      rg.ctx.uiRoot.style.display = 'none';
      c.position.set(...from);
      c.fov = fov;
      c.updateProjectionMatrix();
      c.lookAt(...at);
      rg.render();
    },
    { from, at, fov },
  );
}

test('every chest opens and its wearable goes on (screenshots with RG_SHOTS=1)', async () => {
  await restart();
  const chests = await info();
  // Hero chest: the one whose key is on the clearest side of the camera.
  const c = chests[0];
  const kx = c.key[0] - c.position[0];
  const kz = c.key[2] - c.position[2];
  const kl = Math.hypot(kx, kz);
  const ux = kx / kl;
  const uz = kz / kl;
  // Park the player out of the picture, then the hero shot: camera behind the chest, looking along
  // the arrow trail toward the key, ring of buttons and the floating symbol in view.
  await stand(c.position[0] - ux * 40, c.position[2] - uz * 40, 0, false);
  const lookAt: [number, number, number] = [c.position[0] + ux * 1.6, c.position[1] + 1.1, c.position[2] + uz * 1.6];
  await cam([c.position[0] - ux * 4.8, c.position[1] + 3.9, c.position[2] - uz * 4.8], lookAt, 64);
  await save('ring-trail-symbol');
  // Side view: chest, ring, floating symbol and "?" badge are all in frame.
  await cam([c.position[0] - uz * 5.2, c.position[1] + 2.6, c.position[2] + ux * 5.2], [c.position[0], c.position[1] + 1.2, c.position[2]], 58);
  await save('ring-side');
  // Close on the chest: empty key slot on the plate, symbol on the lid.
  await cam([c.position[0] + 0.2, c.position[1] + 1.35, c.position[2] + 1.9], [c.position[0], c.position[1] + 0.45, c.position[2]], 50);
  await save('slot-empty');
  // With the key: the slot is filled; a wrong button sunk.
  await stand(c.key[0], c.key[2], 0, false);
  const wrong = c.buttons.find((b) => b.symbol !== c.symbol)!;
  await stand(wrong.x, wrong.z, 0, false);
  await stand(c.position[0] - ux * 40, c.position[2] - uz * 40, 0, false);
  await cam([c.position[0] + 0.2, c.position[1] + 1.35, c.position[2] + 1.9], [c.position[0], c.position[1] + 0.45, c.position[2]], 50);
  await save('slot-filled');
  await cam([c.position[0] - ux * 4.8, c.position[1] + 3.9, c.position[2] - uz * 4.8], lookAt, 64);
  await save('ring-key-carried');
  // The key alone, close.
  await restart();
  await stand(c.position[0] - ux * 40, c.position[2] - uz * 40, 0, false);
  await cam([c.key[0] + 2.2, c.key[1] + 0.3, c.key[2] + 0.4], c.key, 50);
  await save('key-close');

  // Open every chest in turn; after each, look at the robot from the front and the back.
  const ids = ['hat-explorer', 'cape-hero', 'paint-flame', 'glasses-star', 'hat-party', 'paint-sky'];
  for (let i = 0; i < 6; i++) {
    const ci = (await info())[i];
    await page.evaluate((k) => {
      const rg = window.__rg!;
      rg.teleport(k[0], rg.ctx.world.heightAt(k[0], k[2]) + 0.1, k[2]);
      rg.step(1 / 60, 3, false);
    }, ci.key);
    const b = nearestRight(ci, ci.position[0] + 4, ci.position[2]);
    await stand(b.x, b.z, 0, false);
    await use();
    // Settle the pop-in, then a cloth-friendly standing pose.
    await page.evaluate(() => window.__rg!.step(1 / 60, 50, false));
    const pw = await page.evaluate(() => {
      const pl = window.__rg!.ctx.player;
      return { p: pl.position.toArray() as [number, number, number], yaw: pl.yaw };
    });
    const [p0, p1, p2] = pw.p;
    const fx = Math.sin(pw.yaw);
    const fz = Math.cos(pw.yaw);
    if (!ids[i].startsWith('paint')) {
      await cam([p0 + fx * 2.3, p1 + 1.45, p2 + fz * 2.3], [p0, p1 + 1.2, p2], 45);
      await save(`wear-${ids[i]}-front`);
      await cam([p0 - fx * 2.6 + fz * 0.6, p1 + 1.4, p2 - fz * 2.6 - fx * 0.6], [p0, p1 + 1.0, p2], 45);
      await save(`wear-${ids[i]}-back`);
    }
  }
  const state = await page.evaluate(() => window.__rg!.state());
  expect(state.chests).toBe(6);
  expect([...state.outfits].sort()).toEqual([...ids].sort());
  const p = await page.evaluate(() => window.__rg!.ctx.player.position.toArray() as [number, number, number]);
  await cam([p[0] + 1.1, p[1] + 1.5, p[2] + 3.2], [p[0], p[1] + 1.15, p[2]], 45);
  await save('robot-all');
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.ctx.uiRoot.style.display = '';
  });
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
  void shot;
});
