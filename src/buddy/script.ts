/**
 * Everything Pip says (data only). Rules: at most six words per line, friendly and funny, no
 * health or medical words, and the pictograms carry the meaning (no reading needed): `icon` is
 * the big picture, `action` the button to press (drawn as a key cap / pad button / touch gesture
 * for the active device, so the text never names a key) and `extra` the thing it is for.
 * `tests/buddy/script.test.ts` checks the word counts and the banned words.
 */
import type { Line, Mood, Priority } from './dialogue';
import { PRIORITY } from './dialogue';
import type { ActionGlyph, Attraction, BuddyPicto } from './types';

export interface ScriptLine {
  text: string;
  icon: BuddyPicto;
  action?: ActionGlyph;
  extra?: BuddyPicto;
  mood?: Mood;
  callout?: string;
  hold?: number;
}

export function line(s: ScriptLine, priority: Priority, id?: string): Line {
  return { ...s, priority, id };
}

/** HUD selectors Pip can point at. */
export const HUD = {
  wallet: '.hud [data-testid="wallet"]',
  stars: '[data-testid="stars"]',
  timer: '[data-testid="timer"]',
  compass: '[data-testid="compass"]',
  skill: '[data-testid="skill-chip"]',
  help: '[data-testid="help"]',
  missions: '[data-testid="missions"]',
  combo: '[data-testid="combo"]',
  pip: '[data-testid="pip-button"]',
} as const;
export type HudKey = keyof typeof HUD;

export const INTRO = {
  welcome: { text: 'Hi! I am Pip!', icon: 'pip', extra: 'party', mood: 'excited', hold: 1.4 },
  move: { text: 'Walk with me!', icon: 'paw', action: 'move', mood: 'excited', hold: 2 },
  look: { text: 'Look around!', icon: 'eye', action: 'look', mood: 'curious', hold: 2 },
  glasses: { text: 'Magic glasses find hidden gems!', icon: 'glasses', extra: 'gem', mood: 'curious', hold: 2.2 },
  wallet: { text: 'Gems are money!', icon: 'gem', extra: 'wallet', mood: 'proud', callout: HUD.wallet, hold: 2.6 },
  jump: { text: 'Jump! Hold to go higher!', icon: 'wTrampoline', action: 'jump', mood: 'excited', hold: 2.4 },
  choose: { text: 'Now you choose!', icon: 'target', mood: 'proud', callout: HUD.compass, hold: 2.8 },
  skipped: { text: 'Okay! Have fun!', icon: 'paw', mood: 'happy', hold: 1.2 },
} satisfies Record<string, ScriptLine>;

/** "Follow me!" towards an attraction (its pictogram shows where). */
export const follow = (a: Attraction): ScriptLine => ({ text: 'Follow me!', icon: 'paw', extra: ATTRACTIONS[a].icon, mood: 'excited', hold: 1.8 });

/** Pip ran over to help (stuck at a fence, wandering off, standing around). */
export const RESCUE: ScriptLine = { text: 'This way! Come on!', icon: 'wave', extra: 'paw', mood: 'happy', hold: 1.6 };

export const RETURNING: ScriptLine = { text: 'Welcome back, buddy!', icon: 'wave', mood: 'excited', hold: 1.2 };

/** One-time HUD tips (each one is shown once ever; ids are saved). */
export const TIPS = {
  stars: { text: 'Stars for cool tricks!', icon: 'star', mood: 'proud', callout: HUD.stars },
  timer: { text: 'Sunset means closing time!', icon: 'sun', mood: 'curious', callout: HUD.timer },
  compass: { text: 'Compass shows fun places!', icon: 'target', mood: 'happy', callout: HUD.compass },
  missions: { text: 'Goals! Finish them for gems!', icon: 'mission', mood: 'excited', callout: HUD.missions },
  help: { text: 'Lost? This button helps!', icon: 'question', mood: 'happy', callout: HUD.help },
  pip: { text: 'Need me? Use my button!', icon: 'pip', mood: 'happy', callout: HUD.pip },
  combo: { text: 'Grab gems fast for combos!', icon: 'combo', mood: 'excited', callout: HUD.combo },
} satisfies Record<string, ScriptLine>;
export type TipId = keyof typeof TIPS | 'skill' | `visit:${Attraction}` | 'chute';

