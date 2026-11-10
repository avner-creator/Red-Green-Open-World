/** Pip's saved flags: only "intro seen" and "tips seen" (localStorage, every access in try/catch). */
export const BUDDY_KEY = 'rgow.buddy.v1';

export interface BuddyFlags {
  intro: boolean;
  tips: string[];
}

export interface BuddyStore {
  readonly flags: Readonly<BuddyFlags>;
  setIntroSeen(): void;
  tipSeen(id: string): boolean;
  markTip(id: string): void;
  /** Forget everything (grown-up profile reset). */
  reset(): void;
}

function load(): BuddyFlags {
  try {
    const raw = localStorage.getItem(BUDDY_KEY);
    if (!raw) return { intro: false, tips: [] };
    const v = JSON.parse(raw) as Partial<BuddyFlags>;
    return {
      intro: v.intro === true,
      tips: Array.isArray(v.tips) ? v.tips.filter((t): t is string => typeof t === 'string').slice(0, 100) : [],
    };
  } catch {
    return { intro: false, tips: [] };
  }
}

export function createBuddyStore(persist = true): BuddyStore {
  const flags = persist ? load() : { intro: false, tips: [] };
  const save = (): void => {
    if (!persist) return;
    try {
      localStorage.setItem(BUDDY_KEY, JSON.stringify(flags));
    } catch {
      /* storage blocked: flags live for this page only */
    }
  };
  return {
    flags,
    setIntroSeen() {
      flags.intro = true;
      save();
    },
    tipSeen(id) {
      return flags.tips.includes(id);
    },
    markTip(id) {
      if (flags.tips.includes(id)) return;
      flags.tips.push(id);
      save();
    },
    reset() {
      flags.intro = false;
      flags.tips.length = 0;
      try {
        localStorage.removeItem(BUDDY_KEY);
      } catch {
        /* ignore */
      }
    },
  };
}
