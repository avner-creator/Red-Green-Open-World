import { describe, expect, it } from 'vitest';
import { StuckWatch, UNSTICK, rPressAction, stuckThrottle, type StuckSample } from '../../src/activities/race/unstick';

const DT = 1 / 60;
const run = (w: StuckWatch, s: Omit<StuckSample, 'dt'>, seconds: number, grow = 0): { reason: string | null; at: number } => {
  let p = s.progress;
  for (let t = 0; t < seconds; t += DT) {
    p += grow * DT;
    const r = w.update({ ...s, progress: p, dt: DT });
    if (r) return { reason: r, at: t };
  }
  return { reason: null, at: seconds };
};

describe('race stuck watch (QA5 M3)', () => {
  const driving = { speed: 12, throttle: 1, upY: 1, offTrack: 1, progress: 0 };

  it('never fires while racing normally', () => {
    const w = new StuckWatch();
    w.reset(0);
    expect(run(w, driving, 120, 12).reason).toBeNull();
  });

  it('wedged: throttle held, not moving, for 2.5 s', () => {
    const w = new StuckWatch();
    w.reset(0);
    const r = run(w, { ...driving, speed: 0.2 }, 10);
    expect(r.reason).toBe('wedged');
    expect(r.at).toBeGreaterThan(UNSTICK.wedgedSeconds - 0.1);
    expect(r.at).toBeLessThan(UNSTICK.wedgedSeconds + 0.1);
  });

  it('a stop with no throttle is not "wedged" (a child may just wait)', () => {
    const w = new StuckWatch();
    w.reset(0);
    expect(run(w, { ...driving, speed: 0, throttle: 0 }, 12).reason).toBeNull();
  });

  it('flipped: on its side for 1.5 s', () => {
    const w = new StuckWatch();
    w.reset(0);
    const r = run(w, { ...driving, upY: 0.1 }, 5, 12);
    expect(r.reason).toBe('flipped');
    expect(r.at).toBeLessThan(UNSTICK.flippedSeconds + 0.1);
  });

  it('lost: far off the track for 4 s, or no forward progress for 8 s', () => {
    const w = new StuckWatch();
    w.reset(0);
    expect(run(w, { ...driving, offTrack: 30 }, 10, 12).reason).toBe('lost');
    w.reset(0);
    const r = run(w, { ...driving, speed: 6 }, 20, 0); // circling on the grass, moving but going nowhere
    expect(r.reason).toBe('lost');
    expect(r.at).toBeGreaterThan(UNSTICK.noProgressSeconds - 0.1);
  });

  it('R: first press resets, a second within 2 s leaves, a later one resets again', () => {
    expect(rPressAction(10, null)).toBe('reset');
    expect(rPressAction(11.5, 10)).toBe('leave');
    expect(rPressAction(13, 10)).toBe('reset');
  });

  it('reversing (S or the left trigger) into scenery counts as throttle: wedged resets it (QA6 m1)', () => {
    expect(stuckThrottle(-1, 0, 0)).toBe(1);
    expect(stuckThrottle(0, 0, 1)).toBe(1);
    expect(stuckThrottle(1, 0, 0)).toBe(1);
    expect(stuckThrottle(0, 0, 0)).toBe(0);
    const w = new StuckWatch();
    w.reset(-21);
    const r = run(w, { speed: 0, throttle: stuckThrottle(-1, 0, 0), upY: 1, offTrack: 3, progress: -21 }, 25);
    expect(r.reason).toBe('wedged');
    expect(r.at).toBeLessThan(UNSTICK.wedgedSeconds + 0.1);
  });
});
