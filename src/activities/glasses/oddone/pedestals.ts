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
/** Panel face: dark neutral grey (display ≈ 0.2, equal R and G, like the toolkit's DOT_BOARD_GREY). */
const PANEL = 0x333333;
const RIM = 0xe8e0cc;

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
  // Pole and the dark round "screen" every weak-eye shape sits on (identical on all three).
  const top = ODD.capBottom + ODD.capHeight;
  const poleTop = ODD.shapeHeight - ODD.panelRadius * 0.6;
  const pole = new THREE.CylinderGeometry(ODD.poleRadius, ODD.poleRadius * 1.3, poleTop - top, 12);
  pole.translate(0, top + (poleTop - top) / 2, 0);
  parts.push(painted(pole, BODY));
  const disc = (r: number, depth: number, z: number, hex: number): THREE.BufferGeometry => {
    const g = new THREE.CylinderGeometry(r, r, depth, 48);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, z);
    g.rotateX(-ODD.panelTilt);
    g.translate(0, ODD.shapeHeight, 0);
    return painted(g, hex);
  };
  parts.push(disc(ODD.rimRadius, ODD.panelDepth, 0, RIM));
  parts.push(disc(ODD.panelRadius, ODD.panelDepth, 0.012, PANEL));
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

/** World frame of a panel face for pedestals facing `facingYaw`: in-plane right/up and the outward normal. */
export function panelFrame(facingYaw: number): { right: THREE.Vector3; up: THREE.Vector3; normal: THREE.Vector3 } {
  const t = ODD.panelTilt;
  const toWorld = (x: number, y: number, z: number): THREE.Vector3 =>
    new THREE.Vector3(x * Math.cos(facingYaw) + z * Math.sin(facingYaw), y, -x * Math.sin(facingYaw) + z * Math.cos(facingYaw));
  return { right: toWorld(1, 0, 0), up: toWorld(0, Math.cos(t), -Math.sin(t)), normal: toWorld(0, Math.sin(t), Math.cos(t)) };
}

/** Distance from the panel centre to the front of its face, along the normal. */
export const PANEL_FACE = ODD.panelDepth / 2 + 0.012;

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
    // A wrong press shakes the pedestal with a quick twist about its own axis, so the panel stays
    // behind its floating shape.
    const twist = wobble > 0 ? Math.sin(time * 26 + i) * 0.08 * wobble : 0;
    d.position.copy(b);
    d.rotation.set(0, facingYaw + twist, 0);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    pedestals.setMatrixAt(i, d.matrix);
    // The button rides on the (possibly wobbling) pedestal top: same pose, no pedestal scale.
    const top = ODD.capBottom + ODD.capHeight;
    btn.makeScale(1 + 0.25 * squash, Math.max(0.25, 1 - 0.7 * squash), 1 + 0.25 * squash).setPosition(0, top, 0);
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
