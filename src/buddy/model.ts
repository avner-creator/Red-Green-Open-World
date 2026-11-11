/**
 * Pip, built procedurally: a ~0.55 m puppy with a big head, big glossy eyes, floppy ears and a
 * waggy tail. Every part is rigidly skinned to one bone of a small skeleton, and all parts are
 * merged into TWO skinned meshes (soft fur + glossy eyes/nose) that share the skeleton: 2 draw
 * calls, plus a shadow-only proxy on layer 7.
 *
 * Red/green: a light cream coat (bright in R and G), dark brown ears and eye patch, a dark navy
 * collar with a yellow tag, near-black eyes with white highlights: brightness carries the shape.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { shadowProxy } from '../core/shadow-proxy';

export const PIP_HEIGHT = 0.55;

export const BONES = [
  'root', 'body', 'head', 'earL', 'earR', 'eyeL', 'eyeR', 'pupilL', 'pupilR', 'browL', 'browR',
  'tail1', 'tail2', 'legFL', 'legFR', 'legBL', 'legBR', 'tongue', 'goggles',
] as const;
export type BoneName = (typeof BONES)[number];

type P3 = readonly [number, number, number];

/** Bind-pose pivot of every bone (model space, metres; Pip faces +Z, his left is +X). */
const PIVOT: Record<BoneName, P3> = {
  root: [0, 0, 0],
  body: [0, 0.22, 0],
  head: [0, 0.31, 0.09],
  earL: [0.1, 0.49, 0.1],
  earR: [-0.1, 0.49, 0.1],
  eyeL: [0.066, 0.422, 0.243],
  eyeR: [-0.066, 0.422, 0.243],
  pupilL: [0.068, 0.42, 0.262],
  pupilR: [-0.068, 0.42, 0.262],
  browL: [0.07, 0.49, 0.236],
  browR: [-0.07, 0.49, 0.236],
  tail1: [0, 0.27, -0.15],
  tail2: [0, 0.335, -0.2],
  legFL: [0.062, 0.18, 0.085],
  legFR: [-0.062, 0.18, 0.085],
  legBL: [0.066, 0.18, -0.09],
  legBR: [-0.066, 0.18, -0.09],
  tongue: [0, 0.335, 0.262],
  goggles: [0, 0.44, 0.17],
};

const PARENT: Record<BoneName, BoneName | null> = {
  root: null,
  body: 'root',
  head: 'body',
  earL: 'head',
  earR: 'head',
  eyeL: 'head',
  eyeR: 'head',
  pupilL: 'eyeL',
  pupilR: 'eyeR',
  browL: 'head',
  browR: 'head',
  tail1: 'body',
  tail2: 'tail1',
  legFL: 'body',
  legFR: 'body',
  legBL: 'body',
  legBR: 'body',
  tongue: 'head',
  goggles: 'head',
};

const C = {
  coat: 0xf6ead4,
  cream: 0xfff8ec,
  patch: 0x5b3b27,
  ear: 0x4e3222,
  nose: 0x161012,
  eye: 0x120c0a,
  white: 0xffffff,
  sclera: 0xfdf8ef,
  brow: 0x3a2618,
  collar: 0x1e2860,
  tag: 0xffd23b,
  tongue: 0xff7c98,
  goggle: 0xff9a2a,
  lens: 0xa8ecff,
  band: 0x2a2030,
  paw: 0xfffaf2,
} as const;

type ColorFn = (p: THREE.Vector3) => number;

interface Part {
  geo: THREE.BufferGeometry;
  bone: BoneName;
  color: number | ColorFn;
  gloss?: boolean;
}

const tmpV = new THREE.Vector3();
const tmpC = new THREE.Color();

function ellipsoid(r: P3, at: P3, seg = 20, rot?: THREE.Euler): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.max(8, Math.round(seg * 0.7)));
  g.scale(r[0], r[1], r[2]);
  if (rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(rot));
  g.translate(at[0], at[1], at[2]);
  return g;
}

function capsule(radius: number, length: number, at: P3, rot?: THREE.Euler, seg = 10): THREE.BufferGeometry {
  const g = new THREE.CapsuleGeometry(radius, length, 4, seg);
  if (rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(rot));
  g.translate(at[0], at[1], at[2]);
  return g;
}

function torus(R: number, tube: number, at: P3, rot: THREE.Euler, seg = 28): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(R, tube, 8, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromEuler(rot));
  g.translate(at[0], at[1], at[2]);
  return g;
}

