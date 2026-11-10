import { describe, expect, it } from 'vitest';
import { OUTFITS, PAINT_COLORS } from '../../src/activities/chests/outfits';
import { CHEST_GEAR, GEAR_CATALOG, GEAR_PAINTS, SHOP_GEAR, emoteKind, paintColor, trailKind } from '../../src/activities/gear/catalog';
import { EMOTES, canStartEmote, emoteCancelled } from '../../src/activities/gear/emoteLogic';
import { emptyLook, isLookSlot, lookChanges, readLook } from '../../src/activities/gear/look';
import { MAX_TRAIL_PARTICLES, RAINBOW_LANES, RIBBON, RibbonHistory, TRAIL_SPECS, TrailEmitter, channel, ribbonFade } from '../../src/activities/gear/trailLogic';
import { withPreviews } from '../../src/activities/gear/previews';
import { createEconomyRules } from '../../src/activities/economy/rules';
import { createProfile } from '../../src/profile';
import type { EventBus, GameEvents } from '../../src/types';

function bus(): EventBus {
  const handlers = new Map<string, Array<(e: never) => void>>();
  return {
    on(type, h) {
      const list = handlers.get(type) ?? [];
      list.push(h as (e: never) => void);
      handlers.set(type, list);
      return () => undefined;
    },
    emit<K extends keyof GameEvents>(type: K, e: GameEvents[K]) {
      for (const h of handlers.get(type) ?? []) h(e as never);
    },
  };
}

const rg = (hex: number): [number, number] => [(hex >> 16) & 255, (hex >> 8) & 255];

describe('gear catalog', () => {
  it('has unique ids', () => {
    const ids = GEAR_CATALOG.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('prices are 5..100 for sale, 0 only for the starter emote and chest-only items', () => {
    for (const it of SHOP_GEAR) {
      if (it.price === 0) expect(it.id).toBe('emote-wave');
      else {
        expect(it.price).toBeGreaterThanOrEqual(5);
        expect(it.price).toBeLessThanOrEqual(100);
      }
    }
    for (const it of CHEST_GEAR) expect(it.chestOnly).toBe(true);
  });

  it('has a spread: several cheap items and some to aspire to', () => {
    const sale = SHOP_GEAR.filter((i) => i.price > 0);
    expect(sale.filter((i) => i.price <= 20).length).toBeGreaterThanOrEqual(5);
    expect(sale.filter((i) => i.price >= 60).length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...sale.map((i) => i.price))).toBeLessThanOrEqual(100);
  });

  it('has the requested counts per slot', () => {
    const n = (slot: string, id?: RegExp): number => SHOP_GEAR.filter((i) => i.slot === slot && (!id || id.test(i.id))).length;
    expect(n('head')).toBe(3);
    expect(n('back', /^cape/)).toBe(2);
    expect(n('back', /^pack/)).toBe(2);
    expect(n('face')).toBe(2);
    expect(n('carColor')).toBe(4);
    expect(n('trail')).toBe(3);
    expect(n('emote')).toBe(3);
    expect(SHOP_GEAR.find((i) => i.id === 'emote-wave')?.price).toBe(0);
  });

  it('chest items use the same ids and slots as OUTFITS', () => {
    expect(CHEST_GEAR.map((i) => i.id)).toEqual(OUTFITS.map((o) => o.id));
    OUTFITS.forEach((o, i) => {
      expect(CHEST_GEAR[i].slot).toBe(o.slot);
      expect(CHEST_GEAR[i].icon).toBe(o.icon);
    });
  });

  it('icons match the categories', () => {
    for (const it of SHOP_GEAR) {
      if (it.slot === 'trail') expect(it.icon).toBe('trail');
      if (it.slot === 'emote') expect(it.icon).toBe('emote');
      if (it.slot === 'carColor') expect(it.icon).toBe('paint');
      if (it.slot === 'face') expect(it.icon).toBe('glasses');
      if (it.id.startsWith('pack')) expect(it.icon).toBe('backpack');
    }
  });

  it('buggy paints differ in brightness in both the R and the G channel, not by hue alone', () => {
    const all = [0xffbd2e, ...Object.values(PAINT_COLORS), ...Object.values(GEAR_PAINTS)].map(rg);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const d = Math.hypot(all[i][0] - all[j][0], all[i][1] - all[j][1]);
        expect(d, `paints ${i} and ${j}`).toBeGreaterThan(50);
      }
    }
    // The shop paints alone span dark to bright in both channels.
    const shop = Object.values(GEAR_PAINTS).map(rg);
    expect(Math.max(...shop.map((c) => c[0])) - Math.min(...shop.map((c) => c[0]))).toBeGreaterThan(150);
    expect(Math.max(...shop.map((c) => c[1])) - Math.min(...shop.map((c) => c[1]))).toBeGreaterThan(150);
  });

  it('maps ids to paints, trails and emotes', () => {
    expect(paintColor('paint-ruby')).toBe(GEAR_PAINTS['paint-ruby']);
    expect(paintColor('paint-flame')).toBe(PAINT_COLORS['paint-flame']);
    expect(paintColor('hat-crown')).toBeNull();
    expect(paintColor(null)).toBeNull();
    expect(trailKind('trail-rainbow')).toBe('rainbow');
    expect(trailKind('x')).toBeNull();
    expect(emoteKind('emote-dance')).toBe('dance');
    expect(emoteKind(null)).toBeNull();
  });

  it('works with the economy: starter owned, buy equips, chest-only is not for sale', () => {
    const events = bus();
    const profile = createProfile(events, { storage: null });
    const eco = createEconomyRules(events, profile);
    eco.registerItems(GEAR_CATALOG);
    expect(profile.owns('emote-wave')).toBe(true);
    expect(eco.buy('hat-propeller')).toBe('tooPoor');
    profile.earn(100, 'test');
    expect(eco.buy('hat-propeller')).toBe('ok');
    expect(profile.equipped('head')).toBe('hat-propeller');
    expect(eco.buy('hat-explorer')).toBe('notForSale');
    expect(eco.buy('trail-rainbow')).toBe('ok');
    expect(profile.equipped('trail')).toBe('trail-rainbow');
    expect(profile.wallet).toBe(100 - 12 - 75);
  });
});

