# Stream C — economy, shop and missions (branch `agent/economy`)

Status: **ready to merge** (see §6 for the last verify numbers).

Scope: items 1–4 of the "Fun and motivation pass" in `docs/GAME_DESIGN.md`: gems as money with a
persistent wallet, mega gems, combo streaks, respawning gems, the Gear Shack kiosk and shop, the
wardrobe in the pause menu, ride tickets and three wordless mission cards per session.

Not in scope (other streams): character select, trampoline/pads/rocket-pad physics, wayfinding,
music, touch controls.

## 0. What was built (short)

| Thing | Where | Notes |
|---|---|---|
| Saved profile (wallet, owned, equipped, best combo) | `src/profile.ts` | localStorage key `rgow.profile.v1`, every access in try/catch, loaded data is sanitised. `ctx.profile`. |
| Economy rules: catalog, buy, equip, tickets | `src/activities/economy/rules.ts`, `index.ts` | `ctx.economy`. Pure rules with unit tests. |
| Gems are money, combo ×2…×5 | `src/activities/economy/combo.ts`, `src/activities/gems.ts` | Pickup pays `value × combo`. 3 s window. The combo timer only runs while playing. |
| Mega gems (13, worth 5) | `src/activities/economy/megaSpots.ts`, `gems.ts` | Weak-eye-only, spiky star-burst about 2× the size of a gem. On the real thrill lines: trampoline peaks (15/30/45 m), bounce-pad arcs, rocket arc, the road by the garage, the skydive descent. |
| Respawn | `src/activities/gemLogic.ts` | 45 s after pickup, pop-in drawn on the weak-eye layer. |
| Missions (3 per session + jackpot) | `src/activities/economy/missions.ts` | Pool: collect 10 gems (5), 2 mega gems (8), ×3 combo (5), bounce 30 m (8), open a chest (10), 5 gems while driving (8), 3 stars (6), land in 3 rings (10). Jackpot 15. Fixed draw in test mode. |
| Tickets | `rules.ts`, one line in `src/activities/skydive/index.ts`, `setLaunchGate` from `src/activities/rocket.ts` | Balloon 5 gems, first ride per session free. Rocket pads 3. A denied ticket never starts the ride and shows a friendly toast. |
| Gear: 9 outfits, 4 buggy paints, 3 trails, 3 emotes, 6 chest-only items | `src/activities/gear/` | One applier dresses the player and the buggy from the profile; items persist between sessions. Emotes play on G (keyboard), a gamepad button and a touch button. Each item has a lazily rendered preview picture. |
| Chests | `src/activities/chests/index.ts` | Opening a chest unlocks its outfit in the profile and equips it through the same applier. Old events still fire. |
| Gear Shack kiosk | `src/world/gear-shack.ts`, anchor `gearShack` in `src/world/layout.ts` | East edge of the plaza (x 14, z 2), about 6.2k triangles, a test keeps it 2.5 m clear of the walking lines from spawn. E at the counter emits `shop:open`. |
| UI | `src/ui/shop.ts`, `hudEcon.ts`, `wallet.ts`, `econ.ts`, `cssEcon.ts`, `itemArt.ts` | Wallet (replaces the old "n/total" counter), "+N" pops at the wallet, combo badge, mission cards, ticket toasts, shop, wardrobe (pause menu), unlock celebration, end-screen additions, wallet chip on the title, profile reset in grown-up settings (hold 3 s), touch layout. |

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
  /** Optional picture of the item for shop cards: returns an image URL (may be a `data:` URL, may render lazily on first call), or null if there is none. */
  preview?(): string | null;
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
  session" (it keeps rising when gems respawn); `total` stays "number of gem spots" (normal + mega).
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
  `spent?: number`. Wallet changes with reason `'test'` (also used by `profile.reset()`) are not
  counted.
- `IconName` gets: `'megaGem' | 'combo' | 'shop' | 'ticket' | 'mission' | 'trail' | 'emote' | 'backpack' | 'character' | 'jackpot' | 'wallet'`.
- `AnchorName` gets: `'gearShack'` (the kiosk on the plaza; `+Z` of its yaw is the counter side
  where the player stands).
