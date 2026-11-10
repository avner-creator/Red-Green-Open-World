import { describe, expect, it } from 'vitest';
import { MUSIC_TUNING, MusicDirector } from '../../src/audio/music-state';
import { COMBO_NOTES, comboArpeggio, GemCombo, isBigGem } from '../../src/audio/combo';

function playing(now = 0): MusicDirector {
  const d = new MusicDirector();
  d.unlock();
  d.setPhase('playing', 'title', now);
  d.update(now);
  return d;
}

describe('MusicDirector', () => {
  it('is silent before the first gesture, soft title theme after it', () => {
    const d = new MusicDirector();
    expect(d.update(0)).toBe('none');
    d.unlock();
    expect(d.update(0.1)).toBe('title');
  });

  it('plays the explore loop when a session starts', () => {
    expect(playing().current).toBe('explore');
  });

  it('switches to action at once when driving or riding, and back only after the dwell time', () => {
    const d = playing();
    d.setMode('driving');
    expect(d.update(1)).toBe('action');
    d.setMode('walk');
    expect(d.update(2)).toBe('action'); // too soon to calm down
    expect(d.update(1 + MUSIC_TUNING.minDwell + 0.01)).toBe('explore');
    d.setMode('riding');
    expect(d.update(10)).toBe('action');
  });

  it('flops keep the previous mode', () => {
    const d = playing();
    d.setMode('driving');
    d.update(1);
    d.setMode('flop');
    expect(d.update(20)).toBe('action');
  });

  it('external control (balloon, skydive) plays the air loop', () => {
    const d = playing();
    d.setMode('external');
    expect(d.update(1)).toBe('air');
    d.setMode('walk');
    expect(d.update(1 + MUSIC_TUNING.minDwell + 0.1)).toBe('explore');
  });

  it('one bounce is not enough, repeated bouncing or a stunt switches to action and then holds', () => {
    const d = playing();
    d.bounce(1, 1);
    expect(d.update(1)).toBe('explore');
    d.bounce(1, 3);
    expect(d.update(3)).toBe('action');
    // Holds while bouncing continues, then calms down.
    expect(d.update(3 + MUSIC_TUNING.actionHold - 0.5)).toBe('action');
    expect(d.update(3 + MUSIC_TUNING.actionHold + 0.1)).toBe('explore');
    d.stunt('bigBounce', 30);
    expect(d.update(30)).toBe('action');
  });

  it('a big boing alone counts as bouncing', () => {
    const d = playing();
    d.bounce(2, 1);
    expect(d.update(1)).toBe('action');
  });

  it('bounce energy decays, so slow single bounces stay on explore', () => {
    const d = playing();
    for (let t = 0; t < 120; t += 20) {
      d.bounce(1, t);
      expect(d.update(t)).toBe('explore');
    }
  });

  it('the last 30 s override everything with the urgent loop', () => {
    const d = playing();
    d.setMode('external');
    d.update(1);
    d.tick(31);
    expect(d.update(2)).toBe('air');
    d.tick(30);
    expect(d.update(2.1)).toBe('urgent');
    d.setMode('driving');
    expect(d.update(3)).toBe('urgent');
    d.tick(0); // stays urgent until the session actually ends
    expect(d.update(4)).toBe('urgent');
  });

  it('pausing keeps the cue but ducks it; resuming restores the level', () => {
    const d = playing();
    d.setMode('driving');
    d.update(1);
    d.setPhase('paused', 'playing', 2);
    expect(d.update(2)).toBe('action');
    expect(d.level()).toBe(MUSIC_TUNING.pausedDuck);
    d.setPhase('playing', 'paused', 3);
    expect(d.level()).toBe(1);
    expect(d.update(3)).toBe('action');
  });

  it('ends quietly for the win jingle, then returns to the soft title theme', () => {
    const d = playing();
    d.tick(10);
    d.update(1);
    d.setPhase('ended', 'playing', 5);
    expect(d.update(5)).toBe('none');
    expect(d.update(5 + MUSIC_TUNING.endedQuiet + 0.01)).toBe('title');
    d.setPhase('title', 'ended', 20);
    expect(d.update(20)).toBe('title');
  });

  it('a fresh session forgets the old clock, mode and bounce energy', () => {
    const d = playing();
    d.tick(5);
    d.setMode('driving');
    d.update(1);
    d.setPhase('ended', 'playing', 2);
    d.update(2);
    d.setPhase('title', 'ended', 3);
    d.update(3);
    d.setPhase('playing', 'title', 4);
    expect(d.update(4)).toBe('explore');
  });
});

describe('GemCombo', () => {
  it('builds within 3 s, caps at 5 steps, and resets after a gap', () => {
    const c = new GemCombo();
    const steps = [0, 1, 2.5, 5, 7, 9.9, 12].map((t) => c.hit(t));
    expect(steps.map((h) => h.step)).toEqual([0, 1, 2, 3, 4, 4, 4]);
    expect(steps.map((h) => h.maxed)).toEqual([false, false, false, false, true, false, false]);
    expect(c.hit(15.5).step).toBe(0);
  });

  it('reset starts over', () => {
    const c = new GemCombo();
    c.hit(0);
    c.hit(1);
    c.reset();
    expect(c.hit(1.5).step).toBe(0);
  });

  it('arpeggio rises one note per step and clamps', () => {
    expect(comboArpeggio(0)).toEqual([COMBO_NOTES[0]]);
    expect(comboArpeggio(4)).toEqual([...COMBO_NOTES]);
    expect(comboArpeggio(99)).toEqual([...COMBO_NOTES]);
    expect(comboArpeggio(-3)).toEqual([COMBO_NOTES[0]]);
    for (let i = 1; i < COMBO_NOTES.length; i++) expect(COMBO_NOTES[i]!).toBeGreaterThan(COMBO_NOTES[i - 1]!);
  });

  it('big gems: last one, every 5th, or a maxed combo', () => {
    const plain = { step: 0, chain: 1, maxed: false };
    expect(isBigGem(3, 20, plain)).toBe(false);
    expect(isBigGem(5, 20, plain)).toBe(true);
    expect(isBigGem(20, 20, plain)).toBe(true);
    expect(isBigGem(7, 20, { step: 4, chain: 5, maxed: true })).toBe(true);
    expect(isBigGem(8, 20, { step: 4, chain: 6, maxed: false })).toBe(false);
  });
});
