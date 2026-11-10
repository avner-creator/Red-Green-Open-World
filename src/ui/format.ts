/** Pure helpers: time formatting and small maths. */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds : 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** Fraction of time left, clamped 0..1. */
export function timeFraction(remaining: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.min(1, Math.max(0, remaining / total));
}

export function percent(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function counterText(count: number, total: number): string {
  return total > 0 ? `${count}/${total}` : `${count}`;
}
