import type { AudioApi, GameContext } from '../types';

/** Stub: silent. Replaced by the procedural WebAudio engine in M1. */
export function createAudio(_ctx: Pick<GameContext, 'settings' | 'events' | 'testMode'>): AudioApi {
  return {
    unlock() {},
    play() {},
    setLoop() {},
    setMusic() {},
    update() {},
  };
}
