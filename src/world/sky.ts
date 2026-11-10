/**
 * Procedural golden-hour sky dome (gradient + sun glow + soft clouds). A second copy, without the
 * sun disk and with a warm ground bounce, is baked into a PMREM environment map for image-based light.
 */
import * as THREE from 'three';
import { GLSL_NOISE, U } from './materials';

export interface SkyState {
  sunDir: THREE.Vector3;
  zenith: THREE.Color;
  horizon: THREE.Color;
  /** Colour below the horizon (fog colour for the visible sky; ground bounce for the environment). */
  ground: THREE.Color;
  sun: THREE.Color;
}

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */ `
uniform vec3 uSunDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSun;
uniform float uDisk; uniform float uTime;
varying vec3 vDir;
${GLSL_NOISE}
float cloudFbm(vec2 p) {
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * rgNoise(p); p = p * 2.07 + 13.1; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float hz = pow(1.0 - clamp(y, 0.0, 1.0), 3.2);
  vec3 col = mix(uZenith, uHorizon, hz);
  float sd = max(dot(d, uSunDir), 0.0);
  // Warm haze around the sun, wider near the horizon.
  col += uSun * (pow(sd, 5.0) * 0.28 + pow(sd, 40.0) * 0.5) * (0.6 + 0.4 * hz);
  // Clouds: a soft high layer, lit from the sun side.
  if (y > 0.0) {
    vec2 uv = d.xz / (y + 0.18) * 1.6 + vec2(uTime * 0.006, uTime * 0.002);
    float c = smoothstep(0.5, 0.78, cloudFbm(uv)) * smoothstep(0.0, 0.2, y);
    float rim = pow(sd, 3.0);
    vec3 cc = mix(uHorizon * 0.95 + uZenith * 0.12, uSun * 0.55 + uHorizon * 0.65, 0.35 + 0.65 * rim);
    col = mix(col, cc, c * 0.85);
  }
  col += uSun * smoothstep(0.99955, 0.9998, sd) * uDisk;
  col = mix(col, uGround, smoothstep(0.0, -0.06, y));
  gl_FragColor = vec4(col, 1.0);
}`;

function makeMaterial(disk: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() },
      uDisk: { value: disk },
      uTime: U.time,
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
}

export interface Sky {
  mesh: THREE.Mesh;
  set(s: SkyState, envGround: THREE.Color): void;
  /** Re-bake the environment map (call when the sky changed noticeably). */
  bakeEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture;
  dispose(): void;
}

export function createSky(): Sky {
  const mat = makeMaterial(40);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  mesh.scale.setScalar(1100);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'sky';

  const envMat = makeMaterial(0);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), envMat));
  let pmrem: THREE.PMREMGenerator | null = null;
  let rt: THREE.WebGLRenderTarget | null = null;

  const apply = (m: THREE.ShaderMaterial, s: SkyState, ground: THREE.Color): void => {
    m.uniforms.uSunDir.value.copy(s.sunDir);
    m.uniforms.uZenith.value.copy(s.zenith);
    m.uniforms.uHorizon.value.copy(s.horizon);
    m.uniforms.uGround.value.copy(ground);
    m.uniforms.uSun.value.copy(s.sun);
  };
  return {
    mesh,
    set(s, envGround) {
      apply(mat, s, s.ground);
      apply(envMat, s, envGround);
    },
    bakeEnvironment(renderer) {
      if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
      const next = pmrem.fromScene(envScene, 0, 0.1, 500);
      rt?.dispose();
      rt = next;
      return next.texture;
    },
    dispose() {
      rt?.dispose();
      pmrem?.dispose();
      mesh.geometry.dispose();
      mat.dispose();
      envMat.dispose();
    },
  };
}
