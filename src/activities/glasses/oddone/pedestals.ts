/**
 * The three both-eye pedestals (one instanced mesh, one draw call) and their round press buttons
 * (one instanced mesh, one draw call). All three look exactly alike. Dark body + bright cream cap
 * + bright yellow button: strong brightness contrast, so they read in R-only and in G-only.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ODD } from './constants';

const BODY = 0x3a3484;
const BASE = 0x1f2138;
const CAP = 0xf3ead6;
const BAND = 0xf3ead6;
const BUTTON = 0xffd84a;
const BUTTON_RIM = 0x262840;

function painted(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g !== geo) geo.dispose();
  return g;
}

/** Pedestal geometry with its base at y = 0. */
export function pedestalGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const base = new THREE.BoxGeometry(ODD.baseSize, ODD.baseHeight, ODD.baseSize);
  base.translate(0, ODD.baseHeight / 2, 0);
  parts.push(painted(base, BASE));
  const colH = ODD.capBottom - ODD.baseHeight;
  const col = new THREE.CylinderGeometry(ODD.columnRadius * 0.92, ODD.columnRadius, colH, 20);
  col.translate(0, ODD.baseHeight + colH / 2, 0);
  parts.push(painted(col, BODY));
  const band = new THREE.CylinderGeometry(ODD.columnRadius + 0.03, ODD.columnRadius + 0.03, 0.09, 20);
  band.translate(0, ODD.baseHeight + 0.24, 0);
  parts.push(painted(band, BAND));
  const cap = new THREE.CylinderGeometry(ODD.capRadius, ODD.capRadius * 0.94, ODD.capHeight, 24);
  cap.translate(0, ODD.capBottom + ODD.capHeight / 2, 0);
  parts.push(painted(cap, CAP));
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('oddone: pedestal merge failed');
  return merged;
}

/** Button geometry with its base at y = 0 (a dark rim ring and a bright dome-ish top). */
export function buttonGeometry(): THREE.BufferGeometry {
  const rim = new THREE.CylinderGeometry(ODD.buttonRadius + 0.06, ODD.buttonRadius + 0.06, 0.05, 24);
  rim.translate(0, 0.025, 0);
  const top = new THREE.CylinderGeometry(ODD.buttonRadius * 0.86, ODD.buttonRadius, ODD.buttonHeight, 24);
  top.translate(0, ODD.buttonHeight / 2, 0);
  const parts = [painted(rim, BUTTON_RIM), painted(top, BUTTON)];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('oddone: button merge failed');
  return merged;
}

export interface PedestalSet {
  readonly pedestals: THREE.InstancedMesh;
  readonly buttons: THREE.InstancedMesh;
  /** Ground under each pedestal. */
  readonly base: readonly THREE.Vector3[];
  /** Per pedestal: squash 0..1 (button down), wobble 0..1, flash 0..1. */
  pose(i: number, squash: number, wobble: number, flash: number, time: number): void;
  commit(): void;
  dispose(): void;
}

export function createPedestals(base: readonly THREE.Vector3[], facingYaw: number): PedestalSet {
  const pGeo = pedestalGeometry();
  const bGeo = buttonGeometry();
  const pMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0 });
  const bMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0, emissive: 0x2a2208 });
  const pedestals = new THREE.InstancedMesh(pGeo, pMat, base.length);
  const buttons = new THREE.InstancedMesh(bGeo, bMat, base.length);
  pedestals.name = 'OddOnePedestals';
  buttons.name = 'OddOneButtons';
  for (const m of [pedestals, buttons]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  const btn = new THREE.Matrix4();
  const pose = (i: number, squash: number, wobble: number, flash: number, time: number): void => {
    const b = base[i];
    const tilt = wobble > 0 ? Math.sin(time * 26 + i) * 0.09 * wobble : 0;
    d.position.copy(b);
    d.rotation.set(tilt * 0.6, facingYaw, tilt, 'YXZ');
    d.scale.set(1 + 0.05 * squash, 1 - 0.04 * squash, 1 + 0.05 * squash);
    d.updateMatrix();
    pedestals.setMatrixAt(i, d.matrix);
    // The button rides on the (possibly wobbling) pedestal top: same pose, no pedestal scale.
    const top = ODD.capBottom + ODD.capHeight;
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    btn.makeScale(1 + 0.25 * squash, Math.max(0.25, 1 - 0.7 * squash), 1 + 0.25 * squash).setPosition(0, top * (1 - 0.04 * squash), 0);
    buttons.setMatrixAt(i, btn.premultiply(d.matrix));
    const k = 1 + 1.5 * flash;
    pedestals.setColorAt(i, c.setRGB(k, k, k));
    buttons.setColorAt(i, c.setRGB(1 + 0.6 * flash, 1 + 0.6 * flash, 1 + 0.6 * flash));
  };
  for (let i = 0; i < base.length; i++) pose(i, 0, 0, 0, 0);
  return {
    pedestals,
    buttons,
    base,
    pose,
    commit() {
      for (const m of [pedestals, buttons]) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.computeBoundingSphere();
      }
    },
    dispose() {
      pGeo.dispose();
      bGeo.dispose();
      pMat.dispose();
      bMat.dispose();
      pedestals.dispose();
      buttons.dispose();
    },
  };
}
