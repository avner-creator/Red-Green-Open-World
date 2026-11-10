/**
 * Instanced glow quads for layer objects (fireflies, sparkle bursts, glowing paw prints) and a
 * small both-eye sparkle burst for celebrations at both-eye objects.
 *
 * Layer quads: one InstancedMesh, one draw call, brightness + coverage only (grey, no hue), depth
 * tested against the world, no depth write. Per instance: grey level, alpha and a phase.
 */
import * as THREE from 'three';

export type GlowKind = 'fly' | 'spark' | 'paw';

const vertex = /* glsl */ `
attribute vec4 aGlow; // level, alpha, phase, puff (1 = soft camera-facing glow)
varying vec2 vUv;
varying vec4 vGlow;
void main() {
  vUv = uv;
  vGlow = aGlow;
#ifdef BILLBOARD
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 sc = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
  mv.xy += position.xy * sc;
#else
  vec4 mv;
  if (aGlow.w > 0.5) {
    // Puff: the ground quad turned to face the camera (its XZ = the original quad's -X, Y).
    mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 sc = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[2].xyz));
    mv.xy += vec2(-position.x, position.z) * sc;
  } else {
    mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
#endif
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
uniform float time;
varying vec2 vUv;
varying vec4 vGlow;
float ell(vec2 p, vec2 c, vec2 r) { return length((p - c) / r); }
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float a;
  float g;
#if defined(KIND_FLY)
  // Slow, bright breathing glow: a big soft halo around a solid core, little wings flapping.
  float pulse = 0.72 + 0.28 * sin(time * 2.2 + vGlow.z);
  float core = smoothstep(0.38, 0.25, r);
  float halo = exp(-r * r * 3.4) * (0.5 + 0.35 * pulse) * (1.0 - smoothstep(0.85, 1.0, r));
  float flap = 0.55 + 0.45 * sin(time * 21.0 + vGlow.z * 3.0);
  float wl = smoothstep(1.0, 0.75, ell(vec2(abs(p.x), p.y), vec2(0.38, 0.24), vec2(0.22, 0.06 + 0.11 * flap)));
  float wing = wl * 0.6;
  a = max(max(core, halo), wing);
  g = core > 0.01 ? mix(0.75, 1.0, core) * (0.85 + 0.15 * pulse) : (wing > halo ? 0.6 : 0.95 * pulse);
#elif defined(KIND_SPARK)
  float soft = exp(-r * r * 9.0);
  float rays = exp(-abs(p.x) * 14.0) * exp(-abs(p.y) * 2.6) + exp(-abs(p.y) * 14.0) * exp(-abs(p.x) * 2.6);
  a = clamp(soft + rays * 0.8, 0.0, 1.0);
  g = 1.0;
#else
  if (vGlow.w > 0.5) {
    // Soft glow hovering over a print that is next: makes it findable from a few metres away.
    a = exp(-r * r * 4.0) * (1.0 - smoothstep(0.8, 1.0, r)) * (0.85 + 0.15 * sin(time * 3.0 + vGlow.z));
    g = 0.9;
  } else {
  // Puppy paw print: a big heel pad and four toes (local +Y = walking direction).
  float pad = ell(p, vec2(0.0, -0.28), vec2(0.42, 0.34));
  float t1 = ell(p, vec2(-0.5, 0.18), vec2(0.17, 0.21));
  float t2 = ell(p, vec2(-0.18, 0.5), vec2(0.17, 0.21));
  float t3 = ell(p, vec2(0.18, 0.5), vec2(0.17, 0.21));
  float t4 = ell(p, vec2(0.5, 0.18), vec2(0.17, 0.21));
  float d = min(pad, min(min(t1, t2), min(t3, t4)));
  float w = max(fwidth(d), 1e-4);
  float ink = clamp((1.0 - d) / w, 0.0, 1.0);
  float glow = exp(-max(d - 1.0, 0.0) * 3.5) * 0.35 * (0.85 + 0.15 * sin(time * 3.0 + vGlow.z));
  a = max(ink, glow * step(r, 1.0));
  g = ink > 0.5 ? 1.0 : 0.8;
  }
#endif
  a *= vGlow.y;
  if (a < 0.004) discard;
  float lv = pow(clamp(g * vGlow.x, 0.0, 1.0), 2.2);
  gl_FragColor = vec4(vec3(lv), a);
}
`;

export interface GlowInstances {
  readonly mesh: THREE.InstancedMesh;
  /** Write instance `i`: matrix, grey level 0..1, alpha 0..1, phase, puff (paw quads only: a soft camera-facing glow). */
  set(i: number, matrix: THREE.Matrix4, level: number, alpha: number, phase?: number, puff?: boolean): void;
  /** Number of instances drawn (0 = no draw call at all). */
  commit(count: number): void;
  setTime(t: number): void;
  dispose(): void;
}

