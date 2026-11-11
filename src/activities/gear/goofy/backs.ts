/**
 * Goofy back items (back anchor: origin on the torso's back, +Z forward, so items stand out to -Z;
 * shoulders at about y = 0.3). Wings flap, balloons sway, the wind-up key turns.
 */
import * as THREE from 'three';
import { P, Wobble, at, ball, box, cone, cyl, eye, goofy, paintBy, slab, torus, tube } from './kit';
import type { Geo, Wearable } from './kit';

/** Butterfly wings: bright patterned wings that flap (one moving mesh, folded around the spine). */
export function buildButterflyWings(): Wearable {
  const wing = (s: 1 | -1): Geo[] => {
    const up = paintBy(slab([[0, 0.02], [0.18, 0.2], [0.38, 0.36], [0.46, 0.25], [0.4, 0.06], [0.06, -0.02]], 0.015, 0.006), (x, y) => {
      const r = Math.hypot(x - 0.3, y - 0.22);
      return r < 0.05 ? 0x1a1030 : r < 0.09 ? 0xffffff : x > 0.4 || y > 0.33 ? 0x1a1030 : 0xffa020;
    }, 0.7, 1.05);
    const low = paintBy(slab([[0.02, -0.02], [0.3, -0.06], [0.33, -0.2], [0.2, -0.28], [0.06, -0.12]], 0.015, 0.006), (x, y) => (Math.hypot(x - 0.2, y + 0.14) < 0.05 ? 0xffffff : x > 0.28 || y < -0.24 ? 0x1a1030 : 0xffc928), 0.7, 1.05);
    const body = P(at(ball(0.04, 8, 6).scale(1, 3.5, 1), -0.02, 0.0, 0), 0x1a1030, 0.8);
    return [up, low, body].map((g) => (s < 0 ? g.scale(-1, 1, 1) : g));
  };
  return flapper(wing(1), { spread: 0.9, rate: 7, y: 0.12, z: -0.07 });
}

/** Little dragon wings: dark leathery panels with bright bony edges and claws. */
export function buildDragonWings(): Wearable {
  const wing = (): Geo[] => {
    const panel = paintBy(slab([[0, 0], [0.18, 0.28], [0.45, 0.4], [0.42, 0.22], [0.5, 0.08], [0.36, 0.04], [0.38, -0.12], [0.22, -0.06], [0.12, -0.2]], 0.012, 0.004), () => 0x3a1a6a, 0.65, 1.0);
    return [
      panel,
      P(tube([[0, 0, 0.01], [0.18, 0.28, 0.01], [0.45, 0.4, 0.01]], 0.022, 8, 5), 0xffe6a0, 0.7, 1.05),
      P(tube([[0.18, 0.28, 0.01], [0.5, 0.08, 0.01]], 0.014, 6, 4), 0xffe6a0, 0.7),
      P(tube([[0.18, 0.28, 0.01], [0.38, -0.12, 0.01]], 0.014, 6, 4), 0xffe6a0, 0.7),
      P(at(cone(0.025, 0.07, 6), 0.46, 0.44, 0.01, 0, 0, -0.6), 0xffffff, 0.8),
    ];
  };
  return flapper([...wing(), P(at(box(0.09, 0.12, 0.06, 0.025), 0, 0, 0), 0x3a1a6a, 0.6)], { spread: 0.6, rate: 4.5, y: 0.14, z: -0.07 });
}

/**
 * Two wings that flap mirrored: one wing geometry drawn twice (the right one is a mirrored Mesh on
 * the same geometry and material), so a pair costs exactly 2 draws.
 */
