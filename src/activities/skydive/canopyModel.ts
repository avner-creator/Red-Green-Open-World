/**
 * Ram-air parachute (both-eye, main scene): an arched wing of airfoil cells in bright/dark stripes
 * (brightness contrast, so it reads in R-only and G-only), suspension lines to the shoulders.
 * Origin = the riser confluence just above the rider's shoulders; the wing hangs ~5 m above it.
 */
import * as THREE from 'three';

const CELLS = 9;
const ARC_RADIUS = 4.6;
const ARC_HALF = 0.92; // radians each side
const CHORD = 2.5;
const LIFT = 5.2;
const STRIPES = [0xffc93c, 0x1b2a55, 0xf6f1e6, 0x1b2a55, 0xff8a3d, 0x1b2a55, 0xf6f1e6, 0x1b2a55, 0xffc93c];

export interface CanopyModel {
  readonly root: THREE.Group;
  dispose(): void;
}

function airfoilShape(): THREE.Shape {
  // Chord along x (−front … +back), thickness up.
  const s = new THREE.Shape();
  const n = 14;
  s.moveTo(-CHORD / 2, 0);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = -CHORD / 2 + t * CHORD;
    const y = 0.42 * Math.sin(Math.PI * Math.pow(t, 0.65)) * (1 - t * 0.35);
    s.lineTo(x, y);
  }
  for (let i = n - 1; i >= 1; i--) {
    const t = i / n;
    s.lineTo(-CHORD / 2 + t * CHORD, -0.04 * Math.sin(Math.PI * t));
  }
  s.closePath();
  return s;
}

export function createCanopyModel(): CanopyModel {
  const root = new THREE.Group();
  root.name = 'canopy';
  const disposables: { dispose(): void }[] = [];
  const wing = new THREE.Group();
  wing.position.y = LIFT;
  root.add(wing);

  const step = (ARC_HALF * 2) / CELLS;
  const cellWidth = 2 * ARC_RADIUS * Math.sin(step / 2) * 1.02;
  const geo = new THREE.ExtrudeGeometry(airfoilShape(), { depth: cellWidth, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 4 });
  geo.translate(0, 0, -cellWidth / 2);
  // Chord runs front (+Z of the rider) to back: rotate so x(chord) → −z.
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  disposables.push(geo);
  const mats = new Map<number, THREE.MeshStandardMaterial>();
  const matFor = (hex: number): THREE.MeshStandardMaterial => {
    let m = mats.get(hex);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, side: THREE.DoubleSide });
      mats.set(hex, m);
      disposables.push(m);
    }
    return m;
  };
  const anchors: THREE.Vector3[] = [];
  for (let i = 0; i < CELLS; i++) {
    const a = -ARC_HALF + step * (i + 0.5);
    const cell = new THREE.Mesh(geo, matFor(STRIPES[i % STRIPES.length]));
    // Arc in the x-y plane, centre below the wing.
    cell.position.set(Math.sin(a) * ARC_RADIUS, Math.cos(a) * ARC_RADIUS - ARC_RADIUS, 0);
    cell.rotation.z = -a;
    cell.castShadow = true;
    wing.add(cell);
  }
  // Line attachment points on the ribs (front and rear) under the wing.
  for (let i = 0; i <= CELLS; i++) {
    const a = -ARC_HALF + step * i;
    const x = Math.sin(a) * (ARC_RADIUS - 0.05);
    const y = LIFT + Math.cos(a) * (ARC_RADIUS - 0.05) - ARC_RADIUS;
    anchors.push(new THREE.Vector3(x, y, CHORD * 0.38), new THREE.Vector3(x, y, -CHORD * 0.3));
  }
  const pts: number[] = [];
  for (const p of anchors) {
    const side = p.x < 0 ? -0.22 : 0.22;
    pts.push(side, 0, 0, p.x, p.y, p.z);
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: 0x15161a, transparent: true, opacity: 0.85 });
  disposables.push(lineGeo, lineMat);
  root.add(new THREE.LineSegments(lineGeo, lineMat));
  // Risers: two short straps down to the harness.
  const riserMat = new THREE.MeshStandardMaterial({ color: 0x202024, roughness: 0.7 });
  const riserGeo = new THREE.BoxGeometry(0.06, 0.55, 0.03).translate(0, -0.27, 0);
  disposables.push(riserMat, riserGeo);
  for (const sx of [-0.22, 0.22]) {
    const r = new THREE.Mesh(riserGeo, riserMat);
    r.position.set(sx, 0.05, 0);
    root.add(r);
  }
  root.traverse((o) => {
    o.frustumCulled = false;
  });

  return {
    root,
    dispose() {
      root.removeFromParent();
      for (const d of disposables) d.dispose();
    },
  };
}
