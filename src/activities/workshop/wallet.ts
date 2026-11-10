/**
 * Gems as money for the buggy workshop and race, coded defensively against the economy stream:
 * when `ctx.profile` exists (Stream C), the saved wallet and owned items are used; until then a
 * session wallet (gems collected this session − gems spent here) and localStorage stand in.
 */
import type { GameContext } from '../../types';

/** The part of the economy's ProfileApi this stream uses (structural, so main builds without it). */
export interface ProfileLike {
  readonly wallet: number;
  earn(amount: number, reason: string): void;
  spend(amount: number, reason: string): boolean;
  owns(itemId: string): boolean;
  unlock(itemId: string, source: string): boolean;
}

export interface Wallet {
  /** Gems available to spend now. */
  readonly gems: number;
  /** Take gems if there are enough (false and no change otherwise). */
  spend(amount: number, reason: 'shop' | 'ticket'): boolean;
  /** Prize gems. */
  earn(amount: number): void;
  owns(itemId: string): boolean;
  unlock(itemId: string): void;
  /** Saved list of fitted items (per device). */
  fitted(): string[];
  setFitted(ids: readonly string[]): void;
}

const STORE_KEY = 'rg.buggyWorkshop.v1';

interface Stored {
  owned: string[];
  fitted: string[];
}

function load(): Stored {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<Stored>;
      return { owned: Array.isArray(d.owned) ? d.owned.filter((x) => typeof x === 'string') : [], fitted: Array.isArray(d.fitted) ? d.fitted.filter((x) => typeof x === 'string') : [] };
    }
  } catch {
    /* storage blocked or corrupt: start empty */
  }
  return { owned: [], fitted: [] };
}

function save(d: Stored): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
  } catch {
    /* storage blocked: keep it for this page only */
  }
}

export function profileOf(ctx: GameContext): ProfileLike | null {
  const p = (ctx as unknown as { profile?: ProfileLike }).profile;
  return p && typeof p.spend === 'function' && typeof p.earn === 'function' ? p : null;
}

let shared: Wallet | null = null;
let sharedCtx: GameContext | null = null;

/** One wallet per game (workshop and race share it). */
export function getWallet(ctx: GameContext): Wallet {
  if (shared && sharedCtx === ctx) return shared;
  const data = load();
  // Session wallet (no economy yet): what you collected this session, minus what you spent here.
  let spent = 0;
  let earned = 0;
  ctx.events.on('session:phase', (e) => {
    if (e.phase === 'playing' && e.previous === 'title') spent = earned = 0;
  });
  const wallet: Wallet = {
    get gems() {
      const p = profileOf(ctx);
      return p ? p.wallet : Math.max(0, ctx.session.state.gems + earned - spent);
    },
    spend(amount, reason) {
      if (amount <= 0) return true;
      const p = profileOf(ctx);
      if (p) return p.spend(amount, reason);
      if (wallet.gems < amount) return false;
      spent += amount;
      return true;
    },
    earn(amount) {
      if (amount <= 0) return;
      const p = profileOf(ctx);
      if (p) p.earn(amount, 'mission');
      else earned += amount;
    },
    owns(id) {
      const p = profileOf(ctx);
      return (p ? p.owns(id) : false) || data.owned.includes(id);
    },
    unlock(id) {
      const p = profileOf(ctx);
      if (p) p.unlock(id, 'shop');
      if (!data.owned.includes(id)) data.owned.push(id);
      save(data);
    },
    fitted: () => [...data.fitted],
    setFitted(ids) {
      data.fitted = [...ids];
      save(data);
    },
  };
  shared = wallet;
  sharedCtx = ctx;
  return wallet;
}