describe('look applier logic', () => {
  it('reads what the profile says is equipped', () => {
    const profile = createProfile(bus(), { storage: null });
    profile.equip('head', 'hat-crown');
    profile.equip('carColor', 'paint-lime');
    profile.equip('trail', 'trail-sparkle');
    expect(readLook(profile)).toEqual({ head: 'hat-crown', back: null, face: null, carColor: 'paint-lime' });
  });

  it('only lists slots that changed', () => {
    const a = emptyLook();
    const b = { ...a, head: 'hat-crown', face: 'glasses-shades' };
    expect(lookChanges(a, a)).toEqual([]);
    expect(lookChanges(a, b)).toEqual([
      { slot: 'head', from: null, to: 'hat-crown' },
      { slot: 'face', from: null, to: 'glasses-shades' },
    ]);
    expect(lookChanges(b, { ...b, head: 'hat-wizard' })).toEqual([{ slot: 'head', from: 'hat-crown', to: 'hat-wizard' }]);
    expect(lookChanges(b, a)).toHaveLength(2);
  });

  it('a profile reset leads to an empty look', () => {
    const events = bus();
    const profile = createProfile(events, { storage: null });
    profile.equip('back', 'pack-rocket');
    profile.reset();
    expect(readLook(profile)).toEqual(emptyLook());
  });

  it('knows which slots it handles', () => {
    expect(isLookSlot('head')).toBe(true);
    expect(isLookSlot('carColor')).toBe(true);
    expect(isLookSlot('trail')).toBe(false);
    expect(isLookSlot('emote')).toBe(false);
  });
});

