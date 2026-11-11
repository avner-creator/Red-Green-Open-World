/**
 * Booth controller: the booth's single mesh (./geometry.ts) plus the cheap changes made to it
 * while the child is near — the demo flipbook (UV swap at ~2.5 fps), the lamps (UV swap + glow),
 * the pad pulse (vertex colour), the device pictogram (UV swap) and the bobbing prompt (a
 * billboard quad). Nothing here adds a draw call. `update` runs only while the site is active
 * (the framework's far-idle), so a booth far away costs nothing.
 */
import * as THREE from 'three';
import { cellUv, demoCell, deviceUv, lampUv, promptCell } from './cells';
import type { BoothPrompt, DeviceId, LampState } from './cells';
import { buildBoothGeometry, placeQuad, setSlotColor, setSlotUv } from './geometry';
import type { BoothGeometry, GroundPiece, Slot } from './geometry';
import type { BoothSpec } from './types';

/**
 * The one shared booth material: the atlas lit by the sun plus a self-light from the same atlas,
 * both multiplied by the vertex colour (so a quad's colour > 1 makes it glow: lamps, pad pulse).
 */
export function createBoothMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    map,
    emissive: new THREE.Color(1, 1, 1),
    emissiveMap: map,
    emissiveIntensity: 0.36,
    roughness: 0.72,
    metalness: 0,
    alphaTest: 0.5,
    vertexColors: true,
  });
  m.name = 'glasses:booth';
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n\ttotalEmissiveRadiance *= vColor.rgb;\n#endif',
    );
  };
  m.customProgramCacheKey = () => 'glasses-booth-v1';
  return m;
}

export type LampMode = 'manual' | 'attract' | 'chase';
export type PadMode = 'attract' | 'wait' | 'busy';

export interface BoothController {
  readonly mesh: THREE.Mesh;
  readonly build: BoothGeometry;
  readonly lamps: number;
  /** Show demo frame `i` (stops nothing: the flipbook keeps running unless `setAutoplay(false)`). */
  setDemoFrame(i: number): void;
  setAutoplay(on: boolean): void;
  setLamp(i: number, state: LampState): void;
  setLampMode(mode: LampMode): void;
  setPad(mode: PadMode): void;
  setDevice(device: DeviceId): void;
  /** Show the device pictogram above the pad (press pads, idle only). */
  showDevice(on: boolean): void;
  /**
   * One prompt at a time: a bobbing pictogram (1 m × `size`) at a frame-local point (the spec's
   * default spot if left out); null hides it.
   */
  setPrompt(p: BoothPrompt | null, at?: THREE.Vector3, size?: number): void;
  /** The prompt now: id, frame-local centre (at rest, without the bob) and edge length (m). */
  prompt(): { id: BoothPrompt | null; at: THREE.Vector3; size: number };
  /**
   * Put the pad and the decals on the real walkable surface: `surface(x, z)` returns the frame-local
   * surface height under a ground piece's anchor (or null to leave it). Moves only their vertices.
   */
  settle(surface: (x: number, z: number) => number | null): void;
  /** Animate (flipbook, lamps, pad pulse, bobbing billboards). `camera` = world camera position. */
  update(dt: number, camera: THREE.Vector3): void;
  /** Test hook: set every animation clock to `t` and re-apply (frames for proofs are then equal). */
  pin(t: number): void;
  debug(): Record<string, unknown>;
  dispose(): void;
}

export interface BoothOptions {
  spec: BoothSpec;
  slot: number;
  frames: number;
  fps?: number;
  hold?: number;
  ground?: (x: number, z: number) => number;
  /** The mini-game's own static geometry merged into the booth (see `buildBoothGeometry`). */
  extra?: readonly THREE.BufferGeometry[];
}

