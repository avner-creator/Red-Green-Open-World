import { describe, expect, it } from 'vitest';
import { SKILL, SkillMachine, springSpeed } from '../../src/core/skills';
import type { SkillFrame } from '../../src/core/skills';

const DT = 1 / 60;
const frame = (p: Partial<SkillFrame> = {}): SkillFrame => ({
  dt: DT,
  pressed: false,
  held: false,
  jumpPressed: false,
  grounded: false,
  airTime: 0.5,
  vy: 0,
  canUse: true,
  ...p,
});
const run = (m: SkillMachine, n: number, p: Partial<SkillFrame> = {}): void => {
  for (let i = 0; i < n; i++) m.update(frame(p));
};

describe('doubleJump', () => {
  it('fires once per air time, only in the air, from skill or jump key', () => {
    const m = new SkillMachine('doubleJump');
    expect(m.update(frame({ pressed: true, grounded: true, airTime: 0 }))).toBeNull();
    expect(m.update(frame({ pressed: true, airTime: 0.05 }))).toBeNull(); // too soon after take-off
    const ev = m.update(frame({ jumpPressed: true }));
    expect(ev).toEqual({ kind: 'fire', id: 'doubleJump', value: SKILL.doubleJump.speed });
    run(m, 30);
    expect(m.update(frame({ pressed: true }))).toBeNull(); // already used this air time
    m.land();
    run(m, 1, { grounded: true, airTime: 0 });
    expect(m.update(frame({ pressed: true }))?.kind).toBe('fire');
  });

  it('is floatier for the flamingo', () => {
    const m = new SkillMachine('doubleJump');
    m.setSkill('doubleJump', true);
    const ev = m.update(frame({ pressed: true }));
    expect(ev?.kind === 'fire' && ev.value).toBe(SKILL.doubleJump.floatySpeed);
    expect(m.floaty).toBe(true);
  });
});

describe('glide', () => {
  it('holds while the key is held, at most maxTime per air time', () => {
    const m = new SkillMachine('glide');
    expect(m.update(frame({ pressed: true, held: true }))?.kind).toBe('fire');
    expect(m.phase).toBe('glide');
    run(m, Math.round(SKILL.glide.maxTime * 60) - 5, { held: true });
    expect(m.phase).toBe('glide');
    let end = null;
    for (let i = 0; i < 10 && !end; i++) end = m.update(frame({ held: true }));
    expect(end).toEqual({ kind: 'end', id: 'glide' });
    // Budget spent: no new glide until landing.
    run(m, 30, { held: false });
    expect(m.update(frame({ pressed: true, held: true }))).toBeNull();
    m.land();
    run(m, 20, { grounded: true, airTime: 0 });
    expect(m.update(frame({ pressed: true, held: true }))?.kind).toBe('fire');
  });

  it('stops on release and never starts on the ground', () => {
    const m = new SkillMachine('glide');
    expect(m.update(frame({ pressed: true, held: true, grounded: true, airTime: 0 }))).toBeNull();
    m.update(frame({ pressed: true, held: true }));
    expect(m.update(frame({ held: false }))).toEqual({ kind: 'end', id: 'glide' });
    expect(m.phase).toBe('idle');
  });

  it('starts by itself when the key is still held as the fall begins', () => {
    const m = new SkillMachine('glide');
    expect(m.update(frame({ held: true, vy: 3 }))).toBeNull();
    expect(m.update(frame({ held: true, vy: -0.5 }))?.kind).toBe('fire');
  });
});

describe('dash', () => {
  it('fires on ground or once in the air, lasts its duration, then cools down 1.5 s', () => {
    const m = new SkillMachine('dash');
    const ev = m.update(frame({ pressed: true, grounded: true, airTime: 0 }));
    expect(ev?.kind === 'fire' && ev.value * SKILL.dash.duration).toBeCloseTo(SKILL.dash.distance);
    expect(m.cooldown).toBeCloseTo(SKILL.dash.cooldown);
    run(m, Math.ceil(SKILL.dash.duration * 60) + 1, { grounded: true, airTime: 0 });
    expect(m.phase).toBe('idle');
    expect(m.update(frame({ pressed: true, grounded: true }))).toBeNull(); // cooling down
    run(m, 90, { grounded: true });
    expect(m.ready).toBe(true);
    expect(m.update(frame({ pressed: true }))?.kind).toBe('fire'); // air dash
    run(m, 100);
    expect(m.update(frame({ pressed: true }))).toBeNull(); // only one per air time
  });
});

