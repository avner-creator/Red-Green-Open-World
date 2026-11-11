/**
 * Camera convention (CLAUDE.md, `src/core/camera-occluders.ts`): only static world scenery blocks
 * the chase camera render-side. Every object this stream attaches through an env (the six
 * mini-games and the weave parts) opts out with `userData.cameraIgnore = true`:
 *  - weak-/strong-eye layer objects must never move the camera (that would reveal them to the
 *    other eye);
 *  - the both-eye props are small (buttons, bowl, toys, prints' glyphs), animated (gift-box lids,
 *    toys, confetti, sparkle) or solid with their own static physics collider (pedestals and
 *    panels, arches and sign, dot sign and pedestal, glow jar, Pip's basket, the shack board and
 *    gift boxes): the collider is what keeps the camera out of them, so none of their render
 *    meshes needs to be an occluder.
 * The six pictogram boards (`./board.ts`, added to the scene directly, never on a layer) are static
 * and solid with box colliders too; they carry no flag (not world scenery, so not an occluder).
 */
import type * as THREE from 'three';

export function cameraSafe<T extends THREE.Object3D>(object: T): T {
  object.userData.cameraIgnore = true;
  return object;
}
