/**
 * Seeing matters, against the REAL round rules: a simulated hero starts on the pad at the meadow's
 * edge; after 3-2-1-GO the flies come out and the round runs for `FLY_RULES.time` seconds or until
 * 5 catches. One who can see the flies (heads for the nearest one, jumps for high ones) must reach
 * the prize (3 catches) in > 90 % of rounds; a blind lawn-mower (laps at sprint speed with random
 * jumps) in < 15 %. Gems per minute include walking back to the pad between rounds.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../src/config';
import { RoundMachine } from '../../src/activities/glasses/booth/round';
import type { RoundEvent } from '../../src/activities/glasses/booth/round';
import { FLIES } from '../../src/activities/glasses/glowflies/constants';
import { Swarm } from '../../src/activities/glasses/glowflies/logic';
import type { Fly, PatchShape, V3 } from '../../src/activities/glasses/glowflies/logic';
import { flyBoothCentre, flyBoothFootprint, FLY_PAD, FLY_RULES } from '../../src/activities/glasses/glowflies/round';
import { seededRng } from '../../src/activities/glasses/idle';
import { auditDemo } from '../../src/activities/glasses/booth/legibility';
import { GLASSES } from '../../src/activities/glasses/constants';
import { GLOWFLIES_DEMO } from '../../src/activities/glasses/glowflies/demo';
import type { GlassesTier } from '../../src/types';

const R = FLIES.roamRadius;
const patch: PatchShape = {
  radius: R,
  avoid: [
    { x: flyBoothCentre().x, z: flyBoothCentre().z, r: FLIES.boothClear },
    { x: 2.4, z: 3.2, r: FLIES.jarClear },
  ],
};
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

function moveTo(h: Hero, tx: number, tz: number, speed: number = PLAYER.sprintSpeed): boolean {
  const dx = tx - h.x;
  const dz = tz - h.z;
  const d = Math.hypot(dx, dz);
  const step = speed * DT;
  if (d <= step) {
    h.x = tx;
    h.z = tz;
    return true;
  }
  h.x += (dx / d) * step;
  h.z += (dz / d) * step;
  return false;
}

type Brain = (h: Hero, s: Swarm, rng: () => number) => void;

/** Sees the flies: runs to the nearest one, jumps when it is above reach. */
const seeing = (): Brain => chaser(PLAYER.sprintSpeed, 0);
/** A slower child who sees them: walks (no sprint) and takes 0.6 s to pick the next fly. */
const walker = (): Brain => chaser(PLAYER.walkSpeed, 0.6);

function chaser(speed: number, think: number): Brain {
  let wait = 0;
  let aim: Fly | null = null;
  return (h, s) => {
    if (!aim || aim.state !== 'alive') {
      aim = null;
      wait += DT;
      if (wait < think) return;
      wait = 0;
      let bd = Infinity;
      for (const f of s.flies) {
        if (f.state !== 'alive') continue;
        const p = s.position(f);
        const d = Math.hypot(p.x - h.x, p.z - h.z);
        if (d < bd) {
          bd = d;
          aim = f;
        }
      }
      if (!aim) return;
    }
    const p = s.position(aim);
    const d = Math.hypot(p.x - h.x, p.z - h.z);
    moveTo(h, p.x, p.z, speed);
    if (d < 2.2 && p.y - CHEST > FLIES.catchRadius * 0.8) jump(h);
  };
}

