/**
 * "E" prompts: the nearest enabled Interactable within its radius is focused (emits
 * `interact:focus` on change); `usePressed` calls its `onUse()`. Only on foot.
 */
import * as THREE from 'three';
import type { GameContext, Interactable, InteractionApi } from '../types';

export interface InteractionsInternal {
  api: InteractionApi;
  update(dt: number): void;
}

/** Nearest enabled target whose radius contains `from` (pure; exported for tests). */
export function pickFocus(targets: Iterable<Interactable>, from: THREE.Vector3): Interactable | null {
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (const t of targets) {
    if (t.enabled && !t.enabled()) continue;
    const d = t.position().distanceTo(from);
    if (d <= t.radius && d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

export function createInteractions(ctx: GameContext): InteractionsInternal {
  const targets = new Set<Interactable>();
  let focused: Interactable | null = null;
  const probe = new THREE.Vector3();

  const setFocus = (t: Interactable | null): void => {
    if (t === focused) return;
    focused = t;
    ctx.events.emit('interact:focus', { target: t });
  };

  return {
    api: {
      add(t) {
        targets.add(t);
        return () => {
          targets.delete(t);
          if (focused === t) setFocus(null);
        };
      },
      get focused() {
        return focused;
      },
    },
    update() {
      const p = ctx.player;
      const active = ctx.session.state.phase === 'playing' && p.mode === 'walk';
      probe.copy(p.position).setY(p.position.y + 0.9);
      setFocus(active ? pickFocus(targets, probe) : null);
      if (focused && ctx.input.state.usePressed) {
        const t = focused;
        try {
          t.onUse();
        } catch (err) {
          console.error(`interactable ${t.id} failed`, err);
        }
      }
    },
  };
}
