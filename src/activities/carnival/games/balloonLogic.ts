/** Balloon Pop rules (pure): the balloon wall grid, prize slots and aim assist. */

export const COLS = 6;
export const ROWS = 4;
export const WALL_Z = -4.2;
export const PRIZE_COUNT = 4;
export const PRIZE_POINTS = 3;
/** Generous aim assist: a throw within this distance (m, on the wall) of a balloon hits it. */
export const ASSIST_RADIUS = 0.62;
export const RESPAWN = 1.6;
export const PRIZE_RESPAWN = 2.6;

export function slotXY(i: number): [number, number] {
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  return [-2.0 + c * 0.8, 1.5 + r * 0.5];
}

/** Pick `n` distinct prize slots, spread over the wall (no two side by side in a row). */
export function pickPrizeSlots(rng: () => number, n = PRIZE_COUNT, total = COLS * ROWS): number[] {
  const out: number[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 500) {
    const i = Math.floor(rng() * total);
    if (out.includes(i)) continue;
    if (out.some((j) => Math.floor(j / COLS) === Math.floor(i / COLS) && Math.abs((j % COLS) - (i % COLS)) < 2)) continue;
    out.push(i);
  }
  return out;
}

export interface AssistTarget {
  index: number;
  x: number;
  y: number;
}

/** Nearest candidate within `radius` of the aim point (x, y on the wall), or null. */
export function assistPick(aimX: number, aimY: number, candidates: readonly AssistTarget[], radius = ASSIST_RADIUS): AssistTarget | null {
  let best: AssistTarget | null = null;
  let bestD = radius;
  for (const c of candidates) {
    const d = Math.hypot(c.x - aimX, c.y - aimY);
    if (d <= bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}