function add(a: P3, b: P3): P3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function parts(): Part[] {
  const p = PIVOT;
  const list: Part[] = [];
  // Body: cream with a brown saddle patch on his left side and a lighter belly.
  list.push({
    geo: ellipsoid([0.115, 0.108, 0.168], [0, 0.225, -0.01], 24),
    bone: 'body',
    color: (v) => {
      if (v.y < 0.165) return C.cream;
      const dx = v.x - 0.07;
      const dz = v.z + 0.04;
      return dx * dx * 1.2 + (v.y - 0.29) * (v.y - 0.29) * 2 + dz * dz * 0.7 < 0.0042 ? C.patch : C.coat;
    },
  });
  // Fluffy chest.
  list.push({ geo: ellipsoid([0.088, 0.09, 0.07], [0, 0.265, 0.1], 18), bone: 'body', color: C.cream });
  // Head: big and round, a brown patch around his right eye.
  list.push({
    geo: ellipsoid([0.152, 0.14, 0.138], [0, 0.405, 0.13], 32),
    bone: 'head',
    color: (v) => {
      const dx = v.x + 0.066;
      const dy = v.y - 0.432;
      if (v.z > 0.17 && dx * dx + dy * dy * 1.2 < 0.0034) return C.patch;
      return C.coat;
    },
  });
  // Cheeks / muzzle.
  list.push({ geo: ellipsoid([0.08, 0.055, 0.062], [0, 0.352, 0.225], 20), bone: 'head', color: C.cream });
  list.push({ geo: ellipsoid([0.045, 0.04, 0.04], [0.035, 0.345, 0.255], 12), bone: 'head', color: C.cream });
  list.push({ geo: ellipsoid([0.045, 0.04, 0.04], [-0.035, 0.345, 0.255], 12), bone: 'head', color: C.cream });
  // Nose (glossy) and tongue.
  list.push({ geo: ellipsoid([0.03, 0.021, 0.02], [0, 0.378, 0.286], 14), bone: 'head', color: C.nose, gloss: true });
  list.push({ geo: ellipsoid([0.024, 0.01, 0.034], add(p.tongue, [0, -0.012, 0.012]), 12), bone: 'tongue', color: C.tongue });
  // Eyes: sclera rim, big pupil-iris, two highlights.
  for (const s of [1, -1] as const) {
    const eye: BoneName = s > 0 ? 'eyeL' : 'eyeR';
    const pupil: BoneName = s > 0 ? 'pupilL' : 'pupilR';
    const brow: BoneName = s > 0 ? 'browL' : 'browR';
    const ear: BoneName = s > 0 ? 'earL' : 'earR';
    list.push({ geo: ellipsoid([0.053, 0.058, 0.026], p[eye], 20), bone: eye, color: C.sclera, gloss: true });
    list.push({ geo: ellipsoid([0.044, 0.05, 0.017], p[pupil], 20), bone: pupil, color: C.eye, gloss: true });
    list.push({ geo: ellipsoid([0.015, 0.016, 0.006], add(p[pupil], [0.014 * s, 0.02, 0.014]), 10), bone: pupil, color: C.white, gloss: true });
    list.push({ geo: ellipsoid([0.007, 0.007, 0.004], add(p[pupil], [-0.015 * s, -0.019, 0.014]), 8), bone: pupil, color: C.white, gloss: true });
    list.push({ geo: capsule(0.008, 0.03, p[brow], new THREE.Euler(0, 0, Math.PI / 2 + 0.15 * s), 6), bone: brow, color: C.brow });
    // Floppy ear hanging from the top of the head.
    list.push({
      geo: ellipsoid([0.056, 0.108, 0.03], add(p[ear], [0.03 * s, -0.075, -0.005]), 16, new THREE.Euler(0, 0.2 * s, 0.32 * s)),
      bone: ear,
      color: C.ear,
    });
    // Goggles (shown in freefall): orange rims, light lenses.
    list.push({ geo: torus(0.034, 0.011, add(p[eye], [0.004 * s, 0, 0.022]), new THREE.Euler(0, 0, 0), 18), bone: 'goggles', color: C.goggle });
    list.push({ geo: ellipsoid([0.031, 0.031, 0.01], add(p[eye], [0.004 * s, 0, 0.026]), 12), bone: 'goggles', color: C.lens, gloss: true });
  }
  list.push({ geo: torus(0.152, 0.01, [0, 0.43, 0.13], new THREE.Euler(Math.PI / 2 - 0.12, 0, 0), 32), bone: 'goggles', color: C.band });
  // Legs with pale paws.
  for (const leg of ['legFL', 'legFR', 'legBL', 'legBR'] as const) {
    const back = leg.startsWith('legB');
    const piv = p[leg];
    list.push({
      geo: capsule(back ? 0.044 : 0.04, 0.1, add(piv, [0, -0.085, 0]), undefined, 10),
      bone: leg,
      color: (v) => (v.y < 0.045 ? C.paw : leg === 'legBL' && v.y < 0.09 ? C.patch : C.coat),
    });
  }
  // Tail: two segments, brown tip for a readable wag.
  list.push({ geo: capsule(0.028, 0.06, add(p.tail1, [0, 0.03, -0.025]), new THREE.Euler(-0.7, 0, 0), 8), bone: 'tail1', color: C.coat });
  list.push({
    geo: capsule(0.03, 0.05, add(p.tail2, [0, 0.03, -0.012]), new THREE.Euler(-0.35, 0, 0), 8),
    bone: 'tail2',
    color: (v) => (v.y > 0.375 ? C.patch : C.coat),
  });
  // Collar + tag.
  list.push({ geo: torus(0.088, 0.019, [0, 0.305, 0.075], new THREE.Euler(Math.PI / 2 + 0.55, 0, 0), 28), bone: 'body', color: C.collar });
  list.push({
    geo: new THREE.CylinderGeometry(0.024, 0.024, 0.009, 16).rotateX(Math.PI / 2).translate(0, 0.25, 0.155),
    bone: 'body',
    color: C.tag,
    gloss: true,
  });
  return list;
}

