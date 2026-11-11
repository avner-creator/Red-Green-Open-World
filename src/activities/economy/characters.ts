/**
 * Characters are bought with gems. The six heroes are shop items (`category: 'character'`,
 * `slot: 'character'`, price from the character catalog; price 0 = starter). The character
 * select talks to the same wallet through `setCharacterAccess`.
 *
 * Which hero plays: the profile's `equipped.character` is the one source of truth. It is plugged
 * into the select screen's `loadPick`/`savePick` (`setPickStore`), and the old standalone key
 * `rgow.character.v1` is migrated into the profile once, then removed. Details:
 * - equipping a character (shop, wardrobe, or the buy in the select screen) switches to it and
 *   saves the pick;
 * - a Go on the select screen saves the pick; it is copied into the profile when play starts or
 *   resumes (the select only previews other heroes, so `player:character` is not mirrored);
 * - after a profile reset, paid heroes are locked again and a hero that is no longer owned is
 *   swapped for the default free one.
 */
import { CHARACTERS, DEFAULT_CHARACTER } from '../../core/characters/catalog';
import { POWER_KEY, setPowerStore } from '../../core/skills-powers';
import type { PowerStore } from '../../core/skills-powers';
import { setCharacterAccess } from '../../ui/characterAccess';
import { clearLegacyPick, legacyPickStore, loadPick, savePick, setPickStore } from '../../ui/characterLogic';
import type { EconomyApi, GameContext, ShopItem } from '../../types';

export const CHARACTER_ITEMS: readonly ShopItem[] = CHARACTERS.map((c) => ({
  id: c.id,
  category: 'character',
  slot: 'character',
  name: c.name,
  icon: 'character',
  price: Math.max(0, c.price),
  swatch: c.cardColors[0],
}));

/** Per-hero power picks <-> the profile's 'power' slot (`hero:power,hero:power`). */
export function encodePowers(all: Record<string, string>): string | null {
  const ok = /^[A-Za-z0-9_-]+$/;
  const pairs = Object.entries(all).filter(([h, p]) => ok.test(h) && ok.test(p)).map(([h, p]) => `${h}:${p}`);
  return pairs.length ? pairs.join(',') : null;
}
export function decodePowers(v: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (v ?? '').split(',')) {
    const [h, p] = pair.split(':');
    if (h && p) out[h] = p;
  }
  return out;
}

/** The old standalone key, read once for the migration (then removed). */
function takeLegacyPowers(): Record<string, string> {
  try {
    const raw = localStorage.getItem(POWER_KEY);
    if (raw === null) return {};
    localStorage.removeItem(POWER_KEY);
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

const isCharacter = (id: string | null): id is string => !!id && CHARACTERS.some((c) => c.id === id);

/** Register the heroes, plug in the wallet and keep pick, player and profile in step. Returns an unsubscriber. */
export function wireCharacters(ctx: GameContext, economy: EconomyApi): () => void {
  const { profile, events } = ctx;
  economy.registerItems(CHARACTER_ITEMS);

  setCharacterAccess({
    owns: (id) => profile.owns(id),
    canAfford: (id) => {
      const it = economy.item(id);
      return !!it && !profile.owns(id) && !it.chestOnly && profile.wallet >= it.price;
    },
    buy: (id) => economy.buy(id) === 'ok' || profile.owns(id),
    wallet: () => profile.wallet,
  });

  /** Make the profile name an owned hero (the pick if owned, else the default). */
  const ensureOwned = (preferred: string | null): void => {
    const want = isCharacter(preferred) && profile.owns(preferred) ? preferred : DEFAULT_CHARACTER;
    if (loadPick() !== want) savePick(want);
    if (profile.equipped('character') !== want) profile.equip('character', want);
  };

  // One source of truth: migrate the old key into the profile once, then read/write the profile.
  const legacy = legacyPickStore.load();
  if (!isCharacter(profile.equipped('character')) && isCharacter(legacy) && profile.owns(legacy)) profile.equip('character', legacy);
  clearLegacyPick();
  setPickStore({ load: () => profile.equipped('character'), save: (id) => profile.equip('character', id) });

  // Super power picks live in the profile too ('power' slot); the old key is migrated once.
  const legacyPowers = takeLegacyPowers();
  if (!profile.equipped('power') && Object.keys(legacyPowers).length) profile.equip('power', encodePowers(legacyPowers));
  const powerStore: PowerStore = {
    load: () => decodePowers(profile.equipped('power')),
    save: (all) => {
      const v = encodePowers(all);
      if (v !== profile.equipped('power')) profile.equip('power', v);
    },
  };
  setPowerStore(powerStore);

  // At boot (before the UI puts the remembered hero in the world): never start as a locked hero.
  ensureOwned(profile.equipped('character'));

  const offs = [
    events.on('item:equipped', (e) => {
      // Picks changed from outside (reset, tests): drop the power cache so it re-reads the profile.
      if (e.slot === 'power') setPowerStore(powerStore);
      if (e.slot !== 'character') return;
      if (e.itemId === null) {
        // A hero cannot be taken off: keep the current one (or the default once it is not owned).
        ensureOwned(ctx.player.characterId);
        return;
      }
      if (!isCharacter(e.itemId)) return;
      if (loadPick() !== e.itemId) savePick(e.itemId);
      if (ctx.player.characterId !== e.itemId) void ctx.player.setCharacter(e.itemId);
    }),
    events.on('profile:reset', () => {
      ensureOwned(ctx.player.characterId);
      if (ctx.player.characterId !== profile.equipped('character')) void ctx.player.setCharacter(profile.equipped('character') ?? DEFAULT_CHARACTER);
    }),
    // A Go on the select screen saved a pick: mirror it into the profile when play (re)starts.
    events.on('session:phase', (e) => {
      if (e.phase !== 'playing') return;
      const p = loadPick();
      if (isCharacter(p) && profile.owns(p) && profile.equipped('character') !== p) profile.equip('character', p);
    }),
  ];
  return () => {
    for (const off of offs) off();
    setPickStore(null);
    setPowerStore(null);
  };
}
