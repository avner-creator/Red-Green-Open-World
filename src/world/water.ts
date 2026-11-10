/**
 * Sea / bay water: one opaque plane. Colour comes from the water depth (baked from the terrain grid),
 * with a bright foam line at the shore so the edge reads in both colour channels. Animated normals
 * catch the sun and reflect the sky environment map.
 */
import * as THREE from 'three';
import type { TerrainData } from './terrain';
import { patch } from './materials';

export function createWater(t: TerrainData): { mesh: THREE.Mesh; dispose(): void } {
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
    fragmentPre: 'uniform sampler2D uDepth; uniform vec2 uBounds;',
    fragment: /* glsl */ `
      vec2 duv = (vWorldPos.xz - uBounds.x) / uBounds.y;
      vec2 cuv = clamp(duv, 0.0, 1.0);
      vec4 dd = texture2D(uDepth, cuv * (1.0 - 1.0 / 201.0) + 0.5 / 201.0);
      float outside = step(0.001, abs(duv.x - cuv.x) + abs(duv.y - cuv.y));
      float deep = max(dd.r, outside);
      float shallow = max(dd.g, outside);
      vec3 cShallow = vec3(0.26, 0.62, 0.58);
      vec3 cMid = vec3(0.04, 0.3, 0.36);
      vec3 cDeep = vec3(0.02, 0.12, 0.2);
      vec3 wc = mix(cShallow, cMid, smoothstep(0.0, 0.35, deep));
      wc = mix(wc, cDeep, smoothstep(0.3, 1.0, deep));
      float n1 = rgNoise(vWorldPos.xz * 0.45 + vec2(uTime * 0.35, uTime * 0.2));
      float n2 = rgNoise(vWorldPos.xz * 1.3 - vec2(uTime * 0.25, -uTime * 0.3));
      float band = 0.5 + 0.5 * sin(shallow * 14.0 - uTime * 1.6 + n1 * 3.0);
      float foam = (1.0 - smoothstep(0.08, 0.32, shallow)) * smoothstep(0.35, 0.65, n1 * 0.6 + n2 * 0.4 + band * 0.35);
      foam = max(foam, 1.0 - smoothstep(0.02, 0.1, shallow));
      diffuseColor.rgb = mix(wc, vec3(0.92, 0.94, 0.92), clamp(foam, 0.0, 1.0) * (1.0 - outside));`,
    afterNormal: /* glsl */ `
      {
        vec2 wp = vWorldPos.xz;
        float dist = length(vWorldPos - cameraPosition);
        float nearF = 1.0 - smoothstep(20.0, 140.0, dist);
        float farF = 1.0 - smoothstep(80.0, 600.0, dist);
        vec2 g = vec2(cos(wp.x * 0.23 + uTime * 1.1), cos(wp.y * 0.19 - uTime * 0.9)) * 0.04 * farF;
        g += (vec2(rgNoise(wp * 0.15 + uTime * 0.08), rgNoise(wp * 0.15 - uTime * 0.07 + 7.0)) - 0.5) * 0.16 * farF;
        g += (vec2(rgNoise(wp * 0.6 + uTime * 0.3), rgNoise(wp * 0.6 - uTime * 0.27 + 7.0)) - 0.5) * 0.18 * nearF;
        g += (vec2(rgNoise(wp * 2.4 - uTime * 0.6), rgNoise(wp * 2.4 + uTime * 0.5 + 3.0)) - 0.5) * 0.1 * nearF;
        vec3 nW = normalize(vec3(-g.x, 1.0, -g.y));
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
      }`,
  });
  const inner = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    inner.call(mat, shader, renderer);
    shader.uniforms.uDepth = uDepth;
    shader.uniforms.uBounds = uBounds;
  };
  const geo = new THREE.PlaneGeometry(2400, 2400, 1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.receiveShadow = true;
  mesh.position.y = 0;
  return {
    mesh,
    dispose() {
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}
