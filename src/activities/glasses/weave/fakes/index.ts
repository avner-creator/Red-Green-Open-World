/**
 * "The real gem among fakes" (tellApart). Four ordinary ground gem spots carry a little test: when
 * the hero comes near one whose Glow Gem is there, two weak-eye fakes appear beside it, the three
 * on the corners of a triangle (the real gem at a random corner). The fakes have the real gem's
 * geometry, size, shading and halo; ONE thing gives them away, finer with the tier:
 *   tier 1: they stand on their heads (point up) · tier 2: 5 facets instead of 8 · tier 3: no
 *   sparkle (no bright top table, no light/dark facet stripes) and they spin the other way.
 * Only spots whose cluster is in open view from at least 3 of 4 approach directions are used.
 *
 *  - Touching a fake first (along the hero's path) → it poofs on the layer, a miss, round over (the
 *    other fake poofs too). The real gem still pays as always when collected.
 *  - Collecting the real gem while the fakes stand → a hit, +2 gems on top, the fakes poof.
 *  - One round per spot per respawn cycle; the tier rises after two hits in a row, falls after a miss.
 *
 * Everything is on the WeakOnly layer (like the real gems): the strong eye sees nothing at all.
 * Draw calls while a cluster stands and is in the camera's view: 1 (the fakes, their halos and the
 * puffs are one InstancedMesh, culled by the cluster's bounding sphere); 0 otherwise.
 * No hook in other folders: public `ctx.world.gemSpots` and the `gem:collected` / `gem:respawned` events.
 */
import * as THREE from 'three';
import { PLAYER } from '../../../../config';
import { VisionLayer } from '../../../../types';
import type { GlassesTier } from '../../../../types';
import { GEM_FX } from '../../../constants';
import { randInt } from '../../gates/kit';
import { GLASSES } from '../../constants';
import { isReserved } from '../../reserved';
import { FIXED_SITES } from '../../sites';
import type { WeaveEnv, WeavePart } from '../types';
import { eligibleSpots, FAKE_FACETS, FAKES, firstTouch, nextLadder, pickSpots, TELLS, triangle } from './logic';
import type { Ladder, P3, SpotInfo, Tell } from './logic';
import { fakeGemGeometry, fakesMaterial, gemAndHaloGeometry, haloTexture } from './look';

/** The real gem's scale, bob and spin (gems.ts). */
const GEM_SCALE = 1.15;
const BOB = 0.15;
const SPIN = 1.2;
/** Puffs when a cluster appears in view (s). */
const PUFF = 0.5;
/** Instances: two fakes and their halos (far one first: gem, halo, gem, halo), then three puffs. */
const INSTANCES = 7;

interface Cluster {
  k: number;
  answer: number;
  angle: number;
  tier: GlassesTier;
  tell: Tell;
  real: P3;
  /** The two fakes: base position, bob phase, spin offset, poof progress (-1 = standing). */
  fakes: { p: P3; phase: number; off: number; poof: number; delay: number }[];
  /** The real gem was collected (event) and nothing was decided yet. */
  pending: boolean;
  decided: boolean;
  puff: number;
}

