/**
 * Booth kit fix round (pure parts): timed rounds and `end()`, a per-try tier, the pad-camera
 * prompt helper (safe area, off the hero and the things that must stay visible), the demo
 * legibility audit (gates strict; the other five logged for their builders), the raised pad and
 * decals (on the real surface via `settle`), the `extra` geometry hook and the 'button' prompt.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBoothController } from '../../src/activities/glasses/booth/booth';
import { deviceUv } from '../../src/activities/glasses/booth/cells';
import { buildBoothGeometry, DECAL_TOP, MARQUEE, PAD_TOP } from '../../src/activities/glasses/booth/geometry';
import { auditDemo } from '../../src/activities/glasses/booth/legibility';
import { ROUND_DEFAULTS, RoundMachine } from '../../src/activities/glasses/booth/round';
import type { RoundEvent } from '../../src/activities/glasses/booth/round';
import type { BoothSpec, RoundRules } from '../../src/activities/glasses/booth/types';
import { HERO_BOX, padCamera, pickPromptSpot, promptFits, PROMPT_SAFE, pxPerMetre, screenRect } from '../../src/activities/glasses/booth/view';
import { DOT_DEMO } from '../../src/activities/glasses/dotsigns/demo';
import { GATE_BOOTH } from '../../src/activities/glasses/gates/constants';
import { GATES_DEMO } from '../../src/activities/glasses/gates/demo';
import { GLOWFLIES_DEMO } from '../../src/activities/glasses/glowflies/demo';
import { LINEUP_DEMO } from '../../src/activities/glasses/lineup/demo';
import { ODD_DEMO } from '../../src/activities/glasses/oddone/demo';
import { TOYS_DEMO } from '../../src/activities/glasses/toys/demo';

const TIMED: RoundRules = { tries: 4, minHits: 2, prize: { 1: [0, 0, 3, 5, 8], 2: [0, 0, 4, 6, 9], 3: [0, 0, 5, 7, 10] }, between: 'next', time: 10 };

function run(m: RoundMachine, seconds: number): RoundEvent[] {
  const out: RoundEvent[] = [];
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) out.push(...m.step(1 / 60, true));
  return out;
}
const toPlay = (m: RoundMachine): void => {
  m.start();
  run(m, ROUND_DEFAULTS.countStep * 3 + ROUND_DEFAULTS.goTime + 0.05);
};

describe('timed rounds, end(), per-try tier', () => {
  it('a timed round stays in play between reports and ends when the time is up', () => {
    const m = new RoundMachine(TIMED);
    toPlay(m);
    expect(m.phase).toBe('play');
    expect(m.report(true)).toMatchObject([{ type: 'result', index: 0, hit: true }]);
    expect(m.phase).toBe('play');
    expect(m.report(true)).toMatchObject([{ type: 'result', index: 1 }]);
    expect(m.timeLeft).toBeGreaterThan(9);
    const ev = run(m, 10.1);
    expect(ev[0]).toEqual({ type: 'end', hits: 2, gems: 3 });
    expect(m.results).toEqual([true, true]); // nothing reported for the lamps never lit
  });

  it('a timed round ends at once when every lamp is lit', () => {
    const m = new RoundMachine(TIMED);
    toPlay(m);
    for (let i = 0; i < 3; i++) m.report(true);
    expect(m.report(false).map((e) => e.type)).toEqual(['result', 'end']);
    expect(m.phase).toBe('celebrate');
    expect(m.gems).toBe(5);
  });

  it('end() finishes the tries early (any round), and only from the tries', () => {
    const m = new RoundMachine({ ...TIMED, time: undefined });
    expect(m.end()).toEqual([]);
    toPlay(m);
    m.report(true);
    expect(m.end()).toEqual([{ type: 'end', hits: 1, gems: 0 }]);
    expect(m.end()).toEqual([]);
  });

  it("report(hit, tier) carries the try's own tier; the round tier is unchanged", () => {
    const m = new RoundMachine(TIMED);
    toPlay(m);
    expect(m.report(true, 3)).toMatchObject([{ type: 'result', tier: 3 }]);
    expect(m.report(true)).toMatchObject([{ type: 'result', tier: 1 }]);
    expect(m.tier).toBe(1);
  });
});

describe('prompt in clear view from the pad camera', () => {
  const pad = { x: 0, y: 0.15, z: 2 };
  const look = { x: 0, z: -2.6 };

  it('the pad camera sees the hero in the hero box and the play ahead', () => {
    const cam = padCamera(pad, look);
    const head = screenRect({ x: 0, y: 1.6, z: 2 }, 0.4, cam)!;
    expect(head.x0).toBeGreaterThan(HERO_BOX.x0 - 0.02);
    expect(head.x1).toBeLessThan(HERO_BOX.x1 + 0.02);
    const ahead = screenRect({ x: 0, y: 2, z: -2.6 }, 1, cam)!;
    expect(ahead.y1).toBeLessThan(0.6);
  });

  it('a spot behind the camera, under the HUD or on the hero does not fit; one near the play does', () => {
    const o = { pad, look, size: 1.4 };
    expect(promptFits({ x: 0, y: 2, z: 9 }, o)).toBe(false); // behind the camera
    expect(promptFits({ x: 0, y: 7, z: -3 }, o)).toBe(false); // top: timer, wallet
    expect(promptFits({ x: 0, y: 1, z: 1.5 }, o)).toBe(false); // on the hero
    expect(promptFits({ x: 6, y: 1.5, z: -1 }, o)).toBe(false); // right edge: wardrobe, skill
    expect(promptFits({ x: 1.6, y: 2.2, z: -1.1 }, o)).toBe(true);
  });

  it('keeps clear of what must stay visible, and is the same whatever happens later (pure)', () => {
    const keep = [{ p: { x: 1.6, y: 2.2, z: -1.1 }, size: 1.2 }];
    const cands = [{ x: 1.6, y: 2.2, z: -1.1 }, { x: -1.6, y: 2.2, z: -1.1 }];
    const a = pickPromptSpot(cands, { pad, look, size: 1.4, keepClear: keep });
    expect(a).toEqual({ at: cands[1], fits: true });
    expect(pickPromptSpot(cands, { pad, look, size: 1.4, keepClear: keep })).toEqual(a);
    expect(PROMPT_SAFE.x0).toBeLessThan(PROMPT_SAFE.x1);
  });
});

describe('demo legibility (8 m, 640×360)', () => {
  it('the booth panel is big enough: ≥ 85 px at 8 m', () => {
    expect(MARQUEE.demo * pxPerMetre(8, 360)).toBeGreaterThanOrEqual(85);
  });

  it('gates: close-ups, the hero ≥ a third of the panel, few pictures per frame', () => {
    const a = auditDemo(GATES_DEMO);
    console.info(`gates demo: hero ${a.minHeroPx.toFixed(0)} px, panel ${a.panelPx.toFixed(0)} px, ≤ ${a.maxThings} pictures/frame`);
    expect(a.problems).toEqual([]);
    expect(a.frames.slice(0, 3).every((f) => f.heroUnits === 0)).toBe(true); // half + half → whole: no hero yet
  });

  it('the other five demos (logged for their builders)', () => {
    for (const [id, demo] of [['dotsigns', DOT_DEMO], ['glowflies', GLOWFLIES_DEMO], ['lineup', LINEUP_DEMO], ['oddone', ODD_DEMO], ['toys', TOYS_DEMO]] as const) {
      const a = auditDemo(demo);
      console.info(`${id} demo: ${a.ok ? 'ok' : a.problems.join('; ')}`);
      expect(a.frames.length).toBe(demo.frames);
    }
  });
});

const SPEC: BoothSpec = {
  marquee: { x: -3, z: 0, yaw: 0.4 },
  lamps: 3,
  pad: { x: 0, z: 2, walkIn: true },
  playPrompt: 'button',
  decals: [{ kind: 'chevron', x: 0, z: 0, size: 1, yaw: 0 }, { kind: 'footprints', x: 1, z: 1, size: 0.8, yaw: 0 }],
};

describe('raised pad and decals', () => {
  it('the pad is a raised drum and the decals are raised wedges', () => {
    const b = buildBoothGeometry(SPEC);
    const pos = b.geometry.getAttribute('position') as THREE.BufferAttribute;
    const face = b.slots.get('padFace')!;
    expect(pos.getY(face.start)).toBeCloseTo(PAD_TOP + 0.006, 5);
    const posts = b.slots.get('padPosts')!;
    let top = -Infinity;
    for (let i = posts.start; i < posts.start + posts.count; i++) top = Math.max(top, pos.getY(i));
    expect(top).toBeGreaterThan(0.6); // bollards stand out of tall grass
    // Pad pieces + 2 decals (chevron: 2 pieces, footprints: 2) are on the ground list.
    expect(b.groundPieces.filter((g) => g.x === 0 && g.z === 2).length).toBeGreaterThanOrEqual(4);
    let decalTop = -Infinity;
    for (const g of b.groundPieces.filter((q) => q.z === 0)) for (let i = g.start; i < g.start + g.count; i++) decalTop = Math.max(decalTop, pos.getY(i));
    expect(decalTop).toBeGreaterThan(DECAL_TOP - 0.03);
  });

  it('settle lifts the pad and the decals onto the real surface (never buries them)', () => {
    const c = createBoothController(new THREE.MeshBasicMaterial(), { spec: SPEC, slot: 0, frames: 2 });
    const pos = c.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const face = c.build.slots.get('padFace')!;
    const y0 = pos.getY(face.start);
    c.settle((x, z) => (x === 0 && z === 2 ? 0.25 : -1));
    expect(pos.getY(face.start)).toBeCloseTo(y0 + 0.25, 5);
    expect(c.build.padCenter.y).toBeCloseTo(0.25, 5);
    const demo = c.build.slots.get('demo')!;
    const dy = pos.getY(demo.start);
    c.settle(() => 5);
    expect(pos.getY(demo.start)).toBe(dy); // the marquee is not a ground piece
    c.dispose();
  });

  it("the 'button' prompt shows the device's Use button and follows the device", () => {
    const c = createBoothController(new THREE.MeshBasicMaterial(), { spec: SPEC, slot: 0, frames: 2 });
    const uv = c.mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    const s = c.build.slots.get('prompt')!;
    c.setPrompt('button');
    const near = (r: readonly number[]): boolean => Math.abs(uv.getX(s.start) - (r[0] + s.unit[0] * r[2])) < 1e-6;
    expect(near(deviceUv('keyboard'))).toBe(true);
    c.setDevice('gamepad');
    expect(near(deviceUv('gamepad'))).toBe(true);
    c.dispose();
  });

  it('extra geometry merges into the one mesh', () => {
    const extra = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const a = buildBoothGeometry(SPEC);
    const b = buildBoothGeometry(SPEC, () => 0, [extra]);
    expect(b.geometry.getAttribute('position').count).toBe(a.geometry.getAttribute('position').count + extra.getAttribute('position').count);
    expect(b.geometry.groups.length).toBe(0);
  });

  it('the gates booth stays within the triangle budget', () => {
    expect(buildBoothGeometry(GATE_BOOTH).triangles).toBeLessThanOrEqual(1500);
  });
});