/** Cannot see them: lawn-mower laps over the roaming disc (rows 2 m apart), random jumps. */
function blind(): Brain {
  let row = -R;
  let dir = 1;
  let target: { x: number; z: number } | null = null;
  return (h, _s, rng) => {
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

interface RunStats {
  rounds: number;
  prized: number;
  catches: number[];
  gemsPerMinute: number;
  nearMisses: number;
}

/**
 * Play `minutes` of rounds with the real round machine: start on the pad, countdown, the timed
 * round, celebration / prize / cool-down, then run back to the pad and start again.
 */
function playRounds(make: () => Brain, seed: number, minutes: number, fixedTier?: GlassesTier): RunStats {
  const m = new RoundMachine(FLY_RULES);
  const rng = seededRng(seed * 31 + 7);
  const h: Hero = { x: FLY_PAD.x, z: FLY_PAD.z, y: 0, vy: 0, grounded: true };
  let swarm = null as Swarm | null;
  let brain = make();
  let gems = 0;
  let near = 0;
  let prized = 0;
  const catches: number[] = [];
  let prev: V3 = { x: h.x, y: CHEST, z: h.z };
  let k = 0;
  for (let t = 0; t < minutes * 60; t += DT) {
    if (fixedTier) m.tier = fixedTier;
    if (m.phase === 'idle') {
      // Back to the pad, then step on it (starts the round).
      if (moveTo(h, FLY_PAD.x, FLY_PAD.z)) m.start();
    }
    const onEvents = (events: RoundEvent[]): void => {
      for (const e of events) {
        if (e.type === 'try' && e.index === 0) {
        swarm = new Swarm({ rng: seededRng(seed * 1000 + k++), patch, toWorld: (x, z) => ({ x, z }), groundAt: () => 0, tier: e.tier });
          brain = make();
        } else if (e.type === 'end') {
          catches.push(e.hits);
          if (e.hits >= FLY_RULES.minHits) prized++;
          swarm = null;
        } else if (e.type === 'pay') gems += e.gems;
      }
    };
    // The kit's timed round: the machine ends the play when the time is up.
    onEvents(m.step(DT));
    const playing = swarm !== null && m.phase === 'play';
    if (playing && swarm) brain(h, swarm, rng);
    physics(h);
    const cur: V3 = { x: h.x, y: h.y + CHEST, z: h.z };
    if (playing && swarm) {
      // Every catch lights the next lamp (the 5th ends the round).
      for (let n = swarm.catchAlong(prev, cur).length; n > 0 && m.phase === 'play'; n--) onEvents(m.report(true));
      // (`onEvents` may have ended the round and taken the flies home.)
      const still = swarm as Swarm | null;
      for (const ev of still?.update(DT, true, cur) ?? []) if (ev.type === 'miss') near++;
    }
    prev = cur;
  }
  return { rounds: catches.length, prized, catches, gemsPerMinute: gems / minutes, nearMisses: near };
}

function stats(make: () => Brain, fixedTier?: GlassesTier, seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], minutes = 10): { share: number; mean: number; gemsPerMinute: number; rounds: number } {
  let rounds = 0;
  let prized = 0;
  let caught = 0;
  let gpm = 0;
  for (const s of seeds) {
    const r = playRounds(make, s, minutes, fixedTier);
    rounds += r.rounds;
    prized += r.prized;
    caught += r.catches.reduce((a, b) => a + b, 0);
    gpm += r.gemsPerMinute;
  }
  return { share: prized / Math.max(1, rounds), mean: caught / Math.max(1, rounds), gemsPerMinute: gpm / seeds.length, rounds };
}

describe('glow-flies rounds: seeing them matters', () => {
  for (const tier of [1, 2, 3] as const) {
    it(`tier ${tier}: a seeing hero reaches the prize in > 90 % of rounds, a blind lawn-mower in < 15 %`, () => {
      const see = stats(seeing, tier);
      const walk = stats(walker, tier);
      const bl = stats(blind, tier);
      console.info(
        `glow-flies tier ${tier}: seeing ${(see.share * 100).toFixed(0)} % prized (${see.mean.toFixed(1)} catches, ${see.gemsPerMinute.toFixed(1)} gems/min, ${see.rounds} rounds); ` +
          `blind ${(bl.share * 100).toFixed(0)} % (${bl.mean.toFixed(1)} catches, ${bl.gemsPerMinute.toFixed(2)} gems/min, ${bl.rounds} rounds)`,
      );
      console.info(`glow-flies tier ${tier}: walking child ${(walk.share * 100).toFixed(0)} % prized (${walk.mean.toFixed(1)} catches, ${walk.gemsPerMinute.toFixed(1)} gems/min)`);
      expect(see.share).toBeGreaterThan(0.9);
      expect(walk.share).toBeGreaterThan(0.9);
      expect(bl.share).toBeLessThan(0.15);
      expect(bl.gemsPerMinute).toBeLessThanOrEqual(6);
    });
  }

  it('gems per minute: a seeing child ≥ 25 at tier 1 (and more climbing the tiers), a blind one ≤ 6', () => {
    const t1 = stats(seeing, 1);
    const st = stats(seeing);
    const bl = stats(blind);
    console.info(`glow-flies gems/min: seeing tier 1 ${t1.gemsPerMinute.toFixed(1)}, staircase ${st.gemsPerMinute.toFixed(1)}; blind staircase ${bl.gemsPerMinute.toFixed(2)}`);
    expect(t1.gemsPerMinute).toBeGreaterThanOrEqual(25);
    expect(st.gemsPerMinute).toBeGreaterThanOrEqual(t1.gemsPerMinute * 0.95);
    expect(bl.gemsPerMinute).toBeLessThanOrEqual(6);
  });

  it('time up ends the round quietly with the catches so far', () => {
    const m = new RoundMachine(FLY_RULES);
    m.start();
    for (let i = 0; i < 400 && m.phase !== 'play'; i++) m.step(DT);
    for (let i = 0; i < 3; i++) {
      m.report(true);
      m.step(DT);
    }
    expect(m.phase).toBe('play');
    expect(m.results).toEqual([true, true, true]);
    const ev: RoundEvent[] = [];
    for (let t = 0; t < (FLY_RULES.time ?? 0) && m.phase === 'play'; t += DT) ev.push(...m.step(DT));
    expect(ev).toContainEqual({ type: 'end', hits: 3, gems: FLY_RULES.prize[1][3] });
    expect(m.results, 'no result for the catches never made').toEqual([true, true, true]);
  });

  it('the demo is legible (the kit\'s auditDemo) and the booth stays inside the site', () => {
    const audit = auditDemo(GLOWFLIES_DEMO);
    console.info(`glow-flies demo: hero ${audit.minHeroPx.toFixed(0)} px at 8 m, ≤ ${audit.maxThings} pictures a frame`);
    expect(audit.problems).toEqual([]);
    for (const p of flyBoothFootprint()) expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(GLASSES.siteRadius + 0.4);
  });
});
