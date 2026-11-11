/**
 * Beacon balloons: a big striped marker balloon on a rope above every attraction, carrying the
 * attraction's icon on a badge that always turns to face the camera. Both-eye landmarks that read by
 * brightness and shape (dark badge, white ring, white figure). Three instanced draws in total.
 */
import * as THREE from 'three';
import { patch } from './materials';
import { pictoUv } from './pictograms';
import type { BeaconDef } from './wayfinding';
import type { Quality } from '../types';

const R = 2.4;

/** Balloon: a slightly tall sphere with 10 alternating gores (aStripe = 1 on white gores) and a knot. */
function balloonGeo(seg = 20, rings = 10): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(R, seg, rings).toNonIndexed();
  const pos = g.attributes.position;
  const stripe = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i += 3) {
    // One value per triangle (crisp gore edges), from the triangle's centre longitude.
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const gore = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 10);
    stripe[i] = stripe[i + 1] = stripe[i + 2] = gore % 2;
  }
  // Teardrop: pinch the bottom.
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = y < 0 ? 1 - 0.28 * (-y / R) ** 2 : 1;
    pos.setXYZ(i, pos.getX(i) * k, y * (y < 0 ? 1.2 : 1.05), pos.getZ(i) * k);
  }
  g.setAttribute('aStripe', new THREE.BufferAttribute(stripe, 1));
  const knot = new THREE.ConeGeometry(0.4, 0.6, 10).translate(0, -R * 1.2 - 0.12, 0).toNonIndexed();
  knot.setAttribute('aStripe', new THREE.BufferAttribute(new Float32Array(knot.attributes.position.count), 1));
  knot.deleteAttribute('uv');
  g.deleteAttribute('uv');
  const parts = [g, knot];
  const merged = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'aStripe']) {
    const size = (g.attributes[name] as THREE.BufferAttribute).itemSize;
    const arr = new Float32Array(parts.reduce((a, p) => a + p.attributes[name].count * size, 0));
    let o = 0;
    for (const p of parts) {
      arr.set((p.attributes[name] as THREE.BufferAttribute).array as Float32Array, o);
      o += p.attributes[name].count * size;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  g.dispose();
  knot.dispose();
  return merged;
}

export interface Beacons {
  group: THREE.Group;
  update(t: number, camera: THREE.Camera): void;
  /** Low: a coarser balloon (same gores, half the triangles). */
  setQuality(q: Quality): void;
}

export function createBeacons(defs: readonly BeaconDef[], atlas: THREE.Texture): Beacons {
  const n = defs.length;
  const group = new THREE.Group();
  group.name = 'beacons';

  const balloonMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0 });
  patch(balloonMat, 'rg-beacon', {
    vertexPre: 'attribute float aStripe; varying float vStripe;',
    vertex: 'vStripe = aStripe;',
    fragmentPre: 'varying float vStripe;',
    fragment: 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.91, 0.86), step(0.5, vStripe));',
  });
  const fullGeo = balloonGeo();
  let lowGeo: THREE.BufferGeometry | null = null;
  const balloons = new THREE.InstancedMesh(fullGeo, balloonMat, n);
  balloons.name = 'beacon:balloons';

  const badgeMat = new THREE.MeshStandardMaterial({
    map: atlas,
    alphaTest: 0.5,
    roughness: 0.5,
    emissive: new THREE.Color(1, 1, 1),
    emissiveMap: atlas,
    emissiveIntensity: 0.35,
  });
  patch(badgeMat, 'rg-beacon-badge', {
    vertexPre: 'attribute vec4 aUvRect;',
    vertex: 'vMapUv = uv * aUvRect.zw + aUvRect.xy;\n#ifdef USE_EMISSIVEMAP\nvEmissiveMapUv = vMapUv;\n#endif',
  });
  const badgeGeo = new THREE.PlaneGeometry(R * 1.5, R * 1.5);
  const rects = new Float32Array(n * 4);
  defs.forEach((d, i) => rects.set(pictoUv(d.icon), i * 4));
  badgeGeo.setAttribute('aUvRect', new THREE.InstancedBufferAttribute(rects, 4));
  const badges = new THREE.InstancedMesh(badgeGeo, badgeMat, n);
  badges.name = 'beacon:badges';

  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.8 });
  const ropes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 5, 1, true).translate(0, 0.5, 0), ropeMat, n);
  ropes.name = 'beacon:ropes';

  const col = new THREE.Color();
  defs.forEach((d, i) => balloons.setColorAt(i, col.set(d.color)));
  for (const m of [balloons, badges, ropes]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = false;
    m.receiveShadow = false;
    // Six instances spread over the island: never cull (the bounding sphere would be stale).
    m.frustumCulled = false;
    group.add(m);
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const knot = new THREE.Vector3();

  return {
    group,
    setQuality(q) {
      balloons.geometry = q === 'low' ? (lowGeo ??= balloonGeo(10, 7)) : fullGeo;
    },
    update(t, camera) {
      camera.getWorldPosition(camPos);
      defs.forEach((d, i) => {
        const ph = i * 1.7;
        const bob = Math.sin(t * 0.9 + ph) * 0.45;
        const sx = Math.sin(t * 0.45 + ph) * 0.9;
        const sz = Math.cos(t * 0.38 + ph * 1.3) * 0.7;
        p.set(d.base.x + sx, d.base.y + d.h + bob, d.base.z + sz);
        // Lean with the drift (the rope pulls the bottom back towards the stake).
        e.set(sz * 0.08, 0, -sx * 0.08, 'XYZ');
        q.setFromEuler(e);
        balloons.setMatrixAt(i, m4.compose(p, q, s.set(1, 1, 1)));
        // Badge: on the camera-facing side of the balloon, turning only around Y.
        const yaw = Math.atan2(camPos.x - p.x, camPos.z - p.z);
        q.setFromAxisAngle(up, yaw);
        const off = R * 0.98;
        badges.setMatrixAt(i, m4.compose(dir.set(p.x + Math.sin(yaw) * off, p.y + 0.05, p.z + Math.cos(yaw) * off), q, s.set(1, 1, 1)));
        // Rope from the stake to the knot.
        knot.set(0, -R * 1.2 - 0.32, 0).applyEuler(e).add(p);
        dir.copy(knot).sub(d.base);
        const len = dir.length();
        q.setFromUnitVectors(up, dir.normalize());
        ropes.setMatrixAt(i, m4.compose(d.base, q, s.set(1, len, 1)));
      });
      balloons.instanceMatrix.needsUpdate = true;
      badges.instanceMatrix.needsUpdate = true;
      ropes.instanceMatrix.needsUpdate = true;
    },
  };
}