/** Skill tip: the key cap is filled in from the control map ("Q", "LB"). */
export function skillTip(_key = ''): ScriptLine {
  return { text: 'Your super power!', icon: 'bolt', action: 'skill', mood: 'excited', callout: HUD.skill };
}

/** Explanations when the player asks about a HUD element (T over it). */
export const EXPLAIN: Partial<Record<HudKey, ScriptLine>> = {
  wallet: { text: 'Gems are money! Spend them!', icon: 'wallet', mood: 'proud', callout: HUD.wallet },
  stars: TIPS.stars,
  timer: TIPS.timer,
  compass: TIPS.compass,
  missions: TIPS.missions,
  help: { text: 'All the buttons live here!', icon: 'question', mood: 'happy', callout: HUD.help },
  combo: TIPS.combo,
  pip: { text: "That's me! Woof!", icon: 'pip', mood: 'silly', callout: HUD.pip },
};

/** Where each attraction is, how to say it and a one-line how-to for the first visit. */
export const ATTRACTIONS: Record<Attraction, { icon: BuddyPicto; name: string; howTo: (key: KeyNames) => ScriptLine }> = {
  trampoline: { icon: 'wTrampoline', name: 'big trampoline', howTo: () => INTRO.jump },
  balloon: { icon: 'wBalloon', name: 'balloon ride', howTo: () => ({ text: 'Hop in! First ride free!', icon: 'wBalloon', action: 'use', extra: 'ticket', mood: 'excited' }) },
  launchPads: { icon: 'wRocket', name: 'rocket pads', howTo: () => ({ text: 'Step on! Blast off!', icon: 'wRocket', mood: 'excited' }) },
  garage: { icon: 'wCar', name: 'buggy', howTo: () => ({ text: 'Drive!', icon: 'wCar', action: 'use', mood: 'excited' }) },
  gearShack: { icon: 'shop', name: 'Gear Shack', howTo: () => ({ text: 'Shop!', icon: 'shop', action: 'use', mood: 'happy' }) },
  bungee: { icon: 'bungee', name: 'bungee tower', howTo: () => ({ text: 'Jump off! Boing boing!', icon: 'bungee', mood: 'silly' }) },
  ranch: { icon: 'horse', name: 'pony ranch', howTo: () => ({ text: 'Ride!', icon: 'horse', action: 'use', mood: 'happy' }) },
  sillyZone: { icon: 'party', name: 'Silly Zone', howTo: () => ({ text: 'Everything is wobbly here!', icon: 'party', mood: 'silly' }) },
  bouncePads: { icon: 'wPads', name: 'bounce pads', howTo: () => ({ text: 'Bounce, bounce, bounce!', icon: 'wPads', mood: 'excited' }) },
  carnivalRow: { icon: 'tent', name: 'carnival games', howTo: () => ({ text: 'Play!', icon: 'tent', action: 'use', mood: 'excited' }) },
  iceCream: { icon: 'cone', name: 'ice-cream shop', howTo: () => ({ text: 'Get a cone!', icon: 'cone', action: 'use', mood: 'happy' }) },
  bubbleArena: { icon: 'bubble', name: 'bubble ball', howTo: () => ({ text: 'Suit up!', icon: 'bubble', action: 'use', mood: 'silly' }) },
  dinoRing: { icon: 'dragon', name: 'dino sumo', howTo: () => ({ text: 'Wobble!', icon: 'dragon', action: 'use', mood: 'silly' }) },
  raceStart: { icon: 'flag', name: 'buggy race', howTo: () => ({ text: 'Race!', icon: 'flag', action: 'use', mood: 'excited' }) },
  foamCourse: { icon: 'bubble', name: 'foam course', howTo: () => ({ text: "Don't fall in the foam!", icon: 'bubble', mood: 'silly' }) },
  airstrip: { icon: 'plane', name: 'stunt planes', howTo: () => ({ text: 'Fly!', icon: 'plane', action: 'use', mood: 'excited' }) },
  dragonRoost: { icon: 'dragon', name: 'dragon ride', howTo: () => ({ text: 'Fly the dragon!', icon: 'dragon', action: 'use', mood: 'excited' }) },
  // Magic-glasses games: one family icon (the glasses), short wordless-friendly how-tos.
  glowflies: { icon: 'glasses', name: 'magic glow-flies', howTo: () => ({ text: 'Catch the glow-flies!', icon: 'glasses', mood: 'excited' }) },
  oddone: { icon: 'glasses', name: 'magic odd-one-out', howTo: () => ({ text: 'Which one is different?', icon: 'glasses', mood: 'curious' }) },
  lineup: { icon: 'glasses', name: 'magic bubbles', howTo: () => ({ text: 'Line up the sparkly ring!', icon: 'glasses', mood: 'curious' }) },
  toys: { icon: 'glasses', name: 'magic toy hunt', howTo: () => ({ text: 'Follow my paw prints!', icon: 'paw', mood: 'excited' }) },
  gates: { icon: 'glasses', name: 'magic gates', howTo: () => ({ text: 'Put the halves together!', icon: 'glasses', mood: 'curious' }) },
  dotsigns: { icon: 'glasses', name: 'magic dot signs', howTo: () => ({ text: 'Find the hidden shape!', icon: 'glasses', mood: 'curious' }) },
};

