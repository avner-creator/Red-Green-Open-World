/**
 * The friendly dragon (original design, procedural): a round, goofy, smiling dragon with big eyes,
 * stubby flapping wings and a wagging tail. Draws: body, head, eyes (2 instances), a dark outline
 * for body+head, wings (one CPU-bent mesh), tail (one CPU-bent tube). Shadow proxy on layer 7.
 *
 * Dragon space: +Z = nose, +Y = up, origin = between the feet. `seat` is where the rider's feet go.
 */
import * as THREE from 'three';
import { finish, finishMaterial, mergeFinished, placed } from '../../core/vertex-finish';
import { shadowProxy } from '../../core/shadow-proxy';
import { outlineGeometry } from './planeModel';

export const DRAGON_DIMS = {
  seat: new THREE.Vector3(0, 1.72, -0.15),
  /** Head pivot (neck), dragon space. */
  neck: new THREE.Vector3(0, 2.05, 1.15),
  /** Mouth, head space (bubbles come out here). */
  mouth: new THREE.Vector3(0, -0.12, 0.98),
} as const;

const COL = {
  body: 0x8fe6b8, // minty green: mid-bright in R, bright in G
  belly: 0xfff0c6, // cream: bright in both
  spikes: 0x4a2f7a, // plum: dark in both
  cheeks: 0xff9cb0,
  saddle: 0x7a3b1c,
  saddleTrim: 0xffd23a,
  wing: 0xe3d6ff,
  wingBone: 0x5a3f8f,
  horn: 0xfff4d8,
  dark: 0x15111f,
} as const;

export interface DragonModel {
  readonly root: THREE.Group;
  readonly body: THREE.Group;
  readonly head: THREE.Group;
  readonly seat: THREE.Object3D;
  /** World position of the mouth (bubbles). */
  mouthWorld(out: THREE.Vector3): THREE.Vector3;
  /**
   * Animate. `flap` 0..1 = wing beat strength (0 = folded/gliding), `wag` tail wag strength,
   * `happy` 0..1 opens the smile/eyes and bounces.
   */
  update(dt: number, opts: { flap: number; glide: number; wag: number; happy: number; sitting: boolean }): void;
  /** One quick big flap (Space). */
  flapNow(): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

let sharedMat: THREE.MeshStandardMaterial | null = null;
let sharedOutline: THREE.MeshBasicMaterial | null = null;

function mat(): THREE.MeshStandardMaterial {
  return (sharedMat ??= finishMaterial('skyrides-dragon'));
}

function outlineMat(): THREE.MeshBasicMaterial {
  return (sharedOutline ??= new THREE.MeshBasicMaterial({ color: 0x07050c, side: THREE.BackSide }));
}

const F = (color: number, rough = 0.55) => ({ color, rough, metal: 0 });

function buildBody(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  // Round chubby body + cream belly.
  p.push(finish(placed(new THREE.SphereGeometry(1, 20, 16).scale(1.15, 1.0, 1.45), 0, 1.35, 0), F(COL.body)));
  p.push(finish(placed(new THREE.SphereGeometry(1, 18, 14).scale(0.95, 0.85, 1.25), 0, 1.22, 0.22), F(COL.belly, 0.7)));
  // Neck.
  p.push(finish(placed(new THREE.CylinderGeometry(0.45, 0.62, 0.9, 14), 0, 1.95, 0.95, 0.6, 0, 0), F(COL.body)));
  // Stubby legs with cream toes.
  for (const sx of [-1, 1]) {
    for (const z of [-0.55, 0.55]) {
      p.push(finish(placed(new THREE.CylinderGeometry(0.28, 0.34, 0.6, 12), sx * 0.62, 0.32, z), F(COL.body)));
      p.push(finish(placed(new THREE.SphereGeometry(0.34, 12, 8).scale(1, 0.5, 1.2), sx * 0.62, 0.06, z + 0.12), F(COL.belly, 0.7)));
    }
  }
  // Back spikes (soft rounded cones), saddle with a bright trim.
  for (let i = 0; i < 4; i++) {
    const z = -0.95 - i * 0.3;
    p.push(finish(placed(new THREE.ConeGeometry(0.17 - i * 0.02, 0.36, 8), 0, 2.15 - i * 0.18, z, -0.5, 0, 0), F(COL.spikes)));
  }
  p.push(finish(placed(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.72, 0.22, 0.68), 0, 2.2, -0.12), F(COL.saddle, 0.6)));
  p.push(finish(placed(new THREE.TorusGeometry(0.68, 0.06, 6, 20).scale(1.05, 1, 1), 0, 2.21, -0.12, Math.PI / 2, 0, 0), F(COL.saddleTrim, 0.4)));
  // Handle bar for the rider.
  p.push(finish(placed(new THREE.TorusGeometry(0.22, 0.05, 6, 12, Math.PI), 0, 2.3, 0.45, 0, 0, 0), F(COL.saddleTrim, 0.4)));
  return mergeFinished(p);
}

