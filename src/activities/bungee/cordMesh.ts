/**
 * The bungee cord: a thick tube with brightness stripes (dark navy / bright yellow, readable in
 * R-only and G-only) whose vertices are rewritten every frame along a sagging or taut centre line.
 * The stripe count is fixed per jump, so the stripes stretch with the cord and the tube thins as
 * it stretches. One draw call; both-eye.
 */
import * as THREE from 'three';

const SEGS = 56;
const RADIAL = 8;

function stripeTexture(): THREE.Texture {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!c) return new THREE.Texture();
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#1b2252';
    g.fillRect(0, 0, 4, 64);
    g.fillStyle = '#ffd94a';
    g.fillRect(0, 4, 4, 24);
    g.fillStyle = '#fff6cf';
    g.fillRect(0, 10, 4, 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class CordMesh {
  readonly mesh: THREE.Mesh;
  private readonly geo = new THREE.BufferGeometry();
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly tex = stripeTexture();
  private readonly pos: Float32Array;
  private readonly nrm: Float32Array;
  private readonly uv: Float32Array;
  private readonly centre: THREE.Vector3[] = [];
  private readonly t = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  /** Transverse wobble (a twang after each bottom), metres, decays. */
  private wobble = 0;
  private wobbleT = 0;

  constructor(readonly radius = 0.075) {
    const verts = (SEGS + 1) * (RADIAL + 1);
    this.pos = new Float32Array(verts * 3);
    this.nrm = new Float32Array(verts * 3);
    this.uv = new Float32Array(verts * 2);
    const idx: number[] = [];
    for (let i = 0; i < SEGS; i++) {
      for (let j = 0; j < RADIAL; j++) {
        const a = i * (RADIAL + 1) + j;
        const b = a + RADIAL + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    for (let i = 0; i <= SEGS; i++) this.centre.push(new THREE.Vector3());
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.5, metalness: 0 });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.name = 'bungee-cord';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
  }

  /** Twang the cord (after a bottom). */
  twang(amount: number): void {
    this.wobble = Math.max(this.wobble, amount);
    this.wobbleT = 0;
  }

  /**
   * Lay the cord from `a` (top) to `b` (bottom). `rest` is its unstretched length (it sags when the
   * ends are closer than that); `stripes` is the stripe count along the whole cord.
   */
  update(a: THREE.Vector3, b: THREE.Vector3, rest: number, stripes: number, dt: number): void {
    const d = a.distanceTo(b);
    // Parabolic sag for a slack cord: arc length L ≈ d + 8s²/(3d).
    const slack = Math.max(0, rest - d);
    const sag = slack > 0 ? Math.min(rest * 0.5, Math.sqrt((3 * Math.max(d, 0.3) * slack) / 8) * 1.6) : 0;
    this.wobbleT += dt;
    this.wobble *= Math.exp(-2.2 * dt);
    const wob = this.wobble * Math.sin(this.wobbleT * 19);
    // Sideways direction for the wobble: horizontal, perpendicular to the chord.
    this.side.set(b.z - a.z, 0, a.x - b.x);
    if (this.side.lengthSq() < 1e-6) this.side.set(1, 0, 0);
    this.side.normalize();
    for (let i = 0; i <= SEGS; i++) {
      const u = i / SEGS;
      const c = this.centre[i];
      c.lerpVectors(a, b, u);
      const bow = 4 * u * (1 - u);
      c.y -= sag * bow;
      if (wob !== 0) c.addScaledVector(this.side, wob * Math.sin(Math.PI * u) * (slack > 0 ? 0 : 1));
    }
    // Thinner when stretched (keeps the volume).
    const r = this.radius * Math.sqrt(Math.max(0.25, Math.min(1.2, rest / Math.max(0.1, d))));
    let p = 0;
    let q = 0;
    for (let i = 0; i <= SEGS; i++) {
      const c = this.centre[i];
      const prev = this.centre[Math.max(0, i - 1)];
      const next = this.centre[Math.min(SEGS, i + 1)];
      this.t.subVectors(next, prev);
      if (this.t.lengthSq() < 1e-10) this.t.set(0, -1, 0);
      this.t.normalize();
      // Reference axis: world Z unless the tangent is nearly along it.
      this.n.set(0, 0, 1);
      if (Math.abs(this.t.z) > 0.9) this.n.set(1, 0, 0);
      this.b.crossVectors(this.t, this.n).normalize();
      this.n.crossVectors(this.b, this.t).normalize();
      for (let j = 0; j <= RADIAL; j++) {
        const ang = (j / RADIAL) * Math.PI * 2;
        const cs = Math.cos(ang);
        const sn = Math.sin(ang);
        const nx = this.n.x * cs + this.b.x * sn;
        const ny = this.n.y * cs + this.b.y * sn;
        const nz = this.n.z * cs + this.b.z * sn;
        this.pos[p] = c.x + nx * r;
        this.pos[p + 1] = c.y + ny * r;
        this.pos[p + 2] = c.z + nz * r;
        this.nrm[p] = nx;
        this.nrm[p + 1] = ny;
        this.nrm[p + 2] = nz;
        p += 3;
        this.uv[q] = j / RADIAL;
        this.uv[q + 1] = (i / SEGS) * stripes;
        q += 2;
      }
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.normal as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.uv as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}
