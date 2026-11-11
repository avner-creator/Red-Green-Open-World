/**
 * Buggy-race glasses part `boost` ("turbo tap"): pure rules (press window, tap zone, pad
 * assignment, one judged press per pad, ring countdown, tier staircase) and the blind strategies on
 * the REAL race lap and pads: a child who cannot see the pads or the ring taps in the best fixed
 * rhythm, at fixed spots picked from nothing, or mashes the button. The best blind hit rate per
 * judged tap stays ≤ 15 % at tier 1; a child who never taps gets no result at all.
 */
import { describe, expect, it } from 'vitest';
import { seededRng } from '../../src/activities/glasses/idle';
import { BOOST, TapJudge, assignPad, bestBlindRate, classifyPress, hintNow, inWindow, inZone, lapDelta, passKey, ringPad, ringT, showFade, stepTier, zoneHalfT } from '../../src/activities/glasses/weave/boost/logic';
import { boostPadDistances, buildTrack } from '../../src/activities/race/track';
import { RACE } from '../../src/activities/race/config';
import type { GlassesTier } from '../../src/types';

const TIERS: GlassesTier[] = [1, 2, 3];
const track = buildTrack();
const L = track.length;
const PADS = boostPadDistances(track, 5);

describe('turbo tap rules', () => {
  it('the tap zone sits at the race trigger edge and ends ≤ 1.2 m past it (no reacting to the whoosh)', () => {
    const edge = -RACE.padHalf.along;
    for (const tier of TIERS) {
      const end = BOOST.zoneCentre + BOOST.zoneHalf[tier];
      expect(end - edge).toBeLessThanOrEqual(1.2 + 1e-9);
      expect(BOOST.zoneCentre - BOOST.zoneHalf[tier]).toBeLessThan(edge);
    }
    expect(BOOST.zoneHalf[1]).toBeGreaterThan(BOOST.zoneHalf[2]);
    expect(BOOST.zoneHalf[2]).toBeGreaterThan(BOOST.zoneHalf[3]);
  });

  it('a press: hit in the zone and on the pad, miss when aimed but mistimed or beside it, nothing far away', () => {
    expect(classifyPress(-3, 0, 1)).toBe('hit');
    expect(classifyPress(-1.1, 1, 1)).toBe('hit');
    expect(classifyPress(-0.8, 0, 1)).toBe('miss'); // late
    expect(classifyPress(-8, 0, 1)).toBe('miss'); // early
    expect(classifyPress(-3, 3.2, 1)).toBe('miss'); // beside the pad
    expect(classifyPress(-4.5, 0, 2)).toBe('miss');
    expect(classifyPress(-3.5, 0, 3)).toBe('hit');
    expect(classifyPress(-2, 0, 3)).toBe('miss');
    expect(classifyPress(-BOOST.windowBefore - 0.1, 0, 1)).toBeNull();
    expect(classifyPress(BOOST.windowAfter + 0.1, 0, 1)).toBeNull();
    expect(inWindow(0)).toBe(true);
    expect(inZone(-3, 3)).toBe(true);
  });

  it('a press is aimed at the pad whose zone is nearest', () => {
    expect(assignPad([8, -26])).toBe(0);
    expect(assignPad([10, -12])).toBe(1);
    expect(assignPad([40, -40])).toBe(-1);
    expect(assignPad([])).toBe(-1);
  });

  it('one judged press per pad per pass; a new lap judges again', () => {
    const j = new TapJudge([100, 300], 400);
    expect(j.press(97, 1).outcome).toBe('hit');
    expect(j.press(98, 1)).toMatchObject({ pad: 0, outcome: null });
    expect(j.press(150, 1).outcome).toBeNull(); // between pads
    expect(j.press(280, 1).outcome).toBe('miss');
    expect(j.press(297, 1).outcome).toBeNull(); // already judged this pass
    expect(j.isJudged(1, 299)).toBe(true);
    expect(j.press(400 + 97, 1).outcome).toBe('hit'); // next lap
    expect(passKey(97, 100, 400)).not.toBe(passKey(497, 100, 400));
  });

  it('the ring stands on the next unjudged pad and closes onto its target at the zone', () => {
    const pads = [100, 300];
    expect(ringPad(pads, 40, 400, () => false)).toEqual({ index: 0, toZone: 57 });
    expect(ringPad(pads, 98, 400, () => false).index).toBe(0); // just past the zone centre: still on it
    expect(ringPad(pads, 98, 400, (i) => i === 0).index).toBe(1);
    expect(ringPad(pads, 105, 400, () => false).index).toBe(1); // past the zone: the next pad
    expect(ringPad(pads, 120, 400, () => false).index).toBe(1);
    expect(ringT(BOOST.span)).toBe(0);
    expect(ringT(0)).toBeCloseTo(BOOST.perfectAt);
    expect(ringT(-100)).toBe(1);
    for (const tier of TIERS) expect(ringT(-BOOST.zoneHalf[tier]) - BOOST.perfectAt).toBeCloseTo(zoneHalfT(tier));
    expect(showFade(BOOST.showFrom + 1)).toBe(0);
    expect(showFade(BOOST.showFrom - BOOST.fadeIn)).toBe(1);
    expect(lapDelta(390, 30, 400)).toBe(40);
  });

  it('the button hint: only as a race counts down, once per session', () => {
    expect(hintNow('countdown', false)).toBe(true);
    expect(hintNow('countdown', true)).toBe(false);
    for (const p of ['idle', 'racing', 'finishing', 'podium', 'result']) expect(hintNow(p, false)).toBe(false);
  });

  it('tier: up after two hits in a row, down after a miss; pays 1 / 2 / 3', () => {
    let s = { tier: 1 as GlassesTier, streak: 0 };
    s = stepTier(s.tier, s.streak, true);
    expect(s).toEqual({ tier: 1, streak: 1 });
    s = stepTier(s.tier, s.streak, true);
    expect(s).toEqual({ tier: 2, streak: 0 });
    s = stepTier(s.tier, s.streak, false);
    expect(s).toEqual({ tier: 1, streak: 0 });
    expect(stepTier(3, 1, true)).toEqual({ tier: 3, streak: 0 });
    expect(TIERS.map((t) => BOOST.pay[t])).toEqual([1, 2, 3]);
  });
});