function buildHead(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  // Big round head and a wide snout.
  p.push(finish(placed(new THREE.SphereGeometry(0.78, 20, 16).scale(1.05, 0.95, 1), 0, 0.15, 0.2), F(COL.body)));
  p.push(finish(placed(new THREE.SphereGeometry(0.55, 18, 12).scale(1.15, 0.72, 1), 0, -0.12, 0.72), F(COL.belly, 0.7)));
  // Nostrils, a big smile, rosy cheeks.
  for (const sx of [-1, 1]) {
    p.push(finish(placed(new THREE.SphereGeometry(0.06, 8, 6), sx * 0.18, 0.05, 1.22), F(COL.dark)));
    p.push(finish(placed(new THREE.SphereGeometry(0.16, 10, 8).scale(1, 0.6, 0.4), sx * 0.58, -0.1, 0.62), F(COL.cheeks, 0.8)));
    // Horns and little ear frills.
    p.push(finish(placed(new THREE.ConeGeometry(0.11, 0.42, 8), sx * 0.34, 0.86, -0.02, -0.4, 0, sx * -0.3), F(COL.horn, 0.5)));
    p.push(finish(placed(new THREE.ConeGeometry(0.16, 0.38, 6).scale(1, 1, 0.35), sx * 0.72, 0.45, -0.1, 0, 0, sx * -1.1), F(COL.spikes)));
  }
  const smile = new THREE.TorusGeometry(0.34, 0.045, 6, 16, Math.PI * 0.9);
  smile.rotateZ(Math.PI + Math.PI * 0.05);
  p.push(finish(placed(smile, 0, -0.08, 1.12, -0.35, 0, 0), F(COL.dark)));
  // Tongue peeking out.
  p.push(finish(placed(new THREE.SphereGeometry(0.11, 10, 6).scale(1, 0.4, 1), 0.08, -0.4, 1.08), F(0xff6f8a, 0.6)));
  return mergeFinished(p);
}

function buildEye(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(finish(new THREE.SphereGeometry(0.27, 16, 12).scale(1, 1.15, 0.7), F(0xffffff, 0.25)));
  p.push(finish(placed(new THREE.SphereGeometry(0.16, 14, 10).scale(1, 1.2, 0.6), 0, -0.02, 0.12), F(COL.dark, 0.2)));
  p.push(finish(placed(new THREE.SphereGeometry(0.055, 8, 6), 0.05, 0.08, 0.21), F(0xffffff, 0.1)));
  return mergeFinished(p);
}

const WING_SPAN = 2.5;

