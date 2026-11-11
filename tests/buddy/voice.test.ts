import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ClipBank, MANIFEST_PATH } from '../../src/buddy/clips';
import type { VoiceManifest } from '../../src/buddy/clips';
import { DialogueQueue, PRIORITY, lineTiming } from '../../src/buddy/dialogue';
import type { Line } from '../../src/buddy/dialogue';
import { CHEST, ECON, HOWTO, INTRO, POOLS, RESCUE, STORY, needGems } from '../../src/buddy/script';
import { pickLocalVoice } from '../../src/buddy/speech';
import { createVoice, pipVoiceLevel } from '../../src/buddy/voice';
import { NEED_GEMS_MAX, allVoiceLines, clipId, spokenText } from '../../src/buddy/voiceLines';
import type { EventBus, GameSettings, SettingsApi } from '../../src/types';

const DIR = join(__dirname, '../../public/assets/voice');
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as VoiceManifest;
const BUDGET = 1.5 * 1024 * 1024;

describe("Pip's voice clips", () => {
  const lines = allVoiceLines();

  it('every fixed line has a clip in the manifest and the file exists', () => {
    expect(lines.length).toBeGreaterThan(100);
    for (const l of lines) {
      const c = manifest.clips[l.id];
      expect(c, `${l.id}: ${l.text}`).toBeTruthy();
      expect(c.text).toBe(l.text);
      expect(existsSync(join(DIR, c.file)), c.file).toBe(true);
      expect(c.dur, l.id).toBeGreaterThan(0.25);
      expect(c.dur, l.id).toBeLessThan(6);
    }
  });

  it('the story, how-tos, economy lines and every reaction pool are all covered', () => {
    const texts = [...STORY, ...Object.values(INTRO), RESCUE, ...Object.values(CHEST), ...Object.values(ECON), ...Object.values(HOWTO).flat(), ...Object.values(POOLS).flat()].map(
      (l) => l.text,
    );
    texts.push('Follow me!', needGems(3).text);
    for (const t of texts) expect(manifest.clips[clipId(t)], t).toBeTruthy();
  });

  it('only numbers beyond the recorded range fall back to on-device speech', () => {
    expect(manifest.clips[clipId(needGems(NEED_GEMS_MAX).text)]).toBeTruthy();
    expect(manifest.clips[clipId(needGems(NEED_GEMS_MAX + 1).text)]).toBeUndefined();
  });

  it('has no orphan clips and stays within the size budget', () => {
    const ids = new Set(lines.map((l) => l.id));
    let total = 0;
    for (const [id, c] of Object.entries(manifest.clips)) {
      expect(ids.has(id), `orphan ${id}`).toBe(true);
      const size = statSync(join(DIR, c.file)).size;
      expect(size, c.file).toBeLessThan(24 * 1024);
      total += size;
    }
    expect(total).toBeLessThan(BUDGET);
  });

  it('clip ids are unique and file-safe', () => {
    const ids = lines.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(clipId('Hi! I am Pip!')).toBe('hi-i-am-pip');
    expect(clipId("Don't fall in the foam!")).toBe('dont-fall-in-the-foam');
  });

  it('spoken text is tuned for the ear', () => {
    expect(spokenText('MEGA gem! Wowee!')).toBe('Mega gem! Wowee!');
    expect(spokenText('Get a x3 combo!')).toBe('Get a 3 gem combo!');
    expect(spokenText('Hmm... where next?')).toBe('Hmm, where next?');
  });

  it('never names a place for hidden objects and has no health words', () => {
    const banned = /\b(health|medical|therapy|treatment|doctor|lazy eye|amblyopia|behind|under|north|south|east|west)\b/i;
    for (const l of lines) expect(banned.test(l.spoken), l.spoken).toBe(false);
  });
});

describe('on-device speech fallback', () => {
  const v = (name: string, lang: string, localService: boolean) => ({ name, lang, localService });

  it('only ever picks local voices', () => {
    expect(pickLocalVoice([v('Google US English', 'en-US', false), v('Cloud Jenny', 'en-US', false)])).toBeNull();
    expect(pickLocalVoice([v('Google US English', 'en-US', false), v('Daniel', 'en-GB', true)])?.name).toBe('Daniel');
  });

  it('prefers an English, female-sounding voice and skips novelty voices', () => {
    const voices = [v('Thomas', 'fr-FR', true), v('Fred', 'en-US', true), v('Samantha', 'en-US', true), v('Bubbles', 'en-US', true), v('Zira Online', 'en-US', false)];
    expect(pickLocalVoice(voices)?.name).toBe('Samantha');
    expect(pickLocalVoice([v('Thomas', 'fr-FR', true)])).toBeNull();
  });
});