function flapper(wing: Geo[], o: { spread: number; rate: number; y: number; z: number }): Wearable {
  const spec = goofy({ moving: wing, pivot: [0, 0, 0] });
  const root = spec.object.children[0] as THREE.Group;
  const pivotL = root.children.find((c) => !(c as THREE.Mesh).isMesh) as THREE.Group;
  const wingMesh = pivotL.children[0] as THREE.Mesh;
  pivotL.position.set(0.03, o.y, o.z);
  const pivotR = new THREE.Group();
  pivotR.position.set(-0.03, o.y, o.z);
  pivotR.scale.x = -1;
  const right = new THREE.Mesh(wingMesh.geometry, wingMesh.material);
  right.castShadow = true;
  pivotR.add(right);
  root.add(pivotR);
  const w = new Wobble(60, 4, 0.05, 0, 1);
  let t = 0;
  return {
    object: spec.object,
    update(dt, speed) {
      t += dt;
      const kick = w.step(dt, speed);
      const flap = (Math.sin(t * o.rate) * 0.5 + 0.5) * o.spread + kick * 0.5;
      pivotL.rotation.y = -0.35 - flap;
      pivotR.rotation.y = 0.35 + flap;
    },
    dispose: spec.dispose,
  };
}

/** Turtle shell: dome with bright plate seams and a pale rim. */
export function buildTurtleShell(): Wearable {
  const dome = new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1.2).rotateX(-Math.PI / 2).translate(0, 0.05, -0.04);
  const shell = paintBy(dome, (x, y, z) => {
    const u = x * 7;
    const v = (y - 0.05) * 6;
    const fu = u - Math.floor(u);
    const fv = v - Math.floor(v + (Math.floor(u) % 2) * 0.5);
    const seam = fu < 0.1 || fv - Math.floor(fv) < 0.1;
    return z < -0.12 && seam ? 0xfff0b0 : 0x3f6a2a;
  }, 0.55, 1.05);
  return goofy({ body: [shell, P(at(torus(0.3, 0.035, 6, 24).scale(1, 1.2, 1), 0, 0.05, -0.05), 0xfff0b0, 0.6, 1.05)], offset: [0, 0, 0.02] });
}

/** A bunch of five balloons on strings, swaying above the head. */
export function buildBalloonBunch(): Wearable {
  const parts: Geo[] = [P(at(ball(0.035, 8, 6), 0, 0.2, -0.12), 0xffffff, 0.7)];
  const tops: [number, number, number, number][] = [
    [0.0, 1.32, -0.25, 0xffffff], [0.24, 1.18, -0.3, 0xffd21f], [-0.24, 1.2, -0.26, 0xff6ab4], [0.13, 1.0, -0.12, 0x1d3fd0], [-0.12, 0.98, -0.42, 0xff7414],
  ];
  for (const [x, y, z, c] of tops) {
    parts.push(P(tube([[0, 0.2, -0.12], [x * 0.4, 0.5, z * 0.8], [x, y - 0.17, z]], 0.006, 8, 3), 0xf0f0f0, 0.9));
    parts.push(P(at(ball(0.15, 12, 8).scale(1, 1.18, 1), x, y, z), c, 0.55, 1.08));
    parts.push(P(at(cone(0.025, 0.04, 6).rotateX(Math.PI), x, y - 0.18, z), c, 0.6));
    parts.push(P(at(ball(0.03, 6, 4), x - 0.05, y + 0.07, z + 0.12), 0xffffff, 1, 1.1));
  }
  return goofy({
    moving: parts,
    pivot: [0, 0.2, -0.12],
    animate: (p, w, dt, speed) => {
      const a = w.step(dt, speed);
      p.rotation.x = a * 0.7 + speed * 0.025;
      p.rotation.z = Math.sin(w.time * 1.3) * 0.08;
    },
    wobble: new Wobble(20, 1.6, 0.04, 0.06, 1.3),
    material: { roughness: 0.25 },
  });
}

