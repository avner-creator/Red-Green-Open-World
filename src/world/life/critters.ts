/**
 * Ambient critters: seagulls round the lighthouse and coast, little ground birds that scatter and
 * resettle, butterflies over flower patches, sheep and chickens that hop out of anyone's way, ducks
 * on the bay, jumping fish with splash rings, fireflies at sunset, and soft contact shadows.
 * One instanced draw per species (only while some of it is near), all animation in the vertex shader.
 */
import * as THREE from 'three';
import type { Quality } from '../../types';
import { Rng, noise2 } from '../rng';
import { SEED } from '../layout';
import { U } from '../materials';
import { birdGeo, butterflyGeo, chickenGeo, critterMaterial, duckGeo, fishGeo, sheepGeo, softMaterial } from './geo';
import { Pool } from './pool';
import {
  BUTTERFLY_AREAS, CHICKENS, COOPS, DUCKS, FIREFLY_ZONES, FISH, FLOCKS, GULLS, PENS, SHEEP,
} from './places';
import {
  TAU, fishArc, makeWaddler, stepFlock, stepWaddler, type Flock, type Threat, type Waddler, type WaddlerParams,
} from './math';

export interface LifeView {
  cam: THREE.Vector3;
  /** Player feet and velocity (null before the player exists). */
  player: { x: number; y: number; z: number; vx: number; vz: number; inVehicle: boolean } | null;
  /** Player on foot plus every vehicle, for dodging. */
  threats: Threat[];
  /** Extra contact shadows to draw this frame: [x, groundY, z, size]. */
  blobs: readonly (readonly [number, number, number, number])[];
}

export interface CritterDeps {
  heightAt(x: number, z: number): number;
  isLand(x: number, z: number): boolean;
  waterLevel: number;
  /** Comic squeak (sheep/chicken hop) at a world position. */
  squeak(kind: 'sheep' | 'chicken', x: number, z: number): void;
}

const SHEEP_P: WaddlerParams = { radius: 0.55, walk: 0.45, flee: 1.6, hopLen: 3, hopTime: 0.5, hopHeight: 0.7, roam: 3.5 };
const CHICK_P: WaddlerParams = { radius: 0.3, walk: 0.6, flee: 2.2, hopLen: 2.6, hopTime: 0.42, hopHeight: 0.8, roam: 2.5 };

/** Draw distances (m from the camera). */
const FAR = { gull: 280, bird: 90, butterfly: 55, farm: 140, water: 160, blob: 60 } as const;

interface Gull {
  cx: number;
  cz: number;
  r: number;
  h: number;
  a: number;
  w: number;
  ph: number;
  scale: number;
}

interface Butterfly {
  x: number;
  y: number;
  z: number;
  r: number;
  ph: number;
  sp: number;
  color: THREE.Color;
}

interface Fish {
  wait: number;
  k: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  color: THREE.Color;
}

interface Ring {
  x: number;
  z: number;
  t: number;
}

export interface Critters {
  group: THREE.Group;
  update(dt: number, view: LifeView): void;
  setQuality(q: Quality): void;
  setTimeOfDay(t: number): void;
  /** Test/debug state. */
  debug(): { flocks: { state: string; scatters: number; x: number; z: number; y: number }[]; hops: number; counts: Record<string, number> };
}

