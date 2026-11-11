import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFader, fadeValue } from '../../src/vision/toolkit/fade';
import { ATLAS, GLYPHS, glyphAdvance, glyphCell, layoutGlyphs, resolveGlyph } from '../../src/vision/toolkit/glyphs';
import { timingRadius, timingWindow, TIMING_DEFAULTS } from '../../src/vision/toolkit/rings';
import { MIN_SIZE_SCALE, TIERS, toTier, withChallenge } from '../../src/vision/toolkit/tiers';
import type { GlassesTier } from '../../src/types';

describe('timing window', () => {
  it('grades presses around the perfect moment', () => {
    const p = TIMING_DEFAULTS.perfectAt;
    expect(timingWindow(p)).toEqual({ grade: 'perfect', score: 1, offset: 0 });
    expect(timingWindow(p + 0.03).grade).toBe('perfect');
    expect(timingWindow(p - 0.08).grade).toBe('good');
    expect(timingWindow(p + 0.08).grade).toBe('good');
    expect(timingWindow(p - 0.3).grade).toBe('early');
    expect(timingWindow(p + 0.19).grade).toBe('late');
    expect(timingWindow(p - 0.3).score).toBe(0);
    expect(timingWindow(p + 0.06).score).toBeCloseTo(0.5);
  });

  it('score falls off symmetrically and monotonically', () => {
    let prev = 1;
    for (let d = 0; d <= 0.2; d += 0.01) {
      const a = timingWindow(0.8 + d).score;
      expect(a).toBeCloseTo(timingWindow(0.8 - d).score, 10);
      expect(a).toBeLessThanOrEqual(prev + 1e-12);
      prev = a;
    }
  });

  it('honours custom windows', () => {
    expect(timingWindow(0.5, { perfectAt: 0.5 }).grade).toBe('perfect');
    expect(timingWindow(0.55, { perfectAt: 0.5, perfect: 0.01, good: 0.03 }).grade).toBe('late');
  });

  it('closing ring radius meets the target at perfectAt and keeps closing after', () => {
    expect(timingRadius(0, 0.5, 1.1)).toBeCloseTo(1.1);
    expect(timingRadius(0.8, 0.5, 1.1)).toBeCloseTo(0.5);
    expect(timingRadius(1, 0.5, 1.1)).toBeLessThan(0.5);
    expect(timingRadius(1, 0.5, 1.1)).toBeGreaterThan(0);
  });
});

describe('tiers', () => {
  it('get smaller, fainter, faster and worth more', () => {
    const t = [TIERS[1], TIERS[2], TIERS[3]];
    for (let i = 1; i < 3; i++) {
      expect(t[i].size).toBeLessThan(t[i - 1].size);
      expect(t[i].level).toBeLessThan(t[i - 1].level);
      expect(t[i].opacity).toBeLessThan(t[i - 1].opacity);
      expect(t[i].speed).toBeGreaterThan(t[i - 1].speed);
      expect(t[i].reward).toBeGreaterThan(t[i - 1].reward);
    }
    for (const p of t) for (const v of [p.size, p.level, p.opacity]) expect(v).toBeLessThanOrEqual(1);
  });

  it('withChallenge applies sizeScale and never returns anything larger or brighter', () => {
    for (const tier of [1, 2, 3] as GlassesTier[]) {
      const p = TIERS[tier];
      expect(withChallenge(tier)).toEqual(p);
      expect(withChallenge(tier, null)).toEqual(p);
      expect(withChallenge(tier, { sizeScale: 0.8 }).size).toBeCloseTo(p.size * 0.8);
      for (const s of [-1, 0, 0.1, 0.5, 1, 1.5, 10, Number.NaN, Infinity]) {
        const r = withChallenge(tier, { sizeScale: s, weakScale: 2, level: 3, maxLevel: 5, strongScale: 1 });
        expect(r.size).toBeLessThanOrEqual(p.size);
        expect(r.size).toBeGreaterThanOrEqual(p.size * MIN_SIZE_SCALE - 1e-12);
        expect(r.level).toBeLessThanOrEqual(p.level);
        expect(r.opacity).toBeLessThanOrEqual(p.opacity);
        expect(r.reward).toBe(p.reward);
      }
    }
  });

  it('toTier clamps', () => {
    expect([0, 1, 1.5, 2, 2.9, 3, 9].map(toTier)).toEqual([1, 1, 1, 2, 2, 3, 3]);
  });
});

