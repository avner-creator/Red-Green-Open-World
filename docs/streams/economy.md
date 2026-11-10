# Stream C — economy, shop and missions (branch `agent/economy`)

Status: **in progress** (this file is finished at the end; section 1 is the contract every
worker of this stream codes against).

Scope: items 1–4 of the "Fun and motivation pass" in `docs/GAME_DESIGN.md`: gems as money with a
persistent wallet, mega gems, combo streaks, respawning gems, the Gear Shack kiosk and shop, the
wardrobe in the pause menu, ride tickets and three wordless mission cards per session.

Not in scope (other streams): character select, trampoline/pads/rocket-pad physics, wayfinding,
music, touch controls.

## 1. Contract (interface additions; all additive)

Everything below is **added**. Nothing in `src/types.ts` is renamed or removed.

### 1.1 New types in `src/types.ts`

```ts
// ───────────── Economy (stream C) ─────────────
export type EquipSlot = OutfitSlot | 'trail' | 'emote' | 'character';
export type ShopCategory = 'character' | 'outfit' | 'paint' | 'trail' | 'emote';
export type WalletReason = 'gem' | 'mission' | 'jackpot' | 'shop' | 'ticket' | 'test';
export type UnlockSource = 'shop' | 'chest' | 'starter';
export type TicketKind = 'balloon' | 'rocketPad';
export type BuyResult = 'ok' | 'owned' | 'tooPoor' | 'notForSale' | 'unknown';
export type MissionKind =
  | 'collectGems' | 'megaGems' | 'combo' | 'bounceHeight' | 'openChest' | 'driveGems' | 'landRings' | 'stars';

export interface ShopItem {
  id: string;
  category: ShopCategory;
  slot: EquipSlot;
  /** Short name, shown small. The icon and the preview are what matter. */
  name: string;
  icon: IconName;
  /** Price in gems (5..100). 0 = free starter item (owned from the start). */
  price: number;
  /** Only given by treasure chests: never sold; shown with a chest badge until owned. */
  chestOnly?: boolean;
  /** Optional CSS colour for the shop card preview (paints, trails). */
  swatch?: string;
}

export interface ProfileData {
  version: 1;
  /** Gems the player can spend. Kept between sessions. */
  wallet: number;
  /** Every gem ever earned (never goes down). */
  lifetimeGems: number;
  /** Ids of owned shop items (starter items included). */
  owned: string[];
  equipped: Partial<Record<EquipSlot, string>>;
  /** Sessions started. */
  sessions: number;
  bestCombo: number;
}

/** The player's saved profile (localStorage, wrapped in try/catch). Implemented in `src/profile.ts`. */
export interface ProfileApi {
  readonly data: Readonly<ProfileData>;
  readonly wallet: number;
  /** Add gems (amount > 0). Emits `wallet:changed`. */
  earn(amount: number, reason: WalletReason): void;
  /** Take gems if the wallet has enough; returns false (and changes nothing) if not. Emits `wallet:changed`. */
  spend(amount: number, reason: WalletReason): boolean;
  owns(itemId: string): boolean;
  /** Mark an item as owned. Returns true if it was new (then emits `item:unlocked`). */
  unlock(itemId: string, source: UnlockSource): boolean;
  /** Save what is worn in a slot (null = nothing). Emits `item:equipped`. Does not check ownership. */
  equip(slot: EquipSlot, itemId: string | null): void;
  equipped(slot: EquipSlot): string | null;
  /** Record a new best combo if higher. */
  noteCombo(multiplier: number): void;
  /** Count a started session. */
  noteSession(): void;
  /** Wipe the profile (grown-up settings). Emits `profile:reset`, `wallet:changed` and `item:equipped` (null) for every slot that was set. */
  reset(): void;
}

export interface Mission {
  id: string;
  kind: MissionKind;
  icon: IconName;
  /** The number shown on the card ("10 gems", "30 m"). */
  target: number;
  /** Gem bonus paid when done. */
  reward: number;
}
export interface MissionState extends Mission {
  progress: number;
  done: boolean;
}

/** Gems as money: shop, tickets, combo and missions. Implemented in `src/activities/economy/`. */
export interface EconomyApi {
  /** Everything the shop can show (registered items, in registration order). */
  readonly catalog: readonly ShopItem[];
  item(id: string): ShopItem | undefined;
  /** Add items to the catalog (gear, and later the characters from the main build). Starter items (price 0) become owned. Ignores ids already registered. */
  registerItems(items: readonly ShopItem[]): void;
  /** Pay, unlock and equip in one go. Emits `shop:purchased` on 'ok'. */
  buy(itemId: string): BuyResult;
  /** Wear an owned item (or null to take the slot off). Returns false if not owned/unknown. */
  equip(slot: EquipSlot, itemId: string | null): boolean;
  /** What the next ride costs right now (0 = free, e.g. the first balloon ride of a session). */
  ticketPrice(kind: TicketKind): number;
  /** Call when the player starts a ride. true = go (paid or free; emits `ticket:paid`). false = not enough gems (emits `ticket:denied`; the ride must not start). */
  payTicket(kind: TicketKind): boolean;
  /** This session's three missions (empty on the title screen before the first session). */
  readonly missions: readonly MissionState[];
  /** Current streak. multiplier 1 = no combo. timeLeft = seconds before it drops. */
  readonly combo: Readonly<{ multiplier: number; streak: number; timeLeft: number }>;
}
```

