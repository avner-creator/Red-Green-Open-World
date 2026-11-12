/**
 * Round 7 M4: the perfect-bounce ring in play. A fake trampoline flight is stepped frame by frame
 * through real arcs (walk-on 12 m, held 18 m, 27 m): each descent is detected ONCE (not once per
 * frame) and a fall long enough gets the weak-eye ring attached on the WeakOnly layer.
 */
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PLAYER } from '../../src/config';
import { VisionLayer } from '../../src/types';
import type { GameContext } from '../../src/types';
import type { WeaveEnv } from '../../src/activities/glasses/weave/types';

const flight = { active: false, owner: '', vx: 0, vy: 0, vz: 0, endY: 0 };
vi.mock('../../src/activities/flight', () => ({ getFlight: () => flight }));
// The star glyph needs a canvas (no DOM here): a plain object stands in for it.
vi.mock('../../src/vision/toolkit/glyphs', async (orig) => ({
  ...(await orig<object>()),
  createGlyphSprite: () => ({ object: new THREE.Object3D(), setFade: () => {}, update: () => {}, dispose: () => {} }),
}));

const { create } = await import('../../src/activities/glasses/weave/bounce');

function setup() {
  const player = { position: new THREE.Vector3(0, 0, 0) };
  const input = { state: { jumpPressed: false, usePressed: false } };
  const ctx = { player, input } as unknown as GameContext;
  const attached = new Map<THREE.Object3D, VisionLayer>();
  const results: boolean[] = [];
  const env: WeaveEnv = {
    ctx,
    id: 'bounce',
    kind: 'timeIt',
    rng: () => 0.5,
    pay: () => {},
    result: (_t, hit) => void results.push(hit),
    challenge: () => ({ size: 1, level: 1, speed: 1 }) as never,
    add: (o, l) => {
      attached.set(o, l);
      return o;
    },
    remove: (o) => void attached.delete(o),
    tracked: () => [...attached.keys()],
  };
  return { part: create(env), player, input, attached, results };
}

const dt = 1 / 60;
const g = PLAYER.gravity;

/** Fly one bounce of `apex` m from the mat (y = 0) and back, calling `each` every frame. */
function bounce(s: ReturnType<typeof setup>, apex: number, each?: (falling: boolean) => void): void {
  flight.active = true;
  flight.owner = 'trampoline';
  flight.endY = 0;
  flight.vy = Math.sqrt(2 * g * apex);
  s.player.position.y = 0;
  for (let i = 0; i < 2000; i++) {
    flight.vy -= g * dt;
    s.player.position.y += flight.vy * dt;
    if (s.player.position.y <= 0) {
      s.player.position.y = 0;
      flight.vy = 0.01; // dwell on the mat: rising again
      s.part.update(dt);
      return;
    }
    s.part.update(dt);
    each?.(flight.vy <= 0);
  }
}

describe('perfect-bounce ring in play (M4)', () => {
  it('counts each descent once and attaches the weak-eye ring on the held 18 m bounce', () => {
    const s = setup();
    s.part.reset();
    bounce(s, 12);
    expect(s.part.debug().falls).toBe(1);
    expect(s.attached.size).toBe(0); // walk-on 12 m: too short, no ring
    let sawRing = false;
    bounce(s, 18, (falling) => {
      if (falling && s.part.debug().ring) sawRing = true;
    });
    expect(s.part.debug().falls).toBe(2);
    expect(sawRing).toBe(true);
    let sawRing27 = false;
    bounce(s, 27, (falling) => {
      if (!falling) return;
      const d = s.part.debug();
      if (d.ring) {
        sawRing27 = true;
        expect(d.fall).not.toBeNull();
        expect(s.attached.size).toBeGreaterThan(0);
        for (const [, l] of s.attached) expect(l).toBe(VisionLayer.WeakOnly);
      }
    });
    expect(sawRing27).toBe(true);
    expect(s.part.debug().falls).toBe(3);
    expect(s.part.debug().skipped).toBe(0);
  });

  it('a press at the perfect moment scores a hit, once per fall', () => {
    const s = setup();
    s.part.reset();
    s.part.force?.({ perfectAt: 0.5 });
    let pressed = false;
    bounce(s, 27, (falling) => {
      s.input.state.jumpPressed = false;
      const d = s.part.debug();
      if (!falling || pressed || d.at === null || d.perfect === null) return;
      if ((d.at as number) >= (d.perfect as number) - dt / 2) {
        s.input.state.jumpPressed = true;
        pressed = true;
      }
    });
    s.input.state.jumpPressed = false;
    expect(s.results).toEqual([true]);
    expect(s.part.debug().falls).toBe(1);
  });
});
