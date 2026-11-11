/**
 * Moving pieces of Bubble Ball. Both-eye: the six bubbles (one instanced shell + one instanced team
 * belt: bright for the player's team, dark for the rivals) and the big panelled ball, with shadow
 * proxies. Weak-eye only (VisionLayer.WeakOnly, never in the main scene): the floating bonus ring
 * and the sparkle on a charged ball.
 */
import * as THREE from 'three';
import { asShadowProxy } from '../../core/shadow-proxy';
import { createGlowMaterial, createLayerMaterial } from '../../vision';
import { UNOCCLUDE_FIX, unoccludable } from './merge';

const TEAM_COLOURS = { home: new THREE.Color(0xffd83d), away: new THREE.Color(0x141c4a) };

/** Bubble shell: thin and clear in the middle, a bright rim at the edge (reads in R and G alone). */
function shellMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float rgRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.6);
       outgoingLight = mix(outgoingLight, vec3(1.0), rgRim * 0.75);
       diffuseColor.a = clamp(diffuseColor.a + rgRim * 0.8, 0.0, 0.95);
       #include <opaque_fragment>`,
    );
  };
  return m;
}

export interface BubbleSet {
  readonly group: THREE.Group;
  /** Place bubble i: centre, orientation, squash (−: flattened). */
  set(i: number, centre: THREE.Vector3, q: THREE.Quaternion, radius: number, squash: number, team: 'home' | 'away'): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

export function createBubbles(count: number): BubbleSet {
  const group = new THREE.Group();
  group.name = 'bubbles';
  const shellGeo = unoccludable(new THREE.SphereGeometry(1, 28, 18));
  const shellMat = shellMaterial();
  const shells = new THREE.InstancedMesh(shellGeo, shellMat, count);
  shells.name = 'bubble-shells';
  shells.renderOrder = 2;
  const beltGeo = unoccludable(new THREE.TorusGeometry(1.0, 0.075, 8, 40).rotateX(Math.PI / 2));
  const beltMat = new THREE.MeshStandardMaterial({ roughness: 0.5 });
  const belts = new THREE.InstancedMesh(beltGeo, beltMat, count * 2);
  belts.name = 'bubble-belts';
  const proxies = asShadowProxy(new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), undefined, count));
  for (const m of [shells, belts, proxies]) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
  }
  shells.castShadow = belts.castShadow = false;
  const mat = new THREE.Matrix4();
  const s = new THREE.Vector3();
  const beltQ = new THREE.Quaternion();
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.0);
  const off = new THREE.Vector3();
  const pos = new THREE.Vector3();
  for (let i = 0; i < count * 2; i++) belts.setColorAt(i, TEAM_COLOURS.home);
  return {
    group,
    set(i, centre, q, r, squash, team) {
      const sq = Math.max(-0.35, Math.min(0.35, squash));
      s.set(r * (1 - sq * 0.5), r * (1 + sq), r * (1 - sq * 0.5));
      mat.compose(centre, q, s);
      proxies.setMatrixAt(i, mat);
      shells.setMatrixAt(i, mat.multiply(UNOCCLUDE_FIX));
      // Two belts: one round the middle and one a little lower (a harness look).
      for (let k = 0; k < 2; k++) {
        beltQ.copy(q).multiply(tilt);
        off.set(0, k === 0 ? 0.05 : -0.42, 0).multiply(s).applyQuaternion(q);
        const ring = k === 0 ? 1.0 : 0.91;
        pos.copy(centre).add(off);
        mat.compose(pos, beltQ, new THREE.Vector3(s.x * ring, s.y, s.z * ring));
        belts.setMatrixAt(i * 2 + k, mat.multiply(UNOCCLUDE_FIX));
        belts.setColorAt(i * 2 + k, TEAM_COLOURS[team]);
      }
      shells.instanceMatrix.needsUpdate = true;
      belts.instanceMatrix.needsUpdate = true;
      proxies.instanceMatrix.needsUpdate = true;
      if (belts.instanceColor) belts.instanceColor.needsUpdate = true;
    },
    setVisible(v) {
      group.visible = v;
    },
    dispose() {
      shellGeo.dispose();
      shellMat.dispose();
      beltGeo.dispose();
      beltMat.dispose();
      proxies.geometry.dispose();
    },
  };
}

/** Classic panelled ball: black pentagon patches on white (pure brightness pattern). */
export function createBallMesh(radius: number): { mesh: THREE.Mesh; proxy: THREE.Mesh; dispose(): void } {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const centres: THREE.Vector3[] = [];
  const p = ico.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i).normalize();
    if (!centres.some((c) => c.distanceTo(v) < 1e-3)) centres.push(v);
  }
  ico.dispose();
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let f = 0; f < pos.count; f += 3) {
    a.fromBufferAttribute(pos, f);
    b.fromBufferAttribute(pos, f + 1);
    c.fromBufferAttribute(pos, f + 2);
    const m = a.add(b).add(c).normalize();
    const dark = centres.some((cv) => cv.dot(m) > 0.93);
    const v = dark ? 0.02 : 0.92;
    for (let k = 0; k < 3; k++) cols.set([v, v, v], (f + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, flatShading: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'bubbleball-ball';
  mesh.scale.setScalar(radius);
  mesh.castShadow = false;
  const proxy = asShadowProxy(new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 6)));
  return {
    mesh,
    proxy,
    dispose() {
      geo.dispose();
      mat.dispose();
      proxy.geometry.dispose();
    },
  };
}

