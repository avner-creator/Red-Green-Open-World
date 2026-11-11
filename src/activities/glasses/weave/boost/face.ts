/**
 * The Emote button's face (the HUD `emote` icon: a smiley with a little four-point sparkle), as one
 * flat weak-eye mesh (1 draw) that sits inside the turbo-tap ring, so a child who sees the ring
 * also sees which button it means. Local XY plane facing +Z (the ring's `wall` facing), grey only.
 */
import * as THREE from 'three';
import { createLayerMaterial } from '../../../../vision';

function annulus(cx: number, cy: number, r0: number, r1: number, a0 = 0, a1 = Math.PI * 2): THREE.Shape {
  const s = new THREE.Shape();
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    s.absarc(cx, cy, r1, 0, Math.PI * 2, false);
    const h = new THREE.Path();
    h.absarc(cx, cy, r0, 0, Math.PI * 2, true);
    s.holes.push(h);
    return s;
  }
  s.absarc(cx, cy, r1, a0, a1, false);
  s.absarc(cx, cy, r0, a1, a0, true);
  s.closePath();
  return s;
}

function disc(cx: number, cy: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(cx, cy, r, 0, Math.PI * 2, false);
  return s;
}

function sparkle(cx: number, cy: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const k = r * 0.3;
  s.moveTo(cx, cy + r);
  s.lineTo(cx + k, cy + k);
  s.lineTo(cx + r, cy);
  s.lineTo(cx + k, cy - k);
  s.lineTo(cx, cy - r);
  s.lineTo(cx - k, cy - k);
  s.lineTo(cx - r, cy);
  s.lineTo(cx - k, cy + k);
  s.closePath();
  return s;
}

export interface EmoteFace {
  readonly mesh: THREE.Mesh;
  /** Coverage 0..1 (tier opacity × fade). */
  setOpacity(o: number): void;
  dispose(): void;
}

/** Face of radius `r` (metres), centred on the origin. */
export function createEmoteFace(r: number, level = 1): EmoteFace {
  const w = r * 0.2;
  const shapes = [
    annulus(0, 0, r - w, r),
    disc(-r * 0.36, r * 0.24, r * 0.15),
    disc(r * 0.36, r * 0.24, r * 0.15),
    annulus(0, -r * 0.02, r * 0.42, r * 0.42 + w, Math.PI * 1.15, Math.PI * 1.85),
    // Seen from behind (the chase camera looks along +Z), so -X is the right-hand side.
    sparkle(-r * 1.05, r * 1.05, r * 0.45),
  ];
  const geo = new THREE.ShapeGeometry(shapes, 24);
  const mat = createLayerMaterial(level, 1);
  mat.transparent = true;
  mat.depthWrite = false;
  mat.side = THREE.DoubleSide;
  mat.toneMapped = false;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'boostFace';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return {
    mesh,
    setOpacity(o) {
      mat.opacity = Math.min(1, Math.max(0, o));
      mesh.visible = mat.opacity > 0;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