/** Drive `laps` laps of the real lap, pressing at `taps` (progress values, sorted). */
function drive(taps: number[], tier: GlassesTier): { hits: number; judged: number } {
  const j = new TapJudge(PADS, L);
  let hits = 0;
  let judged = 0;
  for (const p of taps) {
    const r = j.press(p, tier);
    if (r.outcome) judged++;
    if (r.outcome === 'hit') hits++;
  }
  return { hits, judged };
}

describe('a child who cannot see the pads or the ring (real race lap)', () => {
  const LAPS = 40;
  const rate = (r: { hits: number; judged: number }): number => (r.judged ? r.hits / r.judged : 0);

  it(`the lap has ${PADS.length} pads`, () => {
    expect(PADS.length).toBe(5);
    expect(L).toBeGreaterThan(200);
  });

  it('never tapping: no result at all', () => {
    expect(drive([], 1)).toEqual({ hits: 0, judged: 0 });
  });

  it('mashing (a tap every 0.25 m): every pad is a miss', () => {
    const taps: number[] = [];
    for (let p = -5; p < LAPS * L; p += 0.25) taps.push(p);
    expect(rate(drive(taps, 1))).toBe(0);
  });

  it('the best fixed rhythm (tap every N metres, every N and phase) stays ≤ 15 % per judged tap at tier 1', () => {
    const best: Record<GlassesTier, { rate: number; n: number }> = { 1: { rate: 0, n: 0 }, 2: { rate: 0, n: 0 }, 3: { rate: 0, n: 0 } };
    for (const tier of TIERS) {
      for (let n = 1; n <= 80; n += 0.5) {
        let h = 0;
        let jd = 0;
        for (let ph = 0; ph < 1; ph += 0.125) {
          const taps: number[] = [];
          for (let p = ph * n; p < 12 * L; p += n) taps.push(p);
          const r = drive(taps, tier);
          h += r.hits;
          jd += r.judged;
        }
        const k = jd ? h / jd : 0;
        if (k > best[tier].rate) best[tier] = { rate: k, n };
      }
    }
    console.log(`boost best blind rhythm per judged tap: t1 ${(best[1].rate * 100).toFixed(1)} % (every ${best[1].n} m), t2 ${(best[2].rate * 100).toFixed(1)} %, t3 ${(best[3].rate * 100).toFixed(1)} %; bound ${TIERS.map((t) => (bestBlindRate(t) * 100).toFixed(1)).join(' / ')} %`);
    expect(best[1].rate).toBeLessThanOrEqual(0.15);
    expect(best[2].rate).toBeLessThan(best[1].rate);
    expect(best[3].rate).toBeLessThan(best[2].rate);
    for (const t of TIERS) expect(best[t].rate).toBeLessThanOrEqual(bestBlindRate(t) + 0.02);
  });

  it('fixed track spots picked from nothing (1–20 per lap, same every lap): ≤ 15 % on average', () => {
    const rng = seededRng(3);
    let worst = 0;
    for (let m = 1; m <= 20; m++) {
      let h = 0;
      let jd = 0;
      for (let seed = 0; seed < 200; seed++) {
        const spots = Array.from({ length: m }, () => rng() * L).sort((a, b) => a - b);
        const taps: number[] = [];
        for (let lap = 0; lap < 3; lap++) for (const s of spots) taps.push(lap * L + s);
        const r = drive(taps, 1);
        h += r.hits;
        jd += r.judged;
      }
      worst = Math.max(worst, jd ? h / jd : 0);
    }
    console.log(`boost blind fixed spots: worst average ${(worst * 100).toFixed(1)} % per judged tap`);
    expect(worst).toBeLessThanOrEqual(0.15);
  });

  it('gems per minute: blind (best rhythm) vs a child who sees the ring', () => {
    const lapSeconds = L / 13; // ~13 m/s average race pace
    const padsPerMin = (PADS.length * 60) / lapSeconds;
    const blind = padsPerMin * bestBlindRate(1) * BOOST.pay[1];
    console.log(`boost: ${padsPerMin.toFixed(1)} pads/min; blind best ≈ ${blind.toFixed(2)} gems/min (tier stays 1); seeing child up to ${(padsPerMin * BOOST.pay[3]).toFixed(1)} gems/min`);
    expect(blind).toBeLessThan((padsPerMin * BOOST.pay[3]) / 10);
  });
});
