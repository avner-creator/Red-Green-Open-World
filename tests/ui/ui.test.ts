import { describe, expect, it } from 'vitest';
import { counterText, formatTime, timeFraction } from '../../src/ui/format';
import { checkAnswer, GATE_HOLD_SECONDS, makeGateQuestion, stepHold } from '../../src/ui/gate';
import { pickNext, tabNext } from '../../src/ui/nav';
import { ALL_ICON_NAMES, iconSvg } from '../../src/ui/icons';
import { outfitIcon } from '../../src/ui/glyphs';

describe('format', () => {
  it('formats m:ss, rounding up', () => {
    expect(formatTime(300)).toBe('5:00');
    expect(formatTime(59.2)).toBe('1:00');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(-3)).toBe('0:00');
    expect(formatTime(NaN)).toBe('0:00');
  });
  it('fraction and counters', () => {
    expect(timeFraction(150, 300)).toBe(0.5);
    expect(timeFraction(5, 0)).toBe(0);
    expect(counterText(3, 60)).toBe('3/60');
    expect(counterText(3, 0)).toBe('3');
  });
});

describe('grown-up gate', () => {
  it('opens after holding 3 s and decays when released', () => {
    let s = { held: 0, active: true };
    let done = false;
    for (let i = 0; i < 31 && !done; i++) {
      const r = stepHold(s, 0.1);
      s = r.state;
      done = r.done;
    }
    expect(done).toBe(true);
    const released = stepHold({ held: 1, active: false }, 0.2);
    expect(released.state.held).toBeLessThan(1);
    expect(released.done).toBe(false);
    expect(GATE_HOLD_SECONDS).toBe(3);
  });
  it('makes valid multiplication questions with 4 distinct options', () => {
    for (let i = 0; i < 200; i++) {
      const q = makeGateQuestion();
      expect(q.answer).toBe(q.a * q.b);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options).toContain(q.answer);
      expect(checkAnswer(q, q.answer)).toBe(true);
      expect(checkAnswer(q, q.answer + 1)).toBe(false);
    }
  });
});

describe('focus order', () => {
  const grid = [
    { x: 0, y: 0, w: 10, h: 10 },
    { x: 20, y: 0, w: 10, h: 10 },
    { x: 0, y: 20, w: 10, h: 10 },
    { x: 20, y: 20, w: 10, h: 10 },
  ];
  it('moves spatially', () => {
    expect(pickNext(grid, 0, 'right')).toBe(1);
    expect(pickNext(grid, 0, 'down')).toBe(2);
    expect(pickNext(grid, 3, 'left')).toBe(2);
    expect(pickNext(grid, 3, 'up')).toBe(1);
    expect(pickNext(grid, 0, 'left')).toBe(0);
    expect(pickNext(grid, 0, 'up')).toBe(0);
  });
  it('tab cycles', () => {
    expect(tabNext(3, 2, false)).toBe(0);
    expect(tabNext(3, 0, true)).toBe(2);
    expect(tabNext(3, -1, false)).toBe(0);
    expect(tabNext(0, -1, false)).toBe(-1);
  });
});

describe('icons', () => {
  it('has an svg for every name', () => {
    for (const n of ALL_ICON_NAMES) expect(iconSvg(n)).toContain('<svg');
    for (const n of ['gem', 'key', 'lock', 'chest', 'star', 'car', 'horse', 'balloon', 'parachute', 'bungee', 'trampoline', 'rocket', 'hat', 'cape', 'glasses', 'paint', 'exit', 'hand', 'clock', 'flop', 'eye', 'check']) {
      expect(ALL_ICON_NAMES).toContain(n);
    }
  });
  it('guesses outfit icons', () => {
    expect(outfitIcon('hat_party')).toBe('hat');
    expect(outfitIcon('cape_gold')).toBe('cape');
  });
});
