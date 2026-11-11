import { describe, expect, it } from 'vitest';
import {
  Crossfade,
  crossfadeGains,
  RADIO_STORAGE_KEY,
  RadioState,
  STATIONS,
  stepStation,
  type KeyValueStore,
} from '../../src/audio/radio';
import { GEN_STATION_IDS, genSpec } from '../../src/audio/stations';
import { TRACK_FILES } from '../../src/audio/tracks';

function memStore(initial?: string): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial) data.set(RADIO_STORAGE_KEY, initial);
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('radio stations', () => {
  it('has Auto first, Off last, unique ids, and the four CC0 tracks plus at least three procedural stations', () => {
    expect(STATIONS[0]?.id).toBe('auto');
    expect(STATIONS[STATIONS.length - 1]?.id).toBe('off');
    expect(new Set(STATIONS.map((s) => s.id)).size).toBe(STATIONS.length);
    const tracks = STATIONS.filter((s) => s.kind === 'track').map((s) => s.track);
    expect(tracks).toEqual(['explore', 'action', 'air', 'urgent']);
    for (const t of tracks) expect(TRACK_FILES[t as keyof typeof TRACK_FILES]).toBeTruthy();
    const gens = STATIONS.filter((s) => s.kind === 'gen');
    expect(gens.length).toBeGreaterThanOrEqual(3);
    for (const g of gens) expect(GEN_STATION_IDS).toContain(g.id);
  });

  it('procedural stations differ in tempo and patterns, and have 16-step patterns', () => {
    const specs = GEN_STATION_IDS.map((id) => genSpec(id));
    expect(new Set(specs.map((s) => s.bpm)).size).toBe(specs.length);
    for (const s of specs) {
      for (const p of [s.kick, s.snare, s.hat, s.openHat, s.bass, s.stab, s.arp, s.leadSteps]) expect(p).toHaveLength(16);
    }
  });

  it('cycles forward and backward and wraps', () => {
    expect(stepStation('auto')).toBe('trail');
    expect(stepStation('off')).toBe('auto');
    expect(stepStation('auto', -1)).toBe('off');
    let id = STATIONS[0]!.id;
    const seen = new Set<string>();
    for (let i = 0; i < STATIONS.length; i++) {
      seen.add(id);
      id = stepStation(id);
    }
    expect(seen.size).toBe(STATIONS.length);
    expect(id).toBe('auto');
  });
});

describe('radio state', () => {
  it('starts on Auto; three presses give three different stations', () => {
    const r = new RadioState(memStore());
    expect(r.current).toBe('auto');
    const seen = [r.next(), r.next(), r.next()];
    expect(new Set([...seen, 'auto']).size).toBe(4);
  });

  it('is Auto (adaptive) or an override station', () => {
    const r = new RadioState(null);
    expect(r.station.kind).toBe('auto');
    r.set('disco');
    expect(r.station.kind).toBe('gen');
    r.set('trail');
    expect(r.station.kind).toBe('track');
    expect(r.station.track).toBe('explore');
    r.set('auto');
    expect(r.station.kind).toBe('auto');
  });

  it('persists the choice and restores it; ignores junk and broken storage', () => {
    const store = memStore();
    new RadioState(store).set('beach');
    expect(store.data.get(RADIO_STORAGE_KEY)).toBe('beach');
    expect(new RadioState(store).current).toBe('beach');
    expect(new RadioState(memStore('nonsense')).current).toBe('auto');
    const broken: KeyValueStore = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };
    const r = new RadioState(broken);
    expect(r.current).toBe('auto');
    expect(r.set('arcade')).toBe(true);
    expect(r.current).toBe('arcade');
  });

  it('notifies listeners only on a real change and rejects unknown ids', () => {
    const r = new RadioState(null);
    const log: string[] = [];
    const off = r.subscribe((id, prev) => log.push(`${prev}>${id}`));
    expect(r.set('auto')).toBe(false);
    expect(r.set('nope' as 'auto')).toBe(false);
    r.set('zoom');
    off();
    r.set('sky');
    expect(log).toEqual(['auto>zoom']);
  });
});

describe('crossfade state machine', () => {
  it('goes idle -> fading -> idle over 0.6 s and is equal-power', () => {
    const c = new Crossfade();
    expect(c.phase(0)).toBe('idle');
    c.start('auto', 'disco', 10);
    expect(c.phase(10.1)).toBe('fading');
    expect(c.progress(10.3)).toBeCloseTo(0.5, 5);
    expect(c.phase(10.7)).toBe('idle');
    expect(c.progress(11)).toBe(1);
    const g = crossfadeGains(0.5);
    expect(g.in ** 2 + g.out ** 2).toBeCloseTo(1, 6);
    expect(crossfadeGains(0)).toEqual({ out: 1, in: 0 });
    expect(crossfadeGains(1).out).toBeCloseTo(0, 6);
  });

  it('RadioState starts a fade on change', () => {
    const r = new RadioState(null);
    r.set('beach', 5);
    expect(r.fade.from).toBe('auto');
    expect(r.fade.to).toBe('beach');
    expect(r.fade.phase(5.2)).toBe('fading');
    expect(r.fade.phase(6)).toBe('idle');
  });
});
