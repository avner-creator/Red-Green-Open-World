import { describe, expect, it } from 'vitest';
import { DialogueQueue, MAX_QUEUE, PRIORITY, lineTiming } from '../../src/buddy/dialogue';
import type { Line } from '../../src/buddy/dialogue';

const L = (text: string, priority: Line['priority'], extra: Partial<Line> = {}): Line => ({ text, icon: 'gem', priority, ...extra });

function run(q: DialogueQueue, seconds: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) q.update(dt);
}

describe('DialogueQueue', () => {
  it('shows one line at a time and plays the queue in order', () => {
    const q = new DialogueQueue();
    const shown: string[] = [];
    q.onChange = (a) => a && shown.push(a.line.text);
    expect(q.say(L('one', PRIORITY.tip))).toBe('now');
    expect(q.say(L('two', PRIORITY.tip))).toBe('queued');
    expect(q.current?.line.text).toBe('one');
    run(q, lineTiming(L('one', PRIORITY.tip)).duration + 0.1);
    expect(q.current?.line.text).toBe('two');
    expect(shown).toEqual(['one', 'two']);
  });

  it('a higher priority interrupts; equal or lower waits', () => {
    const q = new DialogueQueue();
    q.say(L('react', PRIORITY.react));
    expect(q.say(L('story', PRIORITY.story))).toBe('now');
    expect(q.current?.line.text).toBe('story');
    expect(q.say(L('tip', PRIORITY.tip))).toBe('queued');
    expect(q.current?.line.text).toBe('story');
  });

  it('a story line waits for the one being told; only an "interrupt" line (the child asked) cuts in', () => {
    const q = new DialogueQueue();
    q.say(L('step one', PRIORITY.story));
    expect(q.say(L('step two', PRIORITY.story))).toBe('queued');
    expect(q.current?.line.text).toBe('step one');
    expect(q.say({ ...L('asked', PRIORITY.story), interrupt: true })).toBe('now');
    expect(q.current?.line.text).toBe('asked');
  });

  it('a line is held while the voice is still saying it (never cut mid-word), up to a limit', () => {
    const q = new DialogueQueue();
    let talking = true;
    q.talking = () => talking;
    q.say(L('a long clip', PRIORITY.story));
    const d = q.current!.duration;
    for (let t = 0; t < d + 2; t += 0.1) q.update(0.1);
    expect(q.current?.line.text).toBe('a long clip');
    talking = false;
    q.update(0.1);
    expect(q.current).toBeNull();
    talking = true;
    q.say(L('stuck voice', PRIORITY.story));
    for (let t = 0; t < 30; t += 0.1) q.update(0.1);
    expect(q.current).toBeNull();
  });

  it('an interrupted tip line comes back first', () => {
    const q = new DialogueQueue();
    q.say(L('tour step', PRIORITY.tip));
    q.update(0.05);
    q.say(L('important', PRIORITY.story));
    expect(q.queued[0]?.text).toBe('tour step');
  });

  it('never queues idle chatter and drops stale reactions', () => {
    const q = new DialogueQueue();
    q.say(L('busy', PRIORITY.story));
    expect(q.say(L('idle', PRIORITY.idle))).toBe('dropped');
    expect(q.say(L('wow', PRIORITY.react))).toBe('queued');
    run(q, 3); // reaction ttl is 2.5 s, the story line is still showing
    expect(q.queued.map((l) => l.text)).not.toContain('wow');
  });

  it('keeps the queue short, dropping the lowest priority first', () => {
    const q = new DialogueQueue();
    q.say(L('now', PRIORITY.story));
    q.say(L('r1', PRIORITY.react));
    q.say(L('t1', PRIORITY.tip));
    q.say(L('t2', PRIORITY.tip));
    q.say(L('t3', PRIORITY.tip));
    expect(q.queued.length).toBe(MAX_QUEUE);
    expect(q.queued.map((l) => l.text)).toEqual(['t1', 't2', 't3']);
  });

  it('ignores duplicates of the line on screen or in the queue', () => {
    const q = new DialogueQueue();
    q.say(L('same', PRIORITY.tip));
    expect(q.say(L('same', PRIORITY.tip))).toBe('dropped');
    q.say(L('next', PRIORITY.tip));
    expect(q.say(L('next', PRIORITY.tip))).toBe('dropped');
  });

  it('typewriter fraction grows to 1 and skip moves on', () => {
    const q = new DialogueQueue();
    q.say(L('hello there', PRIORITY.tip));
    q.say(L('second', PRIORITY.tip));
    expect(q.revealFraction()).toBe(0);
    q.update(0.1);
    expect(q.revealFraction()).toBeGreaterThan(0);
    q.skip();
    expect(q.current?.line.text).toBe('second');
  });
});
