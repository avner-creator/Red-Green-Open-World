/**
 * Both-eye effects for character skills and swaps: sparkles, a landing shockwave ring, speed lines
 * and little glide wings. Everything is light cream with a dark rim where it matters, so it reads
 * by brightness in the R-only and the G-only channel alike (never by hue). Pooled; no allocation
 * per frame.
 */
import * as THREE from 'three';

const SPARKS = 72;
const LINES = 10;

interface Spark {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  rot: number;
}

export interface SkillFx {
  /** Burst of sparkles at `at` (world), `speed` m/s outwards. */
  sparkle(at: THREE.Vector3, count: number, speed: number, size?: number): void;
  /** Ground ring that races out to `radius` metres. */
  shockwave(at: THREE.Vector3, radius: number): void;
  /** Speed lines around `at` streaming against `dir` while `on`. */
  speedLines(on: boolean, at: THREE.Vector3, dir: THREE.Vector3): void;
  /** Little wings on the back holder while gliding (0 = folded away). */
  setWings(open: boolean): void;
  update(dt: number): void;
  clear(): void;
  dispose(): void;
}

export function createSkillFx(scene: THREE.Scene, back: THREE.Object3D): SkillFx {
  // ── Sparkles: a 4-point star made of two crossed flat diamonds.
  const starGeo = new THREE.OctahedronGeometry(0.12, 0);
  starGeo.scale(1, 1.6, 0.35);
  const starMat = new THREE.MeshBasicMaterial({ color: 0xfff6cf, toneMapped: false });
  const stars = new THREE.InstancedMesh(starGeo, starMat, SPARKS);
  stars.name = 'skill-sparkles';
  stars.frustumCulled = false;
  stars.count = 0;
  scene.add(stars);
  const sparks: Spark[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const e = new THREE.Euler();

  // ── Shockwave: bright ring with a dark outer rim (reads on bright and dark ground).
  const ring = new THREE.Group();
  ring.name = 'skill-shockwave';
  const ringLight = new THREE.Mesh(
    new THREE.RingGeometry(0.66, 0.94, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xfff6cf, transparent: true, depthWrite: false, toneMapped: false }),
  );
  const ringDark = new THREE.Mesh(
    new THREE.RingGeometry(0.94, 1.1, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x1e2229, transparent: true, depthWrite: false }),
  );
  ring.add(ringLight, ringDark);
  ring.visible = false;
  scene.add(ring);
  let ringT = 1;
  let ringR = 1;

  // ── Speed lines.
  const lineGeo = new THREE.BoxGeometry(0.035, 0.035, 1.8);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
  const lines = new THREE.InstancedMesh(lineGeo, lineMat, LINES);
  lines.name = 'skill-speedlines';
  lines.frustumCulled = false;
  lines.count = 0;
  scene.add(lines);
  const lineOffsets = Array.from({ length: LINES }, (_, i) => {
    const a = (i / LINES) * Math.PI * 2 + (i % 3) * 0.4;
    const r = 0.55 + (i % 4) * 0.18;
    return new THREE.Vector3(Math.cos(a) * r, 0.85 + Math.sin(a) * r * 0.9, 0);
  });
  let linesOn = 0;
  const lineAt = new THREE.Vector3();
  const lineDir = new THREE.Vector3(0, 0, 1);
  let linePhase = 0;

  // ── Wings: two rounded translucent wings with a dark rim, on the back holder.
  const wings = new THREE.Group();
  wings.name = 'skill-wings';
  const wingShape = new THREE.CircleGeometry(0.42, 20);
  wingShape.scale(1, 0.55, 1);
  wingShape.translate(0.4, 0.1, 0);
  const rimShape = new THREE.RingGeometry(0.4, 0.44, 20);
  rimShape.scale(1, 0.55, 1);
  rimShape.translate(0.4, 0.1, 0);
  const wingMat = new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  const rimMat = new THREE.MeshBasicMaterial({ color: 0x1e2229, side: THREE.DoubleSide });
  const wingPivots: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    const w = new THREE.Mesh(wingShape, wingMat);
    const rim = new THREE.Mesh(rimShape, rimMat);
    pivot.add(w, rim);
    pivot.scale.set(side, 1, 1);
    pivot.position.set(side * 0.06, 0.15, -0.12);
    wings.add(pivot);
    wingPivots.push(pivot);
  }
  wings.visible = false;
  back.add(wings);
  let wingOpen = 0;
  let wantWings = false;
  let flapT = 0;

  const writeSparks = (): void => {
    let n = 0;
    for (const sp of sparks) {
      const k = sp.life / sp.max;
      const sc = sp.size * Math.sin(Math.min(1, k * 4) * Math.PI * 0.5) * (1 - k * k);
      e.set(0, sp.rot, sp.rot * 0.5);
      q.setFromEuler(e);
      s.setScalar(Math.max(0.001, sc));
      m.compose(sp.p, q, s);
      stars.setMatrixAt(n++, m);
    }
    stars.count = n;
    stars.instanceMatrix.needsUpdate = true;
  };

  return {
    sparkle(at, count, speed, size = 1) {
      for (let i = 0; i < count; i++) {
        if (sparks.length >= SPARKS) sparks.shift();
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        const up = 0.3 + Math.random() * 0.9;
        const sp = speed * (0.6 + Math.random() * 0.6);
        sparks.push({
          p: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.6, (Math.random() - 0.5) * 0.4)),
          v: new THREE.Vector3(Math.cos(a) * sp, up * sp, Math.sin(a) * sp),
          life: 0,
          max: 0.55 + Math.random() * 0.35,
          size: size * (0.8 + Math.random() * 0.6),
          rot: Math.random() * Math.PI,
        });
      }
      writeSparks();
    },
    shockwave(at, radius) {
      ring.position.copy(at);
      ring.position.y += 0.06;
      ringR = radius;
      ringT = 0;
      ring.visible = true;
    },
    speedLines(on, at, dir) {
      linesOn = on ? 1 : linesOn;
      if (!on) linesOn = Math.min(linesOn, 0.999);
      lineAt.copy(at);
      if (dir.lengthSq() > 1e-6) lineDir.copy(dir).setY(0).normalize();
    },
    setWings(open) {
      wantWings = open;
    },
    update(dt) {
      // Sparkles.
      if (sparks.length) {
        for (let i = sparks.length - 1; i >= 0; i--) {
          const sp = sparks[i];
          sp.life += dt;
          if (sp.life >= sp.max) {
            sparks.splice(i, 1);
            continue;
          }
          sp.v.y -= 9 * dt;
          sp.v.multiplyScalar(Math.exp(-2.5 * dt));
          sp.p.addScaledVector(sp.v, dt);
          sp.rot += dt * 6;
        }
        writeSparks();
      }
      // Shockwave.
      if (ringT < 1) {
        ringT = Math.min(1, ringT + dt / 0.75);
        const k = 1 - (1 - ringT) ** 2;
        const r = 0.4 + k * ringR;
        ring.scale.set(r, 1, r);
        (ringLight.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - ringT);
        (ringDark.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - ringT * ringT);
        if (ringT >= 1) ring.visible = false;
      }
      // Speed lines: a ring of streaks around the body that stream backwards and fade out.
      if (linesOn > 0) {
        if (linesOn < 1) linesOn = Math.max(0, linesOn - dt / 0.18);
        linePhase += dt * 9;
        const yaw = Math.atan2(lineDir.x, lineDir.z);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        let n = 0;
        for (let i = 0; i < LINES && linesOn > 0; i++) {
          const o = lineOffsets[i];
          const back = ((linePhase + i * 0.37) % 1) * 2.2 + 0.4;
          s.set(o.x, o.y, -back).applyQuaternion(q).add(lineAt);
          const sc = linesOn * (1 - ((linePhase + i * 0.37) % 1) * 0.5);
          m.compose(s, q, new THREE.Vector3(1, 1, Math.max(0.01, sc)));
          lines.setMatrixAt(n++, m);
        }
        lines.count = n;
        lines.instanceMatrix.needsUpdate = true;
      } else if (lines.count) {
        lines.count = 0;
      }
      // Wings.
      wingOpen += ((wantWings ? 1 : 0) - wingOpen) * Math.min(1, dt * 14);
      wings.visible = wingOpen > 0.02;
      if (wings.visible) {
        flapT += dt;
        const flap = Math.sin(flapT * 38) * 0.45;
        wings.scale.setScalar(wingOpen);
        for (const [i, p] of wingPivots.entries()) {
          const side = i === 0 ? 1 : -1;
          p.rotation.set(0, side * 0.35, side * flap);
        }
      }
    },
    clear() {
      sparks.length = 0;
      stars.count = 0;
      ringT = 1;
      ring.visible = false;
      linesOn = 0;
      lines.count = 0;
      wantWings = false;
      wingOpen = 0;
      wings.visible = false;
    },
    dispose() {
      scene.remove(stars, ring, lines);
      wings.removeFromParent();
      starGeo.dispose();
      starMat.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      wingShape.dispose();
      rimShape.dispose();
      wingMat.dispose();
      rimMat.dispose();
    },
  };
}
