/**
 * The balloon's launch pad: a round wooden deck with planks, plus four tether stakes and ropes up
 * to the envelope's load ring (shown while the balloon is parked).
 *
 * Render cost: 2 draws (deck + planks; stakes + ropes), per-vertex finishes from
 * `core/vertex-finish`. Only the deck casts a shadow (via the same mesh; the ropes are too thin
 * to matter).
 */
import * as THREE from 'three';
import { finish, finishMaterial, mergeFinished, placed, rodBetween } from '../../core/vertex-finish';

export interface PadModel {
  /** At the pad position (deck bottom). */
  readonly group: THREE.Group;
  /** Stakes + ropes; hide it while the balloon is away. */
  readonly tethers: THREE.Mesh;
  dispose(): void;
}

export interface PadSpec {
  radius: number;
  height: number;
  /** Balloon yaw (stakes sit on the diagonals). */
  yaw: number;
  /** Height of the rope tops (load ring) above the pad position. */
  ropeTopY: number;
  /** Ground height relative to the pad position at a pad-local (x, z). */
  groundAt(x: number, z: number): number;
}

const DECK = { color: 0x8a6440, rough: 0.8, metal: 0 };
const PLANK = { color: 0xa47a4f, rough: 0.75, metal: 0 };
const STAKE = { color: 0x3b2c22, rough: 0.7, metal: 0 };
const ROPE = { color: 0xe9dcc0, rough: 0.9, metal: 0 };

export function createPadModel(spec: PadSpec): PadModel {
  const group = new THREE.Group();
  group.name = 'balloonPad';
  const material = finishMaterial('rg-balloon-pad');

  const deckParts: THREE.BufferGeometry[] = [finish(placed(new THREE.CylinderGeometry(spec.radius, spec.radius + 0.08, spec.height, 40), 0, spec.height / 2, 0), DECK)];
  for (let i = -5; i <= 5; i++) {
    const len = 2 * Math.sqrt(Math.max(0, spec.radius * spec.radius - (i * 0.44) ** 2)) - 0.12;
    deckParts.push(finish(new THREE.BoxGeometry(0.42, 0.02, len).translate(i * 0.44, spec.height + 0.01, 0), i % 2 ? PLANK : DECK));
  }
  const deck = new THREE.Mesh(mergeFinished(deckParts), material);
  deck.name = 'balloonPad-deck';
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  const ropeParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4 + spec.yaw;
    const sx = Math.sin(a) * 6.5;
    const sz = Math.cos(a) * 6.5;
    const sy = spec.groundAt(sx, sz);
    ropeParts.push(finish(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 6).translate(sx, sy + 0.25, sz), STAKE));
    const top = new THREE.Vector3(Math.sin(a) * 1.6, spec.ropeTopY, Math.cos(a) * 1.6);
    ropeParts.push(finish(rodBetween(new THREE.Vector3(sx, sy + 0.5, sz), top, 0.022, 6), ROPE));
  }
  const tethers = new THREE.Mesh(mergeFinished(ropeParts), material);
  tethers.name = 'balloonPad-tethers';
  tethers.receiveShadow = true;
  group.add(tethers);

  return {
    group,
    tethers,
    dispose() {
      group.removeFromParent();
      deck.geometry.dispose();
      tethers.geometry.dispose();
      material.dispose();
    },
  };
}