export function create(env: WeaveEnv): WeavePart {
  const { ctx } = env;
  let ready = false;
  let spots: SpotInfo[] = [];
  let present: boolean[] = [];
  let spent: boolean[] = [];
  let blocked: boolean[] = [];
  let ladder: Ladder = { tier: 1, streak: 0 };
  let hits = 0;
  let misses = 0;
  let bonus = 0;
  let rounds = 0;
  let lastResult: { tier: GlassesTier; hit: boolean; spot: string } | null = null;
  let armed: Cluster | null = null;
  let time = 0;
  const prev = new THREE.Vector3();
  const cur = new THREE.Vector3();
  let havePrev = false;

  // ───────────── meshes (built once, attached only while a cluster stands) ─────────────
  let geos: Record<Tell, THREE.BufferGeometry> | null = null;
  let mat: THREE.Material | null = null;
  let haloTex: THREE.Texture | null = null;
  /** Per instance: 0 = draw the gem part, 1 = draw the halo part. */
  const kind = new THREE.InstancedBufferAttribute(new Float32Array(INSTANCES), 1);
  kind.setUsage(THREE.DynamicDrawUsage);
  let mesh: THREE.InstancedMesh | null = null;
  const root = new THREE.Group();
  root.name = 'glasses:weave:fakes';
  const dummy = new THREE.Object3D();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const sphere = new THREE.Sphere();

  const idOf = (s: SpotInfo): string => `gem${s.index}`;

  /**
   * From how many of the four compass directions (eye at `viewDist`, child's eye height) the whole
   * cluster is in open view: clear lines to the spot and to both sides of it (± the cluster's reach).
   */
  function openApproaches(s: SpotInfo): number {
    const o = new THREE.Vector3();
    const d = new THREE.Vector3();
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const ax = Math.cos((k * Math.PI) / 2);
      const az = Math.sin((k * Math.PI) / 2);
      const ex = s.x + ax * FAKES.viewDist;
      const ez = s.z + az * FAKES.viewDist;
      o.set(ex, ctx.world.heightAt(ex, ez) + 1.6, ez);
      let clear = true;
      for (const side of [-1, 0, 1]) {
        const tx = s.x - az * side * FAKES.side * 0.6;
        const tz = s.z + ax * side * FAKES.side * 0.6;
        d.set(tx - o.x, s.y - o.y, tz - o.z);
        const len = d.length();
        const hit = ctx.physics.raycast(o, d.normalize(), len);
        if (hit && hit.distance < len - 0.4) clear = false;
      }
      if (clear) n++;
    }
    return n;
  }

  function init(): boolean {
    if (ready) return true;
    const world = ctx.world as typeof ctx.world | undefined;
    if (!world?.gemSpots || !ctx.player || !ctx.camera || !ctx.physics) return false;
    const all: SpotInfo[] = world.gemSpots.map((g, index) => ({
      index,
      x: g.position.x,
      y: g.position.y,
      z: g.position.z,
      tag: g.tag,
      ground: world.heightAt(g.position.x, g.position.z),
    }));
    const circles = [
      ...FIXED_SITES.map((s) => ({ x: s.x, z: s.z, r: GLASSES.siteRadius + (s.playRadius ?? 0) + FAKES.siteMargin })),
      ...Object.values(world.anchors).map((a) => ({ x: a.position.x, z: a.position.z, r: a.radius + FAKES.anchorMargin })),
    ];
    const open = eligibleSpots(all, { circles, reserved: (x, z) => isReserved(x, z, FAKES.reservedPad) }).filter((s) => openApproaches(s) >= FAKES.viewMin);
    spots = pickSpots(open, env.rng);
    present = spots.map(() => true);
    spent = spots.map(() => false);
    blocked = spots.map(() => false);
    const both = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
      const out = gemAndHaloGeometry(g, kind);
      g.dispose();
      return out;
    };
    geos = { flip: both(fakeGemGeometry(undefined, true, true)), facets: both(fakeGemGeometry(FAKE_FACETS)), sparkle: both(fakeGemGeometry(undefined, false)) };
    haloTex = haloTexture();
    mat = fakesMaterial(haloTex);
    mesh = new THREE.InstancedMesh(geos.flip, mat, INSTANCES);
    mesh.name = 'glasses:weave:fakes:gems';
    // Drawn only when the cluster's sphere is in the view (set when armed); after the other
    // transparent layer objects, so its depth-writing halos never hide them.
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), FAKES.side + 2);
    mesh.frustumCulled = true;
    mesh.renderOrder = 1;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(mesh);
    ready = true;
    return true;
  }

  const offs = [
    ctx.events.on('gem:collected', (e) => {
      const k = spots.findIndex((s) => idOf(s) === e.id);
      if (k < 0) return;
      present[k] = false;
      if (armed && armed.k === k && !armed.decided) armed.pending = true;
    }),
    ctx.events.on('gem:respawned', (e) => {
      const k = spots.findIndex((s) => idOf(s) === e.id);
      if (k < 0) return;
      present[k] = true;
      spent[k] = false;
    }),
  ];

  function chest(out: THREE.Vector3): THREE.Vector3 {
    out.copy(ctx.player.position);
    out.y += PLAYER.height / 2;
    return out;
  }

  /** Is the cluster around spot `s` in the camera's view right now? */
  function inView(s: SpotInfo): boolean {
    const cam = ctx.camera;
    cam.updateMatrixWorld();
    projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    sphere.center.set(s.x, s.y, s.z);
    sphere.radius = FAKES.side + 1;
    return frustum.intersectsSphere(sphere);
  }

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  /** Fake corners for this orientation, or null if a corner is blocked (wall, prop, slope, another gem). */
  function corners(s: SpotInfo, answer: number, angle: number): P3[] | null {
    const tri = triangle(s, answer, angle);
    const float = s.y - s.ground;
    const out: P3[] = [];
    for (let i = 0; i < 3; i++) {
      if (i === answer) continue;
      const c = tri[i];
      const g = ctx.world.heightAt(c.x, c.z);
      if (Math.abs(g - s.ground) > 0.8) return null;
      const p = { x: c.x, y: g + float, z: c.z };
      // Clear line from the real gem to the fake (chest and knee height) and nothing standing on the spot.
      for (const h of [0.5, 1.1]) {
        v0.set(s.x, s.ground + h, s.z);
        v1.set(p.x - s.x, g - s.ground, p.z - s.z);
        const len = v1.length();
        const hit = ctx.physics.raycast(v0, v1.normalize(), len + 0.7);
        if (hit) return null;
      }
      v0.set(p.x, p.y + 2.5, p.z);
      const down = ctx.physics.raycast(v0, v1.set(0, -1, 0), 4);
      if (down && down.point.y > g + 0.25) return null;
      // Never on top of another gem.
      if (ctx.world.gemSpots.some((o) => Math.hypot(o.position.x - p.x, o.position.y - p.y, o.position.z - p.z) < 2.6)) return null;
      out.push(p);
    }
    return out;
  }

  function arm(k: number, opts: { answer?: number; angle?: number; puff?: boolean } = {}): boolean {
    const s = spots[k];
    const answer = opts.answer ?? randInt(env.rng, 3);
    const base = opts.angle ?? env.rng() * Math.PI * 2;
    for (let j = 0; j < 12; j++) {
      const angle = base + (j * Math.PI) / 6;
      const fk = corners(s, answer, angle);
      if (!fk || !mesh || !geos) continue;
      const tier = ladder.tier;
      const tell = TELLS[tier];
      mesh.geometry = geos[tell];
      mesh.boundingSphere?.center.set(s.x, s.y, s.z);
      armed = {
        k,
        answer,
        angle,
        tier,
        tell,
        real: { x: s.x, y: s.y, z: s.z },
        fakes: fk.map((p) => ({ p, phase: env.rng() * Math.PI * 2, off: env.rng() * Math.PI * 2, poof: -1, delay: 0 })),
        pending: false,
        decided: false,
        puff: opts.puff ? 0 : -1,
      };
      env.add(root, VisionLayer.WeakOnly);
      draw();
      return true;
    }
    blocked[k] = true;
    return false;
  }

  function disarm(): void {
    armed = null;
    env.remove(root);
  }

  function decide(hit: boolean, fake = -1): void {
    const a = armed;
    if (!a || a.decided) return;
    a.decided = true;
    rounds++;
    spent[a.k] = true;
    env.result(a.tier, hit);
    lastResult = { tier: a.tier, hit, spot: idOf(spots[a.k]) };
    ladder = nextLadder(ladder, hit);
    if (hit) {
      hits++;
      bonus += FAKES.bonus;
      env.pay(FAKES.bonus);
      a.fakes.forEach((f, i) => {
        f.poof = 0;
        f.delay = i * 0.12;
      });
    } else {
      misses++;
      ctx.audio.play('boing', { volume: 0.4, pitch: 1.35 });
      a.fakes.forEach((f, i) => {
        f.poof = 0;
        f.delay = i === fake ? 0 : FAKES.afterMiss;
      });
    }
  }

  function draw(): void {
    const a = armed;
    if (!a || !mesh) return;
    const m = mesh;
    const dir = a.tell === 'sparkle' ? -1 : 1;
    const q = ctx.camera.quaternion;
    const cam = ctx.camera.position;
    // Far fake first: each gem, then its halo (depth-tested against the gem, like the real halo).
    const d = a.fakes.map((f) => Math.hypot(f.p.x - cam.x, f.p.y - cam.y, f.p.z - cam.z));
    const order = d[0] >= d[1] ? [0, 1] : [1, 0];
    order.forEach((i, slot) => {
      const f = a.fakes[i];
      const gi = slot * 2;
      kind.setX(gi, 0);
      kind.setX(gi + 1, 1);
      const k = f.poof < 0 ? 0 : Math.min(1, Math.max(0, f.poof - f.delay) / FAKES.poof);
      if (k >= 1) {
        m.setMatrixAt(gi, zero);
        m.setMatrixAt(gi + 1, zero);
        return;
      }
      const y = f.p.y + Math.sin(time * 2 + f.phase) * BOB;
      dummy.position.set(f.p.x, y, f.p.z);
      dummy.quaternion.identity();
      dummy.rotation.set(0, dir * time * SPIN + f.off, 0);
      dummy.scale.setScalar(GEM_SCALE * (1 + 0.6 * k) * (1 - k));
      dummy.updateMatrix();
      m.setMatrixAt(gi, dummy.matrix);
      dummy.quaternion.copy(q);
      dummy.scale.setScalar((2.2 + Math.sin(time * 3 + f.phase) * 0.25) * (1 + 1.8 * k) * Math.sqrt(1 - k));
      dummy.updateMatrix();
      m.setMatrixAt(gi + 1, dummy.matrix);
    });
    // Puffs over all three corners (the real gem too) when a cluster appears in view.
    const tri = triangle(a.real, a.answer, a.angle);
    for (let j = 0; j < 3; j++) {
      kind.setX(4 + j, 1);
      if (a.puff < 0 || a.puff >= PUFF) {
        m.setMatrixAt(4 + j, zero);
        continue;
      }
      const k = a.puff / PUFF;
      const p = j === a.answer ? a.real : a.fakes[j < a.answer ? j : j - 1].p;
      dummy.position.set(tri[j].x, p.y, tri[j].z);
      dummy.quaternion.copy(q);
      dummy.scale.setScalar((2.4 + 3.2 * k) * (1 - k));
      dummy.updateMatrix();
      m.setMatrixAt(4 + j, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    kind.needsUpdate = true;
  }

  function update(dt: number): void {
    if (!init()) return;
    time += dt;
    chest(cur);
    const maxStep = GEM_FX.maxSpeed * Math.max(dt, 1 / 60) + GEM_FX.slack;
    const from = havePrev && prev.distanceTo(cur) <= maxStep ? prev : cur;
    havePrev = true;

    if (!armed) {
      prev.copy(cur);
      if (ctx.player.mode !== 'walk') return;
      let best = -1;
      let bestD = Infinity;
      spots.forEach((s, k) => {
        if (!present[k] || spent[k] || blocked[k]) return;
        const d = Math.hypot(s.x - cur.x, s.z - cur.z);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      });
      if (best < 0 || bestD > FAKES.armFar) return;
      const seen = inView(spots[best]);
      if (bestD <= FAKES.armNear || !seen) arm(best, { puff: seen });
      return;
    }

    const a = armed;
    const s = spots[a.k];
    if (Math.hypot(s.x - cur.x, s.z - cur.z) > FAKES.disarm) {
      // Walked away (or a poof still running): nothing stays attached; an undecided round is not counted.
      prev.copy(cur);
      disarm();
      return;
    }
    if (!a.decided) {
      const real = present[a.k] || a.pending ? a.real : null;
      const live = a.fakes.map((f) => (f.poof < 0 ? f.p : null));
      // Fakes are touched at their base height (like the real gem's pickup).
      const t = firstTouch(from, cur, real, live, a.pending);
      if (t.first === 'fake') decide(false, t.fake);
      else if (a.pending) decide(true);
      else if (!present[a.k]) {
        prev.copy(cur);
        disarm();
        return;
      }
    }
    prev.copy(cur);
    if (a.puff >= 0) a.puff += dt;
    let done = a.decided;
    for (const f of a.fakes) {
      if (f.poof >= 0) f.poof += dt;
      if (f.poof < 0 || f.poof - f.delay < FAKES.poof) done = false;
    }
    if (done) {
      disarm();
      return;
    }
    draw();
  }

  function reset(): void {
    if (armed) disarm();
    present = spots.map(() => true);
    spent = spots.map(() => false);
    blocked = spots.map(() => false);
    ladder = { tier: 1, streak: 0 };
    hits = misses = bonus = rounds = 0;
    lastResult = null;
    havePrev = false;
  }

  return {
    id: env.id,
    kind: env.kind,
    reset,
    update,
    dispose() {
      for (const off of offs) off();
      if (armed) disarm();
      mesh?.dispose();
      if (geos) for (const g of Object.values(geos)) g.dispose();
      mat?.dispose();
      haloTex?.dispose();
    },
    debug() {
      const a = armed;
      return {
        active: !!a,
        tier: ladder.tier,
        streak: ladder.streak,
        hits,
        misses,
        gems: bonus,
        rounds,
        lastResult,
        spots: spots.map((s, k) => ({ id: idOf(s), tag: s.tag, x: s.x, y: s.y, z: s.z, ground: s.ground, present: present[k], spent: spent[k], blocked: blocked[k] })),
        armed: a
          ? {
              spot: a.k,
              id: idOf(spots[a.k]),
              answer: a.answer,
              angle: a.angle,
              tier: a.tier,
              tell: a.tell,
              decided: a.decided,
              real: { ...a.real },
              corners: triangle(a.real, a.answer, a.angle).map((c, i) => ({ x: c.x, z: c.z, y: i === a.answer ? a.real.y : a.fakes[i < a.answer ? i : i - 1].p.y })),
              fakes: a.fakes.map((f) => ({ ...f.p, poof: f.poof })),
            }
          : null,
      };
    },
    force(params) {
      if (!init()) return;
      if (typeof params.tier === 'number') ladder = { tier: Math.min(3, Math.max(1, Math.round(params.tier))) as GlassesTier, streak: 0 };
      if (params.disarm) {
        if (armed) disarm();
        return;
      }
      if (typeof params.spot === 'number') {
        const k = Math.round(params.spot);
        if (k < 0 || k >= spots.length) return;
        if (armed) disarm();
        spent[k] = false;
        blocked[k] = false;
        const answer = typeof params.answer === 'number' ? Math.round(params.answer) % 3 : undefined;
        const angle = typeof params.angle === 'number' ? params.angle : undefined;
        arm(k, { answer, angle, puff: false });
      }
    },
    drawObjects: () => env.tracked(),
  };
}
