/**
 * QA round 6 m8: one-shot lines are truly one-shot ("A present for you! A silly duck hat!" was said
 * at 25 s and again at 29.5 s after the story's jump line cut it short), and contextual lines are
 * gated on the real state ("Parachute now!" showed while walking on the ground after the trampoline).
 */
import { describe, expect, it } from 'vitest';
import { DialogueQueue, PRIORITY } from '../../src/buddy/dialogue';
import type { Line } from '../../src/buddy/dialogue';
import { Director } from '../../src/buddy/director';
import type { DirectorSink, DirectorView } from '../../src/buddy/director';
import { ECON } from '../../src/buddy/script';
import { createBuddyStore } from '../../src/buddy/store';

function run(q: DialogueQueue, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.05) q.update(0.05);
}

describe('one-shot and contextual lines (QA6 m8)', () => {
  it('an interrupted one-shot line is not replayed; a normal tip still is', () => {
    const q = new DialogueQueue();
    const shown: string[] = [];
    q.onChange = (a) => {
      if (a) shown.push(a.line.text);
    };
    q.say({ text: 'A present for you! A silly duck hat!', icon: 'hat', priority: PRIORITY.tip, once: true });
    run(q, 0.3);
    q.say({ text: 'Jump on the trampoline!', icon: 'wTrampoline', priority: PRIORITY.story });
    run(q, 20);
    expect(shown.filter((t) => t.startsWith('A present')).length).toBe(1);
    // Control: a plain tip cut short comes back.
    q.say({ text: 'Plain tip', icon: 'star', priority: PRIORITY.tip });
    run(q, 0.3);
    q.say({ text: 'Story beat', icon: 'pip', priority: PRIORITY.story });
    run(q, 20);
    expect(shown.filter((t) => t === 'Plain tip').length).toBe(2);
  });

  it('a waiting line whose moment has passed is dropped, not shown late', () => {
    const q = new DialogueQueue();
    const shown: string[] = [];
    q.onChange = (a) => {
      if (a) shown.push(a.line.text);
    };
    let falling = true;
    q.say({ text: 'Story beat', icon: 'pip', priority: PRIORITY.story });
    q.say({ text: 'Parachute now!', icon: 'parachute', priority: PRIORITY.tip, valid: () => falling });
    falling = false;
    run(q, 10);
    expect(shown).toEqual(['Story beat']);
    // Not valid when offered: dropped at once.
    expect(q.say({ text: 'Parachute now!', icon: 'parachute', priority: PRIORITY.tip, valid: () => false })).toBe('dropped');
  });

  const setup = () => {
    const said: Line[] = [];
    const q = new DialogueQueue();
    const shown: string[] = [];
    q.onChange = (a) => {
      if (a) shown.push(a.line.id ?? a.line.text);
    };
    const sink: DirectorSink = {
      say: (l) => {
        said.push(l);
        q.say(l);
      },
      lead: () => {},
      celebrate: () => {},
      bark: () => {},
      glasses: () => {},
      goal: () => ({ id: 'g', line: { text: 'Collect 10 Glow Gems!', icon: 'gem' } }),
      anchor: () => ({ x: 58, z: -24 }),
      places: () => [{ name: 'trampoline', x: 58, z: -24 }],
    };
    const d = new Director(sink, createBuddyStore(false), () => 0.5);
    const view = (over: Partial<DirectorView> = {}): DirectorView => ({
      hero: { x: 58, z: -24 },
      heroSpeed: 0,
      onFoot: true,
      ride: 'none',
      nearAttraction: 'trampoline',
      chestHint: null,
      keys: { use: 'E', jump: 'Space', skill: 'Q' },
      remaining: 300,
      hasMissions: true,
      busy: false,
      ...over,
    });
    const play = (seconds: number, over: Partial<DirectorView> = {}): void => {
      for (let t = 0; t < seconds; t += 0.05) {
        d.update(0.05, view({ busy: q.busy, ...over }));
        q.update(0.05);
      }
    };
    return { d, said, shown, play };
  };

  it('the duck-hat gift is shown once even when the story cuts it short', () => {
    const r = setup();
    r.d.begin(true);
    r.play(20);
    r.d.onGift();
    r.play(0.4);
    r.play(30, { nearAttraction: 'trampoline' });
    r.d.onGift();
    r.play(10);
    expect(r.shown.filter((id) => id === 'econ:gift').length).toBe(1);
    expect(r.said.filter((l) => l.text === ECON.gift.text).length).toBe(1);
  });

  it('"Parachute now!" only in a real skydive, and never after the fall', () => {
    const r = setup();
    r.d.begin(false);
    r.play(3);
    // A big trampoline bounce coming down fast: no parachute there.
    r.play(1, { ride: 'freefall', onFoot: false, inGame: true, chute: false });
    r.play(5);
    expect(r.said.some((l) => l.id === 'tip:chute')).toBe(false);
    // The balloon skydive: said at once, and dropped if the fall ends before it can show.
    r.play(0.5, { ride: 'freefall', onFoot: false, inGame: true, chute: true });
    expect(r.shown).toContain('tip:chute');
    const n = r.shown.filter((id) => id === 'tip:chute').length;
    r.play(10);
    expect(r.shown.filter((id) => id === 'tip:chute').length).toBe(n);
  });
});