describe('ClipBank', () => {
  const fake = (calls: string[]) => async (url: string): Promise<string | ArrayBuffer> => {
    calls.push(url);
    if (url.endsWith('.json')) return JSON.stringify({ clips: { 'hi-i-am-pip': { file: 'hi-i-am-pip.mp3', text: 'Hi! I am Pip!', dur: 1.1 }, 'find-the-key': { file: 'find-the-key.mp3', text: 'Find the key!', dur: 0.9 } } });
    return new ArrayBuffer(8);
  };

  it('loads nothing until asked, then the manifest once', async () => {
    const calls: string[] = [];
    const bank = new ClipBank('/', fake(calls));
    expect(calls).toEqual([]);
    expect(bank.info('Hi! I am Pip!')).toBeNull();
    await Promise.all([bank.load(), bank.load()]);
    expect(calls).toEqual([`/${MANIFEST_PATH}`]);
    expect(bank.info('Hi! I am Pip!')?.dur).toBe(1.1);
    expect(bank.info('Something new!')).toBeNull();
  });

  it('prefetches the given lines first and fetches each clip once', async () => {
    const calls: string[] = [];
    const bank = new ClipBank('/', fake(calls));
    await bank.prefetch(['Find the key!']);
    await bank.fetchBytes('find-the-key');
    expect(calls).toEqual([`/${MANIFEST_PATH}`, '/assets/voice/find-the-key.mp3', '/assets/voice/hi-i-am-pip.mp3']);
  });

  it('a missing manifest means no clips (speech fallback), not an error', async () => {
    const bank = new ClipBank('/', () => Promise.reject(new Error('404')));
    expect(await bank.load()).toBeNull();
    expect(bank.info('Hi! I am Pip!')).toBeNull();
  });
});

describe('bubble follows the voice', () => {
  const line: Line = { text: 'Hi! I am Pip!', icon: 'pip', priority: PRIORITY.story, hold: 0.2 };

  it('stays up until the clip has finished', () => {
    const plain = lineTiming(line);
    const voiced = lineTiming(line, 2.5);
    expect(plain.duration).toBeLessThan(2.5);
    expect(voiced.duration).toBeGreaterThanOrEqual(2.85);
    expect(voiced.reveal).toBeGreaterThan(plain.reveal);
  });

  it('the queue asks for the clip length, and an interruption ends the old line before the next starts', () => {
    const q = new DialogueQueue();
    q.clipSeconds = (l) => (l.text === line.text ? 3 : null);
    const seen: (string | null)[] = [];
    q.onChange = (a) => seen.push(a ? a.line.text : null);
    q.say(line);
    expect(q.current?.duration).toBeGreaterThanOrEqual(3.35);
    q.say({ ...line, text: 'Find the key!' });
    // The voice is hushed (null) before the new line speaks: Pip never talks over himself.
    expect(seen).toEqual(['Hi! I am Pip!', null, 'Find the key!']);
  });
});

describe('voice settings and test hook', () => {
  const settings = (extra: Partial<GameSettings> & { voicePip?: number } = {}) => ({ volumeMaster: 1, volumeMusic: 1, volumeSfx: 1, ...extra }) as unknown as GameSettings;

  it('Pip is on by default and follows voicePip once settings have it', () => {
    expect(pipVoiceLevel(settings())).toBe(1);
    expect(pipVoiceLevel(settings({ voicePip: 0 }))).toBe(0);
    expect(pipVoiceLevel(settings({ voicePip: 4 }))).toBe(1);
  });

  it('in test mode the voice is silent and records which clip it was asked for', () => {
    const s = settings();
    const api = { get: () => s } as unknown as SettingsApi;
    const events = { on: () => () => {} } as unknown as EventBus;
    const voice = createVoice({ settings: api, events, testMode: true });
    voice.speak('Hi! I am Pip!', 'excited');
    voice.hush();
    expect(voice.requests.map((r) => r.id)).toEqual(['hi-i-am-pip']);
    expect(voice.clipSeconds('Hi! I am Pip!')).toBeNull();
  });
});
