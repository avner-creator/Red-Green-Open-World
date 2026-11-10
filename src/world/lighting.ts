/**
 * Sun, shadows, sky, fog and exposure over the session: warm afternoon (t=0) → sunset (t=1).
 * One shadow map follows the camera, snapped to texels so edges don't shimmer; it widens with the
 * camera's height above the ground so the island keeps its shadows seen from the balloon.
 * Fog is height-aware (thick near sea level, thin higher up) so the view from 100–180 m stays clear
 * while the far horizon still melts into the warm haze.
 */
import * as THREE from 'three';
import type { Quality } from '../types';
import { createSky } from './sky';
import type { Sky, SkyState } from './sky';
import { U } from './materials';

/** Height (m) at which the fog has its nominal density, and how fast it thins above (1/m). */
const FOG_BASE = 18;
const FOG_FALLOFF = 1 / 60;

let fogPatched = false;
/**
 * Replace three's exponential-squared fog with height fog, for every material in the scene.
 * Optical depth along the view ray integrates density·exp(−k(h − base)) between the camera and the
 * fragment; beyond ~850 m everything fades fully into the fog colour (= the sky below the horizon),
 * so the edge of the sea plane never shows.
 */
function patchFogChunks(): void {
  if (fogPatched) return;
  fogPatched = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = C.fog_pars_vertex.replace('varying float vFogDepth;', 'varying float vFogDepth;\nvarying vec3 vFogMv;');
  C.fog_vertex = C.fog_vertex.replace('vFogDepth = - mvPosition.z;', 'vFogDepth = - mvPosition.z;\n\tvFogMv = mvPosition.xyz;');
  C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying vec3 vFogMv;');
  C.fog_fragment = C.fog_fragment.replace(
    'float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );',
    /* glsl */ `float rgFogDist = length( vFogMv );
		float rgFogDy = ( vec4( vFogMv, 0.0 ) * viewMatrix ).y;
		float rgFogK = ${FOG_FALLOFF.toFixed(5)};
		float rgFogE = exp( - rgFogK * ( cameraPosition.y - ${FOG_BASE.toFixed(1)} ) );
		float rgFogH = abs( rgFogDy ) > 0.05 ? rgFogE * ( 1.0 - exp( - rgFogK * rgFogDy ) ) / ( rgFogK * rgFogDy ) : rgFogE;
		float rgFogOd = fogDensity * rgFogDist * min( rgFogH, 1.5 );
		float fogFactor = max( 1.0 - exp( - rgFogOd * rgFogOd ), smoothstep( 850.0, 1150.0, rgFogDist ) );`,
  );
}

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

export function createLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer, heightAt: (x: number, z: number) => number): Lighting {
  patchFogChunks();
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
  /** Shadow box half-size on the ground (quality) and the current one (widened with altitude). */
  let baseExtent = 55;
  let extent = 55;
  const fwd = new THREE.Vector3();
  const center = new THREE.Vector3();
  const lightRot = new THREE.Matrix4();
  const lightInv = new THREE.Matrix4();
  const origin = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const setExtent = (e: number): void => {
    extent = e;
    const c = sun.shadow.camera;
    c.left = -e;
    c.right = e;
    c.top = e;
    c.bottom = -e;
    c.far = (e > baseExtent ? 260 : 200) + Math.max(220, e * 1.5);
    c.updateProjectionMatrix();
  };

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
      // Fog: the warm horizon haze, so distance melts into the sky's glow. The sky below the
      // horizon uses the same colour, so far sea and sky meet without a seam.
      fogColor.copy(state.horizon).lerp(state.zenith, 0.1);
      state.ground.copy(fogColor);
      U.sunDir.value.copy(sunDir);
      U.sunColor.value.copy(state.sun).multiplyScalar(k.sunI);
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
        baseExtent = extent = s.extent;
        sun.shadow.radius = s.radius;
        if (sun.shadow.mapSize.x !== s.size) {
          sun.shadow.mapSize.set(s.size, s.size);
          sun.shadow.map?.dispose();
          sun.shadow.map = null;
        }
        setExtent(extent);
      }
      fog.density = q === 'low' ? 0.0024 : 0.0019;
    },
    update(camera) {
      sky.mesh.position.copy(camera.position);
      if (!sun.castShadow) return;
      // Widen the shadow box with height above the ground (in 8 m steps, so it rarely re-snaps):
      // from the balloon the whole diorama below keeps its tree and house shadows.
      const ground = heightAt(camera.position.x, camera.position.z);
      const agl = Math.max(0, camera.position.y - Math.max(ground, 0));
      const want = Math.min(baseExtent * 4, baseExtent * (1 + agl / 45));
      const stepped = Math.max(baseExtent, Math.round(want / 8) * 8);
      if (stepped !== extent) setExtent(stepped);
      // Centre the box on the ground a little ahead of the camera, snapped to shadow texels.
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() > 1e-6) fwd.normalize();
      center.copy(camera.position).addScaledVector(fwd, extent * 0.45);
      center.y = agl > 20 ? Math.max(heightAt(center.x, center.z), 0) : camera.position.y;
      const texel = (2 * extent) / sun.shadow.mapSize.x;
      // Snap in light space so the projected grid stays fixed.
      lightRot.lookAt(sunDir, origin, up);
      lightInv.copy(lightRot).invert();
      center.applyMatrix4(lightInv);
      center.x = Math.round(center.x / texel) * texel;
      center.y = Math.round(center.y / texel) * texel;
      center.applyMatrix4(lightRot);
      sun.target.position.copy(center);
      sun.position.copy(center).addScaledVector(sunDir, extent > baseExtent ? 260 : 200);
      sun.target.updateMatrixWorld();
      sun.updateMatrixWorld();
    },
  };
  return api;
}
