/**
 * Pip's dialogue queue (pure, no DOM). Never more than one line on screen; a higher-priority line
 * interrupts a lower one; lower lines wait in a short queue and expire if they get stale.
 */
import type { BuddyPicto } from './types';

export const PRIORITY = { idle: 0, react: 1, tip: 2, story: 3 } as const;
export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY];

export type Mood = 'happy' | 'excited' | 'curious' | 'worried' | 'proud' | 'silly';

export interface Line {
  text: string;
  icon: BuddyPicto;
  priority: Priority;
  mood?: Mood;
  /** CSS selector of a HUD element Pip points at while saying this line. */
  callout?: string;
  /** Extra seconds on screen after the text is fully revealed. */
  hold?: number;
  /** Id for `onDone` bookkeeping (story steps). */
  id?: string;
  /** Seconds the line may wait in the queue before it is dropped (default by priority). */
  ttl?: number;
}

export interface ActiveLine {
  line: Line;
  /** Seconds since it started. */
  t: number;
  /** Seconds the typewriter needs. */
  reveal: number;
  /** Total seconds on screen. */
  duration: number;
}

/** Seconds per character of the typewriter (the voice speaks one syllable per letter at this rate). */
export const CHAR_SECONDS = 0.045;
export const MAX_QUEUE = 3;

const TTL: Record<Priority, number> = { 0: 1.5, 1: 2.5, 2: 12, 3: 60 };

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** How long a line stays up: typewriter + a reading hold that grows with the words. */
export function lineTiming(line: Line): { reveal: number; duration: number } {
  const reveal = line.text.length * CHAR_SECONDS;
  const hold = line.hold ?? 1.2 + wordCount(line.text) * 0.32;
  return { reveal, duration: reveal + hold };
}

interface Waiting {
  line: Line;
  age: number;
}

export class DialogueQueue {
  current: ActiveLine | null = null;
  private waiting: Waiting[] = [];
  /** Called when a line starts (UI + voice) and when it ends (null). */
  onChange: (active: ActiveLine | null) => void = () => {};
  onDone: (line: Line, interrupted: boolean) => void = () => {};

  get queued(): readonly Line[] {
    return this.waiting.map((w) => w.line);
  }

  get busy(): boolean {
    return this.current !== null;
  }

  /**
   * Offer a line. Returns 'now' (on screen), 'queued' or 'dropped'.
   * A strictly higher priority interrupts the current line; an equal or lower one waits.
   * Idle chatter is never queued (only said when Pip is free).
   */
  say(line: Line): 'now' | 'queued' | 'dropped' {
    const cur = this.current;
    if (!cur) {
      this.start(line);
      return 'now';
    }
    if (cur.line.text === line.text) return 'dropped';
    if (line.priority > cur.line.priority) {
      // A story/tip line that got interrupted goes back to the front of the queue.
      if (cur.line.priority >= PRIORITY.tip && cur.t < cur.reveal) this.enqueue(cur.line, true);
      this.finish(true);
      this.start(line);
      return 'now';
    }
    if (line.priority === PRIORITY.idle) return 'dropped';
    if (this.waiting.some((w) => w.line.text === line.text)) return 'dropped';
    return this.enqueue(line, false) ? 'queued' : 'dropped';
  }

  /** Drop everything below `minPriority` (e.g. when a menu opens). */
  clear(minPriority: Priority = PRIORITY.story): void {
    this.waiting = this.waiting.filter((w) => w.line.priority >= minPriority);
    if (this.current && this.current.line.priority < minPriority) this.finish(true);
  }

  /** Skip the current line (tap on the bubble). */
  skip(): void {
    if (!this.current) return;
    this.finish(false);
    this.next();
  }

  update(dt: number): void {
    for (const w of this.waiting) w.age += dt;
    this.waiting = this.waiting.filter((w) => w.age <= (w.line.ttl ?? TTL[w.line.priority]));
    const cur = this.current;
    if (cur) {
      cur.t += dt;
      if (cur.t >= cur.duration) {
        this.finish(false);
        this.next();
      }
    } else this.next();
  }

  /** 0..1 of the typewriter, or 1 when nothing is shown. */
  revealFraction(): number {
    const c = this.current;
    if (!c) return 1;
    return c.reveal <= 0 ? 1 : Math.min(1, c.t / c.reveal);
  }

  private enqueue(line: Line, front: boolean): boolean {
    const w = { line, age: 0 };
    if (front) this.waiting.unshift(w);
    else {
      // Keep the queue sorted by priority (stable within a priority).
      const i = this.waiting.findIndex((x) => x.line.priority < line.priority);
      if (i < 0) this.waiting.push(w);
      else this.waiting.splice(i, 0, w);
    }
    if (this.waiting.length > MAX_QUEUE) {
      // Drop the lowest-priority, oldest line.
      let worst = 0;
      for (let i = 1; i < this.waiting.length; i++) {
        const a = this.waiting[i];
        const b = this.waiting[worst];
        if (a.line.priority < b.line.priority || (a.line.priority === b.line.priority && a.age > b.age)) worst = i;
      }
      const dropped = this.waiting.splice(worst, 1)[0];
      return dropped !== w;
    }
    return true;
  }

  private start(line: Line): void {
    const { reveal, duration } = lineTiming(line);
    this.current = { line, t: 0, reveal, duration };
    this.onChange(this.current);
  }

  private finish(interrupted: boolean): void {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    this.onDone(cur.line, interrupted);
    this.onChange(null);
  }

  private next(): void {
    const w = this.waiting.shift();
    if (w) this.start(w.line);
  }
}
