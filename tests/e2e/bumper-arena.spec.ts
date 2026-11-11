/**
 * Bubble Ball and Dino Sumo (Stream L): a full round of each from the booth to the result card and
 * back to walking, a replay, and canvas-readback channel tests: the weak-eye bonus pieces (Bubble
 * Ball's hoops and ball sparkle, Dino Sumo's magic water balloons) change only the weak channel —
 * the strong channel and blue stay bit-identical — for all 4 lens/eye combinations.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot, channelDiff } from './helpers';
import type { EyeSettings } from '../../src/types';

test.describe.configure({ mode: 'serial' });

let page: Page;
let consoleErrors: string[] = [];
const OUT = 'test-results/bumper-arena';

const COMBOS: Array<{ eye: Pick<EyeSettings, 'leftLens' | 'weakEye'>; weak: 'r' | 'g'; strong: 'r' | 'g' }> = [
  { eye: { leftLens: 'red', weakEye: 'left' }, weak: 'r', strong: 'g' },
  { eye: { leftLens: 'red', weakEye: 'right' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'left' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'right' }, weak: 'r', strong: 'g' },
];
const maxOf = (d: ReturnType<typeof channelDiff>, c: 'r' | 'g' | 'b'): number => (c === 'r' ? d.maxR : c === 'g' ? d.maxG : d.maxB);

/** Save the canvas as full + R-only + G-only images. */
function saveChannels(img: PNG, name: string): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}-full.png`, PNG.sync.write(img));
  for (const [c, tag] of [
    [0, 'R'],
    [1, 'G'],
  ] as const) {
    const o = new PNG({ width: img.width, height: img.height });
    for (let i = 0; i < img.data.length; i += 4) {
      o.data[i] = o.data[i + 1] = o.data[i + 2] = img.data[i + c];
      o.data[i + 3] = 255;
    }
    writeFileSync(`${OUT}/${name}-${tag}.png`, PNG.sync.write(o));
  }
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3, false);
  });
});

test.afterAll(async () => {
  await page.close();
});

test('Bubble Ball kickabout: walking or sprinting into the ball from 8 directions pushes it, never through it (30/60/144 Hz)', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const bb = window.__rgBubbleBall!;
    const rows: { dir: number; hz: number; minGap: number; moved: number }[] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const hz = [30, 60, 144][k % 3];
      bb.placeBall(0, 0);
      const [wx, wy, wz] = bb.world(-dx * 3.2, 0.05, -dz * 3.2);
      rg.teleport(wx, wy, wz);
      rg.step(1 / 60, 3, false);
      let minGap = Infinity;
      for (let i = 0; i < hz * 1.6; i++) {
        // Steer the stick at the ball every frame (camera-relative stick, like a child would).
        const p = ctx.player.position;
        const [px, , pz] = bb.local(p.x, p.y, p.z);
        const b = bb.ball();
        const [bwx, , bwz] = bb.world(b.x, 0, b.z);
        let ex = bwx - p.x;
        let ez = bwz - p.z;
        const el = Math.hypot(ex, ez) || 1;
        ex /= el;
        ez /= el;
        const yaw = ctx.cameraRig.yaw;
        const s = Math.sin(yaw);
        const c = Math.cos(yaw);
        rg.inject({ moveX: -c * ex + s * ez, moveY: s * ex + c * ez, sprint: k % 2 === 0 });
        rg.step(1 / hz, 1, false);
        minGap = Math.min(minGap, Math.hypot(b.x - px, b.z - pz) - (0.35 + 0.72));
      }
      rg.inject(null);
      const b = bb.ball();
      rows.push({ dir: k, hz, minGap, moved: Math.hypot(b.x, b.z) });
    }
    rg.step(1 / 60, 1);
    return { rows, phase: bb.phase(), mode: ctx.player.mode };
  });
  saveChannels(await canvasShot(page), 'e2e-bubble-kickabout');
  expect(r.phase).toBe('idle');
  expect(r.mode).toBe('walk');
  for (const row of r.rows) {
    // The capsule never gets inside the ball (a few cm of controller skin at most).
    expect(row.minGap, `dir ${row.dir} @${row.hz} Hz`).toBeGreaterThan(-0.08);
    // ...and the ball got shoved along.
    expect(row.moved, `dir ${row.dir} @${row.hz} Hz`).toBeGreaterThan(1);
  }
  await page.evaluate(() => window.__rgBubbleBall!.placeBall(0, 0));
});

test('Bubble Ball: E at the booth, friends join, a full match (first to 3 or 75 s) to the result card, R leaves', async () => {
  const r1 = await page.evaluate(async () => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const bb = window.__rgBubbleBall!;
    const stunts: { stars: number }[] = [];
    const toasts: string[] = [];
    const stamps: string[] = [];
    const offs = [
      ctx.events.on('stunt', (e) => stunts.push({ stars: e.stars })),
      ctx.events.on('ui:toast', (e) => toasts.push(`${e.icon}:${e.text ?? ''}`)),
      ctx.events.on('stamp:earned', (e) => stamps.push(e.id)),
    ];
    (window as unknown as { __bbOffs: (() => void)[] }).__bbOffs = offs;
    (window as unknown as { __bbLog: unknown }).__bbLog = { stunts, toasts, stamps };
    const [bx, , bz] = bb.booth();
    rg.teleport(bx, ctx.world.heightAt(bx, bz) + 0.1, bz);
    rg.step(1 / 60, 10, false);
    const focus = ctx.interactions.focused?.id ?? null;
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    const modeAfterUse = ctx.player.mode;
    // Friends load once (real network time), then the 3-2-1.
    for (let i = 0; i < 400 && bb.phase() === 'loading'; i++) {
      rg.step(1 / 60, 1, false);
      await new Promise((res) => setTimeout(res, 25));
    }
    const phaseAfterLoad = bb.phase();
    const startClock = bb.match()?.clock ?? -1;
    // A few seconds of play for a mid-match screenshot.
    rg.step(1 / 60, 200, false);
    for (let i = 0; i < 40; i++) {
      rg.inject({ moveY: 1, moveX: 0.3, sprint: true, jumpPressed: i === 20 });
      rg.step(1 / 30, 1, false);
    }
    rg.inject(null);
    rg.step(1 / 60, 1);
    return { focus, modeAfterUse, phaseAfterLoad, startClock };
  });
  saveChannels(await canvasShot(page), 'e2e-bubble-play');
  // Play on (chasing the ball and dash-kicking at the far goal) until a goal: screenshot the party.
  const goal = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const bb = window.__rgBubbleBall!;
    const chase = (i: number): void => {
      const m = bb.match();
      if (!m) return;
      // Aim behind the ball on the line to the far goal (+X), then through it.
      const gx = 11;
      const dgx = gx - m.bx;
      const dgz = -m.bz;
      const dl = Math.hypot(dgx, dgz) || 1;
      const tx = m.bx - (dgx / dl) * 1.4;
      const tz = m.bz - (dgz / dl) * 1.4;
      const lined = Math.hypot(tx - m.px, tz - m.pz) < 1.1;
      const [twx, , twz] = bb.world(lined ? m.bx : tx, 0, lined ? m.bz : tz);
      const p = ctx.player.position;
      let ex = twx - p.x;
      let ez = twz - p.z;
      const el = Math.hypot(ex, ez) || 1;
      ex /= el;
      ez /= el;
      const yaw = ctx.cameraRig.yaw;
      const s = Math.sin(yaw);
      const c = Math.cos(yaw);
      rg.inject({ moveX: -c * ex + s * ez, moveY: s * ex + c * ez, sprint: true, jumpPressed: lined && i % 6 === 0 });
    };
    (window as unknown as { __bbChase: (i: number) => void }).__bbChase = chase;
    const home0 = bb.match()?.home ?? 0;
    let i = 0;
    for (; i < 1600 && bb.phase() === 'match' && (bb.match()?.home ?? 0) === home0; i++) {
      chase(i);
      rg.step(1 / 30, 1, false);
    }
    rg.inject(null);
    rg.step(1 / 60, 8, false);
    rg.step(1 / 60, 1);
    return { scored: (bb.match()?.home ?? 0) > home0, frames: i };
  });
  if (goal.scored) saveChannels(await canvasShot(page), 'e2e-bubble-goal');
  const r2 = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const bb = window.__rgBubbleBall!;
    const chase = (window as unknown as { __bbChase: (i: number) => void }).__bbChase;
    let maxDist = 0;
    const p0 = ctx.player.position.clone();
    let frames = 0;
    for (let i = 0; i < 2600 && bb.phase() === 'match'; i++) {
      chase(i);
      rg.step(1 / 20, 1, false);
      maxDist = Math.max(maxDist, ctx.player.position.distanceTo(p0));
      frames++;
    }
    rg.inject(null);
    rg.step(1 / 60, 40, false);
    rg.step(1 / 60, 1);
    const m = bb.match();
    const log = (window as unknown as { __bbLog: { stunts: { stars: number }[]; toasts: string[]; stamps: string[] } }).__bbLog;
    const result = {
      maxDist,
      frames,
      phaseEnd: bb.phase(),
      score: m ? [m.home, m.away] : null,
      card: document.querySelector('[data-testid="bubbleball-hud-result"]')?.classList.contains('on') ?? false,
      stunts: log.stunts.length,
      lastStars: log.stunts.at(-1)?.stars ?? 0,
      toasts: log.toasts,
      stamps: log.stamps,
      friends: bb.friendsLoaded(),
      triangles: bb.triangles(),
    };
    (window as unknown as { __bbOffs: (() => void)[] }).__bbOffs.forEach((o) => o());
    return result;
  });
  saveChannels(await canvasShot(page), 'e2e-bubble-result');
  const r = r2;
  console.log(`bubble ball: goal frames ${goal.frames} scored ${goal.scored}, final ${JSON.stringify(r2.score)} in ${r2.frames} frames`);
  expect(r1.focus).toBe('bubbleball');
  expect(r1.modeAfterUse).toBe('external');
  expect(r1.phaseAfterLoad).toBe('match');
  expect(r1.startClock).toBe(75);
  expect(goal.scored).toBe(true);
  expect(r.stamps).toContain('bubbleArena');
  expect(r.friends).toBeGreaterThanOrEqual(5);
  expect(r.maxDist).toBeGreaterThan(5);
  expect(r.phaseEnd).toBe('result');
  expect(r.card).toBe(true);
  expect(r.lastStars).toBeGreaterThanOrEqual(1);
  expect(r.toasts.some((t) => t.startsWith('check:'))).toBe(true);
  expect(r.triangles).toBeLessThan(40_000);

  // R leaves: back on foot beside the booth.
  const after = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 30, false);
    const [bx, , bz] = window.__rgBubbleBall!.booth();
    const p = rg.ctx.player.position;
    return { mode: rg.ctx.player.mode, phase: window.__rgBubbleBall!.phase(), dist: Math.hypot(p.x - bx, p.z - bz), card: document.querySelector('[data-testid="bubbleball-hud-result"]')?.classList.contains('on') };
  });
  expect(after.mode).toBe('walk');
  expect(after.phase).toBe('idle');
  expect(after.dist).toBeLessThan(5);
  expect(after.card).toBe(false);
});

test('Bubble Ball: the bonus hoop and the charged-ball sparkle touch only the weak channel (all 4 combos)', async () => {
  const ok = await page.evaluate(async () => {
    const rg = window.__rg!;
    const bb = window.__rgBubbleBall!;
    bb.start(); // friends are cached now
    for (let i = 0; i < 200 && bb.phase() === 'loading'; i++) {
      rg.step(1 / 60, 1, false);
      await new Promise((res) => setTimeout(res, 10));
    }
    rg.step(1 / 60, 30, false);
    // A hoop right ahead of the hero (the camera looks down the pitch), and a charged ball.
    bb.ring(2.5, 0.6);
    bb.charge();
    rg.step(1 / 60, 30, false);
    rg.step(1 / 60, 1);
    return bb.phase() === 'match' && !!bb.match()?.ring;
  });
  expect(ok).toBe(true);
  const frame = async (on: boolean): Promise<PNG> => {
    await page.evaluate((v) => {
      window.__rgBubbleBall!.layer(v);
      window.__rg!.render();
    }, on);
    return canvasShot(page);
  };
  for (const combo of COMBOS) {
    await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);
    const withLayer = await frame(true);
    const without = await frame(false);
    const d = channelDiff(withLayer, without);
    const tag = `${combo.eye.leftLens}/${combo.eye.weakEye}`;
    expect(d[combo.weak], tag).toBeGreaterThan(300);
    expect(maxOf(d, combo.strong), tag).toBe(0);
    expect(d.maxB, tag).toBe(0);
    if (combo.weak === 'r' && combo.eye.leftLens === 'red') saveChannels(withLayer, 'e2e-bubble-weak');
  }
  await page.evaluate(() => {
    const rg = window.__rg!;
    window.__rgBubbleBall!.layer(true);
    rg.setEye({ leftLens: 'red', weakEye: 'left' });
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 5, false);
  });
  expect(await page.evaluate(() => window.__rgBubbleBall!.phase())).toBe('idle');
});

test('Dino Sumo: the magic water balloons touch only the weak channel (all 4 combos)', async () => {
  const setup = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const ds = window.__rgDinoSumo!;
    const p = ds.world(0, 0, -10.5);
    const c = ds.world(0, 1.5, 0);
    rg.teleport(p[0], ctx.world.heightAt(p[0], p[2]) + 0.1, p[2], Math.atan2(c[0] - p[0], c[2] - p[2]));
    rg.step(1 / 60, 90, false);
    rg.step(1 / 60, 1);
    return ds.balloons().filter((b) => b.kind === 'weak').length;
  });
  expect(setup).toBeGreaterThan(0);
  const frame = async (on: boolean): Promise<PNG> => {
    await page.evaluate((v) => {
      window.__rgDinoSumo!.layer(v);
      window.__rg!.render();
    }, on);
    return canvasShot(page);
  };
  for (const combo of COMBOS) {
    await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);
    const withLayer = await frame(true);
    const without = await frame(false);
    const d = channelDiff(withLayer, without);
    const tag = `${combo.eye.leftLens}/${combo.eye.weakEye}`;
    expect(d[combo.weak], tag).toBeGreaterThan(40);
    expect(maxOf(d, combo.strong), tag).toBe(0);
    expect(d.maxB, tag).toBe(0);
    if (combo.weak === 'r' && combo.eye.leftLens === 'red') saveChannels(withLayer, 'e2e-sumo-idle');
  }
  await page.evaluate(() => {
    window.__rgDinoSumo!.layer(true);
    window.__rg!.setEye({ leftLens: 'red', weakEye: 'left' });
  });
});

test('Dino Sumo: a full round (first to 5 or 60 s) to the result card; E plays again (beat ring + balloons weak-only, 4 combos); R leaves', async () => {
  const r = await page.evaluate(async () => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const ds = window.__rgDinoSumo!;
    const stamps: string[] = [];
    const offStamp = ctx.events.on('stamp:earned', (e) => stamps.push(e.id));
    /** A child who tries: get on the centre side of the nearest friend, then belly-charge it. */
    const kid = (i: number): void => {
      const st = ds.state();
      if (!st) return;
      let best = Infinity;
      let tx = 0;
      let tz = 0;
      st.dinos.slice(1).forEach(([x, z, state]) => {
        const d = Math.hypot(x - st.px, z - st.pz);
        if (state === 'ok' && d < best) {
          best = d;
          tx = x;
          tz = z;
        }
      });
      const tl = Math.hypot(tx, tz) || 1;
      const sx = tx - (tx / tl) * 1.4;
      const sz = tz - (tz / tl) * 1.4;
      const lined = Math.hypot(sx - st.px, sz - st.pz) < 0.9;
      const [awx, , awz] = ds.world(lined ? tx : sx, 0, lined ? tz : sz);
      const p = ctx.player.position;
      let ex = awx - p.x;
      let ez = awz - p.z;
      const el = Math.hypot(ex, ez) || 1;
      ex /= el;
      ez /= el;
      const yaw = ctx.cameraRig.yaw;
      const s = Math.sin(yaw);
      const c = Math.cos(yaw);
      rg.inject({ moveX: -c * ex + s * ez, moveY: s * ex + c * ez, sprint: true, jumpPressed: lined && best < 2.4 && i % 4 === 0 });
    };
    (window as unknown as { __dsKid: (i: number) => void }).__dsKid = kid;
    (window as unknown as { __dsOff: () => void }).__dsOff = offStamp;
    (window as unknown as { __dsStamps: string[] }).__dsStamps = stamps;
    const [bx, , bz] = ds.booth();
    rg.teleport(bx, ctx.world.heightAt(bx, bz) + 0.1, bz);
    rg.step(1 / 60, 10, false);
    const focus = ctx.interactions.focused?.id ?? null;
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    for (let i = 0; i < 400 && ds.phase() === 'loading'; i++) {
      rg.step(1 / 60, 1, false);
      await new Promise((res) => setTimeout(res, 25));
    }
    const phaseAfterLoad = ds.phase();
    const startClock = ds.state()?.clock ?? -1;
    // Play until the hero bumps someone out (screenshot of the tumble), then on to the end.
    let i = 0;
    for (; i < 1200 && ds.phase() === 'round' && (ds.state()?.points[0] ?? 0) === 0; i++) {
      kid(i);
      rg.step(1 / 30, 1, false);
    }
    rg.inject(null);
    rg.step(1 / 60, 6, false);
    rg.step(1 / 60, 1);
    return { focus, phaseAfterLoad, startClock, koFrames: i, ko: (ds.state()?.points[0] ?? 0) > 0 };
  });
  if (r.ko) saveChannels(await canvasShot(page), 'e2e-sumo-ko');
  const r2 = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const ds = window.__rgDinoSumo!;
    const kid = (window as unknown as { __dsKid: (i: number) => void }).__dsKid;
    let maxPoints = 0;
    for (let i = 0; i < 2000 && ds.phase() === 'round'; i++) {
      kid(i);
      rg.step(1 / 20, 1, false);
      maxPoints = Math.max(maxPoints, ...(ds.state()?.points ?? [0]));
    }
    rg.inject(null);
    rg.step(1 / 60, 40, false);
    rg.step(1 / 60, 1);
    const st = ds.state();
    (window as unknown as { __dsOff: () => void }).__dsOff();
    return {
      phaseEnd: ds.phase(),
      clock: st?.clock ?? -1,
      points: st?.points ?? [],
      maxPoints,
      stamps: (window as unknown as { __dsStamps: string[] }).__dsStamps,
      mode: ctx.player.mode,
      card: document.querySelector('[data-testid="dinosumo-hud-result"]')?.classList.contains('on') ?? false,
    };
  });
  saveChannels(await canvasShot(page), 'e2e-sumo-result');
  console.log(`dino sumo: first KO after ${r.koFrames} frames (${r.ko}), final ${JSON.stringify(r2.points)} clock ${r2.clock.toFixed(1)}`);
  expect(r.focus).toBe('dinosumo');
  expect(r.phaseAfterLoad).toBe('round');
  expect(r.startClock).toBe(60);
  expect(r.ko).toBe(true);
  expect(r2.phaseEnd).toBe('result');
  expect(r2.clock).toBeGreaterThanOrEqual(0);
  expect(r2.maxPoints).toBeGreaterThan(0);
  expect(r2.stamps).toContain('dinoRing');
  expect(r2.mode).toBe('external');
  expect(r2.card).toBe(true);

  const again = await page.evaluate(() => {
    const rg = window.__rg!;
    const ds = window.__rgDinoSumo!;
    rg.step(1 / 60, 30, false); // the card ignores presses for its first moment
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    const phase = ds.phase();
    const clock = ds.state()?.clock;
    rg.step(1 / 60, 60 * 4, false);
    rg.step(1 / 60, 1);
    return { phase, clock };
  });
  saveChannels(await canvasShot(page), 'e2e-sumo-round');
  // Replays cost a ticket only when the economy is present; without it the game is free.
  expect(again.phase).toBe('round');
  expect(again.clock).toBe(60);
  // Live round: the weak-eye beat ring round the hero and the magic balloons, all 4 combos.
  expect(await page.evaluate(() => window.__rg!.ctx.vision.channels().weak)).toBe('r');
  for (const combo of COMBOS) {
    await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);
    const shots: PNG[] = [];
    for (const v of [true, false]) {
      await page.evaluate((on) => {
        window.__rgDinoSumo!.layer(on);
        window.__rg!.render();
      }, v);
      shots.push(await canvasShot(page));
    }
    const d = channelDiff(shots[0], shots[1]);
    const tag = `${combo.eye.leftLens}/${combo.eye.weakEye}`;
    expect(d[combo.weak], tag).toBeGreaterThan(100);
    expect(maxOf(d, combo.strong), tag).toBe(0);
    expect(d.maxB, tag).toBe(0);
  }
  await page.evaluate(() => {
    window.__rgDinoSumo!.layer(true);
    window.__rg!.setEye({ leftLens: 'red', weakEye: 'left' });
  });
  const left = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 20, false);
    return { mode: rg.ctx.player.mode, phase: window.__rgDinoSumo!.phase() };
  });
  expect(left).toEqual({ mode: 'walk', phase: 'idle' });
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