/** Both wings in one mesh. Vertex attribute `span` (0 at the shoulder → 1 at the tip, signed by side). */
function buildWings(): { geo: THREE.BufferGeometry; rest: Float32Array; span: Float32Array } {
  // Each wing: a fan of 3 scalloped panels, upper and lower faces.
  const positions: number[] = [];
  const colors: number[] = [];
  const spans: number[] = [];
  const membrane = new THREE.Color(COL.wing);
  const bone = new THREE.Color(COL.wingBone);
  for (const side of [-1, 1]) {
    // Bone tips (wing space: x outwards, z back).
    const tips = [
      [WING_SPAN, 0.25, 0.2],
      [WING_SPAN * 0.92, 0.0, -0.55],
      [WING_SPAN * 0.7, -0.2, -1.05],
      [WING_SPAN * 0.38, -0.25, -1.2],
    ];
    const shoulder = [0, 0, 0];
    const push = (v: number[], c: THREE.Color, s: number) => {
      positions.push(side * v[0], v[1], v[2]);
      colors.push(c.r, c.g, c.b);
      spans.push(side * s);
    };
    for (let k = 0; k < tips.length - 1; k++) {
      const a = tips[k];
      const b = tips[k + 1];
      // Scallop: the trailing edge between two bones dips toward the body.
      const mid = [(a[0] + b[0]) / 2 * 0.78, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 * 0.8 - 0.05];
      const sa = a[0] / WING_SPAN;
      const sb = b[0] / WING_SPAN;
      const sm = mid[0] / WING_SPAN;
      for (const face of [1, -1]) {
        const tri = (p1: number[], s1: number, c1: THREE.Color, p2: number[], s2: number, c2: THREE.Color, p3: number[], s3: number, c3: THREE.Color) => {
          // Keep the winding facing out on both sides of the body and on both faces.
          if (face * side > 0) {
            push(p1, c1, s1);
            push(p2, c2, s2);
            push(p3, c3, s3);
          } else {
            push(p1, c1, s1);
            push(p3, c3, s3);
            push(p2, c2, s2);
          }
        };
        tri(shoulder, 0, bone, a, sa, bone, mid, sm, membrane);
        tri(shoulder, 0, bone, mid, sm, membrane, b, sb, bone);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  const rest = new Float32Array(positions);
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geo.computeVertexNormals();
  return { geo, rest, span: new Float32Array(spans) };
}

const TAIL_LEN = 2.6;
const TAIL_SEGS = 14;
const TAIL_RADIAL = 9;

function buildTail(): { geo: THREE.BufferGeometry; rest: Float32Array; u: Float32Array } {
  // A tapering tube along -Z with a spade at the tip; u = 0 at the root → 1 at the tip.
  const positions: number[] = [];
  const colors: number[] = [];
  const us: number[] = [];
  const index: number[] = [];
  const body = new THREE.Color(COL.body);
  const spike = new THREE.Color(COL.spikes);
  for (let i = 0; i <= TAIL_SEGS; i++) {
    const u = i / TAIL_SEGS;
    const r = 0.42 * (1 - u) + 0.07 * u;
    for (let k = 0; k < TAIL_RADIAL; k++) {
      const a = (k / TAIL_RADIAL) * Math.PI * 2;
      positions.push(Math.cos(a) * r, Math.sin(a) * r, -u * TAIL_LEN);
      const c = k === 2 && i % 3 === 1 ? spike : body;
      colors.push(c.r, c.g, c.b);
      us.push(u);
    }
  }
  for (let i = 0; i < TAIL_SEGS; i++) {
    for (let k = 0; k < TAIL_RADIAL; k++) {
      const a = i * TAIL_RADIAL + k;
      const b = i * TAIL_RADIAL + ((k + 1) % TAIL_RADIAL);
      const c = a + TAIL_RADIAL;
      const d = b + TAIL_RADIAL;
      index.push(a, c, b, b, c, d);
    }
  }
  // Spade tip: a flat diamond (both faces).
  const base = positions.length / 3;
  const sp = [
    [0, 0, -TAIL_LEN],
    [0.32, 0, -TAIL_LEN - 0.25],
    [0, 0, -TAIL_LEN - 0.7],
    [-0.32, 0, -TAIL_LEN - 0.25],
  ];
  for (const v of sp) {
    positions.push(v[0], v[1] + 0.02, v[2]);
    colors.push(spike.r, spike.g, spike.b);
    us.push(1);
  }
  index.push(base, base + 1, base + 2, base, base + 2, base + 3, base, base + 2, base + 1, base, base + 3, base + 2);
  const geo = new THREE.BufferGeometry();
  const rest = new Float32Array(positions);
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return { geo, rest, u: new Float32Array(us) };
}

function proxyGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 8, 6).scale(1.2, 1.1, 2.2).translate(0, 1.4, -0.2).toNonIndexed();
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  return g;
}

export function createDragonModel(): DragonModel {
  const root = new THREE.Group();
  root.name = 'sky-dragon';
  root.rotation.order = 'YXZ';
  const body = new THREE.Group();
  root.add(body);

  const bodyGeo = buildBody();
  const bodyMesh = new THREE.Mesh(bodyGeo, mat());
  bodyMesh.receiveShadow = true;
  body.add(bodyMesh);
  const headGeo = buildHead();
  const outlineGeo = outlineGeometry(bodyGeo, 0.05);
  const headOutlineGeo = outlineGeometry(headGeo, 0.045);
  const outline = new THREE.Mesh(outlineGeo, outlineMat());
  body.add(outline);

  const head = new THREE.Group();
  head.position.copy(DRAGON_DIMS.neck);
  body.add(head);
  const headMesh = new THREE.Mesh(headGeo, mat());
  headMesh.receiveShadow = true;
  head.add(headMesh);
  const headOutline = new THREE.Mesh(headOutlineGeo, outlineMat());
  head.add(headOutline);

  const eyeGeo = buildEye();
  const eyes = new THREE.InstancedMesh(eyeGeo, mat(), 2);
  eyes.frustumCulled = false;
  head.add(eyes);
  const eyeDummy = new THREE.Object3D();
  const placeEyes = (open: number): void => {
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? -1 : 1;
      eyeDummy.position.set(sx * 0.33, 0.36, 0.78);
      eyeDummy.rotation.set(-0.1, sx * 0.32, 0);
      eyeDummy.scale.set(1, Math.max(0.08, open), 1);
      eyeDummy.updateMatrix();
      eyes.setMatrixAt(i, eyeDummy.matrix);
    }
    eyes.instanceMatrix.needsUpdate = true;
  };
  placeEyes(1);

  const wings = buildWings();
  const wingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
  const wingMesh = new THREE.Mesh(wings.geo, wingMat);
  wingMesh.position.set(0, 2.0, -0.05);
  wingMesh.frustumCulled = false;
  body.add(wingMesh);

  const tail = buildTail();
  const tailMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const tailMesh = new THREE.Mesh(tail.geo, tailMat);
  tailMesh.position.set(0, 1.2, -1.3);
  tailMesh.frustumCulled = false;
  body.add(tailMesh);

  const proxy = shadowProxy(proxyGeometry(), 'sky-dragon-shadow');
  body.add(proxy);

  const seat = new THREE.Object3D();
  seat.position.copy(DRAGON_DIMS.seat);
  body.add(seat);
  // Pip rides behind the hero, between the wings.
  const pipSeat = new THREE.Object3D();
  pipSeat.name = 'pip-seat';
  pipSeat.userData.pipSeat = true;
  pipSeat.position.set(DRAGON_DIMS.seat.x, DRAGON_DIMS.seat.y - 0.05, DRAGON_DIMS.seat.z - 0.7);
  body.add(pipSeat);

  let time = 0;
  let flapPhase = 0;
  let flapKick = 0;
  let blinkT = 2;
  let breathe = 0;
  const wingPos = wings.geo.getAttribute('position') as THREE.BufferAttribute;
  const tailPos = tail.geo.getAttribute('position') as THREE.BufferAttribute;
  let normalsT = 0;

  return {
    root,
    body,
    head,
    seat,
    mouthWorld(out) {
      return head.localToWorld(out.copy(DRAGON_DIMS.mouth));
    },
    flapNow() {
      flapKick = 1;
    },
    update(dt, o) {
      time += dt;
      breathe += dt * (o.sitting ? 1.6 : 3);
      // Wings: a beat that travels out along the span (secondary motion at the tips).
      const beat = Math.min(1, o.flap + flapKick);
      flapPhase += dt * (o.sitting ? 2.2 : 7 + 5 * flapKick);
      flapKick = Math.max(0, flapKick - dt * 1.8);
      const fold = o.sitting ? 0.55 : 0; // tucked in on the perch
      for (let i = 0; i < wingPos.count; i++) {
        const s = wings.span[i];
        const a = Math.abs(s);
        const side = Math.sign(s) || 1;
        const rx = wings.rest[i * 3];
        const ry = wings.rest[i * 3 + 1];
        const rz = wings.rest[i * 3 + 2];
        const lag = a * 0.9;
        const ang =
          (Math.sin(flapPhase - lag) * (0.15 + 0.75 * beat) + 0.25 * o.glide) * a * 1.0 +
          (o.sitting ? Math.sin(time * 1.3) * 0.05 * a : 0) -
          fold * a;
        // Rotate about the body's long axis (z) at the shoulder, more at the tips.
        const c = Math.cos(ang);
        const sn = Math.sin(ang);
        const x = rx * (o.sitting ? 0.55 + 0.45 * (1 - a * 0.5) : 1);
        wingPos.setXYZ(i, x * c, ry + Math.abs(x) * sn * side * side, rz);
      }
      wingPos.needsUpdate = true;
      normalsT -= dt;
      if (normalsT <= 0) {
        wings.geo.computeVertexNormals();
        normalsT = 0.1;
      }
      // Tail: a wag that travels down the tail, plus a lazy droop.
      const wagAmp = 0.15 + 0.55 * o.wag;
      for (let i = 0; i < tailPos.count; i++) {
        const u = tail.u[i];
        const rx = tail.rest[i * 3];
        const ry = tail.rest[i * 3 + 1];
        const rz = tail.rest[i * 3 + 2];
        const sway = Math.sin(time * (3 + 4 * o.wag) - u * 3.2) * wagAmp * u * u;
        const lift = (o.sitting ? -0.5 : 0.15) * u * u + Math.sin(time * 2.1 - u * 2) * 0.08 * u;
        tailPos.setXYZ(i, rx + sway * 1.4, ry + lift * 1.2, rz);
      }
      tailPos.needsUpdate = true;
      // Blink, breathe, bob the head (happier = bouncier).
      blinkT -= dt;
      let open = 1;
      if (blinkT < 0.14) open = Math.abs(blinkT - 0.07) / 0.07;
      if (blinkT <= 0) blinkT = 2.2 + ((time * 7.31) % 2.5);
      if (o.happy > 0.6) open = Math.min(open, 0.35 + 0.3 * Math.abs(Math.sin(time * 6))); // happy squint
      placeEyes(open);
      const b = Math.sin(breathe) * 0.025;
      bodyMesh.scale.set(1 + b, 1 - b * 0.6, 1 + b * 0.4);
      head.rotation.x = Math.sin(time * 1.7) * 0.06 - o.happy * 0.15 * Math.abs(Math.sin(time * 9));
      head.rotation.z = Math.sin(time * 1.1) * 0.05 + o.happy * 0.1 * Math.sin(time * 11);
      body.position.y = o.happy * Math.abs(Math.sin(time * 9)) * 0.15;
    },
    setVisible(v) {
      root.visible = v;
    },
    dispose() {
      root.removeFromParent();
      bodyGeo.dispose();
      headGeo.dispose();
      outlineGeo.dispose();
      headOutlineGeo.dispose();
      eyeGeo.dispose();
      eyes.dispose();
      wings.geo.dispose();
      wingMat.dispose();
      tail.geo.dispose();
      tailMat.dispose();
      proxy.geometry.dispose();
    },
  };
}
