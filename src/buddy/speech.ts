/**
 * Fallback for lines without a recorded clip: the browser's built-in speech (Web Speech API),
 * restricted to voices that run on the device (`localService`), so no text ever leaves it.
 * High and quick for a puppy; picks an English, preferably female/young-sounding voice.
 */

export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
}

/** Pitch and rate for Pip on the browser voice. */
export const SPEECH_PITCH = 1.7;
export const SPEECH_RATE = 1.05;

const FEMALE = /female|woman|girl|child|kid|samantha|karen|moira|tessa|victoria|zira|aria|jenny|susan|serena|fiona|allison|ava|kathy|vicki|princess|junior|nicky|catherine|hazel|libby|sonia|emma|ana\b/i;
const ROBOTIC = /espeak|novelty|whisper|bad news|bells|boing|bubbles|cellos|organ|zarvox|trinoids|albert|jester|superstar|wobble|deranged|hysterical|bahh/i;

/** Best on-device English voice for Pip, or null (then Pip uses his animalese babble). */
export function pickLocalVoice<T extends VoiceLike>(voices: readonly T[]): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    if (v.localService !== true) continue;
    const lang = v.lang.toLowerCase().replace('_', '-');
    if (!lang.startsWith('en')) continue;
    let s = 0;
    if (lang === 'en-us') s += 3;
    else if (lang === 'en-gb' || lang === 'en-au' || lang === 'en-ca') s += 2;
    if (FEMALE.test(v.name)) s += 4;
    if (ROBOTIC.test(v.name)) s -= 6;
    if (v.default) s += 1;
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}

export interface Speaker {
  /** True when an on-device voice is available right now. */
  readonly ready: boolean;
  speak(text: string, volume: number): boolean;
  cancel(): void;
  /** Call from a user gesture (iOS needs one utterance started inside a gesture). */
  unlock(): void;
  dispose(): void;
}

export function createSpeaker(): Speaker {
  const synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  let voice: SpeechSynthesisVoice | null = null;
  let unlocked = false;
  const refresh = (): void => {
    try {
      voice = synth ? pickLocalVoice(synth.getVoices()) : null;
    } catch {
      voice = null;
    }
  };
  refresh();
  synth?.addEventListener?.('voiceschanged', refresh);
  return {
    get ready() {
      return !!synth && !!voice;
    },
    speak(text, volume) {
      if (!synth || !voice) return false;
      try {
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.lang = voice.lang;
        u.pitch = SPEECH_PITCH;
        u.rate = SPEECH_RATE;
        u.volume = Math.max(0, Math.min(1, volume));
        synth.speak(u);
        return true;
      } catch {
        return false;
      }
    },
    cancel() {
      try {
        synth?.cancel();
      } catch {
        /* ignore */
      }
    },
    unlock() {
      if (!synth || unlocked) return;
      unlocked = true;
      try {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        synth.speak(u);
      } catch {
        /* ignore */
      }
    },
    dispose() {
      synth?.removeEventListener?.('voiceschanged', refresh);
      this.cancel();
    },
  };
}
