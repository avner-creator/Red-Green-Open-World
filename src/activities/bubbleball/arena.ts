/**
 * The Bubble Ball set: a raised inflatable pitch (bouncy-castle skirt, puffy rim), striped turf
 * with white lines, puffy walls, two inflatable goals with nets, corner flags and a ticket booth
 * with a pictogram sign. Everything static is one merged vertex-coloured mesh (+1 for the sign,
 * +1 shadow proxy). Pitch space = this group's local space: deck top at y = 0, +X = the player's
 * attack direction.
 */
import * as THREE from 'three';
import { asShadowProxy } from '../../core/shadow-proxy';
import { MergeKit, TRS, UNIT, between, pictoTexture, setMaterial } from './merge';
import { PITCH } from './soccer';

export const ARENA = {
  /** Deck half extents (outer, incl. goals and walls). */
  hx: 11.6,
  hz: 6.6,
  wallR: 0.36,
  wallH: 1.25,
  /**
   * Booth: pitch-space position (on the ground, outside the deck) and turn. QA r7 m7: it used to
   * stand square on the walk-in ramp's foot with its counter facing away, so a walk from the booth
   * hit its back or the wall. Now it stands beside the ramp foot, its counter facing the ramp's
   * line (+X): the hero at the counter turns to the pitch and walks straight up the ramp and in
   * through the gate. Gate centre x = −6.64 (`gateSpan`), ramp foot z = −(hz + 2.6) = −9.2.
   */
  booth: { x: -7.95, z: -10.45, yaw: -Math.PI / 2 },
  /** Where the hero stands to use the booth (pitch space): on the ramp's line, facing the counter. */
  boothPad: { x: -6.6, z: -10.45 },
} as const;

/**
 * The walk-in gate: the near (−Z, booth side) sideline section closest to the booth is an arch with
 * a ribbon curtain. Walkers stroll through it (no wall collider there) and up a little ramp from
 * the meadow; the match ball still bounces off the curtain (the match keeps its sideline).
 */
export function gateSpan(): { x0: number; x1: number; z: number } {
  const sideLen = (PITCH.hx - PITCH.corner) * 2;
  const secs = Math.round(sideLen / 3.2);
  const x0 = -PITCH.hx + PITCH.corner;
  return { x0, x1: x0 + sideLen / secs, z: -PITCH.hz };
}

export const PAL = {
  navy: 0x1b2766,
  ink: 0x10142e,
  white: 0xf7f3ea,
  yellow: 0xffd83d,
  coral: 0xff6f5e,
  turfA: 0x3f9a49,
  turfB: 0x52b05a,
} as const;

export interface ArenaModel {
  readonly group: THREE.Group;
  /** World position of the booth counter (interaction point). */
  readonly booth: THREE.Vector3;
  /** Booth yaw (faces the arena's −Z side outward). */
  readonly boothYaw: number;
  readonly triangles: number;
  dispose(): void;
}

function bubbleBallSign(g: CanvasRenderingContext2D, s: number): void {
  g.fillStyle = '#10142e';
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = s * 0.05;
  g.strokeStyle = '#ffffff';
  g.stroke();
  // Two bubbles (light and dark) bumping, and a ball.
  const bub = (x: number, y: number, r: number, fill: string, edge: string): void => {
    g.fillStyle = fill;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = s * 0.03;
    g.strokeStyle = edge;
    g.stroke();
    g.strokeStyle = '#ffffff';
    g.lineWidth = s * 0.025;
    g.beginPath();
    g.arc(x - r * 0.15, y - r * 0.15, r * 0.6, Math.PI * 1.1, Math.PI * 1.5);
    g.stroke();
  };
  bub(s * 0.36, s * 0.42, s * 0.2, '#ffe680', '#000000');
  bub(s * 0.64, s * 0.42, s * 0.2, '#26306e', '#ffffff');
  // Ball.
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(s * 0.5, s * 0.74, s * 0.12, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = s * 0.02;
  g.strokeStyle = '#000';
  g.stroke();
  g.fillStyle = '#000';
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    g.lineTo(s * 0.5 + Math.cos(a) * s * 0.05, s * 0.74 + Math.sin(a) * s * 0.05);
  }
  g.fill();
}

