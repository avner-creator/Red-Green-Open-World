/**
 * Soap bubbles from the bubble exhaust: one instanced mesh (one draw), world space, a fresnel
 * shader with a bright white rim and a clear middle (readable in R-only and G-only), drifting up
 * and popping. Both-eye (they are only juice; they never mark anything).
 */
import * as THREE from 'three';

const MAX = 70;

interface Bubble {
  alive: boolean;
  age: number;
  life: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
  size: number;
  wob: number;
}

export class Bubbles {
  readonly mesh: THREE.InstancedMesh;
  private readonly list: Bubble[] = [];
  private next = 0;
  private live = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly geo = new THREE.SphereGeometry(1, 14, 10);
  private readonly mat = new THREE.ShaderMaterial({
    name: 'SoapBubble',
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float rim = pow(f, 2.2);
        // Little highlight window.
        float hl = smoothstep(0.86, 0.95, dot(normalize(vN), normalize(vec3(-0.4, 0.7, 0.6))));
        vec3 film = mix(vec3(0.75, 0.95, 1.0), vec3(1.0, 0.85, 0.95), f);
        gl_FragColor = vec4(film + hl, clamp(rim * 0.95 + hl + 0.04, 0.0, 1.0));
      }`,
  });

  constructor() {
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, MAX);
    this.mesh.name = 'buggy-bubbles';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAX; i++) {
      this.list.push({ alive: false, age: 0, life: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), size: 0.1, wob: 0 });
      this.mesh.setMatrixAt(i, this.zero);
    }
    this.mesh.visible = false;
  }

  emit(at: THREE.Vector3, vel: THREE.Vector3, seed: number): void {
    const b = this.list[this.next];
    this.next = (this.next + 1) % MAX;
    if (!b.alive) this.live++;
    const r = (n: number): number => {
      const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    b.alive = true;
    b.age = 0;
    b.life = 1.4 + r(1) * 1.4;
    b.p.copy(at);
    b.v.copy(vel).add(this.s.set((r(2) - 0.5) * 1.2, 0.6 + r(3) * 0.8, (r(4) - 0.5) * 1.2));
    b.size = 0.08 + r(5) * 0.16;
    b.wob = r(6) * 6;
  }

  update(dt: number): void {
    if (this.live === 0) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    for (let i = 0; i < MAX; i++) {
      const b = this.list[i];
      if (!b.alive) continue;
      b.age += dt;
      if (b.age >= b.life) {
        b.alive = false;
        this.live--;
        this.mesh.setMatrixAt(i, this.zero);
        continue;
      }
      b.v.multiplyScalar(Math.exp(-2.2 * dt));
      b.v.y += 0.9 * dt; // buoyant
      b.p.addScaledVector(b.v, dt);
      b.p.x += Math.sin(b.age * 3 + b.wob) * 0.15 * dt;
      const grow = Math.min(1, b.age * 6);
      const pop = b.life - b.age < 0.08 ? 1.25 : 1;
      const sz = b.size * grow * pop;
      this.m.compose(b.p, this.q, this.s.set(sz, sz * (1 + Math.sin(b.age * 9 + b.wob) * 0.06), sz));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
