import { describe, expect, it } from 'vitest';
import { derived, EXPLICIT_STAMPS, GRAND_PRIZE, milestones, modeStamp, nextMilestone, PASS_PRIZES, prizeFor, stuntStamp, ticketStamp } from '../../src/ui/funPassLogic';

describe('fun pass logic', () => {
  it('maps tickets and ride modes to attraction stamps', () => {
    expect(ticketStamp('race')).toBe('raceStart');
    expect(ticketStamp('scoops')).toBe('iceCream');
    expect(ticketStamp('rocketPad')).toBe('launchPads');
    expect(modeStamp('driving')).toBe('garage');
    expect(modeStamp('riding')).toBe('ranch');
    expect(modeStamp('walk')).toBeNull();
  });

  it('stamps with an explicit "round done" event are never derived', () => {
    expect(EXPLICIT_STAMPS.has('chest')).toBe(true);
    expect(derived(ticketStamp('race'))).toBeNull();
    expect(derived(ticketStamp('rocketPad'))).toBeNull();
    expect(derived(ticketStamp('balloon'))).toBe('balloon');
    expect(derived(modeStamp('driving'))).toBe('garage');
    expect(derived(null)).toBeNull();
  });

  it('gives a shared stunt to the nearest attraction on the card', () => {
    const pos: Record<string, { x: number; z: number }> = { bubbleArena: { x: 0, z: 0 }, dinoRing: { x: 100, z: 0 } };
    const where = (id: string): { x: number; z: number } | null => pos[id] ?? null;
    expect(stuntStamp('bumper', { x: 90, z: 0 }, where, () => true)).toBe('dinoRing');
    expect(stuntStamp('bumper', { x: 5, z: 0 }, where, () => true)).toBe('bubbleArena');
    expect(stuntStamp('bumper', { x: 90, z: 0 }, where, (id) => id !== 'dinoRing')).toBe('bubbleArena');
    expect(stuntStamp('bigBounce', { x: 0, z: 0 }, where, () => true)).toBe('trampoline');
  });

  it('pays each milestone once, the grand prize on a full card', () => {
    const total = 24;
    expect(prizeFor(0, 2, total)).toBe(0);
    expect(prizeFor(2, 3, total)).toBe(PASS_PRIZES[0]!.gems);
    expect(prizeFor(3, 4, total)).toBe(0);
    expect(prizeFor(23, 24, total)).toBe(GRAND_PRIZE);
    let sum = 0;
    for (let n = 0; n < total; n++) sum += prizeFor(n, n + 1, total);
    expect(sum).toBe(PASS_PRIZES.reduce((a, p) => a + p.gems, 0) + GRAND_PRIZE);
  });

  it('lists milestones up to the full card and finds the next one', () => {
    expect(milestones(24)).toEqual([3, 6, 10, 15, 24]);
    expect(milestones(8)).toEqual([3, 6, 8]);
    expect(nextMilestone(0, 24)).toBe(3);
    expect(nextMilestone(10, 24)).toBe(15);
    expect(nextMilestone(24, 24)).toBeNull();
  });
});