describe('superBounce', () => {
  it('is ground-only, charges while held and springs up to 9 m on release', () => {
    const m = new SkillMachine('superBounce');
    expect(m.update(frame({ pressed: true }))).toBeNull(); // air: nothing
    expect(m.update(frame({ pressed: true, held: true, grounded: true }))).toEqual({ kind: 'charge' });
    run(m, 40, { held: true, grounded: true });
    const ev = m.update(frame({ held: false, grounded: true }));
    expect(ev?.kind).toBe('fire');
    const v = ev?.kind === 'fire' ? ev.value : 0;
    expect((v * v) / (2 * 22)).toBeCloseTo(SKILL.superBounce.height, 3);
    expect(m.bounceBoost).toBe(SKILL.superBounce.boost);
  });

  it('a quick tap still crouches a moment, then springs lower', () => {
    const m = new SkillMachine('superBounce');
    m.update(frame({ pressed: true, held: true, grounded: true }));
    expect(m.update(frame({ held: false, grounded: true }))).toBeNull();
    let ev = null;
    for (let i = 0; i < 20 && !ev; i++) ev = m.update(frame({ grounded: true }));
    expect(ev?.kind).toBe('fire');
    expect(springSpeed(0, 22)).toBeLessThan(springSpeed(1, 22));
  });

  it('walking off an edge while charging cancels it', () => {
    const m = new SkillMachine('superBounce');
    m.update(frame({ pressed: true, held: true, grounded: true }));
    expect(m.update(frame({ held: true }))).toEqual({ kind: 'end', id: 'superBounce' });
  });

  it('the bounce boost expires shortly after a landing that started no bounce', () => {
    const m = new SkillMachine('superBounce');
    m.update(frame({ pressed: true, held: true, grounded: true }));
    run(m, 30, { held: true, grounded: true });
    m.update(frame({ grounded: true }));
    run(m, 60); // in the air: boost kept
    expect(m.bounceBoost).toBe(1.25);
    m.land();
    run(m, Math.ceil(SKILL.boostGrace * 60) + 1, { grounded: true });
    expect(m.bounceBoost).toBe(1);
  });
});

describe('groundPound', () => {
  it('air-only: hang, slam, then a pound landing gives the max bounce boost', () => {
    const m = new SkillMachine('groundPound');
    expect(m.update(frame({ pressed: true, grounded: true, airTime: 0 }))).toBeNull();
    expect(m.update(frame({ pressed: true }))?.kind).toBe('fire');
    expect(m.phase).toBe('hang');
    run(m, Math.ceil(SKILL.groundPound.hang * 60) + 1);
    expect(m.phase).toBe('slam');
    expect(m.land()).toBe('pound');
    expect(m.bounceBoost).toBe(Infinity);
    m.consumeBoost();
    expect(m.bounceBoost).toBe(1);
    expect(m.land()).toBeNull();
  });
});

describe('rules', () => {
  it('nothing fires outside walk mode and a running skill is cancelled', () => {
    const m = new SkillMachine('glide');
    expect(m.update(frame({ pressed: true, held: true, canUse: false }))).toBeNull();
    m.update(frame({ pressed: true, held: true }));
    expect(m.update(frame({ held: true, canUse: false }))).toEqual({ kind: 'end', id: 'glide' });
    expect(m.active).toBe(false);
  });

  it('changing character resets cooldown and boost', () => {
    const m = new SkillMachine('dash');
    m.update(frame({ pressed: true, grounded: true }));
    expect(m.ready).toBe(false);
    m.setSkill('groundPound');
    expect(m.ready).toBe(true);
    expect(m.id).toBe('groundPound');
    expect(m.phase).toBe('idle');
  });
});
