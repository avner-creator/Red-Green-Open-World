/**
 * Character lineup preview (dev only, not part of the game bundle).
 * Open `/tools/characters/preview.html` on the Vite dev server. Buttons switch the animation;
 * `?only=frog,rex` limits the lineup; `?close=1` frames heads for close-ups.
 * `scripts/shots-characters.mjs` drives `window.__preview` to save full/R/G screenshots.
 */
import * as THREE from 'three';
import type { PlayerAnim } from '../../types';
import { CHARACTERS, type CharacterDef } from './catalog';
import { loadCharacter, type LoadedCharacter } from './load';

export const PREVIEW_ANIMS: readonly (PlayerAnim | 'emote')[] = [
  'idle', 'walk', 'run', 'jump', 'fall', 'flop', 'dance', 'wave', 'cheer', 'sit', 'emote',
];

export interface PreviewApi {
  ready: boolean;
  /** Pose every character in `anim` at `t` seconds (deterministic) and render. */
  pose(anim: PlayerAnim | 'emote', t: number): void;
  /** Show every outfit anchor as a marker. */
  showAnchors(on: boolean): void;
  /** Bind-pose bounds of each character after scale (metres). */
  measure(): Record<string, { height: number; width: number; depth: number; minY: number }>;
  /** Frame one character (or all with null), optionally turned to `yaw` radians. */
  focus(id: string | null, yaw?: number): void;
}

declare global {
  interface Window {
    __preview?: PreviewApi;
  }
}

const params = new URLSearchParams(location.search);
const only = params.get('only')?.split(',');
const defs: CharacterDef[] = CHARACTERS.filter((c) => !only || only.includes(c.id));

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc6ee);
scene.fog = new THREE.Fog(0x8fc6ee, 40, 120);
scene.add(new THREE.HemisphereLight(0xdff0ff, 0x5a6b3a, 1.3));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
sun.position.set(6, 10, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 6;
sun.shadow.camera.bottom = -3;
scene.add(sun);
// Grass-like ground in the game's mid tone, so contrast is judged against a real background.
const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: 0x6f9a48, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 1.7 m ruler (the player capsule height) left of the lineup, for judging sizes.
const ruler = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.7, 0.06), new THREE.MeshStandardMaterial({ color: 0x222222 }));
ruler.position.y = 0.85;
scene.add(ruler);

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 200);
const SPACING = 2.4;

const loaded: LoadedCharacter[] = [];
const anchorMarkers: THREE.Object3D[] = [];

function layout(): void {
  loaded.forEach((c, i) => {
    c.object.position.set((i - (loaded.length - 1) / 2) * SPACING, 0, 0);
    // Turn slightly towards the camera so faces and profiles both show.
    c.object.rotation.y = -0.35;
  });
  ruler.position.x = (-(loaded.length - 1) / 2 - 0.6) * SPACING;
  ruler.visible = loaded.length > 1;
}

function frame(target: LoadedCharacter[] = loaded): void {
  // Fixed boxes (not mesh bounds): skinned bounds depend on the current pose.
  const close = params.get('close') === '1';
  const xs = target.map((c) => c.object.position.x);
  const minX = Math.min(...xs) - SPACING / 2;
  const maxX = Math.max(...xs) + SPACING / 2;
  const h = close ? 1.2 : 2.3;
  const lookY = close ? 1.3 : 1.0;
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = Math.max(h / (2 * tan), (maxX - minX) / (2 * tan * camera.aspect)) * 1.05 + 1;
  const cx = (minX + maxX) / 2;
  camera.position.set(cx, lookY + dist * 0.1, dist);
  camera.lookAt(cx, lookY, 0);
}

function render(): void {
  renderer.render(scene, camera);
}

const api: PreviewApi = {
  ready: false,
  pose(anim, t) {
    for (const c of loaded) {
      c.mixer.stopAllAction();
      c.play(anim, 1, 0);
      c.mixer.setTime(t);
    }
    render();
  },
  showAnchors(on) {
    for (const m of anchorMarkers) m.visible = on;
    render();
  },
  measure() {
    const out: ReturnType<PreviewApi['measure']> = {};
    for (const c of loaded) {
      c.mixer.stopAllAction();
      const p = c.object.position.clone();
      const r = c.object.rotation.y;
      c.object.position.set(0, 0, 0);
      c.object.rotation.y = 0;
      c.object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(c.object, true);
      out[c.def.id] = { height: box.max.y, width: box.max.x - box.min.x, depth: box.max.z - box.min.z, minY: box.min.y };
      c.object.position.copy(p);
      c.object.rotation.y = r;
    }
    return out;
  },
  focus(id, yaw = -0.35) {
    for (const c of loaded) {
      c.object.visible = id === null || c.def.id === id;
      c.object.rotation.y = yaw;
    }
    frame(id === null ? loaded : loaded.filter((c) => c.def.id === id));
    render();
  },
};
window.__preview = api;
(window as unknown as { __previewScene: THREE.Scene }).__previewScene = scene;

async function main(): Promise<void> {
  for (const def of defs) {
    const c = await loadCharacter(def);
    scene.add(c.object);
    loaded.push(c);
    for (const part of Object.keys(c.anchors) as (keyof typeof c.anchors)[]) {
      const color = part === 'head' ? 0xffffff : part === 'face' ? 0xff00ff : 0x00e5ff;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color, depthTest: false }));
      m.renderOrder = 10;
      m.visible = false;
      c.anchors[part].add(m);
      anchorMarkers.push(m);
    }
  }
  layout();
  frame();
  api.pose('idle', 0.5);

  const bar = document.getElementById('bar');
  if (bar && params.get('live') === '0') bar.style.display = 'none';
  let live: PlayerAnim | 'emote' = 'idle';
  for (const a of PREVIEW_ANIMS) {
    const b = document.createElement('button');
    b.textContent = a;
    b.onclick = () => {
      live = a;
      for (const c of loaded) c.play(a);
    };
    bar?.appendChild(b);
  }
  if (params.get('live') !== '0') {
    for (const c of loaded) c.play(live);
    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const dt = clock.getDelta();
      for (const c of loaded) c.update(dt);
      render();
    });
  }
  api.ready = true;
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  frame();
});

void main();
