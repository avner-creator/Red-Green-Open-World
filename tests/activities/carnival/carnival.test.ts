import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { pickFriends } from '../../../src/activities/carnival/friends';
import { BOOTH_X, FALLBACK_SITE, GAME_IDS, boothToSite, resolveSite, siteToWorld } from '../../../src/activities/carnival/layout';
import { plushSlot } from '../../../src/activities/carnival/plush';
import { RIVAL_SKILLS, RivalBrain, expectedRivalPoints } from '../../../src/activities/carnival/rivals';
import { makeRng } from '../../../src/activities/carnival/rng';
import { TICKET_PRICE, payTicket, placeOf, prizeGems, resultOf, starsFor, walletOf } from '../../../src/activities/carnival/round';
import type { ProfileLike } from '../../../src/activities/carnival/round';
import type { Anchor } from '../../../src/types';

describe('carnival round results', () => {
  it('gives at least one star for playing, more for higher scores', () => {
    expect(starsFor(0, [8, 16])).toBe(1);
    expect(starsFor(8, [8, 16])).toBe(2);
    expect(starsFor(30, [8, 16])).toBe(3);
  });

  it('ties go to the player', () => {
    expect(placeOf(5, [5, 5])).toBe(1);
    expect(placeOf(5, [6, 1])).toBe(2);
    expect(placeOf(0, [6, 1])).toBe(3);
  });

  it('pays a star per gem plus a winner bonus', () => {
    expect(prizeGems(1, false)).toBe(1);
    expect(prizeGems(3, true)).toBe(5);
    const r = resultOf(12, [4, 9], [8, 16]);
    expect(r).toEqual({ place: 1, stars: 2, gems: 4, won: true });
  });
});

describe('carnival tickets', () => {
  const wallet = (gems: number): ProfileLike & { gems: number } => {
    const p = {
      gems,
      spend(n: number) {
        if (p.gems < n) return false;
        p.gems -= n;
        return true;
      },
    };
    return p;
  };

  it('first play of each booth per session is free, then costs a ticket', () => {
    const used = new Set<string>();
    const p = wallet(10);
    expect(payTicket(used, 'balloonPop', p)).toBe('free');
    expect(payTicket(used, 'ringToss', p)).toBe('free');
    expect(p.gems).toBe(10);
    expect(payTicket(used, 'balloonPop', p)).toBe('paid');
    expect(p.gems).toBe(10 - TICKET_PRICE);
  });

  it('says "short" when the wallet is too low, and never charges', () => {
    const used = new Set<string>(['duckPond']);
    const p = wallet(1);
    expect(payTicket(used, 'duckPond', p)).toBe('short');
    expect(p.gems).toBe(1);
    expect(walletOf(p)).toBe(1);
  });

  it('is always free without an economy', () => {
    const used = new Set<string>(['duckPond']);
    expect(payTicket(used, 'duckPond', null)).toBe('free');
    expect(payTicket(used, 'duckPond', {})).toBe('free');
    expect(walletOf(null)).toBeNull();
  });

  it('honours canAfford when the profile has it', () => {
    const used = new Set<string>(['glowDodge']);
    let spent = 0;
    const p: ProfileLike = { canAfford: () => false, spend: (n: number) => (spent += n) };
    expect(payTicket(used, 'glowDodge', p)).toBe('short');
    expect(spent).toBe(0);
  });
});

describe('carnival rivals', () => {
  it('are repeatable for a seed', () => {
    const run = (): number[] => {
      const b = new RivalBrain(RIVAL_SKILLS[0], makeRng(42));
      const acts: number[] = [];
      for (let i = 0; i < 600; i++) if (b.tick(1 / 30)) acts.push(i);
      return acts;
    };
    expect(run()).toEqual(run());
  });

  it('score well below what a child who tries gets in a 30 s round', () => {
    // A child throwing about once a second with generous assist pops well over 15 balloons; the
    // friends average under the 2-star line (8) so they lose to a child who tries.
    for (const skill of RIVAL_SKILLS) {
      expect(expectedRivalPoints(skill, 30, 1)).toBeLessThan(8);
      let total = 0;
      for (let seed = 1; seed <= 50; seed++) {
        const b = new RivalBrain(skill, makeRng(seed));
        for (let t = 0; t < 30; t += 1 / 30) if (b.tick(1 / 30) && b.roll()) total++;
      }
      expect(total / 50).toBeLessThan(8.5);
      expect(total / 50).toBeGreaterThan(2);
    }
  });
});

describe('carnival layout', () => {
  it('falls back to the strip behind the east village houses without an anchor', () => {
    const s = resolveSite({});
    expect(s.fromAnchor).toBe(false);
    expect([s.x, s.z]).toEqual([FALLBACK_SITE.x, FALLBACK_SITE.z]);
  });

  it('uses the carnivalRow anchor when the world has one', () => {
    const a: Anchor = { position: new THREE.Vector3(5, 18, -30), yaw: 0.3, radius: 18 };
    const s = resolveSite({ carnivalRow: a });
    expect(s).toMatchObject({ x: 5, z: -30, yaw: 0.3, radius: 18, fromAnchor: true });
  });

  it('maps site coordinates like a three.js Object3D rotated by yaw', () => {
    const site = { x: 21, z: -42, yaw: -Math.PI / 2 };
    const o = new THREE.Object3D();
    o.position.set(site.x, 0, site.z);
    o.rotation.y = site.yaw;
    o.updateMatrixWorld(true);
    for (const [lx, lz] of [[0, 0], [12, -2.5], [-6, 3]]) {
      const v = o.localToWorld(new THREE.Vector3(lx, 0, lz));
      const [wx, wz] = siteToWorld(site, lx, lz);
      expect(wx).toBeCloseTo(v.x, 6);
      expect(wz).toBeCloseTo(v.z, 6);
    }
    // Booths face the midway: site +Z is world −X for the fallback site (towards the houses).
    const [fx] = siteToWorld(site, 0, 1);
    expect(fx).toBeLessThan(site.x);
  });

  it('keeps the booths apart and inside the site radius', () => {
    const xs = GAME_IDS.map((g) => BOOTH_X[g]).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(5);
    for (const g of GAME_IDS) {
      const [x, z] = boothToSite(g, 0, 0);
      expect(Math.hypot(x, z)).toBeLessThan(FALLBACK_SITE.radius);
    }
  });

  it('places the fallback row clear of the fixed anchors and the main street', () => {
    for (const g of GAME_IDS) {
      const [x, z] = siteToWorld(FALLBACK_SITE, ...boothToSite(g, 0, 0));
      expect(Math.abs(x)).toBeGreaterThan(12); // street + houses are |x| < 17.5; booths reach x ≥ 23
      expect(z).toBeLessThan(-20);
      expect(z).toBeGreaterThan(-60);
    }
  });

  it('puts 15 plush slots on three distinct shelf tiers', () => {
    const ys = new Set<number>();
    const seen = new Set<string>();
    for (let i = 0; i < 15; i++) {
      const [x, y, z] = plushSlot(i);
      ys.add(Math.round(y * 100));
      seen.add(`${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`);
    }
    expect(ys.size).toBe(3);
    expect(seen.size).toBe(15);
  });
});

describe('carnival friends', () => {
  const ids = ['robot', 'frog', 'panda', 'bee', 'flamingo', 'rex'];
  it('are two other heroes, never the player', () => {
    for (const me of ids) {
      const f = pickFriends(me, ids);
      expect(f).not.toContain(me);
      expect(new Set(f).size).toBe(2);
    }
    expect(pickFriends('rex', ids)).toEqual(['robot', 'frog']);
  });
});
