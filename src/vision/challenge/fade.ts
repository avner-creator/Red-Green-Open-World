/**
 * A per-layer fade value (0..1, 1 = normal) that glides to a new target over a given time with a
 * smoothstep curve. Advanced only by the `dt` it is given, so a 0-dt render never moves it.
 */
const clamp01 = (v: number): number => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1));

export class LayerFade {
  private from = 1;
  private to = 1;
  private duration = 0;
  private t = 0;
  value = 1;

  set(fade: number, seconds = 0): void {
    const target = clamp01(fade);
    if (!(seconds > 0)) {
      this.from = this.to = this.value = target;
      this.duration = this.t = 0;
      return;
    }
    this.from = this.value;
    this.to = target;
    this.duration = seconds;
    this.t = 0;
  }

  get target(): number {
    return this.to;
  }

  update(dt: number): number {
    if (this.value === this.to || !(dt > 0)) return this.value;
    this.t = Math.min(this.duration, this.t + dt);
    const x = this.duration > 0 ? this.t / this.duration : 1;
    this.value = x >= 1 ? this.to : this.from + (this.to - this.from) * x * x * (3 - 2 * x);
    return this.value;
  }
}
