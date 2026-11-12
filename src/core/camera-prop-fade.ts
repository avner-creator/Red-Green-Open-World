/**
 * See-through props (QA8 m1): a static prop flagged `userData.cameraFade = true` (the Gear Shack's
 * display rocket) is dithered away while it stands between the camera and the hero, or while the
 * camera is right at it, the way tree crowns are (camera-cutout.ts). Its own collider (or the
 * slide-around hull round it) keeps the camera out of it; this keeps it from hiding the hero.
 *
 * Each flagged mesh needs a material of its own (the fade is a per-material uniform); its world
 * bounds are taken once (the prop does not move). A 4×4 ordered dither, like the hero fade;
 * shadows keep the whole prop. `userData.cameraFaded` mirrors the amount for the test probe.
 */
import * as THREE from 'three';

/** `userData` flag on a mesh: dither it away when it hides the hero from the camera. */
export const CAMERA_FADE = 'cameraFade';
const KEY = '|rg-propfade';
const SCAN_INTERVAL = 0.5;
/** Props further than this from the hero are left alone (m). */
const NEAR = 18;
/** How far the dither goes when the prop hides the hero (it stays a ghost, never pops away). */
const FADE = 0.85;
/** The camera this close to the prop's bounds (m) fades it too. */
const AT_CAMERA = 0.35;
const RATE = 10;

interface Prop {
  mesh: THREE.Mesh;
  box: THREE.Box3;
  uniform: { value: number };
}

export interface PropFade {
  update(camera: THREE.Vector3, hero: THREE.Vector3, heroTop: number, dt: number, on: boolean): void;
  /** Amount of the most faded prop (debug). */
  readonly max: number;
}

function patch(m: THREE.Material, uniform: { value: number }): void {
  if ((m as THREE.ShaderMaterial).isShaderMaterial) return;
  const baseKey = m.customProgramCacheKey?.call(m) ?? '';
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    base.call(m, shader, renderer);
    shader.uniforms.uPropFade = uniform;
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      `uniform float uPropFade;
void main() {
  if (uPropFade > 0.0) {
    ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
    int i = q.x + q.y * 4;
    float th = float(i == 0 ? 0 : i == 1 ? 8 : i == 2 ? 2 : i == 3 ? 10 : i == 4 ? 12 : i == 5 ? 4 : i == 6 ? 14 : i == 7 ? 6 : i == 8 ? 3 : i == 9 ? 11 : i == 10 ? 1 : i == 11 ? 9 : i == 12 ? 15 : i == 13 ? 7 : i == 14 ? 13 : 5) / 16.0 + 1.0 / 32.0;
    if (uPropFade > th) discard;
  }`,
    );
  };
  m.customProgramCacheKey = () => baseKey + KEY;
  m.needsUpdate = true;
}

/** Does the segment a → b pass through box `bx` (slab test)? Pure. */
export function segmentHitsBox(a: THREE.Vector3, b: THREE.Vector3, bx: THREE.Box3): boolean {
  let t0 = 0;
  let t1 = 1;
  for (const k of ['x', 'y', 'z'] as const) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-9) {
      if (a[k] < bx.min[k] || a[k] > bx.max[k]) return false;
      continue;
    }
    let u0 = (bx.min[k] - a[k]) / d;
    let u1 = (bx.max[k] - a[k]) / d;
    if (u0 > u1) [u0, u1] = [u1, u0];
    t0 = Math.max(t0, u0);
    t1 = Math.min(t1, u1);
    if (t0 > t1) return false;
  }
  return true;
}

export function createPropFade(scene: THREE.Scene): PropFade {
  const props: Prop[] = [];
  const seen = new WeakSet<THREE.Object3D>();
  let scanT = 0;
  let max = 0;
  const to = new THREE.Vector3();
  const from = new THREE.Vector3();

  function scan(): void {
    scene.traverse((o) => {
      if (seen.has(o)) return;
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (mesh.userData as Record<string, unknown>)[CAMERA_FADE] !== true) return;
      seen.add(o);
      const mat = mesh.material;
      if (Array.isArray(mat) || !mat) return;
      const uniform = { value: 0 };
      patch(mat, uniform);
      mesh.updateWorldMatrix(true, false);
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const box = (mesh.geometry.boundingBox as THREE.Box3).clone().applyMatrix4(mesh.matrixWorld);
      props.push({ mesh, box, uniform });
    });
  }

  return {
    update(camera, hero, heroTop, dt, on) {
      scanT -= dt;
      if (scanT <= 0) {
        scanT = SCAN_INTERVAL;
        scan();
      }
      max = 0;
      const k = 1 - Math.exp(-RATE * Math.max(0, dt));
      for (const p of props) {
        let want = 0;
        if (on && p.mesh.parent && Math.hypot(p.box.max.x + p.box.min.x - 2 * hero.x, p.box.max.z + p.box.min.z - 2 * hero.z) < NEAR * 2) {
          if (p.box.distanceToPoint(camera) < AT_CAMERA) want = FADE;
          else {
            // Camera to the hero's feet, middle and head (stopping a little short of the hero).
            for (const f of [0.3, 0.55, 0.92]) {
              to.copy(hero).setY(hero.y + heroTop * f);
              from.copy(camera);
              const len = from.distanceTo(to);
              if (len < 0.5) continue;
              to.lerp(from, 0.4 / len);
              if (segmentHitsBox(from, to, p.box)) {
                want = FADE;
                break;
              }
            }
          }
        }
        // Without a time step (a frozen test frame) jump straight to the target.
        const v = dt > 0 ? p.uniform.value + (want - p.uniform.value) * k : want;
        p.uniform.value = v < 0.01 ? 0 : v;
        p.mesh.userData.cameraFaded = p.uniform.value;
        max = Math.max(max, p.uniform.value);
      }
    },
    get max() {
      return max;
    },
  };
}
