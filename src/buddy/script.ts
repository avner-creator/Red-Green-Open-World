/**
 * Everything Pip says (data only). Rules: at most six words per line, friendly and funny, no
 * health or medical words, and the pictogram carries the meaning (no reading needed).
 * `tests/buddy/script.test.ts` checks the word counts and the banned words.
 */
import type { Line, Mood, Priority } from './dialogue';
import { PRIORITY } from './dialogue';
import type { Attraction, BuddyPicto } from './types';

export interface ScriptLine {
  text: string;
  icon: BuddyPicto;
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
  welcome: { text: 'Welcome to Carnival Island!', icon: 'party', mood: 'excited', hold: 1.6 },
  glasses: { text: 'Glow Gems hide in your glasses!', icon: 'glasses', mood: 'curious', hold: 1.8 },
  findGem: { text: 'Gems near! Look around!', icon: 'gem', mood: 'excited', hold: 2.2 },
  wallet: { text: 'Gems are money!', icon: 'wallet', mood: 'proud', callout: HUD.wallet, hold: 2.6 },
  shop: { text: 'Buy a silly hat!', icon: 'hat', mood: 'silly', hold: 2.4 },
  trampoline: { text: 'Jump! Hold the button!', icon: 'wTrampoline', mood: 'excited', hold: 2.4 },
  choose: { text: 'Now you choose!', icon: 'target', mood: 'proud', callout: HUD.compass, hold: 2.8 },
  skipped: { text: 'Okay! Have fun!', icon: 'paw', mood: 'happy', hold: 1.2 },
} satisfies Record<string, ScriptLine>;

export const RETURNING: ScriptLine = { text: 'Welcome back, buddy!', icon: 'wave', mood: 'excited', hold: 1.2 };

/** One-time HUD tips (each one is shown once ever; ids are saved). */
export const TIPS = {
  stars: { text: 'Stars for cool tricks!', icon: 'star', mood: 'proud', callout: HUD.stars },
  timer: { text: 'Sunset means closing time!', icon: 'sun', mood: 'curious', callout: HUD.timer },
  compass: { text: 'Compass shows fun places!', icon: 'target', mood: 'happy', callout: HUD.compass },
  missions: { text: 'Goals! Finish them for gems!', icon: 'mission', mood: 'excited', callout: HUD.missions },
  help: { text: 'Lost? Press the ? button!', icon: 'question', mood: 'happy', callout: HUD.help },
  pip: { text: 'Need me? Press my button!', icon: 'pip', mood: 'happy', callout: HUD.pip },
  combo: { text: 'Grab gems fast for combos!', icon: 'combo', mood: 'excited', callout: HUD.combo },
} satisfies Record<string, ScriptLine>;
export type TipId = keyof typeof TIPS | 'skill' | `visit:${Attraction}` | 'chute';

