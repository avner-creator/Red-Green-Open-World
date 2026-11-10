/**
 * Keeping the race clear of props: the lap is probed once (physics rays on a grid of lap distance ×
 * lateral offset) and a "safe line" is derived that stays close to the ideal racing line but keeps
 * a buggy's half-width plus a margin away from anything solid (stalls, benches, signs, rocks).
 * The racing-line glow, the boost pads, the friends' lanes and the test autopilot all use it, so
 * the race keeps working when other streams dress the roads. Pure maths here (unit-tested); the
 * probing itself is done by the caller.
 */

export interface Corridor {
  /** Samples along the lap (1 per `ds` metres). */
  readonly count: number;
  readonly ds: number;
  /** Lateral offsets probed, metres (+ = left). */
  readonly lats: readonly number[];
  /** blocked[i * lats.length + j] */
  readonly blocked: Uint8Array;
}

export function createCorridor(length: number, ds = 1, maxLat = 6, dLat = 0.25): Corridor {
  const count = Math.max(1, Math.round(length / ds));
  const lats: number[] = [];
  for (let l = -maxLat; l <= maxLat + 1e-6; l += dLat) lats.push(Math.round(l * 100) / 100);
  return { count, ds: length / count, lats, blocked: new Uint8Array(count * lats.length) };
}

/** Lateral distance from `lat` to the nearest blocked cell within ±`window` samples of `i`. */
export function clearance(c: Corridor, i: number, lat: number, window = 2): number {
  let best = Infinity;
  const nl = c.lats.length;
  for (let k = -window; k <= window; k++) {
    const ii = (((i + k) % c.count) + c.count) % c.count;
    for (let j = 0; j < nl; j++) {
      if (!c.blocked[ii * nl + j]) continue;
      const d = Math.abs(c.lats[j] - lat);
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * Safe line: a smooth lateral path (dynamic programming over the lap samples) that stays close to
 * `desired(s)`, keeps at least `need` metres from anything blocked, and drifts sideways at most
 * `maxSlope` metres per metre of lap (a buggy can follow it).
 */
export function safeLine(c: Corridor, desired: (s: number) => number, need = 2, maxSlope = 0.45, smooth = 2): number[] {
  const n = c.count;
  const step = 0.25;
  const lo = c.lats[0] + 0.5;
  const hi = c.lats[c.lats.length - 1] - 0.5;
  const states: number[] = [];
  for (let l = lo; l <= hi + 1e-6; l += step) states.push(Math.round(l * 100) / 100);
  const m = states.length;
  const reach = Math.max(1, Math.floor((maxSlope * c.ds) / step + 1e-6));
  // Node cost: distance from the ideal line, plus a steep price for being too close to a prop.
  const nodeCost = (i: number, k: number): number => {
    const l = states[k];
    const cl = clearance(c, i, l);
    const tight = cl >= need ? 0 : 40 + (need - cl) * 60;
    return Math.abs(l - desired(i * c.ds)) * 1 + tight;
  };
  const cost = new Float64Array(n * m);
  const from = new Int16Array(n * m);
  for (let k = 0; k < m; k++) cost[k] = nodeCost(0, k) + Math.abs(states[k] - desired(0)) * 20;
  for (let i = 1; i < n; i++) {
    for (let k = 0; k < m; k++) {
      let best = Infinity;
      let arg = k;
      for (let d = -reach; d <= reach; d++) {
        const kk = k + d;
        if (kk < 0 || kk >= m) continue;
        const v = cost[(i - 1) * m + kk] + d * d * 0.05;
        if (v < best) {
          best = v;
          arg = kk;
        }
      }
      cost[i * m + k] = best + nodeCost(i, k);
      from[i * m + k] = arg;
    }
  }
  // Close the loop gently: prefer ending near where we started.
  let k = 0;
  let best = Infinity;
  for (let kk = 0; kk < m; kk++) {
    const v = cost[(n - 1) * m + kk] + Math.abs(states[kk] - desired(0)) * 5;
    if (v < best) {
      best = v;
      k = kk;
    }
  }
  const line = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    line[i] = states[k];
    k = from[i * m + k];
  }
  // Light smoothing that never moves the line into a prop.
  for (let p = 0; p < 2; p++) {
    const prev = line.slice();
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let d = -smooth; d <= smooth; d++) sum += prev[(((i + d) % n) + n) % n];
      const v = sum / (smooth * 2 + 1);
      if (clearance(c, i, v) >= Math.min(need, clearance(c, i, prev[i]))) line[i] = v;
    }
  }
  return line;
}

/** Interpolate a per-sample line at lap distance `s`. */
export function lineAt(line: readonly number[], length: number, s: number): number {
  const n = line.length;
  const f = ((((s % length) + length) % length) / length) * n;
  const i = Math.floor(f) % n;
  const t = f - Math.floor(f);
  return line[i] + (line[(i + 1) % n] - line[i]) * t;
}

/** Move a friend's lateral towards the safe line when its own lane is not clear here. */
export function steerClear(c: Corridor, s: number, lateral: number, safe: number, dt: number, need = 1.45, rate = 5): number {
  const i = Math.round(((((s % (c.count * c.ds)) + c.count * c.ds) % (c.count * c.ds)) / c.ds)) % c.count;
  // Look a little ahead too, so they move over before reaching the obstacle.
  const ahead = Math.min(clearance(c, i, lateral, 2), clearance(c, (i + 4) % c.count, lateral, 2));
  if (ahead >= need) return lateral;
  const d = safe - lateral;
  return lateral + Math.max(-rate * dt, Math.min(rate * dt, d));
}
