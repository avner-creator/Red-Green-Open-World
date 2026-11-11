/**
 * Pip's dialogue queue (pure, no DOM). Never more than one line on screen; a higher-priority line
 * interrupts a lower one; lower lines wait in a short queue and expire if they get stale.
 */
import type { ActionGlyph, BuddyPicto } from './types';

export const PRIORITY = { idle: 0, react: 1, tip: 2, story: 3 } as const;
export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY];

export type Mood = 'happy' | 'excited' | 'curious' | 'worried' | 'proud' | 'silly';

export interface Line {
  text: string;
  icon: BuddyPicto;
  /** The button/stick/gesture to use, drawn for the active input device (key cap, pad button, touch). */
  action?: ActionGlyph;
  /** A second pictogram after the action (the thing: trampoline, gem...). */
  extra?: BuddyPicto;
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
  /** Pure praise / reaction: spoken with no bubble when Pip's voice is audible. */
  praise?: boolean;
  /** May cut a story line short (the child asked, or skipped). Other story lines wait their turn. */
  interrupt?: boolean;
  /**
   * One-shot line (a one-time tip, an economy first): never replayed after an interruption, so the
   * child never hears it twice (QA6 m8: "A present for you!" at 25 s and again at 29.5 s).
   */
  once?: boolean;
  /**
   * Context check for a line that only makes sense in a certain state ("Parachute now!" only in
   * freefall, a chest hint only at the chest): a waiting line that is no longer valid is dropped
   * instead of shown late.
   */
  valid?: () => boolean;
}

/** A line whose clip is still playing is held at most this many seconds past its planned end. */
export const VOICE_HOLD_MAX = 6;

export type BubbleMode = 'none' | 'compact' | 'full';

/**
 * How a line shows: with Pip's voice audible (voice on, audio unlocked, a clip exists) only a
 * compact pictogram bubble, or nothing for pure praise; with no voice the full text bubble.
 */
export function bubbleMode(line: Pick<Line, 'praise'>, audible: boolean): BubbleMode {
  if (!audible) return 'full';
  return line.praise ? 'none' : 'compact';
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

/**
 * How long a line stays up: typewriter + a reading hold that grows with the words. With a spoken
 * clip of `clipSeconds`, the typewriter follows the voice (the words appear as Pip says them) and
 * the bubble stays up at least until the clip has finished, plus a short beat.
 */
export function lineTiming(line: Line, clipSeconds: number | null = null): { reveal: number; duration: number } {
  let reveal = line.text.length * CHAR_SECONDS;
  const hold = line.hold ?? 1.2 + wordCount(line.text) * 0.32;
  if (clipSeconds && clipSeconds > 0) {
    reveal = Math.max(reveal, clipSeconds * 0.85);
    return { reveal, duration: Math.max(reveal + hold, clipSeconds + 0.35) };
  }
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
  /** Seconds of the line's voice clip, when known (keeps the bubble up while Pip talks). */
  clipSeconds: (line: Line) => number | null = () => null;
  /** True while the voice is still saying the current line (it is never cut mid-word). */
  talking: () => boolean = () => false;

  get queued(): readonly Line[] {
    return this.waiting.map((w) => w.line);
  }

  get busy(): boolean {
    return this.current !== null;
  }

  /**
   * Offer a line. Returns 'now' (on screen), 'queued' or 'dropped'.
   * A strictly higher priority interrupts the current line (a story line also replaces another
   * story line); an equal or lower one waits.
   * Idle chatter is never queued (only said when Pip is free).
   */
  say(line: Line): 'now' | 'queued' | 'dropped' {
    if (line.valid && !line.valid()) return 'dropped';
    const cur = this.current;
    if (!cur) {
      this.start(line);
      return 'now';
    }
    if (cur.line.text === line.text) return 'dropped';
    // A story line waits for the one being told (unless it may interrupt: the child asked or
    // skipped); otherwise only a strictly higher priority interrupts.
    const storyBeat = line.priority === PRIORITY.story && cur.line.priority === PRIORITY.story && !!line.interrupt;
    if (line.priority > cur.line.priority || storyBeat) {
      // A tip line that got interrupted goes back to the front of the queue.
      if (!storyBeat && cur.line.priority >= PRIORITY.tip && cur.t < cur.reveal && !cur.line.once) this.enqueue(cur.line, true);
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
      if (cur.t >= cur.duration && !(this.talking() && cur.t < cur.duration + VOICE_HOLD_MAX)) {
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
    const { reveal, duration } = lineTiming(line, this.clipSeconds(line));
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
    let w = this.waiting.shift();
    while (w && w.line.valid && !w.line.valid()) w = this.waiting.shift();
    if (w) this.start(w.line);
  }
}