/** Skill tip: the key cap is filled in from the control map ("Q", "LB"). */
export function skillTip(key: string): ScriptLine {
  return { text: key ? `Press ${key} for your power!` : 'Tap the bolt for power!', icon: 'bolt', mood: 'excited', callout: HUD.skill };
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
  trampoline: { icon: 'wTrampoline', name: 'big trampoline', howTo: () => ({ text: 'Jump! Hold the button!', icon: 'wTrampoline', mood: 'excited' }) },
  balloon: { icon: 'wBalloon', name: 'balloon ride', howTo: () => ({ text: 'Hop in! First ride free!', icon: 'ticket', mood: 'excited' }) },
  launchPads: { icon: 'wRocket', name: 'rocket pads', howTo: () => ({ text: 'Step on! Blast off!', icon: 'wRocket', mood: 'excited' }) },
  garage: { icon: 'wCar', name: 'buggy', howTo: (k) => ({ text: `Press ${k.use} to drive!`, icon: 'wCar', mood: 'excited' }) },
  gearShack: { icon: 'shop', name: 'Gear Shack', howTo: (k) => ({ text: `Press ${k.use} to shop!`, icon: 'shop', mood: 'happy' }) },
  bungee: { icon: 'bungee', name: 'bungee tower', howTo: () => ({ text: 'Jump off! Boing boing!', icon: 'bungee', mood: 'silly' }) },
  ranch: { icon: 'horse', name: 'pony ranch', howTo: (k) => ({ text: `Press ${k.use} to ride!`, icon: 'horse', mood: 'happy' }) },
  sillyZone: { icon: 'party', name: 'Silly Zone', howTo: () => ({ text: 'Everything is wobbly here!', icon: 'party', mood: 'silly' }) },
  bouncePads: { icon: 'wPads', name: 'bounce pads', howTo: () => ({ text: 'Bounce, bounce, bounce!', icon: 'wPads', mood: 'excited' }) },
  carnivalRow: { icon: 'tent', name: 'carnival games', howTo: (k) => ({ text: `Press ${k.use} to play!`, icon: 'tent', mood: 'excited' }) },
  iceCream: { icon: 'cone', name: 'ice-cream shop', howTo: (k) => ({ text: `Press ${k.use} for a cone!`, icon: 'cone', mood: 'happy' }) },
  bubbleArena: { icon: 'bubble', name: 'bubble ball', howTo: (k) => ({ text: `Press ${k.use} to suit up!`, icon: 'bubble', mood: 'silly' }) },
  dinoRing: { icon: 'dragon', name: 'dino sumo', howTo: (k) => ({ text: `Press ${k.use} to wobble!`, icon: 'dragon', mood: 'silly' }) },
  raceStart: { icon: 'flag', name: 'buggy race', howTo: (k) => ({ text: `Press ${k.use} to race!`, icon: 'flag', mood: 'excited' }) },
  foamCourse: { icon: 'bubble', name: 'foam course', howTo: () => ({ text: "Don't fall in the foam!", icon: 'bubble', mood: 'silly' }) },
  airstrip: { icon: 'plane', name: 'stunt planes', howTo: (k) => ({ text: `Press ${k.use} to fly!`, icon: 'plane', mood: 'excited' }) },
  dragonRoost: { icon: 'dragon', name: 'dragon ride', howTo: (k) => ({ text: `Press ${k.use} to fly the dragon!`, icon: 'dragon', mood: 'excited' }) },
};

export interface KeyNames {
  use: string;
  jump: string;
  skill: string;
}

export const CHUTE = (k: KeyNames): ScriptLine => ({ text: `Press ${k.jump} for the parachute!`, icon: 'parachute', mood: 'excited' });

export const CHEST = {
  findKey: { text: 'Find the key!', icon: 'key', mood: 'curious' },
  findSide: { text: 'Now find the keyhole side!', icon: 'lock', mood: 'curious' },
  shape: { text: 'Step on the right shape!', icon: 'lock', mood: 'curious' },
} satisfies Record<string, ScriptLine>;

export const needGems = (n: number): ScriptLine => ({ text: `Need ${n} more gems!`, icon: 'gem', mood: 'worried' });

export const suggest = (a: Attraction): ScriptLine => ({ text: `Try the ${ATTRACTIONS[a].name}!`, icon: ATTRACTIONS[a].icon, mood: 'curious' });

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
  bought: { text: 'Lookin’ sharp!', icon: 'hat', mood: 'proud' },
  unlocked: { text: 'Ooh, new stuff!', icon: 'backpack', mood: 'excited' },
  ticket: { text: 'Wheee! Here we go!', icon: 'ticket', mood: 'excited' },
  jackpot: { text: 'Jackpot! We are rich!', icon: 'jackpot', mood: 'excited' },
  goalDone: { text: 'Goal done! Woohoo!', icon: 'check', mood: 'proud' },
  sunset: { text: 'Hurry! Sunset is coming!', icon: 'sun', mood: 'worried' },
  heights: { text: 'So high! Eek!', icon: 'eye', mood: 'worried' },
  landed: { text: 'You did it! Yay!', icon: 'star', mood: 'proud' },
  freefall: { text: 'Wheeeee!', icon: 'parachute', mood: 'excited' },
} satisfies Record<string, ScriptLine>;

/** Trampoline bounce count barks: "One!", "Two!"… */
export const COUNT = ['One!', 'Two!', 'Three!', 'Four!', 'Five!', 'Six!', 'Seven!', 'Eight!', 'Nine!', 'Ten!'];

export { PRIORITY };