describe('trails', () => {
  it('rainbow lanes span bright and dark in the red channel alone and the green channel alone', () => {
    for (const c of ['r', 'g'] as const) {
      const v = RAINBOW_LANES.map((h) => channel(h, c));
      expect(Math.max(...v) - Math.min(...v), c).toBeGreaterThan(0.6);
    }
  });

  it('neighbouring rainbow lanes differ in brightness in the red or the green channel', () => {
    for (let i = 0; i < RAINBOW_LANES.length - 1; i++) {
      const a = RAINBOW_LANES[i];
      const b = RAINBOW_LANES[i + 1];
      const d = Math.max(Math.abs(channel(a, 'r') - channel(b, 'r')), Math.abs(channel(a, 'g') - channel(b, 'g')));
      expect(d, `lane ${i}`).toBeGreaterThan(0.25);
    }
  });

  it('keeps the last 1.5 s of the path and records only real steps', () => {
    const h = new RibbonHistory();
    for (let i = 0; i < 200; i++) h.push(1 / 60, { x: i * 0.05, y: 0, z: 0 });
    expect(h.samples.length).toBeGreaterThan(5);
    expect(h.samples.length).toBeLessThanOrEqual(RIBBON.maxSamples);
    for (const s of h.samples) expect(s.age).toBeLessThanOrEqual(RIBBON.seconds + 1e-9);
    const still = new RibbonHistory();
    for (let i = 0; i < 30; i++) still.push(1 / 60, { x: 0, y: 0, z: 0 });
    expect(still.samples).toHaveLength(1);
    still.tick(2);
    expect(still.samples).toHaveLength(0);
  });

  it('the ribbon tapers to nothing at the tail', () => {
    expect(ribbonFade(0)).toBe(1);
    expect(ribbonFade(RIBBON.seconds)).toBe(0);
    expect(ribbonFade(RIBBON.seconds / 2)).toBeCloseTo(0.5, 5);
  });

  it('particle sizes stay small next to the robot', () => {
    for (const spec of Object.values(TRAIL_SPECS)) {
      expect(spec.size[0]).toBeGreaterThanOrEqual(0.08);
      expect(spec.size[1]).toBeLessThanOrEqual(0.36);
    }
  });

  it('emits one puff per spacing walked, carries the remainder, and caps a jump', () => {
    const e = new TrailEmitter();
    expect(e.advance(0.3, 0.4)).toBe(0);
    expect(e.advance(0.3, 0.4)).toBe(1);
    expect(e.advance(0.15, 0.4)).toBe(0);
    expect(e.advance(0.1, 0.4)).toBe(1);
    expect(e.advance(50, 0.4)).toBe(3);
    expect(e.advance(0, 0.4)).toBe(0);
    expect(e.advance(-1, 0.4)).toBe(0);
  });

  it('keeps the particle budget small', () => {
    expect(MAX_TRAIL_PARTICLES).toBeLessThanOrEqual(60);
  });
});

describe('emotes', () => {
  const base = { phase: 'playing', mode: 'walk' as const, grounded: true, hasVehicle: false, menuOpen: false, fromKey: true };

  it('can start only while playing, on foot, grounded', () => {
    expect(canStartEmote(base)).toBe(true);
    expect(canStartEmote({ ...base, phase: 'title' })).toBe(false);
    expect(canStartEmote({ ...base, phase: 'ended' })).toBe(false);
    expect(canStartEmote({ ...base, grounded: false })).toBe(false);
    expect(canStartEmote({ ...base, mode: 'driving' })).toBe(false);
    expect(canStartEmote({ ...base, mode: 'flop' })).toBe(false);
    expect(canStartEmote({ ...base, hasVehicle: true })).toBe(false);
  });

  it('a key press is ignored while a menu is open, the event is not', () => {
    expect(canStartEmote({ ...base, menuOpen: true })).toBe(false);
    expect(canStartEmote({ ...base, menuOpen: true, fromKey: false })).toBe(true);
  });

  it('move or jump input cancels', () => {
    const idle = { moveX: 0, moveY: 0, jump: false, jumpPressed: false };
    expect(emoteCancelled(idle)).toBe(false);
    expect(emoteCancelled({ ...idle, moveY: 1 })).toBe(true);
    expect(emoteCancelled({ ...idle, moveX: -0.6 })).toBe(true);
    expect(emoteCancelled({ ...idle, jumpPressed: true })).toBe(true);
    expect(emoteCancelled({ ...idle, jump: true })).toBe(true);
    expect(emoteCancelled({ ...idle, moveX: 0.05 })).toBe(false);
  });

  it('each emote plays its animation', () => {
    expect(EMOTES.wave.anim).toBe('wave');
    expect(EMOTES.dance.anim).toBe('dance');
    expect(EMOTES.cheer.anim).toBe('cheer');
  });
});

describe('shop previews', () => {
  it('every non-emote gear item gets a preview function, emotes keep the UI icon', () => {
    const items = withPreviews(GEAR_CATALOG);
    expect(items).toHaveLength(GEAR_CATALOG.length);
    for (const it of items) {
      if (it.slot === 'emote') expect(it.preview).toBeUndefined();
      else expect(typeof it.preview, it.id).toBe('function');
    }
  });
});
