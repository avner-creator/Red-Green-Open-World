/** The Gear Shack kiosk: an E prompt on the counter side that asks the UI to open the shop. */
import * as THREE from 'three';
import type { GameContext } from '../../types';

/** How far in front of the kiosk (counter side) the prompt floats, metres. */
const COUNTER_OFFSET = 1.2;
/** Prompt height above the ground, about chest height. */
const PROMPT_HEIGHT = 1.2;
const PROMPT_RADIUS = 2.6;

/** Prompt position: the anchor, pushed out along +Z of its yaw. */
export function kioskPromptPosition(anchor: { position: THREE.Vector3; yaw: number }, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(
    anchor.position.x + Math.sin(anchor.yaw) * COUNTER_OFFSET,
    anchor.position.y + PROMPT_HEIGHT,
    anchor.position.z + Math.cos(anchor.yaw) * COUNTER_OFFSET,
  );
}

export function createKiosk(ctx: GameContext): { dispose(): void } {
  const anchor = ctx.world.anchors.gearShack;
  const pos = kioskPromptPosition(anchor);
  const off = ctx.interactions.add({
    id: 'gearShack',
    position: () => pos,
    radius: PROMPT_RADIUS,
    icon: 'shop',
    enabled: () => ctx.session.state.phase === 'playing' && ctx.player.mode === 'walk',
    onUse: () => ctx.events.emit('shop:open', {}),
  });
  return { dispose: off };
}