/** Instanced glow quads (`fly`/`spark` face the camera; `paw` lies in the instance's XZ plane). */
export function createGlowInstances(capacity: number, kind: GlowKind, name: string): GlowInstances {
  const geo = new THREE.PlaneGeometry(1, 1);
  if (kind === 'paw') geo.rotateX(-Math.PI / 2).rotateY(Math.PI); // uv +Y → local -Z… then flipped to +Z
  const glow = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  glow.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aGlow', glow);
  const defines: Record<string, string> = { [`KIND_${kind.toUpperCase()}`]: '' };
  if (kind !== 'paw') defines.BILLBOARD = '';
  const mat = new THREE.ShaderMaterial({
    name: `glasses-${kind}`,
    uniforms: { time: { value: 0 } },
    defines,
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  return {
    mesh,
    set(i, matrix, level, alpha, phase = 0, puff = false) {
      mesh.setMatrixAt(i, matrix);
      glow.setXYZW(i, level, alpha, phase, puff ? 1 : 0);
    },
    commit(count) {
      mesh.count = Math.max(0, Math.min(capacity, count));
      mesh.instanceMatrix.needsUpdate = true;
      glow.needsUpdate = true;
    },
    setTime(t) {
      mat.uniforms.time.value = t;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
}

// ───────────────────────────── both-eye sparkle ─────────────────────────────

function starTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    const c = size / 2;
    const grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,250,225,0.7)');
    grad.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    g.fillStyle = 'rgba(255,255,255,1)';
    g.strokeStyle = 'rgba(46,34,12,0.95)';
    g.lineWidth = 3.5;
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? c * 0.9 : c * 0.24;
      g.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
    }
    g.closePath();
    g.stroke();
    g.fill();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Sparkle {
  readonly mesh: THREE.InstancedMesh;
  /** A burst of `n` stars around `pos` (world), flying up and out. */
  burst(pos: THREE.Vector3, n?: number, spread?: number): void;
  /** A flat ring of stars racing outwards around `pos` (world). */
  ring(pos: THREE.Vector3, n?: number, speed?: number): void;
  update(dt: number, camera: THREE.Camera): void;
  clear(): void;
  readonly busy: boolean;
  dispose(): void;
}

interface Star {
  t: number;
  life: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
  s: number;
  spin: number;
  /** Gravity on this star. */
  g: number;
}

/**
 * Both-eye star sparkle (main scene): warm-white stars with a dark outline, so they read as a
 * brightness pop in the R and the G channel alike, on bright and dark backgrounds. Use it only at both-eye objects.
 */
export function createSparkle(capacity: number, name: string, rng: () => number): Sparkle {
  const tex = starTexture();
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xfff4d6, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  const stars: Star[] = [];
  const dummy = new THREE.Object3D();
  const q = new THREE.Quaternion();
  const roll = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  return {
    mesh,
    burst(pos, n = 10, spread = 1) {
      for (let i = 0; i < n && stars.length < capacity; i++) {
        const a = (i / n) * Math.PI * 2 + rng() * 0.5;
        const sp = (1.4 + rng() * 1.6) * spread;
        stars.push({ t: 0, life: 0.7 + rng() * 0.5, p: pos.clone(), v: new THREE.Vector3(Math.cos(a) * sp, 2.2 + rng() * 2.2, Math.sin(a) * sp), s: (0.22 + rng() * 0.2) * spread, spin: rng() * 6, g: 5.5 });
      }
    },
    ring(pos, n = 16, speed = 3.2) {
      for (let i = 0; i < n && stars.length < capacity; i++) {
        const a = (i / n) * Math.PI * 2;
        stars.push({ t: 0, life: 0.75, p: pos.clone(), v: new THREE.Vector3(Math.cos(a) * speed, 0.3, Math.sin(a) * speed), s: 0.46, spin: i, g: 0 });
      }
    },
    update(dt, camera) {
      for (const s of stars) {
        s.t += dt;
        s.v.y -= s.g * dt;
        s.p.addScaledVector(s.v, dt);
      }
      for (let i = stars.length - 1; i >= 0; i--) if (stars[i].t >= stars[i].life) stars.splice(i, 1);
      camera.getWorldQuaternion(q);
      stars.forEach((s, i) => {
        const k = s.t / s.life;
        dummy.position.copy(s.p);
        dummy.quaternion.copy(q).multiply(roll.setFromAxisAngle(zAxis, s.spin + s.t * 4));
        dummy.scale.setScalar(s.s * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.count = stars.length;
      mesh.instanceMatrix.needsUpdate = true;
    },
    clear() {
      stars.length = 0;
      mesh.count = 0;
    },
    get busy() {
      return stars.length > 0;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      tex.dispose();
      mesh.dispose();
    },
  };
}
