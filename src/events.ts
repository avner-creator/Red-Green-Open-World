import type { EventBus, GameEvents } from './types';

type Handler = (e: never) => void;

export function createEventBus(): EventBus {
  const handlers = new Map<keyof GameEvents, Set<Handler>>();
  return {
    on(type, handler) {
      let set = handlers.get(type);
      if (!set) handlers.set(type, (set = new Set()));
      set.add(handler as Handler);
      return () => set.delete(handler as Handler);
    },
    emit(type, event) {
      const set = handlers.get(type);
      if (!set) return;
      for (const h of [...set]) {
        try {
          (h as (e: typeof event) => void)(event);
        } catch (err) {
          console.error(`event handler for ${type} failed`, err);
        }
      }
    },
  };
}
