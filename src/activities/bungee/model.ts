/**
 * Bungee bridge props (both-eye, procedural): the jump platform sticking out over the canyon from
 * the bridge railing gap, a yellow gantry with a cantilever arm and pulley (the cord anchor), a
 * striped safety gate that swings up for the dive, and the soft landing mat with a winch post on
 * the shore. Bright/dark brightness contrast so everything reads in R-only and G-only.
 */
import * as THREE from 'three';
import { Kit } from './kit';

const YELLOW = 0xf2c14e;
const NAVY = 0x1b2252;
const CREAM = 0xfff1cf;
const DARK = 0x262a33;
const WOOD = [0xa67c56, 0x8d6847, 0x9b7350];

export interface PlatformGeo {
  /** Deck top height. */
  deck: number;
  /** X of the bridge deck's west edge (the board starts here and sticks out towards −X). */
  edgeX: number;
  /** Z of the platform centre line. */
  z: number;
  /** How far the board sticks out past the edge. */
  reach: number;
  /** Half width of the board (along Z). */
  halfWidth: number;
  /** Cord anchor (pulley) position. */
  anchor: THREE.Vector3;
}

export interface PlatformModel {
  root: THREE.Group;
  /** The springboard tip (pivots about the deck edge). */
  board: THREE.Group;
  /** Gate bar pivot (rotation.z swings it up). */
  gate: THREE.Group;
  /** Pulley wheel (spins while the cord runs). */
  pulley: THREE.Object3D;
  /** Where the idle cord end hangs (a hook on the gantry post). */
  hook: THREE.Vector3;
}

export function createPlatformModel(g: PlatformGeo): PlatformModel {
  const root = new THREE.Group();
  root.name = 'bungee-platform';
  const { deck, edgeX, z, reach, halfWidth: hw } = g;

  // Fixed part: deck pad, gantry posts, crossbeam, cantilever arm, side rails.
  const k = new Kit();
  // A bright pad on the deck in front of the board (where you get harnessed).
  k.box('matte', NAVY, edgeX + 1.9, deck + 0.02, z, 1.6, 0.04, hw * 2 - 0.2);
  for (let i = 0; i < 4; i++) k.box('matte', CREAM, edgeX + 1.3 + i * 0.4, deck + 0.045, z, 0.16, 0.01, hw * 2 - 0.5);
  // Posts stand on the platform 0.6 m in from its end (where the world's own gantry stands).
  const postX = edgeX + 0.6;
  const top = deck + 4.7;
  for (const s of [-1, 1]) {
    const pz = z + s * (hw + 0.12);
    k.box('gloss', YELLOW, postX, deck + 2.35, pz, 0.26, 4.7, 0.26);
    k.box('metal', DARK, postX, deck + 0.08, pz, 0.5, 0.16, 0.5);
    // Hazard bands on the posts.
    for (let i = 0; i < 4; i++) k.box('matte', NAVY, postX, deck + 0.5 + i * 0.32, pz, 0.28, 0.12, 0.28);
    // Side rails along the board.
    k.rod('metal', DARK, new THREE.Vector3(edgeX, deck + 1.05, pz), new THREE.Vector3(edgeX - reach + 0.05, deck + 1.05, pz), 0.045);
    k.rod('metal', DARK, new THREE.Vector3(edgeX, deck + 0.55, pz), new THREE.Vector3(edgeX - reach + 0.05, deck + 0.55, pz), 0.035);
    k.box('metal', DARK, edgeX - reach + 0.05, deck + 0.55, pz, 0.09, 1.1, 0.09);
  }
  k.box('gloss', YELLOW, postX, top, z, 0.32, 0.32, hw * 2 + 0.6);
  // Cantilever arm from the crossbeam to the pulley, with a diagonal brace.
  const ax = g.anchor.x;
  k.box('gloss', YELLOW, (postX + ax) / 2 - 0.1, top + 0.02, z, postX - ax + 0.5, 0.3, 0.3);
  k.rod('gloss', YELLOW, new THREE.Vector3(postX, deck + 3.0, z + 0.05), new THREE.Vector3(ax + 0.6, top - 0.05, z + 0.05), 0.06);
  k.rod('gloss', YELLOW, new THREE.Vector3(postX, deck + 3.0, z - 0.05), new THREE.Vector3(ax + 0.6, top - 0.05, z - 0.05), 0.06);
  // Pulley cheeks.
  for (const s of [-1, 1]) k.box('metal', DARK, ax, top - 0.3, z + s * 0.14, 0.5, 0.6, 0.04);
  const fixed = k.build('bungee-gantry');
  root.add(fixed);

  // Springboard: pivots about the deck edge so it can flex under the jumper.
  const board = new THREE.Group();
  board.position.set(edgeX, deck, z);
  const kb = new Kit();
  const planks = 6;
  for (let i = 0; i < planks; i++) {
    const w = (hw * 2) / planks;
    kb.box('matte', WOOD[i % 3], -reach / 2, -0.06, -hw + w * (i + 0.5), reach, 0.12, w - 0.03);
  }
  kb.box('matte', DARK, -reach / 2, -0.2, 0, reach, 0.16, hw * 2);
  // Hazard edge at the tip (alternating bright/dark).
  const n = 9;
  for (let i = 0; i < n; i++) kb.box('matte', i % 2 ? NAVY : YELLOW, -reach + 0.09, 0.005, -hw + ((i + 0.5) * hw * 2) / n, 0.18, 0.02, (hw * 2) / n);
  board.add(kb.build('bungee-board'));
  root.add(board);

  // Gate bar at the board tip (hinged at +Z end, swings up).
  const gate = new THREE.Group();
  gate.position.set(edgeX - reach + 0.05, deck + 0.85, z - hw - 0.05);
  const kg = new Kit();
  const segs = 8;
  for (let i = 0; i < segs; i++) kg.box('gloss', i % 2 ? NAVY : CREAM, 0, 0, ((i + 0.5) * (hw * 2 + 0.1)) / segs, 0.1, 0.1, (hw * 2 + 0.1) / segs);
  gate.add(kg.build('bungee-gate'));
  root.add(gate);

  // Pulley wheel.
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 18), new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.4 }));
  wheel.rotation.x = Math.PI / 2;
  const pulley = new THREE.Group();
  pulley.position.set(ax, top - 0.3, z);
  pulley.add(wheel);
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.17), new THREE.MeshStandardMaterial({ color: NAVY, roughness: 0.6 }));
  pulley.add(spoke);
  root.add(pulley);

  const hook = new THREE.Vector3(postX + 0.2, deck + 1.35, z - hw - 0.12);
  return { root, board, gate, pulley, hook };
}