- `GameContext` gets `profile: ProfileApi` and `economy: EconomyApi`.
- No new `SfxName`. The UI plays `'fanfare'` (purchase, jackpot), `'star'` (mission done) and
  `'bump'` (denied ticket, item too expensive). Gem and combo sounds come from main's audio on
  `gem:collected`; the economy code plays none.

### 1.3 Other shared files

- `src/config.ts` (appended): `PROFILE_KEY = 'rgow.profile.v1'` and
  `ECONOMY = { gemValue: 1, megaGemValue: 5, comboWindow: 3, comboMax: 5, respawnSeconds: 45, balloonTicket: 5, rocketPadTicket: 3, freeBalloonRides: 1, missionsPerSession: 3, jackpot: 15 }`.
- `src/main.ts` (7 added lines): `ctx.profile = createProfile(events)` right after `ctx` is made;
  `ctx.economy = createEconomy(ctx)` just before `createActivities(ctx)`; `economy.update(dt)`
  before `activities.update(dt)`; `ctx.profile.noteSession()` in the title → playing handler.
- `src/session.ts`: the optional counters (four listeners, reset in `start()`).
- `src/activities/skydive/index.ts` (main's file, 1 added line in the balloon's `onUse`, after
  its busy/parked guard): `if (!ctx.economy.payTicket('balloon')) return;`
- `src/activities/index.ts`: gear system created, updated and disposed next to the others.
- `src/ui/wayfinding*.ts`, `src/ui/controlMap.ts` (main's files): small layout/selector changes so
  the economy HUD, the pause menu and the emote control fit (listed in the commits of
  `agent/economy-ui`).

### 1.4 Who owns what in this stream

| Area | Owner | Files |
|---|---|---|
| Shared types, boot, config, profile, session counters | integrator | `src/types.ts`, `src/main.ts`, `src/config.ts`, `src/profile.ts`, `src/session.ts` |
| Economy rules: combo, wallet credit, tickets, missions, catalog, buy; gem values, mega gems, respawn; kiosk interaction | activities-designer (economy) | `src/activities/economy/`, `src/activities/gems.ts`, `src/activities/gemLogic.ts` |
| Things to wear: outfits, paints, trails, emotes, previews, and putting equipped items on the player and buggy | activities-designer (gear) | `src/activities/gear/`, `src/activities/chests/` |
| Wallet HUD, combo, mission cards, shop, wardrobe, unlock moment, end screen, profile reset | ui-designer | `src/ui/` |
| Kiosk model and the `gearShack` anchor | world-artist | `src/world/gear-shack.ts`, `src/world/layout.ts` |

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

- "Rebase on `origin/main`" was done as `git merge origin/main` into `agent/economy`. Reason: the
  branch is pushed with plain pushes (no force), and a rebase would need a force push.
- Stream decisions are logged here, not in `docs/DECISIONS.md`/`docs/PROGRESS.md`/`docs/HANDOFF.md`,
  so the branch merges into `main` without doc conflicts.
- Opening the shop pauses the session timer. Reason: browsing must not eat a child's five minutes.
- The combo multiplies mega gems too (a mega at ×5 pays 25). Reason: it is the most exciting
  moment in the loop; QA's estimate shows prices still hold (first buy in the first minute, the
  top item at 90 gems takes a few sessions).
- Items the child cannot afford yet stay in full colour in the shop; only the price chip shows
  "not yet" (dark chip, lock, "+N" missing). Reason: the child must see the crown to want it.
- Real preview pictures are rendered lazily by a small offscreen renderer, one per frame, never
  at boot; under `?test=1` they are off unless a test calls `__rgGear.enablePreviews(true)`.
  Reason: the first render costs about 10 s on the software renderer.
