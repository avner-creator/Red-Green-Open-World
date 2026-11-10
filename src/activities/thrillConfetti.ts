/**
 * Big both-eye celebration for the thrill rides (bigger pieces than the chest confetti): a pooled field of tumbling confetti (instanced, one draw
 * call) plus an additive flash. Palette mixes bright and dark entries (see PALETTE).
 */
import * as THREE from 'three';

const MAX = 420;
/**
 * Every piece is clearly bright or clearly dark in BOTH the red and the green channel (no cyan,
 * pink or orange mid-tones), so the burst reads by brightness against light and dark backgrounds.
 */
const PALETTE = [0xffffff, 0x0b0e1c, 0xfff4a8, 0x15245a, 0xffe03a, 0x111111];

interface Particle {
  alive: boolean;
  age: number;
  life: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
  size: number;
}

function flashTexture(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,230,150,0.6)');
    grad.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    // Four soft rays.
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,240,200,0.5)';
    g.fillRect(s / 2 - 2, 4, 4, s - 8);
    g.fillRect(4, s / 2 - 2, s - 8, 4);
  }
  return new THREE.CanvasTexture(c);
}

export class ThrillConfetti {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly geo = new THREE.PlaneGeometry(0.42, 0.26);
  private readonly mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  private readonly flashTex = flashTexture();
  private readonly flashMat = new THREE.SpriteMaterial({ map: this.flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  private readonly flashes: { sprite: THREE.Sprite; t: number }[] = [];
  private next = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor() {
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAX; i++) {
      this.particles.push({ alive: false, age: 0, life: 1, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, sx: 0, sy: 0, sz: 0, size: 1 });
      this.mesh.setMatrixAt(i, this.zero);
      this.mesh.setColorAt(i, new THREE.Color(PALETTE[i % PALETTE.length]));
    }
    this.group.add(this.mesh);
    for (let i = 0; i < 3; i++) {
      const sprite = new THREE.Sprite(this.flashMat.clone());
      sprite.visible = false;
      sprite.renderOrder = 10;
      this.flashes.push({ sprite, t: 9 });
      this.group.add(sprite);
    }
  }

  /** Burst of `count` pieces from `origin` (world space), plus a flash. */
  burst(origin: THREE.Vector3, count = 90): void {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const p = this.particles[i];
      const a = Math.random() * Math.PI * 2;
      const spread = 1.5 + Math.random() * 6;
      p.alive = true;
      p.age = 0;
      p.life = 2 + Math.random() * 1.4;
      p.px = origin.x + Math.cos(a) * 0.15;
      p.py = origin.y;
      p.pz = origin.z + Math.sin(a) * 0.15;
      p.vx = Math.cos(a) * spread;
      p.vy = 5 + Math.random() * 9;
      p.vz = Math.sin(a) * spread;
      p.rx = Math.random() * 6;
      p.ry = Math.random() * 6;
      p.rz = Math.random() * 6;
      p.sx = (Math.random() - 0.5) * 14;
      p.sy = (Math.random() - 0.5) * 14;
      p.sz = (Math.random() - 0.5) * 14;
      p.size = 0.8 + Math.random() * 0.7;
      this.mesh.setColorAt(i, new THREE.Color(PALETTE[(i * 7 + n) % PALETTE.length]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    const f = this.flashes.find((x) => x.t >= 1) ?? this.flashes[0];
    f.t = 0;
    f.sprite.position.copy(origin);
    f.sprite.visible = true;
  }

  update(dt: number): void {
    let any = false;
    for (let i = 0; i < MAX; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      any = true;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        this.mesh.setMatrixAt(i, this.zero);
        continue;
      }
      // Gravity, drag and a little flutter (paper falls slowly).
      p.vy -= 9.8 * dt * 0.55;
      const drag = Math.exp(-1.4 * dt);
      p.vx *= drag;
      p.vz *= drag;
      if (p.vy < -3) p.vy = -3;
      p.px += (p.vx + Math.sin(p.age * 6 + i) * 0.35) * dt;
      p.py += p.vy * dt;
      p.pz += (p.vz + Math.cos(p.age * 5 + i) * 0.35) * dt;
      p.rx += p.sx * dt;
      p.ry += p.sy * dt;
      p.rz += p.sz * dt;
      const k = p.age / p.life;
      const fade = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      this.dummy.position.set(p.px, p.py, p.pz);
      this.dummy.rotation.set(p.rx, p.ry, p.rz);
      this.dummy.scale.setScalar(p.size * fade);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
    for (const f of this.flashes) {
      if (f.t >= 1) continue;
      f.t += dt / 0.7;
      const k = Math.min(1, f.t);
      f.sprite.scale.setScalar(3 + k * 12);
      (f.sprite.material as THREE.SpriteMaterial).opacity = (1 - k) * (1 - k);
      if (f.t >= 1) f.sprite.visible = false;
    }
  }

  clear(): void {
    for (let i = 0; i < MAX; i++) {
      this.particles[i].alive = false;
      this.mesh.setMatrixAt(i, this.zero);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    for (const f of this.flashes) {
      f.t = 9;
      f.sprite.visible = false;
    }
  }

  dispose(): void {
    this.mesh.dispose();
    this.geo.dispose();
    this.mat.dispose();
    this.flashTex.dispose();
    this.flashMat.dispose();
    for (const f of this.flashes) (f.sprite.material as THREE.Material).dispose();
  }
}
