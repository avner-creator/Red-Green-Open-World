/**
 * Trails: both-eye effects behind the player while moving (on foot, or behind the buggy/horse).
 *  - sparkle: small twinkling four-point stars (camera-facing quads, soft glow + cross flare);
 *  - bubbles: translucent soap bubbles (bright rim, clear centre, specular dots) that wobble, drift and pop;
 *  - rainbow: one smooth ribbon along the last ~1.5 s of the path with colour lanes running along it,
 *    plus a few sparkles shed from it.
 * At most 60 pooled particles (one instanced draw each) and one ribbon; no shadows, no depth writes,
 * unlit. Trails only ever follow the player: they never mark where a gem is.
 */
import * as THREE from 'three';
import type { GameContext } from '../../types';
import { trailKind } from './catalog';
import type { TrailKind } from './catalog';
import { MAX_TRAIL_PARTICLES, RAINBOW_LANES, RIBBON, RibbonHistory, TRAIL_SPECS, TRAIL_TINTS, TrailEmitter, ribbonFade } from './trailLogic';

interface Puff {
  alive: boolean;
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  size: number;
  seed: number;
}

export interface Trails {
  update(dt: number): void;
  active(): TrailKind | null;
  /** Textured particles alive right now (the rainbow ribbon is not counted). */
  particleCount(): number;
  /** Path samples in the rainbow ribbon right now. */
  ribbonSamples(): number;
  dispose(): void;
}