/** Backpack with a plush bear peeking out and waving its paws. */
export function buildPlushPack(): Wearable {
  const body: Geo[] = [
    P(at(box(0.36, 0.4, 0.2, 0.07), 0, 0.0, -0.12), 0x1d3fd0, 0.55),
    P(at(box(0.28, 0.16, 0.08, 0.04), 0, -0.08, -0.23), 0xffd21f, 0.65, 1.05),
    P(at(torus(0.12, 0.015, 4, 16, Math.PI), 0, 0.2, -0.12), 0xffffff, 0.7),
  ];
  const bear: Geo[] = [
    P(at(ball(0.12, 12, 8), 0, 0.3, -0.13), 0xc8915a, 0.6, 1.05),
    P(at(ball(0.045, 8, 6), 0.09, 0.4, -0.13), 0xc8915a, 0.6),
    P(at(ball(0.045, 8, 6), -0.09, 0.4, -0.13), 0xc8915a, 0.6),
    P(at(ball(0.05, 8, 6).scale(1.2, 0.8, 0.8), 0, 0.27, -0.03), 0xf4dcc0, 0.7, 1.05),
    P(at(ball(0.018, 6, 4), 0, 0.29, 0.0), 0x14141c, 0.9),
    ...eye(0.045, 0.33, -0.03, 0.022),
    ...eye(-0.045, 0.33, -0.03, 0.022),
    P(at(ball(0.04, 8, 6), 0.13, 0.22, -0.06), 0xc8915a, 0.6),
    P(at(ball(0.04, 8, 6), -0.13, 0.22, -0.06), 0xc8915a, 0.6),
  ];
  // The bear faces backwards (out of the pack): turn it around the pack centre.
  const turned = bear.map((g) => g.translate(0, 0, 0.13).rotateY(Math.PI).translate(0, 0, -0.13));
  return goofy({
    body,
    moving: turned,
    pivot: [0, 0.2, -0.13],
    animate: (p, w, dt, speed) => {
      const a = w.step(dt, speed);
      p.rotation.z = Math.sin(w.time * 1.8) * 0.12;
      p.rotation.x = a * 0.6;
      p.position.y = 0.2 + Math.max(0, Math.sin(w.time * 0.9)) * 0.04;
    },
    offset: [0, 0.02, 0],
  });
}

/** Giant wind-up key that turns all the time (faster when running). */
export function buildWindUpKey(): Wearable {
  const parts: Geo[] = [
    P(at(cyl(0.035, 0.035, 0.3, 10).rotateX(Math.PI / 2), 0, 0, -0.15), 0xd8dde4, 0.6, 1.05),
    P(at(cyl(0.06, 0.06, 0.05, 12).rotateX(Math.PI / 2), 0, 0, -0.04), 0xffc928, 0.6),
  ];
  for (const s of [-1, 1]) {
    parts.push(P(at(torus(0.11, 0.035, 8, 18).scale(1, 0.8, 1), s * 0.13, 0, -0.3, 0, Math.PI / 2, 0), 0xffc928, 0.55, 1.1));
  }
  parts.push(P(at(ball(0.06, 10, 6), 0, 0, -0.3), 0xffc928, 0.6, 1.1));
  return goofy({
    moving: parts,
    pivot: [0, 0, 0],
    animate: (p, w, dt, speed) => {
      w.step(dt, speed);
      p.rotation.z += dt * (1.5 + Math.min(6, speed * 0.6));
    },
    offset: [0, 0.05, 0],
    material: { roughness: 0.3, metalness: 0.4 },
  });
}

/** A little flag on a pole, flapping (the cloth is re-shaped every frame; 16 quads). */
export function buildFlag(): Wearable {
  const W = 0.36;
  const H = 0.24;
  const cloth = new THREE.PlaneGeometry(W, H, 8, 2).translate(W / 2, 0, 0);
  const flag = paintBy(cloth, (x, y) => {
    const r = Math.hypot(x - W / 2, y);
    return r < 0.07 ? 0xffffff : Math.floor((x / W) * 4) % 2 ? 0xffd21f : 0x1d3fd0;
  }, 0.75, 1.05);
  const pos = flag.getAttribute('position');
  const base = Float32Array.from(pos.array as Float32Array);
  const body: Geo[] = [
    P(at(cyl(0.015, 0.015, 0.95, 8), 0, 0.42, -0.12), 0xffffff, 0.7),
    P(at(ball(0.035, 8, 6), 0, 0.91, -0.12), 0xffc928, 0.7, 1.1),
    P(at(box(0.08, 0.14, 0.05, 0.02), 0, -0.02, -0.08), 0x1c1c26, 0.7),
  ];
  const w = new Wobble(30, 2, 0.05, 0, 1);
  const spec = goofy({ body, moving: [flag], pivot: [0, 0.76, -0.12] });
  return {
    object: spec.object,
    update(dt, speed) {
      w.step(dt, speed);
      const t = w.time;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3] as number;
        const k = x / W;
        pos.setZ(i, (base[i * 3 + 2] as number) + Math.sin(t * 6 - x * 14) * 0.05 * k);
        pos.setX(i, x * (1 - 0.1 * k * Math.min(1, speed / 6)));
      }
      pos.needsUpdate = true;
    },
    dispose: spec.dispose,
  };
}