function prepare(part: Part, boneIndex: number): THREE.BufferGeometry {
  const g = part.geo.index ? part.geo : part.geo;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count;
  const colors = new Float32Array(n * 3);
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    tmpV.fromBufferAttribute(pos, i);
    const hex = typeof part.color === 'number' ? part.color : part.color(tmpV);
    tmpC.setHex(hex);
    colors[i * 3] = tmpC.r;
    colors[i * 3 + 1] = tmpC.g;
    colors[i * 3 + 2] = tmpC.b;
    skinIndex[i * 4] = boneIndex;
    skinWeight[i * 4] = 1;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  return g;
}

export interface PipModel {
  /** Root group: place it at Pip's feet, rotate `rotation.y` for heading. */
  readonly object: THREE.Group;
  readonly bones: Record<BoneName, THREE.Bone>;
  /** Bind-pose local position of every bone (copy before posing). */
  readonly rest: Record<BoneName, THREE.Vector3>;
  readonly meshes: THREE.SkinnedMesh[];
  dispose(): void;
}

export function buildPip(): PipModel {
  const object = new THREE.Group();
  object.name = 'pip';
  const bones = {} as Record<BoneName, THREE.Bone>;
  const rest = {} as Record<BoneName, THREE.Vector3>;
  for (const name of BONES) {
    const b = new THREE.Bone();
    b.name = `pip_${name}`;
    const parent = PARENT[name];
    const pv = PIVOT[name];
    const pp = parent ? PIVOT[parent] : ([0, 0, 0] as const);
    b.position.set(pv[0] - pp[0], pv[1] - pp[1], pv[2] - pp[2]);
    rest[name] = b.position.clone();
    bones[name] = b;
    if (parent) bones[parent].add(b);
  }
  object.add(bones.root);
  object.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(BONES.map((n) => bones[n]));

  const fur: THREE.BufferGeometry[] = [];
  const gloss: THREE.BufferGeometry[] = [];
  for (const part of parts()) {
    const g = prepare(part, BONES.indexOf(part.bone));
    (part.gloss ? gloss : fur).push(g);
  }
  const furGeo = mergeGeometries(fur, false);
  const glossGeo = mergeGeometries(gloss, false);
  for (const g of [...fur, ...gloss]) g.dispose();
  if (!furGeo || !glossGeo) throw new Error('pip: merge failed');

  const furMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  const glossMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0, envMapIntensity: 1.4 });
  const meshes: THREE.SkinnedMesh[] = [];
  for (const [geo, mat, name] of [
    [furGeo, furMat, 'pip_fur'],
    [glossGeo, glossMat, 'pip_gloss'],
  ] as const) {
    const m = new THREE.SkinnedMesh(geo, mat);
    m.name = name;
    m.bind(skeleton, new THREE.Matrix4());
    m.castShadow = false;
    m.receiveShadow = true;
    m.frustumCulled = false;
    object.add(m);
    meshes.push(m);
  }

  // Cheap shadow stand-in (shadow pass only).
  const proxyGeo = new THREE.SphereGeometry(1, 10, 7);
  proxyGeo.scale(0.13, 0.2, 0.2);
  proxyGeo.translate(0, 0.27, 0.04);
  const proxy = shadowProxy(proxyGeo, 'pip_shadow');
  bones.body.add(proxy);
  proxy.position.set(0, -0.22, 0);

  return {
    object,
    bones,
    rest,
    meshes,
    dispose() {
      furGeo.dispose();
      glossGeo.dispose();
      furMat.dispose();
      glossMat.dispose();
      proxyGeo.dispose();
    },
  };
}
