/**
 * Sun, shadows, sky, fog and exposure over the session: warm afternoon (t=0) → sunset (t=1).
 * One shadow map follows the camera, snapped to texels so edges don't shimmer.
 */
import * as THREE from 'three';
import type { Quality } from '../types';
import { createSky } from './sky';
import type { Sky, SkyState } from './sky';
import { U } from './materials';

interface Key {
  t: number;
  elev: number; // degrees
  azim: number; // degrees, 0 = +X (east), 90 = +Z (south)
  sun: [number, number, number];
  sunI: number;
  zenith: [number, number, number];
  horizon: [number, number, number];
  envI: number;
  exposure: number;
  glow: number;
}

// Colours are linear-ish HDR values. The sun sits in the west-south-west and sinks towards the west.
const KEYS: Key[] = [
  { t: 0, elev: 25, azim: 158, sun: [1.0, 0.78, 0.52], sunI: 3.5, zenith: [0.13, 0.29, 0.64], horizon: [1.0, 0.74, 0.5], envI: 0.85, exposure: 0.95, glow: 0 },
  { t: 0.55, elev: 15, azim: 165, sun: [1.0, 0.74, 0.5], sunI: 3.0, zenith: [0.18, 0.28, 0.56], horizon: [1.0, 0.74, 0.52], envI: 0.85, exposure: 1.02, glow: 0.25 },
  { t: 1, elev: 4.5, azim: 172, sun: [1.0, 0.56, 0.32], sunI: 2.6, zenith: [0.14, 0.17, 0.38], horizon: [1.0, 0.56, 0.36], envI: 0.95, exposure: 1.18, glow: 1 },
];

function sample(t: number): Key {
  const tt = THREE.MathUtils.clamp(t, 0, 1);
  let i = 0;
  while (i < KEYS.length - 2 && tt > KEYS[i + 1].t) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const f = THREE.MathUtils.smoothstep(tt, a.t, b.t);
  const l = (x: number, y: number): number => x + (y - x) * f;
  const l3 = (x: number[], y: number[]): [number, number, number] => [l(x[0], y[0]), l(x[1], y[1]), l(x[2], y[2])];
  return {
    t: tt, elev: l(a.elev, b.elev), azim: l(a.azim, b.azim), sun: l3(a.sun, b.sun), sunI: l(a.sunI, b.sunI),
    zenith: l3(a.zenith, b.zenith), horizon: l3(a.horizon, b.horizon), envI: l(a.envI, b.envI),
    exposure: l(a.exposure, b.exposure), glow: l(a.glow, b.glow),
  };
}

// Tighter boxes than before (crisper contact shadows); radius is the PCF blur in texels.
const SHADOW: Record<Quality, { size: number; extent: number; radius: number } | null> = {
  low: null,
  medium: { size: 2048, extent: 44, radius: 1.6 },
  high: { size: 4096, extent: 66, radius: 2.2 },
};

export interface Lighting {
  sun: THREE.DirectionalLight;
  sky: Sky;
  /** Exposure for the grading pass. */
  exposure: number;
  setTime(t: number): void;
  setQuality(q: Quality): void;
  update(camera: THREE.Camera): void;
}

export function createLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer): Lighting {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.name = 'sun';
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 3;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 420;
  scene.add(sun);
  scene.add(sun.target);

  const sky = createSky();
  scene.add(sky.mesh);
  const fog = new THREE.FogExp2(0xffffff, 0.0013);
  scene.fog = fog;

  const sunDir = new THREE.Vector3();
  const state: SkyState = { sunDir, zenith: new THREE.Color(), horizon: new THREE.Color(), ground: new THREE.Color(), sun: new THREE.Color() };
  const envGround = new THREE.Color();
  const fogColor = new THREE.Color();
  let bakedAt = -1;
  let extent = 55;

  const api: Lighting = {
    sun,
    sky,
    exposure: 1,
    setTime(t) {
      const k = sample(t);
      const el = THREE.MathUtils.degToRad(k.elev);
      const az = THREE.MathUtils.degToRad(k.azim);
      sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
      state.sun.setRGB(...k.sun);
      state.zenith.setRGB(...k.zenith);
      state.horizon.setRGB(...k.horizon);
      // Fog / below-horizon colour: the horizon, a touch hazier.
      state.ground.copy(state.horizon).lerp(state.zenith, 0.18);
      // Fog: the warm horizon haze, so distance melts into the sky's glow.
      fogColor.copy(state.horizon).lerp(state.zenith, 0.08);
      envGround.setRGB(0.26, 0.24, 0.15).multiply(state.sun);
      sky.set(state, envGround);
      fog.color.copy(fogColor);
      sun.color.setRGB(...k.sun);
      sun.intensity = k.sunI;
      scene.environmentIntensity = k.envI;
      api.exposure = k.exposure;
      U.glow.value = k.glow;
      // Re-bake image-based light in coarse steps (a few times per session).
      const step = Math.round(k.t * 12);
      if (step !== bakedAt) {
        bakedAt = step;
        scene.environment = sky.bakeEnvironment(renderer);
      }
    },
    setQuality(q) {
      const s = SHADOW[q];
      sun.castShadow = s !== null;
      if (s) {
        extent = s.extent;
        sun.shadow.radius = s.radius;
        if (sun.shadow.mapSize.x !== s.size) {
          sun.shadow.mapSize.set(s.size, s.size);
          sun.shadow.map?.dispose();
          sun.shadow.map = null;
        }
        const c = sun.shadow.camera;
        c.left = -extent;
        c.right = extent;
        c.top = extent;
        c.bottom = -extent;
        c.updateProjectionMatrix();
      }
      fog.density = q === 'low' ? 0.0024 : 0.0019;
    },
    update(camera) {
      sky.mesh.position.copy(camera.position);
      // Centre the shadow box a little ahead of the camera, snapped to shadow texels.
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() > 1e-6) fwd.normalize();
      const center = camera.position.clone().addScaledVector(fwd, extent * 0.45);
      const texel = (2 * extent) / sun.shadow.mapSize.x;
      // Snap in light space so the projected grid stays fixed.
      const lightRot = new THREE.Matrix4().lookAt(sunDir, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
      const inv = lightRot.clone().invert();
      center.applyMatrix4(inv);
      center.x = Math.round(center.x / texel) * texel;
      center.y = Math.round(center.y / texel) * texel;
      center.applyMatrix4(lightRot);
      sun.target.position.copy(center);
      sun.position.copy(center).addScaledVector(sunDir, 200);
      sun.target.updateMatrixWorld();
      sun.updateMatrixWorld();
    },
  };
  return api;
}