/**
 * The weak-eye-only bonus ring: an upright hoop with a soft glow and orbiting sparkles. Lives in the
 * vision layer scene (world transform set by the caller), never in the main scene.
 */
export interface BonusRingView {
  readonly object: THREE.Group;
  /** Show at a world position, facing along `yaw` (the hoop's axis), with grow-in `t` 0..1. */
  place(pos: THREE.Vector3, yaw: number, appear: number, pop: number, time: number): void;
  hide(): void;
  dispose(): void;
}

export function createBonusRing(radius: number): BonusRingView {
  const object = new THREE.Group();
  object.name = 'bubbleball-bonus-ring';
  const hoopGeo = new THREE.TorusGeometry(radius, 0.12, 10, 48);
  const hoopMat = createLayerMaterial(1);
  const hoop = new THREE.Mesh(hoopGeo, hoopMat);
  const glowGeo = new THREE.TorusGeometry(radius, 0.3, 10, 48);
  const glowMat = createGlowMaterial({ level: 1, coreOpacity: 0.35, rimPower: 1.5, pulse: 0.35 });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  // "×2" pips: two small spheres in the middle of the hoop.
  const pipGeo = new THREE.SphereGeometry(0.16, 12, 8);
  const pipMat = createLayerMaterial(0.9);
  const pips = [new THREE.Mesh(pipGeo, pipMat), new THREE.Mesh(pipGeo, pipMat)];
  pips[0].position.set(-0.25, 0, 0);
  pips[1].position.set(0.25, 0, 0);
  // Sparkles that orbit the hoop.
  const sparkGeo = new THREE.OctahedronGeometry(0.11);
  const sparks: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(sparkGeo, hoopMat);
    sparks.push(m);
  }
  const inner = new THREE.Group();
  inner.add(hoop, glow, ...pips, ...sparks);
  object.add(inner);
  object.visible = false;
  return {
    object,
    place(pos, yaw, appear, pop, time) {
      object.visible = true;
      object.position.copy(pos);
      // TorusGeometry's axis is +Z; turn it so the axis runs along the pitch's X (yaw + 90°).
      object.rotation.set(0, yaw + Math.PI / 2, 0);
      const grow = appear < 1 ? 1 - Math.pow(1 - appear, 3) * Math.cos(appear * 6) : 1;
      const k = Math.max(0.01, grow * (1 + pop * 0.8));
      inner.scale.setScalar(k);
      inner.rotation.z = Math.sin(time * 1.4) * 0.12;
      inner.position.y = Math.sin(time * 2.1) * 0.06;
      glowMat.uniforms.coreOpacity.value = 0.35 * (1 - pop);
      hoopMat.opacity = 1 - pop;
      hoopMat.transparent = pop > 0;
      sparks.forEach((s, i) => {
        const a = time * 1.8 + (i / sparks.length) * Math.PI * 2;
        s.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
        s.rotation.set(time * 3, time * 2, 0);
        s.visible = pop === 0;
      });
      pips.forEach((p) => (p.visible = pop === 0));
    },
    hide() {
      object.visible = false;
    },
    dispose() {
      hoopGeo.dispose();
      hoopMat.dispose();
      glowGeo.dispose();
      glowMat.dispose();
      pipGeo.dispose();
      pipMat.dispose();
      sparkGeo.dispose();
    },
  };
}

/** Weak-eye-only sparkle shell round a charged ball. */
export interface ChargeView {
  readonly object: THREE.Group;
  place(pos: THREE.Vector3, radius: number, time: number, fade: number): void;
  hide(): void;
  dispose(): void;
}

export function createChargeSparkle(): ChargeView {
  const object = new THREE.Group();
  object.name = 'bubbleball-charge';
  const glowGeo = new THREE.SphereGeometry(1, 24, 16);
  const glowMat = createGlowMaterial({ level: 1, coreOpacity: 0.12, rimPower: 1.6, pulse: 0.5 });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  const starGeo = new THREE.OctahedronGeometry(0.12);
  const starMat = createLayerMaterial(1);
  const stars: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(starGeo, starMat);
    stars.push(m);
    object.add(m);
  }
  object.add(glow);
  object.visible = false;
  return {
    object,
    place(pos, r, time, fade) {
      object.visible = fade > 0.01;
      object.position.copy(pos);
      glow.scale.setScalar(r * 1.32);
      stars.forEach((s, i) => {
        const a = time * 2.6 + (i / stars.length) * Math.PI * 2;
        const tilt = (i % 2 ? 0.6 : -0.6) + Math.sin(time + i) * 0.3;
        s.position.set(Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45 * Math.sin(tilt), Math.sin(a) * r * 1.45 * Math.cos(tilt));
        s.scale.setScalar(fade * (0.8 + 0.4 * Math.sin(time * 9 + i)));
      });
    },
    hide() {
      object.visible = false;
    },
    dispose() {
      glowGeo.dispose();
      glowMat.dispose();
      starGeo.dispose();
      starMat.dispose();
    },
  };
}
