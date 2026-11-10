/**
 * Sea / bay water: one opaque plane that follows the camera. Colour comes from the water depth
 * (baked from the terrain grid): a wide turquoise shelf and a white surf line round the island, deep
 * blue further out, so the coast reads in both colour channels. Animated normals reflect the sky;
 * slow swell bands and a glittering sun-glint path give the open sea structure seen from the balloon.
 */
import * as THREE from 'three';
import type { TerrainData } from './terrain';
import { patch, U } from './materials';

export function createWater(t: TerrainData): { mesh: THREE.Mesh; update(camera: THREE.Camera): void; dispose(): void } {
  const n = t.n + 1;
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const depth = Math.max(0, -t.heights[i]);
    data[i * 4] = Math.round(Math.min(1, depth / 8) * 255);
    data[i * 4 + 1] = Math.round(Math.min(1, depth / 1.2) * 255);
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.14, metalness: 0 });
  const uDepth = { value: tex };
  const uBounds = { value: new THREE.Vector2(-t.size / 2, t.size) };
  patch(mat, 'rg-water', {
    fragmentPre: 'uniform sampler2D uDepth; uniform vec2 uBounds; uniform vec3 uSunDir; uniform vec3 uSunColor;',
    fragment: /* glsl */ `
      vec2 duv = (vWorldPos.xz - uBounds.x) / uBounds.y;
      vec2 cuv = clamp(duv, 0.0, 1.0);
      vec4 dd = texture2D(uDepth, cuv * (1.0 - 1.0 / 201.0) + 0.5 / 201.0);
      float outside = step(0.001, abs(duv.x - cuv.x) + abs(duv.y - cuv.y));
      float deep = max(dd.r, outside);
      float shallow = max(dd.g, outside);
      vec3 cShallow = vec3(0.3, 0.68, 0.6);
      vec3 cMid = vec3(0.07, 0.33, 0.38);
      vec3 cDeep = vec3(0.035, 0.11, 0.19);
      // Open sea beyond the baked grid gets darker still with distance from the island.
      float off = smoothstep(200.0, 520.0, length(vWorldPos.xz));
      vec3 wc = mix(cShallow, cMid, smoothstep(0.0, 0.35, deep));
      wc = mix(wc, cDeep, smoothstep(0.3, 1.0, deep));
      wc *= 1.0 - 0.25 * off;
      // Long swell bands (two crossing directions, broken up by noise): visible from altitude.
      vec2 sp = vWorldPos.xz;
      float sw1 = sin(dot(sp, vec2(0.052, 0.021)) + uTime * 0.55 + rgNoise(sp * 0.012) * 4.0);
      float sw2 = sin(dot(sp, vec2(-0.017, 0.043)) - uTime * 0.4 + rgNoise(sp * 0.017 + 5.0) * 4.0);
      float swell = (sw1 + sw2 * 0.7) * 0.5;
      wc *= 1.0 + 0.16 * swell * smoothstep(0.25, 0.8, deep);
      // Darker cat's-paw patches where gusts ruffle the surface.
      wc *= 0.88 + 0.24 * rgNoise(sp * 0.008 + uTime * 0.01);
      float n1 = rgNoise(vWorldPos.xz * 0.45 + vec2(uTime * 0.35, uTime * 0.2));
      float n2 = rgNoise(vWorldPos.xz * 1.3 - vec2(uTime * 0.25, -uTime * 0.3));
      float band = 0.5 + 0.5 * sin(shallow * 14.0 - uTime * 1.6 + n1 * 3.0);
      float foam = (1.0 - smoothstep(0.08, 0.32, shallow)) * smoothstep(0.35, 0.65, n1 * 0.6 + n2 * 0.4 + band * 0.35);
      foam = max(foam, 1.0 - smoothstep(0.02, 0.1, shallow));
      // A soft pale band of broken surf just beyond the shore line.
      foam = max(foam, 0.35 * (1.0 - smoothstep(0.15, 0.45, shallow)) * smoothstep(0.3, 0.7, n1));
      diffuseColor.rgb = mix(wc, vec3(0.92, 0.94, 0.92), clamp(foam, 0.0, 1.0) * (1.0 - outside));`,
    afterNormal: /* glsl */ `
      {
        vec2 wp = vWorldPos.xz;
        float dist = length(vWorldPos - cameraPosition);
        float nearF = 1.0 - smoothstep(20.0, 140.0, dist);
        float farF = 1.0 - smoothstep(80.0, 600.0, dist);
        float swellF = 1.0 - smoothstep(500.0, 1100.0, dist);
        vec2 g = vec2(cos(wp.x * 0.23 + uTime * 1.1), cos(wp.y * 0.19 - uTime * 0.9)) * 0.04 * farF;
        g += (vec2(rgNoise(wp * 0.15 + uTime * 0.08), rgNoise(wp * 0.15 - uTime * 0.07 + 7.0)) - 0.5) * 0.16 * farF;
        // Swell slopes (same bands as the colour), kept out to the horizon.
        g += vec2(0.052, 0.021) * cos(dot(wp, vec2(0.052, 0.021)) + uTime * 0.55) * 0.9 * swellF;
        g += vec2(-0.017, 0.043) * cos(dot(wp, vec2(-0.017, 0.043)) - uTime * 0.4) * 0.9 * swellF;
        g += (vec2(rgNoise(wp * 0.6 + uTime * 0.3), rgNoise(wp * 0.6 - uTime * 0.27 + 7.0)) - 0.5) * 0.18 * nearF;
        g += (vec2(rgNoise(wp * 2.4 - uTime * 0.6), rgNoise(wp * 2.4 + uTime * 0.5 + 3.0)) - 0.5) * 0.1 * nearF;
        vec3 nW = normalize(vec3(-g.x, 1.0, -g.y));
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
      }`,
    // Sun glint: a broad glittering path towards the sun. Far away the lobe widens (unresolved
    // ripples), and a sparkle noise breaks it into glints. Bright in both channels (warm white).
    emissive: /* glsl */ `
      {
        vec3 wN = inverseTransformDirection(normal, viewMatrix);
        vec3 toCam = cameraPosition - vWorldPos;
        float dCam = length(toCam);
        vec3 rf = reflect(-toCam / dCam, wN);
        float sd = max(dot(rf, uSunDir), 0.0);
        float spread = mix(900.0, 60.0, smoothstep(30.0, 700.0, dCam));
        float sparkle = smoothstep(0.55, 0.9, rgNoise(vWorldPos.xz * 1.7 + vec2(uTime * 1.3, -uTime * 0.9)));
        float glint = pow(sd, spread) * (0.25 + 2.6 * sparkle) + pow(sd, spread * 0.25) * 0.08;
        totalEmissiveRadiance += uSunColor * glint;
      }`,
  });
  const inner = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    inner.call(mat, shader, renderer);
    shader.uniforms.uDepth = uDepth;
    shader.uniforms.uBounds = uBounds;
    shader.uniforms.uSunDir = U.sunDir;
    shader.uniforms.uSunColor = U.sunColor;
  };
  const geo = new THREE.PlaneGeometry(2400, 2400, 1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.receiveShadow = true;
  mesh.position.y = 0;
  return {
    mesh,
    update(camera) {
      // Follow the camera (in 50 m steps) so the plane's edge always lies past the fog.
      mesh.position.x = Math.round(camera.position.x / 50) * 50;
      mesh.position.z = Math.round(camera.position.z / 50) * 50;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}