export function createCritters(deps: CritterDeps): Critters {
  const rng = new Rng(SEED + 707);
  const rnd = (): number => rng.next();
  const group = new THREE.Group();
  group.name = 'life-critters';
  const mat = critterMaterial();

  const birds = new Pool('birds', birdGeo(), mat, 48, { anim: true, color: true });
  const butterflies = new Pool('butterflies', butterflyGeo(), mat, 40, { anim: true, color: true });
  const sheepPool = new Pool('sheep', sheepGeo(), mat, SHEEP.length, { anim: true, color: true });
  const chickPool = new Pool('chickens', chickenGeo(), mat, CHICKENS.length, { anim: true, color: true });
  const duckPool = new Pool('ducks', duckGeo(), mat, DUCKS.n, { anim: true, color: true });
  const fishPool = new Pool('fish', fishGeo(), mat, FISH.n, { anim: true, color: true });
  const ringGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const rings = new Pool('splash', ringGeo, softMaterial('ring'), 12, { fade: true });
  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blobs = new Pool('blobs', blobGeo, softMaterial('blob'), 24, { fade: true });
  for (const p of [birds, butterflies, sheepPool, chickPool, duckPool, fishPool, rings, blobs]) group.add(p.mesh);
  rings.mesh.renderOrder = 2;
  blobs.mesh.renderOrder = 1;

  // ── Seagulls ──
  const gulls: Gull[] = [];
  for (const g of GULLS) {
    for (let i = 0; i < g.n; i++) {
      gulls.push({
        cx: g.x + rng.range(-4, 4), cz: g.z + rng.range(-4, 4), r: rng.range(g.r0, g.r1), h: rng.range(g.h0, g.h1),
        a: rng.range(0, TAU), w: rng.range(0.25, 0.4) * (rng.chance(0.5) ? 1 : -1), ph: rng.range(0, TAU), scale: rng.range(2.0, 2.4),
      });
    }
  }
  const gullColor = new THREE.Color(0xf4f4f0);

  // ── Ground birds ──
  const flocks: Flock[] = FLOCKS.map((f) => {
    const spots = f.spots.filter((s, i) => i === 0 || deps.isLand(s[0], s[1]));
    const [sx, sz] = spots[0];
    return {
      state: 'ground', t: 0, spots, spot: 0, gx: sx, gy: 0, gz: sz, scatters: 0,
      birds: Array.from({ length: f.birds }, () => {
        const a = rng.range(0, TAU);
        const r = rng.range(0.3, 2.2);
        const ox = Math.cos(a) * r;
        const oz = Math.sin(a) * r;
        return { x: sx + ox, y: deps.heightAt(sx + ox, sz + oz), z: sz + oz, vx: 0, vy: 0, vz: 0, ox, oz };
      }),
    };
  });
  const flockColors = FLOCKS.map((f) => new THREE.Color(f.color));
  const birdYaw = flocks.map((f) => f.birds.map(() => rng.range(0, TAU)));
  const birdPh = flocks.map((f) => f.birds.map(() => rng.range(0, TAU)));

  // ── Butterflies over flower patches (same noise as the flower scatter) ──
  const bflies: Butterfly[] = [];
  const wingCols = [0xffe14a, 0xffffff, 0xff9a3c, 0x9ad8ff, 0xfff6a0].map((c) => new THREE.Color(c));
  for (const [ax, az, ar] of BUTTERFLY_AREAS) {
    const patches: [number, number, number][] = [];
    if (ar === 0) {
      patches.push([ax, az, deps.heightAt(ax + 5.6, az)]);
    } else {
      const cands: [number, number, number][] = [];
      for (let x = ax - ar; x <= ax + ar; x += 3) {
        for (let z = az - ar; z <= az + ar; z += 3) {
          const n = noise2(x / 9, z / 9, SEED + 43);
          const y = deps.heightAt(x, z);
          if (n > 0.5 && y > 1.7 && deps.isLand(x, z)) cands.push([x, z, n]);
        }
      }
      cands.sort((a, b) => b[2] - a[2]);
      for (const c of cands) {
        if (patches.length >= 2) break;
        if (patches.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) > 12)) patches.push([c[0], c[1], deps.heightAt(c[0], c[1])]);
      }
    }
    for (const [px, pz, py] of patches) {
      const n = ar === 0 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        bflies.push({ x: px, y: py, z: pz, r: ar === 0 ? 5.8 : rng.range(1.2, 2.6), ph: rng.range(0, TAU), sp: rng.range(0.35, 0.6), color: rng.pick(wingCols) });
      }
    }
  }

  // ── Farm ──
  const inPen = (x: number, z: number, m: number): boolean => PENS.some((p) => Math.abs(x - p.x) < p.hx + m && Math.abs(z - p.z) < p.hz + m);
  const sheep: Waddler[] = SHEEP.map(([x, z]) => makeWaddler(x, z));
  const chickens: Waddler[] = CHICKENS.map(([x, z]) => makeWaddler(x, z));
  const okSheep = (x: number, z: number): boolean => deps.isLand(x, z) && inPen(x, z, 3);
  const okChick = (x: number, z: number): boolean => deps.isLand(x, z) && COOPS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 6);
  for (const w of [...sheep, ...chickens]) w.yaw = rng.range(0, TAU);
  const sheepCols = SHEEP.map((_, i) => new THREE.Color(i === 2 ? 0x8a8078 : 0xffffff));
  const chickCols = CHICKENS.map((_, i) => new THREE.Color(i === 1 ? 0xd9b48a : 0xffffff));
  const farmPh = [...SHEEP, ...CHICKENS].map(() => rng.range(0, TAU));
  let hops = 0;

  // ── Ducks and fish ──
  let duckS = 0;
  const duckCols = [new THREE.Color(0xffffff), ...Array.from({ length: DUCKS.n - 1 }, () => new THREE.Color(0xffe25a))];
  const fishes: Fish[] = Array.from({ length: FISH.n }, (_, i) => ({ wait: 1.5 + i * 2.3, k: -1, x0: 0, z0: 0, x1: 0, z1: 0, color: new THREE.Color(i % 2 ? 0xff9a50 : 0xc8dcf0) }));
  const ringsList: Ring[] = [];
  const startJump = (f: Fish): void => {
    for (let tries = 0; tries < 8; tries++) {
      const a = rng.range(0, TAU);
      const r = FISH.r * Math.sqrt(rng.next());
      const x = FISH.x + Math.cos(a) * r;
      const z = FISH.z + Math.sin(a) * r;
      if (Math.hypot(x - FISH.avoidX, z - FISH.avoidZ) < FISH.avoidR) continue;
      if (deps.heightAt(x, z) > deps.waterLevel - 1) continue;
      const d = rng.range(0, TAU);
      f.x0 = x;
      f.z0 = z;
      f.x1 = x + Math.sin(d) * 2.2;
      f.z1 = z + Math.cos(d) * 2.2;
      f.k = 0;
      ringsList.push({ x, z, t: 0 });
      return;
    }
    f.wait = 1;
  };

  // ── Fireflies ──
  let fireflyCount = 0;
  const ffPerZone = 36;
  const ffPos = new Float32Array(FIREFLY_ZONES.length * ffPerZone * 3);
  const ffSeed = new Float32Array(FIREFLY_ZONES.length * ffPerZone);
  for (const [zx, zz, zr] of FIREFLY_ZONES) {
    for (let i = 0; i < ffPerZone; i++) {
      const a = rng.range(0, TAU);
      const r = zr * Math.sqrt(rng.next());
      const x = zx + Math.cos(a) * r;
      const z = zz + Math.sin(a) * r;
      if (!deps.isLand(x, z)) continue;
      ffPos.set([x, deps.heightAt(x, z) + rng.range(0.4, 2.4), z], fireflyCount * 3);
      ffSeed[fireflyCount] = rng.range(0, 100);
      fireflyCount++;
    }
  }
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos.slice(0, fireflyCount * 3), 3));
  ffGeo.setAttribute('aSeed', new THREE.BufferAttribute(ffSeed.slice(0, fireflyCount), 1));
  const uDusk = { value: 0 };
  const ffMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uDusk, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uDusk; uniform float uScale;
      attribute float aSeed; varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime * 0.6 + aSeed;
        p += vec3(sin(t * 1.3) * 0.9, sin(t * 0.9 + aSeed) * 0.35, cos(t * 1.1) * 0.9);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float blink = smoothstep(0.2, 0.9, sin(uTime * (1.4 + fract(aSeed) * 1.2) + aSeed * 7.0) * 0.5 + 0.5);
        vA = uDusk * (0.25 + 0.75 * blink) * (1.0 - smoothstep(45.0, 70.0, -mv.z));
        gl_PointSize = clamp(uScale * 130.0 / max(-mv.z, 0.5), 2.5, 14.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        vec2 d = gl_PointCoord * 2.0 - 1.0;
        float r = dot(d, d);
        float a = (1.0 - smoothstep(0.0, 1.0, r)) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(1.0, 0.96, 0.55) * (1.5 + 3.0 * (1.0 - r)) * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const fireflies = new THREE.Points(ffGeo, ffMat);
  fireflies.name = 'life-fireflies';
  fireflies.frustumCulled = false;
  fireflies.visible = false;
  group.add(fireflies);

  // ── Per-frame helpers ──
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const p3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const put = (x: number, y: number, z: number, yaw: number, pitch: number, roll: number, s: number): THREE.Matrix4 => {
    e.set(pitch, yaw, roll);
    return m4.compose(p3.set(x, y, z), q.setFromEuler(e), s3.set(s, s, s));
  };
  const blob = (x: number, z: number, y: number, size: number, fade: number): void => {
    m4.makeScale(size, 1, size).setPosition(x, y + 0.04, z);
    blobs.push(m4, undefined, fade);
  };

  let time = 0;
  let quality: Quality = 'medium';
  const dist2 = (cam: THREE.Vector3, x: number, z: number): number => (cam.x - x) ** 2 + (cam.z - z) ** 2;

  const api: Critters = {
    group,
    setQuality(qq) {
      quality = qq;
      ffMat.uniforms.uScale.value = qq === 'low' ? 0.8 : 1;
    },
    setTimeOfDay(t) {
      uDusk.value = THREE.MathUtils.smoothstep(t, 0.55, 0.85);
      fireflies.visible = uDusk.value > 0.01;
    },
    update(dt, view) {
      time += dt;
      const cam = view.cam;
      const low = quality === 'low';
      const pl = view.player;
      for (const p of [birds, butterflies, sheepPool, chickPool, duckPool, fishPool, rings, blobs]) p.begin();

      // Seagulls: wide lazy circles, gliding most of the time with bursts of flapping.
      const gullN = low ? Math.ceil(gulls.length * 0.6) : gulls.length;
      for (let i = 0; i < gullN; i++) {
        const g = gulls[i];
        g.a += (g.w * dt * 9) / g.r;
        const r = g.r * (1 + 0.15 * Math.sin(time * 0.17 + g.ph));
        const x = g.cx + Math.cos(g.a) * r;
        const z = g.cz + Math.sin(g.a) * r;
        if (dist2(cam, x, z) > FAR.gull ** 2) continue;
        const y = Math.max(deps.heightAt(g.cx, g.cz), deps.waterLevel) + g.h + Math.sin(time * 0.5 + g.ph) * 1.5;
        const yaw = Math.atan2(-Math.sin(g.a) * Math.sign(g.w), Math.cos(g.a) * Math.sign(g.w));
        const flap = Math.max(0, Math.sin(time * 0.45 + g.ph * 3));
        birds.push(put(x, y, z, yaw, 0, -0.4 * Math.sign(g.w), g.scale), gullColor, g.ph, 0.15 + 0.5 * flap, 7, 0);
      }

      // Ground birds.
      const threat = pl ? { x: pl.x, z: pl.z, vehicle: pl.inVehicle } : null;
      const flockN = low ? 2 : flocks.length;
      for (let fi = 0; fi < flocks.length; fi++) {
        const f = flocks[fi];
        const [hx, hz] = f.spots[f.spot];
        const nearCam = dist2(cam, hx, hz) < FAR.bird ** 2;
        // Far flocks don't simulate (unless airborne, so they always come back down).
        if (!nearCam && f.state === 'ground') continue;
        stepFlock(f, threat && Math.abs(pl!.y - deps.heightAt(hx, hz)) < 4 ? threat : null, dt, deps.heightAt, rnd);
        if (!nearCam || fi >= flockN) continue;
        for (let i = 0; i < f.birds.length; i++) {
          const b = f.birds[i];
          const ph = birdPh[fi][i];
          if (f.state === 'ground') {
            const hop = Math.max(0, Math.sin(time * 5 + ph * 4)) ** 8 * 0.06;
            birdYaw[fi][i] += Math.sin(time * 0.7 + ph) * dt * 0.8;
            birds.push(put(b.x, b.y + hop, b.z, birdYaw[fi][i], Math.sin(time * 3 + ph) > 0.6 ? 0.5 : 0, 0, 1), flockColors[fi], ph, 0, 1, 1);
          } else {
            const sp = Math.hypot(b.vx, b.vz);
            const yaw = sp > 0.1 ? Math.atan2(b.vx, b.vz) : birdYaw[fi][i];
            birdYaw[fi][i] = yaw;
            birds.push(put(b.x, b.y + 0.08, b.z, yaw, -Math.atan2(b.vy, Math.max(sp, 0.5)) * 0.6, 0, 1), flockColors[fi], ph, 1.0, 17, 0);
          }
        }
      }

      // Butterflies.
      const bfN = low ? Math.ceil(bflies.length / 2) : bflies.length;
      for (let i = 0; i < bfN; i++) {
        const b = bflies[i];
        if (dist2(cam, b.x, b.z) > FAR.butterfly ** 2) continue;
        const t = time * b.sp + b.ph;
        const x = b.x + Math.cos(t) * b.r + Math.sin(t * 2.3) * 0.5;
        const z = b.z + Math.sin(t) * b.r + Math.cos(t * 1.7) * 0.5;
        const dx = -Math.sin(t) * b.r + Math.cos(t * 2.3) * 1.15;
        const dz = Math.cos(t) * b.r - Math.sin(t * 1.7) * 0.85;
        const y = b.y + 0.6 + 0.45 * Math.sin(t * 2.9) + 0.15 * Math.sin(time * 9 + b.ph);
        butterflies.push(put(x, y, z, Math.atan2(dx, dz), -0.2, 0, 2.2), b.color, b.ph, 1.1, 16, 0);
      }

      // Farm animals (simulated only near the player or camera).
      const farmNear = PENS.some((p) => dist2(cam, p.x, p.z) < FAR.farm ** 2 || (pl !== null && (pl.x - p.x) ** 2 + (pl.z - p.z) ** 2 < FAR.farm ** 2));
      if (farmNear) {
        const herd = [
          { list: sheep, p: SHEEP_P, ok: okSheep, pool: sheepPool, cols: sheepCols, kind: 'sheep' as const, scale: 1.15, off: 0 },
          { list: chickens, p: CHICK_P, ok: okChick, pool: chickPool, cols: chickCols, kind: 'chicken' as const, scale: 1, off: SHEEP.length },
        ];
        for (const h of herd) {
          for (let i = 0; i < h.list.length; i++) {
            const w = h.list[i];
            if (stepWaddler(w, h.p, view.threats, dt, rnd, h.ok)) {
              hops++;
              deps.squeak(h.kind, w.x, w.z);
            }
            const y = deps.heightAt(w.x, w.z) + w.lift;
            const ph = farmPh[h.off + i];
            const moving = w.speed > 0.05;
            const roll = moving ? Math.sin(time * 9 + ph) * (h.kind === 'chicken' ? 0.18 : 0.06) : 0;
            const pitch = w.hop > 0 ? -0.25 : 0;
            const walkAmp = moving ? Math.min(0.7, 0.25 + w.speed * 0.3) : 0;
            const freq = moving ? 8 + w.speed * 4 : 1.4;
            // Wings flap (chickens) while hopping; heads nod/peck while still.
            const flap = w.hop > 0 ? 1 : 0;
            h.pool.push(put(w.x, y, w.z, w.yaw, pitch, roll, h.scale), h.cols[i], ph, w.hop > 0 ? 1.2 : moving ? walkAmp : 0.6, w.hop > 0 ? 18 : freq, flap ? 0 : 1);
            if (dist2(cam, w.x, w.z) < FAR.blob ** 2) blob(w.x, w.z, deps.heightAt(w.x, w.z), h.kind === 'sheep' ? 1.5 : 0.75, 1 - Math.min(0.7, w.lift));
          }
        }
      }

      // Ducks: mum leads the ducklings round the oval; they paddle faster if the player is close.
      const duckNear = dist2(cam, DUCKS.x, DUCKS.z) < FAR.water ** 2;
      let duckBoost = 1;
      if (pl) {
        const dd = Math.hypot(pl.x - (DUCKS.x + Math.cos(duckS) * DUCKS.rx), pl.z - (DUCKS.z + Math.sin(duckS) * DUCKS.rz));
        if (dd < 5) duckBoost = 2.5;
      }
      duckS += (DUCKS.speed * duckBoost * dt) / ((DUCKS.rx + DUCKS.rz) / 2);
      if (duckNear) {
        for (let i = 0; i < DUCKS.n; i++) {
          const s = duckS - i * (i === 0 ? 0 : 0.12) - (i > 0 ? 0.1 : 0);
          const x = DUCKS.x + Math.cos(s) * DUCKS.rx;
          const z = DUCKS.z + Math.sin(s) * DUCKS.rz;
          const yaw = Math.atan2(-Math.sin(s) * DUCKS.rx, Math.cos(s) * DUCKS.rz);
          const bob = Math.sin(time * 2.2 + i * 1.3) * 0.025;
          duckPool.push(put(x, deps.waterLevel + bob, z, yaw, 0, Math.sin(time * 1.7 + i) * 0.06, i === 0 ? 1.3 : 0.7), duckCols[i], i * 1.7, 0.4, 2.5, 0.85);
        }
      }

      // Fish.
      for (const f of fishes) {
        if (f.k < 0) {
          f.wait -= dt;
          if (f.wait <= 0) startJump(f);
          continue;
        }
        f.k += dt / 1.0;
        if (f.k >= 1) {
          ringsList.push({ x: f.x1, z: f.z1, t: 0 });
          f.k = -1;
          f.wait = rng.range(2.5, 6.5);
          continue;
        }
        const arc = fishArc(f.k, 1.1);
        const x = f.x0 + (f.x1 - f.x0) * f.k;
        const z = f.z0 + (f.z1 - f.z0) * f.k;
        if (duckNear) fishPool.push(put(x, deps.waterLevel + arc.y - 0.1, z, Math.atan2(f.x1 - f.x0, f.z1 - f.z0), arc.pitch, 0, 1.1), f.color, 0, 0, 0, 0);
      }
      for (let i = ringsList.length - 1; i >= 0; i--) {
        const r = ringsList[i];
        r.t += dt;
        if (r.t > 1.3) {
          ringsList.splice(i, 1);
          continue;
        }
        if (!duckNear) continue;
        const s = 0.5 + r.t * 1.8;
        m4.makeScale(s, 1, s).setPosition(r.x, deps.waterLevel + 0.04, r.z);
        rings.push(m4, undefined, 1 - r.t / 1.3);
      }

      for (const [x, y, z, size] of view.blobs) if (dist2(cam, x, z) < FAR.blob ** 2) blob(x, z, y, size, 1);
      for (const p of [birds, butterflies, sheepPool, chickPool, duckPool, fishPool, rings, blobs]) p.end();
    },
    debug() {
      return {
        flocks: flocks.map((f) => {
          let y = 0;
          for (const b of f.birds) y += b.y - deps.heightAt(b.x, b.z);
          return { state: f.state, scatters: f.scatters, x: f.spots[f.spot][0], z: f.spots[f.spot][1], y: y / f.birds.length };
        }),
        hops,
        counts: {
          birds: birds.count, butterflies: butterflies.count, sheep: sheepPool.count, chickens: chickPool.count,
          ducks: duckPool.count, fish: fishPool.count, rings: rings.count, blobs: blobs.count, fireflies: fireflies.visible ? fireflyCount : 0,
        },
      };
    },
  };
  return api;
}
