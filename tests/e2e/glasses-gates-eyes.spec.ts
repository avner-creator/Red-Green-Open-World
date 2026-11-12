/**
 * QA r7 m12: half-symbol gates scoring is the same for every lens/eye setting and every arch.
 * For all 4 lens/eye combinations × each of the 3 arches: the answer is forced to that arch, the
 * hero starts on the pad and RUNS (real input, real physics, sprint) to the arch's front and
 * straight through it → a hit for that arch; then a run through a different arch → a miss for that
 * arch. Deterministic: frozen time, stepped frames, input steered in the page every frame.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { boot } from './helpers';
import { COMBOS, setEye } from './glasses-helpers';

test.describe.configure({ mode: 'serial' });

type P3 = { x: number; y: number; z: number };
interface GatesDebug {
  state: string;
  phase: string;
  answer: number;
  yaw: number;
  pad: P3;
  arches: { front: P3; back: P3 }[];
  lastResult: { tier: number; hit: boolean; arch: number } | null;
}

let page: Page;
let consoleErrors: string[] = [];

const debug = (): Promise<GatesDebug> => page.evaluate(() => window.__rgGlasses!.debug('gates') as unknown as GatesDebug);
const force = (p: Record<string, unknown>): Promise<void> => page.evaluate((q) => window.__rgGlasses!.force('gates', q), p);

/** Steer with real move input (camera-relative, sprint) to each point in turn, one frame at a time. */
async function run(points: { x: number; z: number }[]): Promise<{ x: number; z: number }> {
  return page.evaluate((pts) => {
    const rg = window.__rg!;
    const cam = rg.ctx.camera;
    const f = cam.position.clone();
    for (const p of pts) {
      for (let i = 0; i < 240; i++) {
        const hp = rg.state().playerPosition;
        const dx = p.x - hp[0];
        const dz = p.z - hp[2];
        const d = Math.hypot(dx, dz);
        if (d < 0.35) break;
        cam.getWorldDirection(f);
        const yaw = Math.atan2(f.x, f.z);
        const s = Math.sin(yaw);
        const c = Math.cos(yaw);
        const ux = dx / d;
        const uz = dz / d;
        rg.inject({ moveY: s * ux + c * uz, moveX: -c * ux + s * uz, sprint: true });
        rg.step(1 / 60, 1, false);
      }
    }
    rg.inject(null);
    rg.step(1 / 60, 2, false);
    const hp = rg.state().playerPosition;
    return { x: hp[0], z: hp[2] };
  }, points);
}

/** A run from the pad through arch `i` and 2 m out past it. */
async function runThrough(d: GatesDebug, i: number): Promise<{ x: number; z: number }> {
  await page.evaluate(
    ({ p, yaw }) => {
      const rg = window.__rg!;
      rg.teleport(p.x, p.y + 0.05, p.z, yaw);
      rg.step(1 / 60, 3, false);
    },
    { p: d.pad, yaw: d.yaw + Math.PI },
  );
  const { front, back } = d.arches[i];
  // The half-symbol lectern stands between the pad and the middle arch: go round its side first
  // (layout-local (1.6, 0.1); the middle arch's front is local (0, archZ + 0.7) = (0, -1.9)).
  const c = Math.cos(d.yaw);
  const s = Math.sin(d.yaw);
  const m = d.arches[1].front;
  const side = { x: m.x + 1.6 * c + 2.0 * s, z: m.z - 1.6 * s + 2.0 * c };
  const L = Math.hypot(back.x - front.x, back.z - front.z);
  const out = { x: back.x + ((back.x - front.x) / L) * 2, z: back.z + ((back.z - front.z) / L) * 2 };
  return run(i === 1 ? [side, front, out] : [front, out]);
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 10, false);
    window.__rgGlasses!.goto('gates');
    rg.step(1 / 60, 30, false);
  });
});

test.afterAll(async () => {
  await page.close();
});

test('gates: running through an arch scores that arch, for all 4 lens/eye settings and all 3 arches', async () => {
  test.setTimeout(240_000);
  const rows: string[] = [];
  for (const [k, combo] of COMBOS.entries()) {
    await setEye(page, combo.eye);
    // The weak eye's half on the left for two settings, on the right for the other two.
    const weakSide = k % 2 ? 'right' : 'left';
    for (let i = 0; i < 3; i++) {
      // A hit: the answer is arch i, the hero runs through arch i.
      await force({ play: true });
      await force({ answer: i, weakSide });
      let d = await debug();
      expect(d.state, 'a run is on').toBe('open');
      expect(d.answer).toBe(i);
      await runThrough(d, i);
      d = await debug();
      const tag = `${combo.eye.leftLens}-left weak-${combo.eye.weakEye} arch ${i}`;
      rows.push(`${tag}: ${JSON.stringify(d.lastResult)}`);
      expect(d.lastResult, `${tag}: hit`).toMatchObject({ hit: true, arch: i });
      // A miss: the answer is arch i, the hero runs through the next arch.
      const j = (i + 1) % 3;
      await force({ play: true });
      await force({ answer: i, weakSide });
      d = await debug();
      const end = await runThrough(d, j);
      d = await debug();
      rows.push(`${tag} via ${j}: ${JSON.stringify(d.lastResult)} end ${end.x.toFixed(1)}, ${end.z.toFixed(1)}`);
      expect(d.lastResult, `${tag}: miss via ${j}`).toMatchObject({ hit: false, arch: j });
    }
  }
  console.info(rows.join('\n'));
  await setEye(page, COMBOS[0].eye);
  expect(consoleErrors).toEqual([]);
});
