/**
 * Seeing matters: a simulated hero who can see the flies (heads for the nearest one, jumps for
 * high ones) must catch far more per minute than one who cannot (lawn-mower laps at sprint
 * speed with random jumps). Pure simulation on the real swarm logic and tuning.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../src/config';
import { FLIES } from '../../src/activities/glasses/glowflies/constants';
import { Swarm } from '../../src/activities/glasses/glowflies/logic';
import type { PatchShape, V3 } from '../../src/activities/glasses/glowflies/logic';
import { seededRng } from '../../src/activities/glasses/idle';

const R = FLIES.roamRadius;
const patch: PatchShape = { radius: R, avoid: [{ x: -3, z: 6, r: FLIES.boardClear }] };
const DT = 1 / 30;
const CHEST = PLAYER.height / 2;

interface Hero {
  x: number;
  z: number;
  y: number;
  vy: number;
  grounded: boolean;
}

function jump(h: Hero): void {
  if (!h.grounded) return;
  h.vy = PLAYER.jumpSpeed;
  h.grounded = false;
}

function physics(h: Hero): void {
  if (h.grounded) return;
  h.vy -= PLAYER.gravity * DT;
  h.y += h.vy * DT;
  if (h.y <= 0) {
    h.y = 0;
    h.vy = 0;
    h.grounded = true;
  }
}

function moveTo(h: Hero, tx: number, tz: number): void {
  const dx = tx - h.x;
  const dz = tz - h.z;
  const d = Math.hypot(dx, dz);
  const step = PLAYER.sprintSpeed * DT;
  if (d <= step) {
    h.x = tx;
    h.z = tz;
  } else {
    h.x += (dx / d) * step;
    h.z += (dz / d) * step;
  }
}

type Brain = (h: Hero, s: Swarm, t: number, rng: () => number) => void;

/** Sees the flies: runs to the nearest one, jumps when it is above reach. */
const seeing: Brain = (h, s) => {
  let best: V3 | null = null;
  let bd = Infinity;
  for (const f of s.flies) {
    if (f.state !== 'alive') continue;
    const p = s.position(f);
    const d = Math.hypot(p.x - h.x, p.z - h.z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  if (!best) return;
  moveTo(h, best.x, best.z);
  if (bd < 2.2 && best.y - CHEST > FLIES.catchRadius * 0.8) jump(h);
};

/** Cannot see them: lawn-mower laps over the roaming disc (rows 2 m apart), random jumps. */
function blind(): Brain {
  let row = -R;
  let dir = 1;
  let target: { x: number; z: number } | null = null;
  return (h, _s, _t, rng) => {
    if (!target || (Math.abs(h.x - target.x) < 0.05 && Math.abs(h.z - target.z) < 0.05)) {
      const half = Math.sqrt(Math.max(0, R * R - row * row));
      if (target && Math.abs(h.x - dir * half) < 0.1) {
        row += 2;
        if (row > R) row = -R;
        dir = -dir;
        const h2 = Math.sqrt(Math.max(0, R * R - row * row));
        target = { x: -dir * h2, z: row };
      } else target = { x: dir * half, z: row };
    }
    moveTo(h, target.x, target.z);
    if (rng() < 1.2 * DT) jump(h);
  };
}

/** Catches per minute over `minutes` for a brain, averaged over a few seeds. */
function catchRate(make: () => Brain, minutes = 6, seeds = [1, 2, 3, 4, 5, 6, 7, 8]): number {
  let total = 0;
  for (const seed of seeds) {
    const swarm = new Swarm({ rng: seededRng(seed), patch, toWorld: (x, z) => ({ x, z }), groundAt: () => 0 });
    const rng = seededRng(seed * 31 + 7);
    const brain = make();
    const h: Hero = { x: 0, z: R + 1, y: 0, vy: 0, grounded: true };
    let prev: V3 = { x: h.x, y: CHEST, z: h.z };
    for (let t = 0; t < minutes * 60; t += DT) {
      brain(h, swarm, t, rng);
      physics(h);
      const cur: V3 = { x: h.x, y: h.y + CHEST, z: h.z };
      total += swarm.catchAlong(prev, cur).length;
      swarm.update(DT, true, cur);
      prev = cur;
    }
  }
  return total / (minutes * seeds.length);
}

describe('glow-flies: seeing them matters', () => {
  it('a seeing hero catches at least 4× as many as a blind lawn-mower', () => {
    const see = catchRate(() => seeing);
    const blindRate = catchRate(blind);
    console.log(`glow-flies catches/min: seeing ${see.toFixed(1)}, blind ${blindRate.toFixed(1)}, ratio ${(see / Math.max(blindRate, 1e-6)).toFixed(1)}`);
    expect(see).toBeGreaterThan(3);
    expect(see).toBeGreaterThanOrEqual(4 * blindRate);
  });
});