export interface LandingModel {
  root: THREE.Group;
  /** Top of the mat (feet height when landed). */
  top: number;
  /** Winch post button position (for the E prompt). */
  winch: THREE.Vector3;
}

/** Big soft landing mat with bright/dark rings and a winch post that hauls you back up. */
export function createLandingModel(centre: THREE.Vector3, ground: number, towardsBridge: THREE.Vector2): LandingModel {
  const root = new THREE.Group();
  root.name = 'bungee-landing';
  const k = new Kit();
  const r = 2.6;
  const h = 0.32;
  k.cyl('matte', NAVY, centre.x, ground + h / 2, centre.z, r, h, 40);
  k.add('matte', new THREE.TorusGeometry(r - 0.02, 0.17, 10, 48), YELLOW, k.t(centre.x, ground + h, centre.z, Math.PI / 2));
  for (const [rr, col] of [[1.9, CREAM], [1.35, NAVY], [0.8, YELLOW], [0.35, NAVY]] as const) {
    k.cyl('matte', col, centre.x, ground + h + 0.006, centre.z, rr, 0.012, 36);
  }
  // Winch post beside the mat, on the bridge side.
  const wx = centre.x + towardsBridge.x * (r + 0.9);
  const wz = centre.z + towardsBridge.y * (r + 0.9) + 1.2;
  k.box('metal', DARK, wx, ground + 0.1, wz, 0.9, 0.2, 0.9);
  k.box('gloss', YELLOW, wx, ground + 0.8, wz, 0.5, 1.4, 0.5);
  k.cyl('metal', DARK, wx, ground + 1.2, wz, 0.33, 0.62, 16, Math.PI / 2);
  for (let i = 0; i < 3; i++) k.box('matte', NAVY, wx, ground + 0.35 + i * 0.22, wz, 0.52, 0.08, 0.52);
  // An up-arrow on the post (bright on dark) to say "back up".
  k.box('matte', NAVY, wx + towardsBridge.x * 0.26, ground + 1.75, wz, 0.04, 0.55, 0.42);
  k.add('matte', new THREE.ConeGeometry(0.15, 0.2, 3), CREAM, k.t(wx + towardsBridge.x * 0.29, ground + 1.88, wz, 0, 0, 0));
  k.box('matte', CREAM, wx + towardsBridge.x * 0.29, ground + 1.66, wz, 0.02, 0.22, 0.08);
  root.add(k.build('bungee-mat'));
  return { root, top: ground + h, winch: new THREE.Vector3(wx, ground + 1.2, wz) };
}