### 1.2 Changes to existing types (additive only)

- `GameEvents['gem:collected']` gets optional fields:
  `value?: number` (1 or 5), `mega?: boolean`, `combo?: number` (multiplier used, 1..5),
  `gain?: number` (`value × combo`, what went into the wallet). `count` stays "gems picked up this
  session" (it keeps rising when gems respawn); `total` stays "number of gem spots".
- New `GameEvents`:
  - `'wallet:changed': { wallet: number; delta: number; reason: WalletReason }`
  - `'gem:respawned': { id: string }`
  - `'combo:changed': { multiplier: number; streak: number }`
  - `'shop:open': Record<string, never>` (the player used the kiosk; the UI opens the shop)
  - `'shop:purchased': { itemId: string; price: number }`
  - `'item:unlocked': { itemId: string; source: UnlockSource }`
  - `'item:equipped': { slot: EquipSlot; itemId: string | null }`
  - `'emote:play': { itemId?: string }` (ask for the equipped emote, or a given one, to play)
  - `'ticket:paid': { kind: TicketKind; price: number; free: boolean }`
  - `'ticket:denied': { kind: TicketKind; price: number; wallet: number }`
  - `'mission:progress': { index: number; mission: MissionState }`
  - `'mission:completed': { index: number; mission: MissionState }`
  - `'mission:jackpot': { reward: number }`
  - `'profile:reset': Record<string, never>`
- `SessionState` gets optional counters, reset by `session.start()` and kept up to date in
  `src/session.ts` from the events above: `earned?: number` (gems put in the wallet this session,
  bonuses included), `bestCombo?: number`, `megaGems?: number`, `missionsDone?: number`,
  `spent?: number`.
- `IconName` gets: `'megaGem' | 'combo' | 'shop' | 'ticket' | 'mission' | 'trail' | 'emote' | 'backpack' | 'character' | 'jackpot' | 'wallet'`.
- `AnchorName` gets: `'gearShack'` (the kiosk on the plaza; `+Z` of its yaw is the counter side
  where the player stands).
- `GameContext` gets `profile: ProfileApi` (created in `main.ts` right after `session`) and
  `economy: EconomyApi` (created in `main.ts` just before `createActivities`).
- No new `SfxName`: combo chimes use `audio.play('gem', { pitch })`; buying/jackpot use
  `'fanfare'`; a finished mission uses `'star'`; "not enough gems" uses `'bump'`.

### 1.3 Constants in `src/config.ts`

```ts
export const PROFILE_KEY = 'rgow.profile.v1';
export const ECONOMY = {
  gemValue: 1,
  megaGemValue: 5,
  comboWindow: 3,          // seconds between pickups that keep a streak alive
  comboMax: 5,             // ×5 cap
  respawnSeconds: 45,
  balloonTicket: 5,
  rocketPadTicket: 3,
  freeBalloonRides: 1,     // per session
  missionsPerSession: 3,
  jackpot: 15,             // bonus for finishing all three missions
} as const;
```

### 1.4 Who owns what in this stream

| Area | Owner | Files |
|---|---|---|
| Shared types, boot, config, profile, session counters | integrator | `src/types.ts`, `src/main.ts`, `src/config.ts`, `src/profile.ts`, `src/session.ts` |
| Economy rules: combo, wallet credit, tickets, missions, catalog, buy; gem values, mega gems, respawn; kiosk interaction | activities-designer (economy) | `src/activities/economy/`, `src/activities/gems.ts`, `src/activities/gemLogic.ts`, `src/activities/index.ts` |
| Things to wear: new outfits, paints, trails, emotes, and putting equipped items on the player and buggy | activities-designer (gear) | `src/activities/gear/`, `src/activities/chests/` |
| Wallet HUD, combo, mission cards, shop, wardrobe, unlock moment, end screen, profile reset | ui-designer | `src/ui/` |
| Kiosk model and the `gearShack` anchor | world-artist | `src/world/` |

### 1.5 Rules that apply to all of it

- Gems and mega gems are **weak-eye-only**. Nothing both-eye (HUD, toast, particle, DOM label
  placed at a world position, trail, marker) may show where an uncollected gem is. "+N" feedback
  pops at the wallet counter on the HUD, never at the gem's place in the world.
- Everything both-eye (kiosk, trails, outfits, shop UI) must read in the R channel alone and in
  the G channel alone: brightness contrast, never hue alone.
- No health or therapy wording. No violence. No reading needed: icons and numbers.
- Nothing can soft-lock: with 0 gems every free attraction still works, and a denied ticket just
  shows a friendly "need N gems" icon toast.

## 2. Decisions made in this stream

- "Rebase on `origin/main`" is done as `git merge origin/main` into `agent/economy`. Reason: the
  branch is pushed with plain pushes (no force), and a rebase would need a force push.
- Stream decisions are logged here, not in `docs/DECISIONS.md`/`docs/PROGRESS.md`/`docs/HANDOFF.md`,
  so the branch merges into `main` without doc conflicts.
- Opening the shop pauses the session timer (the shop is a menu on top of the paused state).
  Reason: browsing must not eat a child's five minutes.
