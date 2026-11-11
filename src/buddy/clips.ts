/**
 * Pip's recorded lines: the manifest (`assets/voice/manifest.json`, written by
 * `scripts/gen-pip-voice.mjs`), a small cache of the compressed MP3 bytes and a few decoded buffers.
 * Nothing loads until `load()` (called on the first user gesture, never during boot); then the
 * intro clips come first and the rest stream in quietly, two at a time.
 */
import { clipId } from './voiceLines';

export interface ClipInfo {
  file: string;
  text: string;
  /** Seconds. */
  dur: number;
}

export interface VoiceManifest {
  clips: Record<string, ClipInfo>;
}

export const MANIFEST_PATH = 'assets/voice/manifest.json';
/** Decoded clips kept in memory (each ~2 s of PCM). */
const DECODED_MAX = 12;

type Fetcher = (url: string) => Promise<ArrayBuffer | string>;

const defaultFetch: Fetcher = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return url.endsWith('.json') ? r.text() : r.arrayBuffer();
};

export class ClipBank {
  manifest: VoiceManifest | null = null;
  private loading: Promise<VoiceManifest | null> | null = null;
  private bytes = new Map<string, Promise<ArrayBuffer | null>>();
  private decoded = new Map<string, AudioBuffer>();
  private prefetching = false;

  constructor(
    private readonly base: string,
    private readonly fetcher: Fetcher = defaultFetch,
  ) {}

  /** Load the manifest (once). Resolves null when there is none. */
  load(): Promise<VoiceManifest | null> {
    this.loading ??= this.fetcher(this.base + MANIFEST_PATH)
      .then((t) => {
        const m = JSON.parse(typeof t === 'string' ? t : new TextDecoder().decode(t)) as VoiceManifest;
        this.manifest = m && typeof m.clips === 'object' ? m : null;
        return this.manifest;
      })
      .catch(() => null);
    return this.loading;
  }

  /** The clip for a line's text, if the manifest is loaded and has one. */
  info(text: string): (ClipInfo & { id: string }) | null {
    const id = clipId(text);
    const c = this.manifest?.clips[id];
    return c ? { ...c, id } : null;
  }

  /** Compressed bytes of a clip (fetched once, shared). */
  fetchBytes(id: string): Promise<ArrayBuffer | null> {
    let p = this.bytes.get(id);
    if (!p) {
      const c = this.manifest?.clips[id];
      p = c
        ? this.fetcher(`${this.base}assets/voice/${c.file}`)
            .then((b) => (typeof b === 'string' ? null : b))
            .catch(() => null)
        : Promise.resolve(null);
      this.bytes.set(id, p);
      // A failed fetch may be retried later.
      void p.then((b) => {
        if (!b) this.bytes.delete(id);
      });
    }
    return p;
  }

  /** A decoded clip for `text`, or null when there is no clip (or it failed). */
  async buffer(ac: BaseAudioContext, text: string): Promise<AudioBuffer | null> {
    await this.load();
    const c = this.info(text);
    if (!c) return null;
    const hit = this.decoded.get(c.id);
    if (hit) {
      // Refresh its place in the LRU.
      this.decoded.delete(c.id);
      this.decoded.set(c.id, hit);
      return hit;
    }
    const bytes = await this.fetchBytes(c.id);
    if (!bytes) return null;
    try {
      // decodeAudioData detaches its input: decode a copy so the cache stays usable.
      const buf = await ac.decodeAudioData(bytes.slice(0));
      this.decoded.set(c.id, buf);
      while (this.decoded.size > DECODED_MAX) this.decoded.delete(this.decoded.keys().next().value as string);
      return buf;
    } catch {
      return null;
    }
  }

  /** Fetch every clip's bytes in the background, `first` ids first, two at a time. */
  async prefetch(first: readonly string[] = []): Promise<void> {
    if (this.prefetching) return;
    this.prefetching = true;
    const m = await this.load();
    if (!m) return;
    const ids = [...new Set([...first.map((t) => clipId(t)), ...Object.keys(m.clips)])].filter((id) => m.clips[id]);
    let i = 0;
    const worker = async (): Promise<void> => {
      while (i < ids.length) await this.fetchBytes(ids[i++]);
    };
    await Promise.all([worker(), worker()]);
  }
}