- The kiosk yields to the paths: a unit test keeps it 2.5 m clear of every walking line from
  spawn. Reason: its first spot blocked the walk to the park road (caught by main's e2e).
- Emotes use an `ExternalController` for about 2 s; any move or jump input cancels them.
- No rocket-ride mission: it would need a new `MissionKind`; add one later if wanted.

## 3. For the main orchestrator: merging and wiring

- **Merge**: `agent/economy` already contains `origin/main` as of its last merge (see §6). Merge
  with `git merge origin/agent/economy`. Expect at most a small conflict in
  `src/activities/index.ts` or `src/ui/index.ts` if main changed them since (keep both sides).
- **Characters in the shop** (main's character wiring): register the characters once at boot and
  the shop shows a "character" tab by itself:
  ```ts
  ctx.economy.registerItems(CHARACTERS.map((c) => ({
    id: c.id, category: 'character', slot: 'character', name: c.name, icon: 'character',
    price: c.price, // 0 = free starter: owned at once
    preview: () => c.portraitUrl ?? null, // optional
  })));
  // Which character is worn: ctx.profile.equipped('character'); changes arrive as
  // 'item:equipped' with slot 'character' (also fired by the shop and the wardrobe).
  ```
  The character select screen can use `ctx.economy.buy(id)` / `ctx.economy.equip('character', id)`
  and `ctx.profile.owns(id)`.
- **Tickets for a new paid ride**: put `if (!ctx.economy.payTicket(kind)) return;` at the point
  where the ride really starts (after "busy" checks). A new ride kind needs a new `TicketKind`
  member and a price in `ECONOMY`.
- **Known, not changed here** (main's code): the `gem:near` screen-edge glow in `src/ui/hud.ts`
  is both-eye, so the strong eye can tell that a gem is within `GEMS.nearRadius` (no direction).
  QA flagged it against CLAUDE.md rule 6; consider making it audio-only.
- **E2e time**: this stream adds `economy.spec.ts` (~14 s), `economy-secrecy.spec.ts` (~25 s),
  `gear.spec.ts` (~19 s) and `shop.spec.ts` (~45–70 s including a touch test). The whole suite is
  about 8 minutes on the software renderer (main's touch spec alone is ~90 s).

## 4. How to test

- `npm run verify` (typecheck, lint, unit, build, e2e).
- Only this stream: `npx vitest run tests/unit/profile.test.ts tests/activities tests/ui/econ.test.ts tests/world/gear-shack.test.ts`
  and `npx playwright test economy gear shop`.
- By hand (`npm run dev`): Play → pick up gems (wallet, "+N", combo badge) → walk to the striped
  stall on the east side of the plaza → E → buy a hat → Esc → pause → wardrobe → balloon (first
  ride free, second costs 5) → rocket pads by Bouncy Park (3) → finish the three mission cards →
  end screen → Play again (wallet and outfit kept) → reload (still kept) → grown-up settings →
  Game → hold "reset profile".
- Test hooks under `?test=1`: `__rg.ctx.profile.earn(200, 'test')`, `__rg.ctx.economy.buy(id)`,
  `__rgEconomy` (`megaSpots`, `gemSpotCount`, `forceRespawn()`), `__rgGear` (`attached()`,
  `carColor()`, `trail()`, `particles()`, `ribbonSamples()`, `emote()`, `playEmote()`,
  `enablePreviews(on)`).

## 5. QA result (independent qa-playtester, on the merged branch)

- **Blockers: none.**
- Weak-eye secrecy: normal gems, halos, pickup bursts, mega bursts and the respawn pop-in change
  only the weak channel in all 4 lens/eye combinations (strong and blue max difference 0). "+N"
  pops, toasts and mission effects appear only at HUD elements.
- Playthrough, exploits (double buy, buying while poor, unowned equip, NaN/negative amounts,
  corrupt or throwing storage), persistence across sessions and reloads, and the grown-up reset
  all passed. With 0 gems nothing soft-locks.
- Fixed after QA: emotes on gamepad and touch plus the controls card; distinct emote pictures;
  shop paints distinct in each channel alone; stronger single-channel contrast on sparkle and
  bubble trails; combo badge placement; Gear Shack on the compass; stricter profile sanitising.
- Left as is (minor): pressing E at the balloon during a 2 s emote does nothing; the first real
  preview pictures take a moment to appear on slow GPUs (icons show until then).

## 6. Last verify

See the last commit message of this file for the date and numbers of the final `npm run verify`.