function canvasTexture(draw: (g: CanvasRenderingContext2D, s: number) => void, s = 96): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  if (g) draw(g, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft warm glow, a bright core and a four-point cross flare. */
export function sparkleTexture(): THREE.CanvasTexture {
  return canvasTexture((g, s) => {
    const m = s / 2;
    const glow = g.createRadialGradient(m, m, 0, m, m, m);
    glow.addColorStop(0, 'rgba(255,215,90,1)');
    glow.addColorStop(0.3, 'rgba(255,170,40,0.55)');
    glow.addColorStop(1, 'rgba(255,170,40,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, s, s);
    // A dark amber shadow under the cross so it still shows on bright ground in a single channel.
    g.fillStyle = 'rgba(120,60,0,0.5)';
    for (const rot of [0, Math.PI / 2]) {
      g.save();
      g.translate(m, m);
      g.rotate(rot);
      g.beginPath();
      g.moveTo(-m * 0.98, 0);
      g.quadraticCurveTo(0, -s * 0.085, m * 0.98, 0);
      g.quadraticCurveTo(0, s * 0.085, -m * 0.98, 0);
      g.fill();
      g.restore();
    }
    for (const rot of [0, Math.PI / 2]) {
      g.save();
      g.translate(m, m);
      g.rotate(rot);
      const arm = g.createLinearGradient(-m, 0, m, 0);
      arm.addColorStop(0, 'rgba(255,255,255,0)');
      arm.addColorStop(0.5, 'rgba(255,255,255,1)');
      arm.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = arm;
      g.beginPath();
      g.moveTo(-m * 0.98, 0);
      g.quadraticCurveTo(0, -s * 0.05, m * 0.98, 0);
      g.quadraticCurveTo(0, s * 0.05, -m * 0.98, 0);
      g.fill();
      g.restore();
    }
    const core = g.createRadialGradient(m, m, 0, m, m, s * 0.16);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = core;
    g.fillRect(0, 0, s, s);
  });
}

/** Bright rim over a dark-blue edge line, clear centre, crisp specular dot and a small second glint. */
export function bubbleTexture(): THREE.CanvasTexture {
  return canvasTexture((g, s) => {
    const m = s / 2;
    const r = m * 0.92;
    const body = g.createRadialGradient(m, m, r * 0.55, m, m, r);
    body.addColorStop(0, 'rgba(190,235,255,0.04)');
    body.addColorStop(0.8, 'rgba(200,240,255,0.22)');
    body.addColorStop(1, 'rgba(255,255,255,0.8)');
    g.fillStyle = body;
    g.beginPath();
    g.arc(m, m, r, 0, Math.PI * 2);
    g.fill();
    // Dark outline just outside the bright rim, so the bubble reads on bright paving in one channel.
    g.strokeStyle = 'rgba(30,70,150,0.55)';
    g.lineWidth = s * 0.03;
    g.beginPath();
    g.arc(m, m, r, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = s * 0.035;
    g.beginPath();
    g.arc(m, m, r - s * 0.03, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    g.ellipse(m - r * 0.38, m - r * 0.4, r * 0.15, r * 0.1, -0.7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.arc(m + r * 0.42, m + r * 0.38, r * 0.06, 0, Math.PI * 2);
    g.fill();
  });
}

/** Material whose per-instance alpha comes from an `instanceAlpha` attribute (soft fade, no popping). */
function particleMaterial(map: THREE.Texture, additive: boolean): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float instanceAlpha;\nvarying float vInstA;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstA = instanceAlpha;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vInstA;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vInstA;');
  };
  return mat;
}

interface Pool {
  mesh: THREE.InstancedMesh;
  alpha: THREE.InstancedBufferAttribute;
  puffs: Puff[];
  next: number;
  emitted: number;
}

export function createTrails(ctx: GameContext): Trails {
  const quad = new THREE.PlaneGeometry(1, 1);
  const textures = { sparkle: sparkleTexture(), bubbles: bubbleTexture() };
  const mats = { sparkle: particleMaterial(textures.sparkle, false), bubbles: particleMaterial(textures.bubbles, false) };
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);

  const makePool = (mat: THREE.Material, tints: readonly number[], order: number): Pool => {
    const geo = quad.clone();
    const alpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRAIL_PARTICLES), 1);
    alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('instanceAlpha', alpha);
    const mesh = new THREE.InstancedMesh(geo, mat, MAX_TRAIL_PARTICLES);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = order;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const puffs: Puff[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < MAX_TRAIL_PARTICLES; i++) {
      puffs.push({ alive: false, age: 0, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, size: 0.1, seed: 0 });
      mesh.setMatrixAt(i, zero);
      mesh.setColorAt(i, c.setHex(tints[i % tints.length]));
    }
    mesh.visible = false;
    ctx.scene.add(mesh);
    return { mesh, alpha, puffs, next: 0, emitted: 0 };
  };
  const pools = {
    sparkle: makePool(mats.sparkle, TRAIL_TINTS.sparkle, 6),
    bubbles: makePool(mats.bubbles, TRAIL_TINTS.bubbles, 5),
  };

  // ───────────── rainbow ribbon ─────────────
  const L = RAINBOW_LANES.length;
  const maxS = RIBBON.maxSamples + 1;
  const vCount = maxS * L * 2;
  const ribGeo = new THREE.BufferGeometry();
  const ribPos = new Float32Array(vCount * 3);
  const ribCol = new Float32Array(vCount * 4);
  const idx: number[] = [];
  for (let i = 0; i < maxS - 1; i++) {
    for (let l = 0; l < L; l++) {
      const a = (i * L + l) * 2;
      const c = ((i + 1) * L + l) * 2;
      idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  ribGeo.setIndex(idx);
  ribGeo.setAttribute('position', new THREE.BufferAttribute(ribPos, 3).setUsage(THREE.DynamicDrawUsage));
  ribGeo.setAttribute('color', new THREE.BufferAttribute(ribCol, 4).setUsage(THREE.DynamicDrawUsage));
  const ribMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const ribbon = new THREE.Mesh(ribGeo, ribMat);
  ribbon.frustumCulled = false;
  ribbon.castShadow = false;
  ribbon.receiveShadow = false;
  ribbon.renderOrder = 4;
  ribbon.visible = false;
  ctx.scene.add(ribbon);
  const laneColors = RAINBOW_LANES.map((h) => new THREE.Color(h));
  const history = new RibbonHistory();
  let ribbonCount = 0;

  function buildRibbon(head: THREE.Vector3, time: number): void {
    const pts = history.samples.map((s) => ({ x: s.x, y: s.y, z: s.z, age: s.age }));
    pts.push({ x: head.x, y: head.y, z: head.z, age: 0 });
    const n = Math.min(pts.length, maxS);
    ribbonCount = n;
    if (n < 2) {
      ribGeo.setDrawRange(0, 0);
      return;
    }
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const sx = -dz;
      const sz = dx;
      const p = pts[i];
      const fade = ribbonFade(p.age);
      const half = (RIBBON.width / 2) * (0.15 + 0.85 * fade);
      const y = p.y + RIBBON.lift + Math.sin(time * 4 + i * 0.8) * 0.045 * (0.3 + fade);
      const cx = p.x + sx * Math.sin(time * 3 + i * 0.6) * 0.06 * fade;
      const cz = p.z + sz * Math.sin(time * 3 + i * 0.6) * 0.06 * fade;
      const alpha = Math.min(1, fade * 1.6) * 0.95;
      for (let l = 0; l < L; l++) {
        const off0 = -half + (l / L) * half * 2;
        const off1 = -half + ((l + 1) / L) * half * 2;
        const v = (i * L + l) * 2;
        ribPos.set([cx + sx * off0, y, cz + sz * off0, cx + sx * off1, y, cz + sz * off1], v * 3);
        const c = laneColors[l];
        ribCol.set([c.r, c.g, c.b, alpha, c.r, c.g, c.b, alpha], v * 4);
      }
    }
    ribGeo.setDrawRange(0, (n - 1) * L * 6);
    (ribGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (ribGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  // ───────────── particles ─────────────
  const emitter = new TrailEmitter();
  const dummy = new THREE.Object3D();
  const last = new THREE.Vector3();
  const head = new THREE.Vector3();
  let haveLast = false;
  let current: TrailKind | null = null;
  let alive = 0;
  let time = 0;

  const poolFor = (kind: TrailKind): Pool => (kind === 'bubbles' ? pools.bubbles : pools.sparkle);

  const clearPool = (p: Pool): void => {
    for (let i = 0; i < p.puffs.length; i++) {
      p.puffs[i].alive = false;
      p.mesh.setMatrixAt(i, zero);
      p.alpha.setX(i, 0);
    }
    p.mesh.instanceMatrix.needsUpdate = true;
    p.alpha.needsUpdate = true;
  };

  const setKind = (kind: TrailKind | null): void => {
    if (kind === current) return;
    current = kind;
    clearPool(pools.sparkle);
    clearPool(pools.bubbles);
    history.clear();
    emitter.reset();
    haveLast = false;
    alive = 0;
    ribbonCount = 0;
    ribGeo.setDrawRange(0, 0);
  };

  function emit(kind: TrailKind, x: number, y: number, z: number): void {
    const spec = TRAIL_SPECS[kind];
    const pool = poolFor(kind);
    const i = pool.next;
    pool.next = (pool.next + 1) % MAX_TRAIL_PARTICLES;
    const p = pool.puffs[i];
    const r = Math.random;
    p.alive = true;
    p.age = 0;
    p.life = spec.life * (0.8 + r() * 0.5);
    const spread = kind === 'bubbles' ? 0.3 : 0.22;
    p.x = x + (r() - 0.5) * spread * 2;
    p.y = y + 0.1 + r() * (kind === 'bubbles' ? 0.9 : 0.7);
    p.z = z + (r() - 0.5) * spread * 2;
    p.vx = (r() - 0.5) * (kind === 'bubbles' ? 0.6 : 0.2);
    p.vz = (r() - 0.5) * (kind === 'bubbles' ? 0.6 : 0.2);
    p.vy = spec.rise * (0.6 + r() * 0.8);
    p.spin = (r() - 0.5) * 5;
    p.size = spec.size[0] + (spec.size[1] - spec.size[0]) * r();
    p.seed = r() * 6.28;
    pool.emitted++;
  }

  function stepPool(pool: Pool, kind: 'sparkle' | 'bubbles', dt: number, cam: THREE.Quaternion): number {
    let n = 0;
    let any = false;
    for (let i = 0; i < pool.puffs.length; i++) {
      const p = pool.puffs[i];
      if (!p.alive) continue;
      p.age += dt;
      any = true;
      if (p.age >= p.life) {
        p.alive = false;
        pool.mesh.setMatrixAt(i, zero);
        pool.alpha.setX(i, 0);
        continue;
      }
      n++;
      const k = p.age / p.life;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      let scale: number;
      let a: number;
      let roll = p.spin * p.age + p.seed;
      if (kind === 'sparkle') {
        const grow = Math.min(1, k / 0.22);
        const twinkle = 0.72 + 0.28 * Math.sin(time * 16 + p.seed * 5);
        scale = p.size * (grow * grow * (3 - 2 * grow)) * twinkle * (k > 0.6 ? 1 - (k - 0.6) / 0.4 * 0.5 : 1);
        a = Math.min(1, k / 0.12) * (k > 0.5 ? 1 - (k - 0.5) / 0.5 : 1);
      } else {
        const pop = k > 0.9 ? (k - 0.9) / 0.1 : 0;
        const wob = 1 + 0.07 * Math.sin(time * 7 + p.seed);
        scale = p.size * Math.min(1, k / 0.12) * wob * (1 + 0.4 * pop);
        a = Math.min(1, k / 0.1) * (1 - pop);
        roll = 0;
        p.x += Math.sin(time * 2.2 + p.seed) * 0.12 * dt;
      }
      dummy.position.set(p.x, p.y, p.z);
      dummy.quaternion.copy(cam);
      dummy.rotateZ(roll);
      dummy.scale.setScalar(Math.max(0.0001, scale));
      dummy.updateMatrix();
      pool.mesh.setMatrixAt(i, dummy.matrix);
      pool.alpha.setX(i, a);
    }
    if (any) {
      pool.mesh.instanceMatrix.needsUpdate = true;
      pool.alpha.needsUpdate = true;
    }
    return n;
  }

  function update(dt: number): void {
    time += dt;
    const playing = ctx.session.state.phase === 'playing';
    const kind = trailKind(ctx.profile.equipped('trail'));
    setKind(kind);
    pools.sparkle.mesh.visible = kind === 'sparkle' || kind === 'rainbow';
    pools.bubbles.mesh.visible = kind === 'bubbles';
    ribbon.visible = kind === 'rainbow';
    if (!kind) return;
    const spec = TRAIL_SPECS[kind];

    const veh = ctx.player.vehicle;
    const mode = ctx.player.mode;
    const source = veh ? veh.position : ctx.player.position;
    const moving = veh ? veh.speed > 1.5 : Math.hypot(ctx.player.velocity.x, ctx.player.velocity.z) > 1.2;
    const onTheMove =
      playing && ctx.player.object.visible !== false && (mode === 'walk' || mode === 'driving' || mode === 'riding') && (veh ? true : ctx.player.grounded);
    if (onTheMove && moving) {
      if (!haveLast) last.copy(source);
      const dist = Math.hypot(source.x - last.x, source.z - last.z);
      const n = emitter.advance(dist, spec.spacing);
      for (let k = 0; k < n; k++) {
        if (veh) {
          const yaw = Math.atan2(source.x - last.x, source.z - last.z);
          emit(kind, source.x - Math.sin(yaw) * 1.8, source.y, source.z - Math.cos(yaw) * 1.8);
        } else {
          emit(kind, source.x, source.y, source.z);
        }
      }
      if (kind === 'rainbow') {
        if (veh) {
          const yaw = Math.atan2(source.x - last.x, source.z - last.z);
          head.set(source.x - Math.sin(yaw) * 1.8, source.y, source.z - Math.cos(yaw) * 1.8);
        } else head.copy(source);
        history.push(dt, head);
      }
      last.copy(source);
      haveLast = true;
    } else {
      haveLast = false;
      history.tick(dt);
    }

    if (kind === 'rainbow') {
      const h = history.samples[history.samples.length - 1];
      if (!(onTheMove && moving) && h) head.set(h.x, h.y, h.z);
      if (history.samples.length < 2) {
        ribbonCount = history.samples.length;
        ribGeo.setDrawRange(0, 0);
      } else buildRibbon(head, time);
    }

    const cam = ctx.camera.quaternion;
    alive = stepPool(pools.sparkle, 'sparkle', dt, cam) + stepPool(pools.bubbles, 'bubbles', dt, cam);
  }

  return {
    update,
    active: () => current,
    particleCount: () => alive,
    ribbonSamples: () => ribbonCount,
    dispose() {
      ctx.scene.remove(pools.sparkle.mesh, pools.bubbles.mesh, ribbon);
      for (const p of Object.values(pools)) {
        p.mesh.dispose();
        p.mesh.geometry.dispose();
      }
      ribGeo.dispose();
      ribMat.dispose();
      quad.dispose();
      for (const m of Object.values(mats)) m.dispose();
      for (const t of Object.values(textures)) t.dispose();
    },
  };
}
