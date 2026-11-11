/** Items the child has already seen in the dressing room (for the HUD "new!" badge). localStorage, try/catch. */
const KEY = 'rg-wardrobe-seen-v1';

export interface SeenStore {
  readonly ids: ReadonlySet<string>;
  add(ids: readonly string[]): void;
  clear(): void;
}

export function createSeenStore(): SeenStore {
  const ids = new Set<string>();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (Array.isArray(raw)) for (const v of raw) if (typeof v === 'string') ids.add(v);
  } catch {
    /* no storage: start empty */
  }
  const save = (): void => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...ids]));
    } catch {
      /* ignore */
    }
  };
  return {
    ids,
    add(list) {
      let changed = false;
      for (const id of list) {
        if (!ids.has(id)) {
          ids.add(id);
          changed = true;
        }
      }
      if (changed) save();
    },
    clear() {
      ids.clear();
      save();
    },
  };
}