describe('fader', () => {
  it('fadeValue eases from → to and is exact at both ends', () => {
    expect(fadeValue(1, 0, 0, 2)).toBe(1);
    expect(fadeValue(1, 0, 2, 2)).toBe(0);
    expect(fadeValue(1, 0, 5, 2)).toBe(0);
    expect(fadeValue(1, 0, 1, 2)).toBeCloseTo(0.5);
    expect(fadeValue(0.2, 0.8, 3, 0)).toBe(0.8);
    let prev = 1;
    for (let t = 0; t <= 2; t += 0.1) {
      const v = fadeValue(1, 0, t, 2);
      expect(v).toBeLessThanOrEqual(prev + 1e-12);
      prev = v;
    }
  });

  it('scales opacity of any material, hides at 0, restores exactly', () => {
    const basic = new THREE.MeshBasicMaterial({ opacity: 0.8, transparent: true });
    const opaque = new THREE.MeshStandardMaterial();
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), basic), new THREE.Mesh(new THREE.BoxGeometry(), [opaque, basic]));
    const f = createFader(group);
    expect(basic.opacity).toBe(0.8);
    expect(opaque.transparent).toBe(false);
    f.fadeTo(0.5, 1);
    f.update(0.5);
    expect(f.value).toBeCloseTo(0.75);
    f.update(0.5);
    expect(f.value).toBe(0.5);
    expect(basic.opacity).toBeCloseTo(0.4);
    expect(opaque.opacity).toBeCloseTo(0.5);
    expect(opaque.transparent).toBe(true);
    f.set(0);
    expect(basic.visible).toBe(false);
    expect(opaque.visible).toBe(false);
    f.set(1);
    expect(opaque.transparent).toBe(false);
    expect(opaque.visible).toBe(true);
    f.fadeTo(0.3);
    f.restore();
    expect(basic.opacity).toBe(0.8);
    expect(opaque.opacity).toBe(1);
    expect(opaque.transparent).toBe(false);
  });

  it('is deterministic for any split of dt', () => {
    const run = (steps: number[]): number => {
      const f = createFader(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
      f.fadeTo(0, 1.2);
      for (const s of steps) f.update(s);
      return f.value;
    };
    expect(run([0.3, 0.3])).toBeCloseTo(run([0.1, 0.2, 0.15, 0.15]), 12);
  });

  it('uses a toolkit fade uniform, or injects one into other shader materials', () => {
    const fadeU = { value: 1 };
    const own = new THREE.ShaderMaterial({ uniforms: { fade: fadeU }, transparent: true });
    const other = new THREE.ShaderMaterial({ fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }', transparent: true });
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(), own), new THREE.Mesh(new THREE.BoxGeometry(), other));
    const f = createFader(g);
    f.set(0.25);
    expect(fadeU.value).toBe(0.25);
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, fragmentShader: other.fragmentShader, vertexShader: '' } as unknown as THREE.WebGLProgramParametersWithUniforms;
    other.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('gl_FragColor.a *= toolkitFade;');
    expect(shader.uniforms.toolkitFade.value).toBe(0.25);
  });

  it('clone option leaves shared materials alone', () => {
    const shared = new THREE.MeshBasicMaterial();
    const a = new THREE.Mesh(new THREE.BoxGeometry(), shared);
    const b = new THREE.Mesh(new THREE.BoxGeometry(), shared);
    createFader(a, { clone: true }).set(0.5);
    expect(shared.opacity).toBe(1);
    expect((a.material as THREE.MeshBasicMaterial).opacity).toBe(0.5);
    expect(b.material).toBe(shared);
  });
});

describe('glyph atlas layout', () => {
  it('every glyph has its own cell inside the atlas', () => {
    expect(GLYPHS.length).toBeLessThanOrEqual(ATLAS.cols * ATLAS.rows);
    expect(new Set(GLYPHS).size).toBe(GLYPHS.length);
    const cells = new Set<string>();
    for (const g of GLYPHS) {
      const c = glyphCell(g)!;
      expect(c).not.toBeNull();
      cells.add(`${c.col},${c.row}`);
      for (const v of [c.u0, c.u1, c.v0, c.v1]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(c.u1 - c.u0).toBeCloseTo(1 / ATLAS.cols);
      expect(c.v1 - c.v0).toBeCloseTo(1 / ATLAS.rows);
    }
    expect(cells.size).toBe(GLYPHS.length);
    for (const need of ['0', '9', '×', '+', '!', '?', '←', '→', '↑', '↓', '✓']) expect(GLYPHS).toContain(need);
  });

  it('resolves aliases and unknown characters', () => {
    expect(resolveGlyph('x')).toBe('×');
    expect(resolveGlyph('>')).toBe('→');
    expect(resolveGlyph('Q')).toBe('?');
    expect(resolveGlyph(' ')).toBe(' ');
  });

  it('lays a string out centred, left to right, with UVs inside each glyph cell', () => {
    const lay = layoutGlyphs('×12', 0.78, 0);
    expect(lay.height).toBeCloseTo(1);
    expect(lay.quads.map((q) => q.ch)).toEqual(['×', '1', '2']);
    expect(lay.width).toBeCloseTo(glyphAdvance('×') + 2 * glyphAdvance('1'));
    expect(lay.quads[0].x0).toBeCloseTo(-lay.width / 2);
    expect(lay.quads[2].x1).toBeCloseTo(lay.width / 2);
    for (let i = 1; i < lay.quads.length; i++) expect(lay.quads[i].x0).toBeCloseTo(lay.quads[i - 1].x1);
    for (const q of lay.quads) {
      const c = glyphCell(q.ch)!;
      expect(q.u0).toBeGreaterThanOrEqual(c.u0);
      expect(q.u1).toBeLessThanOrEqual(c.u1);
      expect((q.u0 + q.u1) / 2).toBeCloseTo((c.u0 + c.u1) / 2);
    }
    // Spaces advance but draw nothing.
    const sp = layoutGlyphs('1 2', 1);
    expect(sp.quads).toHaveLength(2);
  });
});