export function createArenaModel(opts: {
  /** Deck top y minus the lowest ground under it (skirt height). */
  skirt: number;
  /** Ground height minus deck top at the booth (negative = below the deck). */
  boothDy: number;
  site: { x: number; z: number; yaw: number; deckY: number };
}): ArenaModel {
  const k = new MergeKit();
  const proxy = new MergeKit();
  const { hx, hz, goalHalf: gh, goalDepth: gd, goalHeight: gH, corner: cc } = PITCH;
  const { wallR: wr, wallH } = ARENA;

  // ── Deck: striped skirt panels and a puffy rim ──
  const skirtH = opts.skirt + 0.5;
  const panel = 1.45;
  for (const [len, axis] of [
    [ARENA.hx * 2, 'x'],
    [ARENA.hz * 2, 'z'],
  ] as const) {
    const n = Math.max(2, Math.round(len / panel));
    const w = len / n;
    for (const side of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + (i + 0.5) * w;
        const col = i % 2 ? PAL.navy : i % 4 === 0 ? PAL.yellow : PAL.coral;
        if (axis === 'x') k.add(UNIT.box, col, TRS(t, -skirtH / 2, side * ARENA.hz, 0, w, skirtH, 0.3));
        else k.add(UNIT.box, col, TRS(side * ARENA.hx, -skirtH / 2, t, 0, 0.3, skirtH, w));
      }
    }
  }
  // Top surface under the turf (edges show between the rim and the turf).
  k.add(UNIT.box, PAL.navy, TRS(0, -0.12, 0, 0, ARENA.hx * 2, 0.22, ARENA.hz * 2));
  // Puffy rim tubes round the deck edge, corner balls.
  for (const s of [-1, 1]) {
    k.add(UNIT.cyl, PAL.white, between(-ARENA.hx, 0.05, s * ARENA.hz, ARENA.hx, 0.05, s * ARENA.hz, 0.3));
    k.add(UNIT.cyl, PAL.white, between(s * ARENA.hx, 0.05, -ARENA.hz, s * ARENA.hx, 0.05, ARENA.hz, 0.3));
    for (const t of [-1, 1]) k.add(UNIT.sphere, PAL.yellow, TRS(s * ARENA.hx, 0.12, t * ARENA.hz, 0, 0.5, 0.5, 0.5));
  }
  proxy.add(UNIT.box, 0, TRS(0, -skirtH / 2, 0, 0, ARENA.hx * 2, skirtH, ARENA.hz * 2));

  // ── Turf: mown stripes across the pitch (and into the goal boxes) ──
  const stripes = 12;
  const sw = (hx * 2) / stripes;
  for (let i = 0; i < stripes; i++) {
    k.add(UNIT.box, i % 2 ? PAL.turfA : PAL.turfB, TRS(-hx + (i + 0.5) * sw, 0.0, 0, 0, sw, 0.04, hz * 2 + wr));
  }
  for (const s of [-1, 1]) k.add(UNIT.box, PAL.turfA, TRS(s * (hx + gd / 2), 0.0, 0, 0, gd, 0.04, gh * 2 + 0.2));
  // White lines.
  const line = (x0: number, z0: number, x1: number, z1: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    k.add(UNIT.box, PAL.white, TRS((x0 + x1) / 2, 0.03, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0), 0.12, 0.02, len + 0.12));
  };
  const lx = hx - 0.35;
  const lz = hz - 0.35;
  line(-lx, -lz, lx, -lz);
  line(-lx, lz, lx, lz);
  line(-lx, -lz, -lx, lz);
  line(lx, -lz, lx, lz);
  line(0, -lz, 0, lz);
  for (const s of [-1, 1]) {
    // Goal area box.
    line(s * lx, -gh - 0.8, s * (lx - 2), -gh - 0.8);
    line(s * lx, gh + 0.8, s * (lx - 2), gh + 0.8);
    line(s * (lx - 2), -gh - 0.8, s * (lx - 2), gh + 0.8);
    k.add(UNIT.cylLow, PAL.white, TRS(s * (lx - 3.2), 0.03, 0, 0, 0.14, 0.02, 0.14));
  }
  const circle = new THREE.RingGeometry(1.95, 2.08, 48).rotateX(-Math.PI / 2);
  k.add(circle, PAL.white, TRS(0, 0.035, 0));
  circle.dispose();
  k.add(UNIT.cylLow, PAL.white, TRS(0, 0.035, 0, 0, 0.18, 0.02, 0.18));

  // ── Puffy walls: two stacked tubes with fat posts, navy below, white/yellow above ──
  const tubeWall = (x0: number, z0: number, x1: number, z1: number, idx: number): void => {
    // Offset the wall outward (away from the pitch centre) so its inner face is on the segment.
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    let nx = -(z1 - z0);
    let nz = x1 - x0;
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    if (nx * mx + nz * mz < 0) {
      nx = -nx;
      nz = -nz;
    }
    const ox = nx * wr;
    const oz = nz * wr;
    k.add(UNIT.cyl, PAL.navy, between(x0 + ox, wr, z0 + oz, x1 + ox, wr, z1 + oz, wr));
    k.add(UNIT.cyl, idx % 2 ? PAL.yellow : PAL.white, between(x0 + ox, wallH - wr * 0.9, z0 + oz, x1 + ox, wallH - wr * 0.9, z1 + oz, wr * 0.9));
    for (const [px, pz] of [
      [x0, z0],
      [x1, z1],
    ]) {
      k.add(UNIT.cyl, PAL.white, TRS(px + ox, wallH / 2, pz + oz, 0, wr * 1.15, wallH, wr * 1.15));
      k.add(UNIT.sphere, PAL.navy, TRS(px + ox, wallH, pz + oz, 0, wr * 1.2, wr * 1.0, wr * 1.2));
    }
    const len = Math.hypot(x1 - x0, z1 - z0);
    proxy.add(UNIT.box, 0, TRS(mx + ox, wallH / 2, mz + oz, Math.atan2(x1 - x0, z1 - z0), wr * 2, wallH, len));
  };
  /** The walk-in gate: two tall striped posts, an arch tube and a curtain of soft ribbons. */
  const gateArch = (x0: number, x1: number, z: number): void => {
    const top = 2.6;
    for (const px of [x0, x1]) {
      for (let b = 0; b < 4; b++) k.add(UNIT.cyl, b % 2 ? PAL.navy : PAL.yellow, TRS(px, ((b + 0.5) * top) / 4, z, 0, wr * 1.15, top / 4, wr * 1.15));
      k.add(UNIT.sphere, PAL.yellow, TRS(px, top, z, 0, wr * 1.3, wr * 1.3, wr * 1.3));
      proxy.add(UNIT.cyl, 0, TRS(px, top / 2, z, 0, wr * 1.15, top, wr * 1.15));
    }
    k.add(UNIT.cyl, PAL.white, between(x0, top, z, x1, top, z, wr * 0.8));
    const n = 9;
    for (let i = 1; i < n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      k.add(UNIT.box, i % 2 ? PAL.yellow : PAL.white, TRS(x, top / 2 + 0.1, z, 0, 0.16, top - 0.3, 0.03));
    }
  };
  // Sidelines in sections (posts every ~3.2 m).
  let wi = 0;
  const sideLen = (hx - cc) * 2;
  const secs = Math.round(sideLen / 3.2);
  for (const s of [-1, 1]) {
    for (let i = 0; i < secs; i++) {
      const xa = -hx + cc + (i * sideLen) / secs;
      const xb = -hx + cc + ((i + 1) * sideLen) / secs;
      if (s < 0 && i === 0) {
        gateArch(xa, xb, s * hz - wr);
        wi++;
        continue;
      }
      tubeWall(xa, s * hz, xb, s * hz, wi++);
    }
    for (const t of [-1, 1]) {
      tubeWall(s * hx, t * (hz - cc), s * hx, t * gh, wi++);
      tubeWall(s * hx, t * (hz - cc), s * (hx - cc), t * hz, wi++);
    }
  }

  // ── Goals: inflatable posts and crossbar, low side/back tubes, a white net ──
  for (const s of [-1, 1]) {
    // +X is the goal the player attacks (bright), −X the one they defend (white/coral).
    const postA = s > 0 ? PAL.yellow : PAL.white;
    const postB = s > 0 ? PAL.navy : PAL.coral;
    const pr = 0.3;
    for (const t of [-1, 1]) {
      const pz = t * (gh + pr);
      const bands = 4;
      for (let b = 0; b < bands; b++) k.add(UNIT.cyl, b % 2 ? postB : postA, TRS(s * (hx + pr * 0.6), ((b + 0.5) * gH) / bands, pz, 0, pr, gH / bands, pr));
      k.add(UNIT.sphere, postA, TRS(s * (hx + pr * 0.6), gH, pz, 0, pr * 1.25, pr * 1.25, pr * 1.25));
      // Low side tube.
      k.add(UNIT.cyl, postB, between(s * hx, 0.22, pz, s * (hx + gd), 0.22, pz, 0.22));
      proxy.add(UNIT.cyl, 0, TRS(s * (hx + pr * 0.6), gH / 2, pz, 0, pr, gH, pr));
    }
    k.add(UNIT.cyl, postA, between(s * (hx + pr * 0.6), gH, -(gh + pr), s * (hx + pr * 0.6), gH, gh + pr, pr * 0.9));
    k.add(UNIT.cyl, postB, between(s * (hx + gd), 0.22, -(gh + pr), s * (hx + gd), 0.22, gh + pr, 0.22));
    // Net: thin white cords on the back, sides and roof.
    const cord = 0.025;
    const bx = s * (hx + gd);
    const fx = s * (hx + 0.2);
    for (let i = 0; i <= 8; i++) {
      const z = -gh + (i * 2 * gh) / 8;
      k.add(UNIT.cylLow, PAL.white, between(bx, 0.3, z, bx, gH * 0.85, z, cord));
      k.add(UNIT.cylLow, PAL.white, between(fx, gH, z, bx, gH * 0.85, z, cord));
    }
    for (let j = 0; j <= 5; j++) {
      const y = 0.3 + (j * (gH * 0.85 - 0.3)) / 5;
      k.add(UNIT.cylLow, PAL.white, between(bx, y, -gh, bx, y, gh, cord));
      for (const t of [-1, 1]) k.add(UNIT.cylLow, PAL.white, between(s * hx, y + (gH - y) * 0.15, t * gh, bx, y, t * gh, cord));
    }
    for (let i = 0; i <= 3; i++) {
      const x = s * (hx + (i * gd) / 3);
      for (const t of [-1, 1]) k.add(UNIT.cylLow, PAL.white, between(x, 0.3, t * gh, x, gH - (i * gH * 0.15) / 3, t * gh, cord));
    }
  }

  // ── Corner flags: striped poles with pennants ──
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      const x = s * (ARENA.hx - 0.45);
      const z = t * (ARENA.hz - 0.3);
      k.add(UNIT.cylLow, PAL.white, TRS(x, 1.6, z, 0, 0.06, 3.2, 0.06));
      k.add(UNIT.sphereLow, PAL.yellow, TRS(x, 3.25, z, 0, 0.12, 0.12, 0.12));
      const flag = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.7, 0), new THREE.Vector3(0.95, -0.35, 0)]);
      flag.setIndex([0, 1, 2, 0, 2, 1]);
      flag.computeVertexNormals();
      k.add(flag, s > 0 ? PAL.yellow : PAL.coral, TRS(x, 3.15, z, t > 0 ? Math.PI / 2 : -Math.PI / 2));
      flag.dispose();
    }
  }

  // ── Booth on the ground beside the walk-in ramp ──
  const bx = ARENA.booth.x;
  const bz = ARENA.booth.z;
  const by = opts.boothDy;
  const boothYaw = ARENA.booth.yaw; // the counter's front (local −Z) faces +X: the ramp's line
  const B = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0): THREE.Matrix4 => {
    const local = TRS(x, y, z, ry, sx, sy, sz, rx);
    return TRS(bx, by, bz, boothYaw).multiply(local);
  };
  k.add(UNIT.box, PAL.white, B(0, 0.5, 0, 0, 2.2, 1.0, 1.1));
  k.add(UNIT.box, PAL.navy, B(0, 1.02, 0.05, 0, 2.4, 0.1, 1.3));
  for (const sx of [-1, 1]) k.add(UNIT.cylLow, PAL.white, B(sx * 1.05, 1.6, -0.4, 0, 0.07, 1.4, 0.07));
  for (let i = 0; i < 6; i++) k.add(UNIT.box, i % 2 ? PAL.navy : PAL.yellow, B(-1.1 + 0.44 * i + 0.22, 2.35, 0.1, 0, 0.44, 0.08, 1.5, 0.28));
  k.add(UNIT.box, PAL.navy, B(0, 2.6, -0.45, 0, 2.5, 0.25, 0.25));
  // Puffy bubble mascot on the roof (a dark bubble and a light one).
  k.add(UNIT.sphere, PAL.yellow, B(-0.45, 3.15, -0.45, 0, 0.42, 0.42, 0.42));
  k.add(UNIT.sphere, PAL.navy, B(0.45, 3.15, -0.45, 0, 0.42, 0.42, 0.42));
  proxy.add(UNIT.box, 0, B(0, 1.2, 0, 0, 2.3, 2.4, 1.2));

  const geo = k.build();
  const mat = setMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'bubbleball-set';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  const group = new THREE.Group();
  group.name = 'bubbleball';
  group.add(mesh);

  // Pictogram sign above the counter (both sides).
  const tex = pictoTexture(bubbleBallSign);
  const signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide });
  const sign = new THREE.Mesh(new THREE.CircleGeometry(0.85, 40), signMat);
  sign.name = 'bubbleball-sign';
  sign.applyMatrix4(B(0, 3.3, -1.0, Math.PI));
  group.add(sign);

  const proxyMesh = asShadowProxy(new THREE.Mesh(proxy.build()));
  group.add(proxyMesh);

  group.position.set(opts.site.x, opts.site.deckY, opts.site.z);
  group.rotation.y = opts.site.yaw;
  group.updateMatrixWorld(true);

  const booth = new THREE.Vector3().setFromMatrixPosition(B(0, 1.0, -0.9)).applyMatrix4(group.matrixWorld);
  return {
    group,
    booth,
    boothYaw: opts.site.yaw + boothYaw,
    triangles: (geo.attributes.position.count / 3) | 0,
    dispose() {
      geo.dispose();
      mat.dispose();
      sign.geometry.dispose();
      signMat.dispose();
      tex.dispose();
      proxyMesh.geometry.dispose();
    },
  };
}