/** Snail shell: a fat spiral of shrinking balls, dark and bright bands. */
export function buildSnailShell(): Wearable {
  const parts: Geo[] = [];
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const a = t * Math.PI * 3.2;
    const r = 0.2 * (1 - t * 0.85);
    const s = 0.15 * (1 - t * 0.75);
    parts.push(P(at(ball(s, 9, 6), 0, 0.1 + Math.sin(a) * r, -0.2 - Math.cos(a) * r), i % 2 ? 0xffe6a0 : 0x8a4a1c, 0.55, 1.05));
  }
  return goofy({ body: parts, offset: [0, 0.08, 0.03] });
}

/** Surfboard strapped on the back, with bright stripes. */
export function buildSurfboard(): Wearable {
  const board = new THREE.SphereGeometry(0.5, 16, 8).scale(0.32, 1.25, 0.06);
  const body: Geo[] = [
    paintBy(board, (x, y) => (Math.abs(x) < 0.025 ? 0x1c1c26 : y > 0.1 && y < 0.22 ? 0xff7414 : y > 0.26 && y < 0.32 ? 0x1d3fd0 : 0xffffff), 0.6, 1.05),
    P(at(box(0.32, 0.04, 0.06, 0.015), 0, -0.05, 0.02), 0x1c1c26, 0.8),
  ];
  return goofy({ body: body.map((g) => g.translate(0, 0, -0.12)), offset: [0, 0.18, 0], tilt: [0, 0, 0.35] });
}

/** Fizzy soda jetpack: two bottles with foamy puffs that bubble when you run. */
export function buildSodaJetpack(): Wearable {
  const body: Geo[] = [P(at(box(0.3, 0.28, 0.06, 0.025), 0, 0.03, -0.07), 0x2a2f3a, 0.6)];
  for (const s of [-1, 1]) {
    const x = s * 0.1;
    body.push(paintBy(at(cyl(0.075, 0.075, 0.3, 14), x, 0.02, -0.15), (_x, y) => (y > -0.03 && y < 0.07 ? 0xffffff : 0x8a2a1a), 0.55, 1.05));
    body.push(P(at(cyl(0.03, 0.075, 0.08, 14), x, 0.21, -0.15), 0x8a2a1a, 0.55));
    body.push(P(at(cyl(0.032, 0.032, 0.03, 10), x, 0.26, -0.15), 0xffd21f, 0.7));
  }
  const foam: Geo[] = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) foam.push(P(at(ball(0.05 + i * 0.012, 8, 6), s * 0.1 + Math.sin(i * 2.3) * 0.02, -0.17 - i * 0.07, -0.15), 0xffffff, 0.8, 1.05));
  }
  return goofy({
    body,
    moving: foam,
    pivot: [0, -0.13, -0.15],
    animate: (p, w, dt, speed) => {
      w.step(dt, speed);
      const k = 0.55 + Math.min(0.9, speed * 0.1);
      p.scale.set(1 + Math.sin(w.time * 20) * 0.06, k * (0.9 + Math.sin(w.time * 13) * 0.12), 1);
    },
    offset: [0, 0.02, 0],
    material: { roughness: 0.25 },
  });
}

