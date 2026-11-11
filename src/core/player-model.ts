/**
 * The avatar rig: a stable hierarchy the rest of core poses, with a swappable character inside.
 *
 * root (feet, yaw) → squash (feet; squash & stretch, tilt, pop) → spin (body centre; flop tumble,
 * skill spins) → character object (`loadCharacter`, feet at -centre).
 *
 * Outfits attach to stable per-part holders; on a character swap the holders move onto the new
 * character's anchors (which carry the catalog's per-character offset/scale), so a hat sits right
 * on a frog, a flamingo or a T-rex without the outfit code knowing.
 */
import * as THREE from 'three';
import { PLAYER } from '../config';
import type { PlayerAnim } from '../types';
import type { AttachPart } from './characters/catalog';
import type { LoadedCharacter } from './characters/load';
import { createWobble } from './characters/wobble';
import type { Wobble, WobbleDrive } from './characters/wobble';

export type { AttachPart };
export type ModelAnim = PlayerAnim | 'emote';

export interface PlayerModel {
  readonly root: THREE.Group;
  readonly squash: THREE.Group;
  readonly spin: THREE.Group;
  /** Stable outfit holders (follow the current character's anchors). */
  readonly anchors: Record<AttachPart, THREE.Object3D>;
  /** Body centre height above the feet (pivot for the tumble). */
  readonly centre: number;
  readonly character: LoadedCharacter | null;
  /** Swap the visual character in (keeps the current animation and the outfits). */
  setCharacter(c: LoadedCharacter): void;
  /** Play an animation (cross-fades). `rate` scales playback speed. */
  play(anim: ModelAnim, rate?: number, restart?: boolean): void;
  update(dt: number): void;
  /** Floppy secondary motion drive for the next update (see characters/wobble.ts). */
  readonly wobbleDrive: WobbleDrive;
  /** The current character's wobble layer (null for the fallback robot). */
  readonly wobble: Wobble | null;
}

/** Simple both-channel robot used only when no character model could load. */
function fallbackRobot(): { object: THREE.Group; anchors: Record<AttachPart, THREE.Object3D> } {
  const g = new THREE.Group();
  const light = new THREE.MeshStandardMaterial({ color: 0xeae6dc, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3d434d, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 4, 12), light);
  body.position.y = 0.7;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.5), light);
  head.position.y = 1.4;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.05), dark);
  visor.position.set(0, 1.42, 0.26);
  g.add(body, head, visor);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  const spots: Record<AttachPart, [number, number, number]> = { head: [0, 1.63, 0], face: [0, 1.42, 0.3], back: [0, 0.8, -0.3] };
  const anchors = {} as Record<AttachPart, THREE.Object3D>;
  for (const part of Object.keys(spots) as AttachPart[]) {
    const a = new THREE.Object3D();
    a.position.set(...spots[part]);
    g.add(a);
    anchors[part] = a;
  }
  return { object: g, anchors };
}

export function createPlayerModel(): PlayerModel {
  const root = new THREE.Group();
  root.name = 'player';
  const squash = new THREE.Group();
  const spin = new THREE.Group();
  const centre = PLAYER.height * 0.5;
  spin.position.y = centre;
  root.add(squash);
  squash.add(spin);

  const anchors = {} as Record<AttachPart, THREE.Object3D>;
  for (const part of ['head', 'face', 'back'] as AttachPart[]) {
    const h = new THREE.Group();
    h.name = `outfit-${part}`;
    anchors[part] = h;
  }

  const fallback = fallbackRobot();
  fallback.object.position.y = -centre;
  spin.add(fallback.object);
  for (const part of Object.keys(anchors) as AttachPart[]) fallback.anchors[part].add(anchors[part]);

  let character: LoadedCharacter | null = null;
  let wobble: Wobble | null = null;
  const wobbleDrive: WobbleDrive = { side: 0, up: 0, fwd: 0, yawRate: 0, air: 0, amount: 1, arms: 1 };
  let lastAnim: ModelAnim = 'idle';
  let lastRate = 1;

  return {
    root,
    squash,
    spin,
    anchors,
    centre,
    get character() {
      return character;
    },
    wobbleDrive,
    get wobble() {
      return wobble;
    },
    setCharacter(c) {
      if (c === character) return;
      wobble?.restore();
      if (character) character.object.removeFromParent();
      else fallback.object.removeFromParent();
      character = c;
      c.object.position.set(0, -centre, 0);
      spin.add(c.object);
      for (const part of Object.keys(anchors) as AttachPart[]) c.anchors[part].add(anchors[part]);
      c.play(lastAnim, lastRate, 0);
      c.update(0);
      wobble = createWobble(c.object);
    },
    play(anim, rate = 1, restart = false) {
      lastAnim = anim;
      lastRate = rate;
      character?.play(anim, rate, 0.18, restart);
    },
    update(dt) {
      wobble?.restore();
      character?.update(dt);
      if (wobble && dt > 0) wobble.apply(dt, wobbleDrive);
    },
  };
}