export interface KeyNames {
  use: string;
  jump: string;
  skill: string;
}

export const CHUTE = (_k?: KeyNames): ScriptLine => ({ text: 'Parachute now!', icon: 'parachute', action: 'jump', mood: 'excited' });

export const CHEST = {
  findKey: { text: 'Find the key!', icon: 'key', extra: 'chest', mood: 'curious', hold: 2.4 },
  shape: { text: 'Step on the right shape!', icon: 'key', extra: 'lock', mood: 'curious', hold: 2.4 },
} satisfies Record<string, ScriptLine>;

export const needGems = (n: number): ScriptLine => ({ text: `Need ${n} more gems!`, icon: 'gem', extra: 'ticket', mood: 'worried' });

export const suggest = (a: Attraction): ScriptLine => ({ text: `Try the ${ATTRACTIONS[a].name}!`, icon: ATTRACTIONS[a].icon, extra: 'target', mood: 'curious' });

export const IDLE: ScriptLine[] = [
  { text: 'I smell adventure!', icon: 'nose', mood: 'curious' },
  { text: 'Is it snack time?', icon: 'paw', mood: 'silly' },
  { text: 'Wanna race? Go go go!', icon: 'bolt', mood: 'excited' },
  { text: 'Your glasses look super cool!', icon: 'glasses', mood: 'happy' },
  { text: 'Hmm... where next?', icon: 'target', mood: 'curious' },
  { text: 'Scratch my ears? Hehe!', icon: 'paw', mood: 'silly' },
];

export const REACT = {
  gem: { text: 'Shiny! Yip yip!', icon: 'gem', mood: 'happy' },
  combo: { text: 'Combo! Keep going!', icon: 'combo', mood: 'excited' },
  mega: { text: 'MEGA gem! Wowee!', icon: 'megaGem', mood: 'excited' },
  stunt: { text: 'Whoa! So high!', icon: 'star', mood: 'excited' },
  key: { text: 'A key! Nice find!', icon: 'key', mood: 'excited' },
  chest: { text: 'Treasure! Ooh, shiny!', icon: 'chest', mood: 'proud' },
  flop: { text: 'Silly flop! Boing!', icon: 'flop', mood: 'silly' },
  skill: { text: 'Cool power!', icon: 'bolt', mood: 'excited' },
  emote: { text: 'Dance party!', icon: 'emote', mood: 'silly' },
  bought: { text: 'Looking sharp!', icon: 'hat', mood: 'proud' },
  unlocked: { text: 'Ooh, new stuff!', icon: 'backpack', mood: 'excited' },
  ticket: { text: 'Wheee! Here we go!', icon: 'ticket', mood: 'excited' },
  jackpot: { text: 'Jackpot! We are rich!', icon: 'jackpot', mood: 'excited' },
  goalDone: { text: 'Goal done! Woohoo!', icon: 'check', mood: 'proud' },
  sunset: { text: 'Hurry! Sunset is coming!', icon: 'sun', mood: 'worried' },
  heights: { text: 'So high! Eek!', icon: 'eye', mood: 'worried' },
  landed: { text: 'You did it! Yay!', icon: 'star', mood: 'proud' },
  magic: { text: 'Magic glasses! Great job!', icon: 'glasses', mood: 'proud' },
  freefall: { text: 'Wheee!', icon: 'parachute', mood: 'excited' },
} satisfies Record<string, ScriptLine>;

/** Trampoline bounce count barks: "One!", "Two!"… */
export const COUNT = ['One!', 'Two!', 'Three!', 'Four!', 'Five!', 'Six!', 'Seven!', 'Eight!', 'Nine!', 'Ten!'];

export { PRIORITY };