export function createBoothController(material: THREE.Material, o: BoothOptions): BoothController {
  const build = buildBoothGeometry(o.spec, o.ground, o.extra);
  const geo = build.geometry;
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'glasses:booth';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Solid parts have colliders; the moving quads must never move the camera (camera.ts).
  mesh.userData.cameraIgnore = true;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const color = geo.getAttribute('color') as THREE.BufferAttribute;
  const slot = (name: string): Slot => {
    const s = build.slots.get(name);
    if (!s) throw new Error(`booth: no slot ${name}`);
    return s;
  };
  const S = {
    demo: slot('demo'),
    padFace: slot('padFace'),
    padGlow: slot('padGlow'),
    padPosts: build.slots.get('padPosts') ?? null,
    device: slot('device'),
    prompt: slot('prompt'),
    lamps: [...Array(o.spec.lamps).keys()].map((i) => slot(`lamp${i}`)),
  };
  const frames = Math.max(1, Math.min(6, o.frames));
  const fps = o.fps ?? 2.5;
  const hold = o.hold ?? 0.8;
  const loop = frames / fps + hold;

  let clock = 0;
  let autoplay = true;
  let frame = -1;
  const lampState: LampState[] = S.lamps.map(() => 'off');
  const lampShown: (LampState | null)[] = S.lamps.map(() => null);
  let lampMode: LampMode = 'attract';
  let padMode: PadMode = 'attract';
  let device: DeviceId = 'keyboard';
  let deviceOn = !o.spec.pad.walkIn;
  let prompt: BoothPrompt | null = null;
  let promptSize = 1;
  const promptAt = build.promptAt.clone();
  const deviceAt = build.padCenter.clone().add(new THREE.Vector3(0, 1.5, 0));
  const zero = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const right = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  function showFrame(i: number): void {
    const f = ((i % frames) + frames) % frames;
    if (f === frame) return;
    frame = f;
    setSlotUv(uv, S.demo, cellUv(demoCell(o.slot, f)));
  }

  function lampLook(i: number, t: number): void {
    let st = lampState[i];
    let glow = st === 'hit' ? 1.7 : st === 'miss' ? 0.8 : 1.0;
    if (lampMode === 'attract') {
      // Slow twinkle: one bulb at a time lights up and fades.
      const n = S.lamps.length;
      const ph = (t * 0.9 - i / n) % 1;
      const k = Math.max(0, Math.sin(((ph + 1) % 1) * Math.PI * 2));
      st = k > 0.55 ? 'chase' : 'off';
      glow = 1 + k * 0.5;
    } else if (lampMode === 'chase') {
      const on = Math.floor(t * 9 + i) % 2 === 0;
      st = on ? 'chase' : lampState[i] === 'off' ? 'off' : lampState[i];
      glow = on ? 1.9 : 1.1;
    }
    if (lampShown[i] !== st) {
      lampShown[i] = st;
      setSlotUv(uv, S.lamps[i], lampUv(st));
    }
    setSlotColor(color, S.lamps[i], glow);
  }

  function padLook(t: number): void {
    const k =
      padMode === 'attract' ? 1.15 + 0.45 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.8))
        : padMode === 'wait' ? 1.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 2.2))
          : 0.75;
    setSlotColor(color, S.padFace, k);
    setSlotColor(color, S.padGlow, padMode === 'busy' ? 0.8 : k * 1.45);
    if (S.padPosts) setSlotColor(color, S.padPosts, padMode === 'busy' ? 0.9 : k * 1.5);
  }

  /** Billboard (yaw only) facing the camera, in mesh-local space. */
  function billboard(s: Slot, at: THREE.Vector3, camera: THREE.Vector3, scale: number): void {
    if (scale <= 0) {
      placeQuad(pos, nor, s, at, right.set(1, 0, 0), UP, 0);
      return;
    }
    tmp.copy(camera);
    mesh.worldToLocal(tmp);
    tmp.sub(at);
    tmp.y = 0;
    if (tmp.lengthSq() < 1e-6) tmp.set(0, 0, 1);
    tmp.normalize();
    right.set(tmp.z, 0, -tmp.x);
    placeQuad(pos, nor, s, at, right, UP, scale);
  }

  function apply(t: number, camera: THREE.Vector3 | null): void {
    if (autoplay) {
      const lt = t % loop;
      showFrame(Math.min(frames - 1, Math.floor(lt * fps)));
    }
    for (let i = 0; i < S.lamps.length; i++) lampLook(i, t);
    padLook(t);
    if (camera) {
      const bob = Math.sin(t * Math.PI * 2 * 0.9) * 0.12;
      if (prompt) billboard(S.prompt, tmp.set(0, 0, 0).add(promptAt).add(zero.set(0, bob, 0)).clone(), camera, promptSize);
      else billboard(S.prompt, promptAt, camera, 0);
      if (deviceOn) billboard(S.device, deviceAt.clone().add(zero.set(0, -bob * 0.6, 0)), camera, 1);
      else billboard(S.device, deviceAt, camera, 0);
    }
  }

  let lastCam: THREE.Vector3 | null = null;
  // Start state: prompt hidden, device per pad kind (collapsed until the first update).
  placeQuad(pos, nor, S.prompt, promptAt, new THREE.Vector3(1, 0, 0), UP, 0);
  if (!deviceOn) placeQuad(pos, nor, S.device, deviceAt, new THREE.Vector3(1, 0, 0), UP, 0);
  apply(0, null);

  return {
    mesh,
    build,
    lamps: S.lamps.length,
    setDemoFrame: showFrame,
    setAutoplay(on) {
      autoplay = on;
    },
    setLamp(i, st) {
      if (i >= 0 && i < lampState.length) lampState[i] = st;
      lampLook(i, clock);
    },
    setLampMode(m) {
      lampMode = m;
    },
    setPad(m) {
      padMode = m;
    },
    setDevice(d) {
      if (d === device) return;
      device = d;
      setSlotUv(uv, S.device, deviceUv(d));
      if (prompt === 'button') setSlotUv(uv, S.prompt, deviceUv(d));
    },
    showDevice(on) {
      deviceOn = on && !o.spec.pad.walkIn;
    },
    setPrompt(p, at, size = 1) {
      prompt = p;
      promptSize = size;
      if (p) {
        setSlotUv(uv, S.prompt, p === 'button' ? deviceUv(device) : cellUv(promptCell(p)));
        promptAt.copy(at ?? build.promptAt);
      }
    },
    prompt: () => ({ id: prompt, at: promptAt.clone(), size: promptSize }),
    settle(surface) {
      const P = pos.array as Float32Array;
      let padDy = 0;
      const moved = new Set<GroundPiece>();
      for (const g of build.groundPieces) {
        const y = surface(g.x, g.z);
        if (y === null) continue;
        // Only ever lift (the terrain mesh / colliders sit above the analytic height): never bury.
        const dy = Math.max(0, Math.min(0.6, y - g.y));
        if (dy <= 1e-4) continue;
        for (let i = g.start; i < g.start + g.count; i++) P[i * 3 + 1] += dy;
        pos.addUpdateRange(g.start * 3, g.count * 3);
        g.y += dy;
        moved.add(g);
        if (Math.abs(g.x - build.padCenter.x) < 1e-6 && Math.abs(g.z - build.padCenter.z) < 1e-6) padDy = dy;
      }
      if (moved.size) pos.needsUpdate = true;
      if (padDy > 0) {
        build.padCenter.y += padDy;
        deviceAt.y += padDy;
        if (promptAt.distanceTo(build.promptAt) < 1e-6) promptAt.y += padDy;
        build.promptAt.y += padDy;
      }
    },
    update(dt, camera) {
      clock += dt;
      lastCam = camera;
      apply(clock, camera);
    },
    pin(t) {
      clock = t;
      apply(clock, lastCam);
    },
    debug: () => ({
      frame,
      clock: Math.round(clock * 1000) / 1000,
      lamps: [...lampState],
      lampMode,
      padMode,
      device,
      deviceOn,
      prompt,
      promptAt: { x: promptAt.x, y: promptAt.y, z: promptAt.z },
      promptSize,
      padY: build.padCenter.y,
      triangles: build.triangles,
    }),
    dispose() {
      geo.dispose();
    },
  };
}
