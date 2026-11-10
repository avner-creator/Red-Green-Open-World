/**
 * The moving parts of the outer areas (one draw each, all cheap): the canyon waterfall and river
 * with flowing foam streaks, the lighthouse's turning light beams (brighter towards sunset), the
 * ranch windmill's wheel and the bobbing swim buoys. Everything is both-eye scenery.
 */
import * as THREE from 'three';
import { patch, U } from '../materials';

export interface OuterLiveDefs {
  waterfall: THREE.BufferGeometry;
  river: THREE.BufferGeometry;
  lamp: { x: number; y: number; z: number };
  windmill: { x: number; y: number; z: number; yaw: number };
  buoys: { x: number; z: number; color: number }[];
}

export interface OuterLive {
  group: THREE.Group;
  update(t: number): void;
}

function waterMat(key: string, flow: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0.05, side: THREE.DoubleSide });
  patch(m, key, {
    vertexPre: 'attribute float aFoam; varying float vFoam;',
    vertex: 'vFoam = aFoam;',
    fragmentPre: 'varying float vFoam;',
    // Dark teal water with bright foam streaks moving downstream: reads by brightness in R and G.
    fragment: /* glsl */ `
      ${flow}
      float streak = smoothstep(0.55, 0.85, rgNoise(fp) * 0.7 + rgNoise(fp * 2.7) * 0.3);
      float foam = clamp(vFoam * (0.55 + 0.6 * rgNoise(fp * 1.6)) + streak * (0.35 + 0.5 * vFoam), 0.0, 1.0);
      diffuseColor.rgb = mix(vec3(0.06, 0.24, 0.3), vec3(0.93, 0.96, 0.97), foam);`,
  });
  return m;
}

function wheelGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blades = 16;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    const g = new THREE.BoxGeometry(0.34, 1.25, 0.03).translate(0, 1.15, 0).rotateY(0.35).rotateZ(a);
    parts.push(g.toNonIndexed());
    g.dispose();
  }
  const rim = new THREE.TorusGeometry(1.8, 0.04, 4, 32).toNonIndexed();
  const hub = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 10).rotateX(Math.PI / 2).toNonIndexed();
  parts.push(rim, hub);
  const total = parts.reduce((n, p) => n + p.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  const c = new THREE.Color();
  parts.forEach((p, i) => {
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    c.set(i < blades ? (i % 2 ? 0xf2eee6 : 0xb8433a) : 0x3a3f45);
    for (let v = 0; v < p.attributes.position.count; v++) col.set([c.r, c.g, c.b], (o + v) * 3);
    o += p.attributes.position.count;
    p.dispose();
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function beamGeo(): THREE.BufferGeometry {
  // Two opposite light cones from the lantern, 26 m long, widening to 3.2 m.
  const a = new THREE.CylinderGeometry(0.35, 3.2, 26, 16, 1, true).translate(0, 13, 0).rotateZ(-Math.PI / 2);
  const b = a.clone().rotateY(Math.PI);
  const pa = a.toNonIndexed();
  const pb = b.toNonIndexed();
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(pa.attributes.position.count * 3 + pb.attributes.position.count * 3);
  pos.set(pa.attributes.position.array as Float32Array, 0);
  pos.set(pb.attributes.position.array as Float32Array, pa.attributes.position.count * 3);
  // Fade along the beam (alpha in a custom attribute).
  const fade = new Float32Array(pos.length / 3);
  for (let i = 0; i < fade.length; i++) fade[i] = 1 - Math.min(1, Math.abs(pos[i * 3]) / 26);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
  g.computeVertexNormals();
  [a, b, pa, pb].forEach((x) => x.dispose());
  return g;
}

export function createOuterLive(d: OuterLiveDefs): OuterLive {
  const group = new THREE.Group();
  group.name = 'outer-live';

  const fall = new THREE.Mesh(d.waterfall, waterMat('rg-waterfall', 'vec2 fp = vec2(vWorldPos.x * 1.4, vWorldPos.y * 0.35 + uTime * 2.6);'));
  fall.name = 'outer:waterfall';
  const river = new THREE.Mesh(d.river, waterMat('rg-river', 'vec2 fp = vec2(vWorldPos.x * 0.45 + uTime * 0.9, vWorldPos.z * 1.6);'));
  river.name = 'outer:river';
  for (const m of [fall, river]) {
    m.receiveShadow = true;
    m.castShadow = false;
    m.matrixAutoUpdate = false;
    group.add(m);
  }

  // Lighthouse beams: additive, soft, rotating; stronger as the sun goes down.
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uGlow: U.glow, uLamp: { value: new THREE.Vector3(d.lamp.x, d.lamp.y, d.lamp.z) } },
    vertexShader: /* glsl */ `
      attribute float aFade; varying float vFade; varying vec3 vW; varying vec3 vN;
      void main() {
        vFade = aFade;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    // Soft edges (fades where the cone is seen edge-on) and nothing when the camera is close to the
    // lamp (standing on the gallery), so the beam never washes out the view.
    fragmentShader: /* glsl */ `
      uniform float uGlow; uniform vec3 uLamp; varying float vFade; varying vec3 vW; varying vec3 vN;
      void main() {
        vec3 v = normalize(cameraPosition - vW);
        float soft = pow(abs(dot(v, normalize(vN))), 1.5);
        float near = smoothstep(9.0, 22.0, distance(cameraPosition, uLamp));
        gl_FragColor = vec4(vec3(1.0, 0.92, 0.7) * vFade * vFade * soft * near * (0.04 + 0.26 * uGlow), 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(beamGeo(), beamMat);
  beam.name = 'outer:beam';
  beam.position.set(d.lamp.x, d.lamp.y, d.lamp.z);
  beam.rotation.z = -0.06;
  beam.frustumCulled = false;
  beam.renderOrder = 5;
  group.add(beam);

  const wheel = new THREE.Mesh(wheelGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  wheel.name = 'outer:windmill';
  const pivot = new THREE.Group();
  pivot.position.set(d.windmill.x, d.windmill.y, d.windmill.z);
  pivot.rotation.y = d.windmill.yaw;
  wheel.position.set(0, 0, 0.5);
  wheel.castShadow = true;
  pivot.add(wheel);
  group.add(pivot);

  const buoyGeo = new THREE.SphereGeometry(0.42, 12, 8);
  buoyGeo.scale(1, 0.85, 1);
  const buoys = new THREE.InstancedMesh(buoyGeo, new THREE.MeshStandardMaterial({ roughness: 0.4 }), d.buoys.length);
  buoys.name = 'outer:buoys';
  const col = new THREE.Color();
  d.buoys.forEach((b, i) => buoys.setColorAt(i, col.set(b.color)));
  buoys.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  buoys.castShadow = false;
  group.add(buoys);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const placeBuoys = (t: number): void => {
    d.buoys.forEach((b, i) => {
      const ph = i * 1.3;
      e.set(Math.sin(t * 1.1 + ph) * 0.12, 0, Math.cos(t * 0.9 + ph) * 0.12);
      q.setFromEuler(e);
      buoys.setMatrixAt(i, m4.compose(p.set(b.x, 0.12 + Math.sin(t * 1.4 + ph) * 0.08, b.z), q, s));
    });
    buoys.instanceMatrix.needsUpdate = true;
  };
  placeBuoys(0);
  buoys.computeBoundingSphere();

  let last = -1;
  return {
    group,
    update(t) {
      beam.rotation.y = t * 0.45;
      wheel.rotation.z = -t * 1.6;
      // Buoys only need a refresh a few times a second.
      if (Math.abs(t - last) > 1 / 20) {
        last = t;
        placeBuoys(t);
      }
    },
  };
}
