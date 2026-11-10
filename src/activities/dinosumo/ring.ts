/**
 * The Dino Sumo set: a round raised inflatable mat with a striped skirt, a ring of chunky pool
 * noodles, four striped posts with two crossing ropes for the water balloons, and a ticket booth
 * with a pictogram sign. One merged vertex-coloured mesh (+ sign + shadow proxy). Ring space =
 * the group's local space: mat top at y = 0, origin at the ring centre.
 */
import * as THREE from 'three';
import { asShadowProxy } from '../../core/shadow-proxy';
import { PAL } from '../bubbleball/arena';
import { MergeKit, TRS, UNIT, between, pictoTexture, setMaterial } from '../bubbleball/merge';
import { RING } from './sumo';

export const SET = {
  deck: 6.0,
  postR: 5.45,
  ropeY: 3.7,
  booth: { x: 0, z: -8.6 },
} as const;

export interface RingModel {
  readonly group: THREE.Group;
  readonly booth: THREE.Vector3;
  /** Rope attachment height (ring space) for balloon strings. */
  readonly ropeY: number;
  readonly triangles: number;
  dispose(): void;
}

function dinoSign(g: CanvasRenderingContext2D, s: number): void {
  g.fillStyle = '#10142e';
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = s * 0.05;
  g.strokeStyle = '#ffffff';
  g.stroke();
  // A round, happy dino with a big tail, and a water balloon above.
  g.lineJoin = 'round';
  g.fillStyle = '#ffe680';
  g.strokeStyle = '#000';
  g.lineWidth = s * 0.025;
  g.beginPath();
  g.ellipse(s * 0.47, s * 0.62, s * 0.2, s * 0.17, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(s * 0.3, s * 0.64);
  g.quadraticCurveTo(s * 0.12, s * 0.66, s * 0.1, s * 0.5);
  g.quadraticCurveTo(s * 0.2, s * 0.6, s * 0.32, s * 0.56);
  g.fill();
  g.stroke();
  g.beginPath();
  g.ellipse(s * 0.63, s * 0.43, s * 0.11, s * 0.09, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#000';
  g.beginPath();
  g.arc(s * 0.66, s * 0.41, s * 0.022, 0, Math.PI * 2);
  g.fill();
  // Balloon.
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(s * 0.72, s * 0.2, s * 0.07, s * 0.085, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.strokeStyle = '#ffffff';
  g.lineWidth = s * 0.012;
  g.beginPath();
  g.moveTo(s * 0.72, s * 0.29);
  g.lineTo(s * 0.72, s * 0.08);
  g.stroke();
}

export function createRingModel(opts: { skirt: number; boothDy: number; site: { x: number; z: number; yaw: number; deckY: number } }): RingModel {
  const k = new MergeKit();
  const proxy = new MergeKit();
  // ── Deck: round skirt in panels, a top disc and a puffy rim ──
  const skirtH = opts.skirt + 0.5;
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    const w = (2 * Math.PI * SET.deck) / n;
    const col = i % 2 ? PAL.navy : i % 4 === 0 ? PAL.yellow : PAL.coral;
    k.add(UNIT.box, col, TRS(Math.sin(a) * SET.deck, -skirtH / 2, Math.cos(a) * SET.deck, a, w * 1.02, skirtH, 0.3));
  }
  const top = new THREE.CylinderGeometry(SET.deck, SET.deck, 0.2, 48);
  k.add(top, PAL.navy, TRS(0, -0.1, 0));
  top.dispose();
  const rim = new THREE.TorusGeometry(SET.deck, 0.3, 10, 64).rotateX(Math.PI / 2);
  k.add(rim, PAL.white, TRS(0, 0.05, 0));
  rim.dispose();
  proxy.add(UNIT.cyl, 0, TRS(0, -skirtH / 2, 0, 0, SET.deck, skirtH, SET.deck));

  // ── Mat: light canvas inside the ring with a sunburst, darker band outside it ──
  const inner = new THREE.CircleGeometry(RING.r, 48).rotateX(-Math.PI / 2);
  k.add(inner, 0xf4ead2, TRS(0, 0.01, 0));
  inner.dispose();
  const rays = 16;
  for (let i = 0; i < rays; i++) {
    const a0 = (i / rays) * Math.PI * 2;
    const ray = new THREE.CircleGeometry(RING.r - 0.35, 3, a0, Math.PI / rays).rotateX(-Math.PI / 2);
    k.add(ray, i % 2 ? 0xe2d2ad : 0xf4ead2, TRS(0, 0.015, 0));
    ray.dispose();
  }
  const outer = new THREE.RingGeometry(RING.r, SET.deck - 0.05, 48, 1).rotateX(-Math.PI / 2);
  k.add(outer, 0x2a8a8a, TRS(0, 0.01, 0));
  outer.dispose();
  const centre = new THREE.CircleGeometry(0.55, 24).rotateX(-Math.PI / 2);
  k.add(centre, PAL.navy, TRS(0, 0.02, 0));
  centre.dispose();
  // Start marks: four short white dashes.
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    k.add(UNIT.box, PAL.white, TRS(Math.sin(a) * 2.6, 0.025, Math.cos(a) * 2.6, a + Math.PI / 2, 0.9, 0.02, 0.14));
  }

  // ── Pool-noodle ring: chunky curved segments in alternating colours ──
  const segs = 18;
  for (let i = 0; i < segs; i++) {
    const arc = (Math.PI * 2) / segs;
    const g = new THREE.TorusGeometry(RING.r + 0.18, 0.18, 8, 6, arc * 0.92).rotateX(Math.PI / 2);
    g.rotateY(-i * arc);
    k.add(g, i % 2 ? PAL.navy : i % 4 === 0 ? PAL.yellow : PAL.coral, TRS(0, 0.19, 0));
    g.dispose();
  }

  // ── Posts and crossing ropes ──
  const posts: [number, number][] = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const px = Math.sin(a) * SET.postR;
    const pz = Math.cos(a) * SET.postR;
    posts.push([px, pz]);
    const bands = 6;
    for (let b = 0; b < bands; b++) k.add(UNIT.cyl, b % 2 ? PAL.navy : PAL.white, TRS(px, ((b + 0.5) * SET.ropeY) / bands, pz, 0, 0.16, SET.ropeY / bands, 0.16));
    k.add(UNIT.sphere, PAL.yellow, TRS(px, SET.ropeY + 0.12, pz, 0, 0.26, 0.26, 0.26));
    proxy.add(UNIT.cylLow, 0, TRS(px, SET.ropeY / 2, pz, 0, 0.16, SET.ropeY, 0.16));
  }
  for (let i = 0; i < 2; i++) {
    const [ax, az] = posts[i];
    const [bx, bz] = posts[i + 2];
    // A gentle sag in four pieces.
    const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => [ax + (bx - ax) * t, SET.ropeY - Math.sin(Math.PI * t) * 0.18, az + (bz - az) * t]);
    for (let p = 0; p < 4; p++) k.add(UNIT.cylLow, PAL.white, between(pts[p][0], pts[p][1], pts[p][2], pts[p + 1][0], pts[p + 1][1], pts[p + 1][2], 0.035));
  }
  // Bunting pennants on the ropes.
  for (let i = 0; i < 2; i++) {
    const [ax, az] = posts[i];
    const [bx, bz] = posts[i + 2];
    const yaw = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
    for (let p = 1; p < 12; p++) {
      const t = p / 12;
      if (Math.abs(t - 0.5) < 0.06) continue;
      const flag = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.17, 0, 0), new THREE.Vector3(0.17, 0, 0), new THREE.Vector3(0, -0.42, 0)]);
      flag.setIndex([0, 1, 2, 0, 2, 1]);
      flag.computeVertexNormals();
      k.add(flag, p % 2 ? PAL.yellow : PAL.white, TRS(ax + (bx - ax) * t, SET.ropeY - Math.sin(Math.PI * t) * 0.18 - 0.02, az + (bz - az) * t, yaw));
      flag.dispose();
    }
  }

  // ── Booth (ground level, north side) ──
  const B = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0): THREE.Matrix4 =>
    TRS(SET.booth.x, opts.boothDy, SET.booth.z).multiply(TRS(x, y, z, ry, sx, sy, sz, rx));
  k.add(UNIT.box, PAL.white, B(0, 0.5, 0, 0, 2.2, 1.0, 1.1));
  k.add(UNIT.box, PAL.navy, B(0, 1.02, 0.05, 0, 2.4, 0.1, 1.3));
  for (const sx of [-1, 1]) k.add(UNIT.cylLow, PAL.white, B(sx * 1.05, 1.6, -0.4, 0, 0.07, 1.4, 0.07));
  for (let i = 0; i < 6; i++) k.add(UNIT.box, i % 2 ? PAL.navy : PAL.coral, B(-1.1 + 0.44 * i + 0.22, 2.35, 0.1, 0, 0.44, 0.08, 1.5, 0.28));
  k.add(UNIT.box, PAL.navy, B(0, 2.6, -0.45, 0, 2.5, 0.25, 0.25));
  // A little inflatable dino on the roof.
  k.add(UNIT.sphere, 0x8fd65a, B(0.3, 3.0, 0.2, 0, 0.5, 0.42, 0.45));
  k.add(UNIT.sphere, 0x8fd65a, B(0.55, 3.55, -0.05, 0, 0.26, 0.24, 0.28));
  k.add(UNIT.sphere, 0x8fd65a, B(-0.25, 2.9, 0.5, 0, 0.3, 0.14, 0.16));
  for (const sx of [-1, 1]) {
    k.add(UNIT.sphere, PAL.white, B(0.55 + sx * 0.12, 3.68, -0.25, 0, 0.08, 0.08, 0.08));
    k.add(UNIT.sphere, PAL.ink, B(0.55 + sx * 0.12, 3.69, -0.31, 0, 0.04, 0.04, 0.04));
  }
  proxy.add(UNIT.box, 0, B(0, 1.2, 0, 0, 2.3, 2.4, 1.2));

  const geo = k.build();
  const mat = setMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'dinosumo-set';
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.name = 'dinosumo';
  group.add(mesh);
  const tex = pictoTexture(dinoSign);
  const signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide });
  const sign = new THREE.Mesh(new THREE.CircleGeometry(0.85, 40), signMat);
  sign.name = 'dinosumo-sign';
  sign.applyMatrix4(B(0, 3.3, -1.0, Math.PI));
  group.add(sign);
  const proxyMesh = asShadowProxy(new THREE.Mesh(proxy.build()));
  group.add(proxyMesh);
  group.position.set(opts.site.x, opts.site.deckY, opts.site.z);
  group.rotation.y = opts.site.yaw;
  group.updateMatrixWorld(true);
  const booth = new THREE.Vector3().setFromMatrixPosition(B(0, 1.0, -0.9)).applyMatrix4(group.matrixWorld);
  return {
    group,
    booth,
    ropeY: SET.ropeY,
    triangles: (geo.attributes.position.count / 3) | 0,
    dispose() {
      geo.dispose();
      mat.dispose();
      sign.geometry.dispose();
      signMat.dispose();
      tex.dispose();
      proxyMesh.geometry.dispose();
    },
  };
}
