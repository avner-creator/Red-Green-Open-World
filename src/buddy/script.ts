/**
 * Everything Pip says (data only). Rules: at most twelve words per line, kid language, friendly and
 * funny, no health or medical words, and the pictograms carry the meaning (no reading needed):
 * `icon` is the big picture, `action` the button to press (drawn as a key cap / pad button / touch
 * gesture for the active device, so the text never names a key) and `extra` the thing it is for.
 * How-tos explain RULES, never where a weak-eye or strong-eye object is.
 * `tests/buddy/script.test.ts` checks the word counts, the banned words and the pool sizes.
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
  /** Pure praise / reaction: spoken with no bubble when Pip's voice is on. */
  praise?: boolean;
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

/**
 * The welcome story (a brand-new player, about 30 s, skippable, the child can already move). Each
 * beat is one spoken clip; the bubble shows only its pictograms while Pip talks.
 */
export const STORY: readonly ScriptLine[] = [
  { text: "Hi, I'm Pip! Welcome to Carnival Island, a giant fun park!", icon: 'pip', extra: 'party', action: 'move', mood: 'excited', hold: 0.6 },
  { text: 'Rides and games everywhere! Fly a balloon, bounce, race and play!', icon: 'tent', extra: 'wBalloon', action: 'look', mood: 'excited', hold: 0.6 },
  { text: 'Sparkly gems hide all over. Your magic glasses find them!', icon: 'glasses', extra: 'gem', mood: 'curious', hold: 0.6 },
  { text: 'Gems buy rides, goofy hats and cool gear!', icon: 'gem', extra: 'hat', mood: 'proud', callout: HUD.wallet, hold: 0.6 },
  { text: 'Each new ride earns a stamp. Full Fun Pass, giant prize!', icon: 'mission', extra: 'jackpot', mood: 'excited', callout: HUD.missions, hold: 0.6 },
  { text: "Let's fill it before sunset! Follow me to the first one!", icon: 'paw', extra: 'wTrampoline', action: 'move', mood: 'excited', hold: 0.8 },
];
/** Story beat index at which Pip puts on his own magic glasses. */
export const STORY_GLASSES_BEAT = 2;

export const INTRO = {
  jump: { text: 'Jump on the trampoline! Hold jump to bounce higher!', icon: 'wTrampoline', action: 'jump', mood: 'excited', hold: 1.2 },
  choose: { text: 'Now you choose! The compass shows fun places.', icon: 'target', mood: 'proud', callout: HUD.compass, hold: 1.6 },
  skipped: { text: 'Okay! Have fun!', icon: 'paw', mood: 'happy', hold: 1.2 },
} satisfies Record<string, ScriptLine>;

/** "Follow me!" towards an attraction (its pictogram shows where). */
export const follow = (a: Attraction): ScriptLine => ({ text: 'Follow me!', icon: 'paw', action: 'move', extra: ATTRACTIONS[a].icon, mood: 'excited', hold: 1.4 });
/** Re-prompts while leading (no repeats within a few minutes; then Pip only barks). */
export const FOLLOW_AGAIN: readonly string[] = ['This way, buddy!', 'Come on, over here!', "Let's go! It's this way!", 'Hurry, it is so fun!', 'Almost there! Follow me!', 'Over here! Woof!'];

/** Pip ran over to help (stuck at a fence, wandering off, standing around). */
export const RESCUE: ScriptLine = { text: 'This way! Come on!', icon: 'wave', extra: 'paw', mood: 'happy', hold: 1.6 };

export const RETURNING: ScriptLine = { text: 'Welcome back, buddy! Ready for more fun?', icon: 'wave', mood: 'excited', hold: 1.2 };

/** One-time HUD tips (each one is shown once ever; ids are saved). */
export const TIPS = {
  stars: { text: 'Cool tricks earn stars!', icon: 'star', mood: 'proud', callout: HUD.stars },
  timer: { text: 'When the sun sets, the park closes!', icon: 'sun', mood: 'curious', callout: HUD.timer },
  compass: { text: 'The compass shows fun places!', icon: 'target', mood: 'happy', callout: HUD.compass },
  missions: { text: 'Your Fun Pass! New rides and games fill it with stamps.', icon: 'mission', mood: 'excited', callout: HUD.missions },
  help: { text: 'Lost? This button shows all the controls!', icon: 'question', mood: 'happy', callout: HUD.help },
  pip: { text: 'Need help? Use my button, and I explain things!', icon: 'pip', mood: 'happy', callout: HUD.pip },
  combo: { text: 'Grab gems fast for a combo! More gems!', icon: 'combo', mood: 'excited', callout: HUD.combo },
  arrows: { text: 'Glowing arrows on the ground lead to secrets. Follow them!', icon: 'glasses', extra: 'trail', mood: 'curious' },
} satisfies Record<string, ScriptLine>;
export type TipId = keyof typeof TIPS | 'skill' | `visit:${Attraction}` | `howto:${string}` | `econ:${string}` | 'chute';

/** Skill tip: the key cap is filled in from the control map ("Q", "LB"). */
export function skillTip(_key = ''): ScriptLine {
  return { text: 'Your hero has a super power! Try it!', icon: 'bolt', action: 'skill', mood: 'excited', callout: HUD.skill };
}

/** Explanations when the player asks about a HUD element (T over it). */
export const EXPLAIN: Partial<Record<HudKey, ScriptLine>> = {
  wallet: { text: 'Your gems! Spend them on rides, hats and gear.', icon: 'wallet', mood: 'proud', callout: HUD.wallet },
  stars: TIPS.stars,
  timer: TIPS.timer,
  compass: TIPS.compass,
  missions: TIPS.missions,
  help: TIPS.help,
  combo: TIPS.combo,
  pip: { text: "That's me! Woof!", icon: 'pip', mood: 'silly', callout: HUD.pip },
};

/** Attractions Pip knows: pictogram and name ("Try the big trampoline!"). */
export const ATTRACTIONS: Record<Attraction, { icon: BuddyPicto; name: string }> = {
  trampoline: { icon: 'wTrampoline', name: 'big trampoline' },
  balloon: { icon: 'wBalloon', name: 'balloon ride' },
  launchPads: { icon: 'wRocket', name: 'rocket pads' },
  garage: { icon: 'wCar', name: 'buggy' },
  gearShack: { icon: 'shop', name: 'Gear Shack' },
  bungee: { icon: 'bungee', name: 'bungee bridge' },
  ranch: { icon: 'horse', name: 'pony ranch' },
  sillyZone: { icon: 'party', name: 'Silly Zone' },
  bouncePads: { icon: 'wPads', name: 'bounce pads' },
  carnivalRow: { icon: 'tent', name: 'carnival games' },
  iceCream: { icon: 'cone', name: 'ice-cream shop' },
  bubbleArena: { icon: 'bubble', name: 'bubble soccer' },
  dinoRing: { icon: 'dragon', name: 'dino sumo' },
  raceStart: { icon: 'flag', name: 'buggy race' },
  foamCourse: { icon: 'bubble', name: 'foam course' },
  airstrip: { icon: 'plane', name: 'stunt planes' },
  dragonRoost: { icon: 'dragon', name: 'dragon ride' },
  glowflies: { icon: 'glasses', name: 'magic glow-flies' },
  oddone: { icon: 'glasses', name: 'magic odd-one-out' },
  lineup: { icon: 'glasses', name: 'magic bubbles' },
  toys: { icon: 'glasses', name: 'magic toy hunt' },
  gates: { icon: 'glasses', name: 'magic gates' },
  dotsigns: { icon: 'glasses', name: 'magic dot signs' },
};

/** Carnival booths (game ids from src/activities/carnival). */
export const BOOTHS = ['balloonPop', 'ringToss', 'duckPond', 'strengthBell', 'glowDodge'] as const;
export type Booth = (typeof BOOTHS)[number];

/** Everything with a spoken how-to: attractions, booths and a few both-eye things. */
export type HowToTopic = Attraction | `booth:${Booth}` | 'vault' | 'chest' | 'workshop' | 'secrets';

/**
 * Spoken how-tos (1–3 lines each): what it is and exactly what to do. Said on the first arrival
 * and again when the child asks Pip there. Each line is true to the attraction's code.
 */
export const HOWTO: Record<HowToTopic, readonly ScriptLine[]> = {
  trampoline: [
    INTRO.jump,
    { text: 'Up high, steer with the stick for flips and tricks!', icon: 'star', action: 'move', mood: 'excited' },
  ],
  bouncePads: [{ text: 'Step on a bounce pad. It throws you to the next one!', icon: 'wPads', mood: 'excited' }],
  launchPads: [{ text: 'Stand on a rocket pad and blast up onto the big net!', icon: 'wRocket', mood: 'excited' }],
  balloon: [
    { text: 'This balloon flies you sky-high! Hop in the basket!', icon: 'wBalloon', action: 'use', mood: 'excited' },
    { text: 'At the top, jump out and fly through the gems!', icon: 'parachute', action: 'jump', mood: 'excited' },
    { text: 'Jump again to open your parachute. Land on the rings!', icon: 'parachute', action: 'jump', extra: 'wTarget', mood: 'happy' },
  ],
  garage: [
    { text: 'Hop in the buggy and drive! Bumps are bouncy and fun!', icon: 'wCar', action: 'use', mood: 'excited' },
    { text: 'The tool cart gives your buggy silly new parts!', icon: 'gear', action: 'use', extra: 'wCar', mood: 'happy' },
  ],
  raceStart: [
    { text: 'Race two friends, three laps around the roads!', icon: 'flag', action: 'use', mood: 'excited' },
    { text: 'Magic glasses show boost pads. Three in a row go zoom!', icon: 'glasses', extra: 'bolt', mood: 'curious' },
  ],
  gearShack: [{ text: 'The Gear Shack! Spend gems on hats, capes and cool gear!', icon: 'shop', action: 'use', extra: 'hat', mood: 'happy' }],
  ranch: [{ text: 'Hop on a pony and gallop around the island!', icon: 'horse', action: 'use', mood: 'happy' }],
  sillyZone: [
    { text: 'Step on the big round button for a silly flop!', icon: 'flop', mood: 'silly' },
    { text: 'Bump the mushrooms, push the beach ball, ride the see-saw!', icon: 'party', mood: 'silly' },
    { text: 'Run through the wiggly tube guys. They just wobble, hehe!', icon: 'wRun', mood: 'silly' },
  ],
  bungee: [
    { text: 'Clip in at the bridge, then dive off the springboard!', icon: 'bungee', action: 'use', mood: 'excited' },
    { text: 'Jump when the board bounces up for a deeper dive!', icon: 'bungee', action: 'jump', mood: 'excited' },
  ],
  carnivalRow: [
    { text: 'Five carnival games! Walk up to a booth to play!', icon: 'tent', action: 'use', mood: 'excited' },
    { text: 'Beat your friends to win prizes and gems!', icon: 'star', extra: 'gem', mood: 'proud' },
  ],
  'booth:balloonPop': [
    { text: 'Throw beanbags at the balloons! Look around to aim.', icon: 'balloon', action: 'use', mood: 'excited' },
    { text: "Magic glasses show prize balloons. They're worth triple!", icon: 'glasses', extra: 'balloon', mood: 'curious' },
  ],
  'booth:ringToss': [
    { text: 'Hold to power up, let go to toss the ring!', icon: 'target', action: 'use', mood: 'excited' },
    { text: 'Magic glasses show a gold star peg. It counts double!', icon: 'glasses', extra: 'star', mood: 'curious' },
  ],
  'booth:duckPond': [
    { text: 'Aim the net over a duck and scoop it up!', icon: 'target', action: 'use', mood: 'happy' },
    { text: 'Magic glasses show lucky ducks with stars. Worth three!', icon: 'glasses', extra: 'star', mood: 'curious' },
  ],
  'booth:strengthBell': [
    { text: 'Watch the swinging needle and stomp to ring the bell!', icon: 'star', action: 'jump', mood: 'excited' },
    { text: 'Magic glasses show the perfect spot on the dial!', icon: 'glasses', extra: 'target', mood: 'curious' },
  ],
  'booth:glowDodge': [
    { text: 'Foam balls roll at you! Jump over, or step aside!', icon: 'bubble', action: 'jump', mood: 'silly' },
    { text: 'In the dark, magic glasses show the glowing balls!', icon: 'glasses', extra: 'bubble', mood: 'curious' },
  ],
  iceCream: [
    { text: 'Build your own ice cream! Pick with left and right!', icon: 'cone', action: 'move', mood: 'happy' },
    { text: 'Jump adds it. Then eat it for a silly power!', icon: 'cone', action: 'jump', mood: 'silly' },
  ],
  bubbleArena: [
    { text: 'Bubble soccer! Roll the big ball into the other goal!', icon: 'bubble', action: 'use', mood: 'excited' },
    { text: 'Jump to dash and kick the ball super hard!', icon: 'bubble', action: 'jump', mood: 'excited' },
  ],
  dinoRing: [
    { text: 'Dino sumo! Bump the other dinos out of the ring!', icon: 'dragon', action: 'use', mood: 'silly' },
    { text: 'Jump for a big belly charge! Boing!', icon: 'dragon', action: 'jump', mood: 'silly' },
  ],
  foamCourse: [
    { text: 'Race a friend across the foam on floats and blocks!', icon: 'bubble', action: 'use', mood: 'excited' },
    { text: 'Jump the gaps! If you fall in, try again from the checkpoint.', icon: 'flag', action: 'jump', mood: 'silly' },
  ],
  airstrip: [
    { text: 'Fly the stunt plane! Zoom through hoops and pop cloud balloons!', icon: 'plane', action: 'use', mood: 'excited' },
    { text: 'Steer where you look. Your power button does loops!', icon: 'plane', action: 'skill', mood: 'excited' },
  ],
  dragonRoost: [
    { text: 'Give the dragon a snack, then hop on and fly!', icon: 'dragon', action: 'use', mood: 'excited' },
    { text: 'Jump flaps the wings. Your power button blows bubbles!', icon: 'dragon', action: 'jump', mood: 'silly' },
  ],
  // The six magic-glasses games: one rule-neutral line each (their rounds are being reworked).
  glowflies: [{ text: 'Catch the glow-flies! Run or jump right through them!', icon: 'glasses', action: 'jump', mood: 'excited' }],
  oddone: [{ text: "Three shapes, one is different. Push that one's button!", icon: 'glasses', action: 'use', mood: 'curious' }],
  lineup: [{ text: 'Move the magic ring onto a bubble, then pop it!', icon: 'glasses', action: 'use', mood: 'curious' }],
  toys: [{ text: 'I lost my toys! Follow the glowing paw prints to find them!', icon: 'paw', extra: 'glasses', mood: 'curious' }],
  gates: [{ text: 'Each eye sees half a shape. Run through the matching arch!', icon: 'glasses', mood: 'curious' }],
  dotsigns: [{ text: 'Find the shape hidden in the dots. Push its button!', icon: 'glasses', action: 'use', mood: 'curious' }],
  vault: [
    { text: 'A secret vault! Magic glasses show three shapes in a row.', icon: 'lock', extra: 'glasses', mood: 'curious' },
    { text: 'Push the door buttons in that same order!', icon: 'lock', action: 'use', mood: 'excited' },
  ],
  chest: [
    { text: 'A treasure chest! Magic glasses help you find its key.', icon: 'chest', extra: 'key', mood: 'curious' },
    { text: 'Bring the key back and step on the matching symbol!', icon: 'key', extra: 'lock', mood: 'excited' },
  ],
  workshop: [{ text: 'Pick silly parts for your buggy! Gems pay for them.', icon: 'gear', action: 'use', extra: 'wCar', mood: 'happy' }],
  secrets: [
    TIPS.arrows,
    { text: 'Some stepping stones only magic glasses see. Hop across!', icon: 'glasses', action: 'jump', mood: 'excited' },
  ],
};

/** Economy, explained once at the moment it matters. */
export const ECON = {
  gem: { text: 'A gem! Gems are money for rides, hats and gear!', icon: 'gem', extra: 'wallet', mood: 'excited', callout: HUD.wallet },
  mega: { text: 'A mega gem! The spiky ones are worth five!', icon: 'megaGem', mood: 'excited', callout: HUD.wallet },
  key: { text: 'You found a key! Bring it back to its chest!', icon: 'key', extra: 'chest', mood: 'excited' },
  ticket: { text: 'The first ride is free. After that, rides cost gems!', icon: 'ticket', extra: 'gem', mood: 'curious', callout: HUD.wallet },
  stamp: { text: 'A Fun Pass stamp! Fill the card for giant prizes!', icon: 'mission', extra: 'jackpot', mood: 'proud', callout: HUD.missions },
  shop: { text: 'Pick something cool! Your gems pay for it.', icon: 'shop', extra: 'gem', mood: 'happy' },
} satisfies Record<string, ScriptLine>;
export type EconId = keyof typeof ECON;

export const CHUTE = (_k?: KeyNames): ScriptLine => ({ text: 'Parachute now!', icon: 'parachute', action: 'jump', mood: 'excited' });

export interface KeyNames {
  use: string;
  jump: string;
  skill: string;
}

/** Chest context hints (repeat with a long cooldown while the hero stands at a locked chest). */
export const CHEST = {
  findKey: { text: 'Find the key with your magic glasses!', icon: 'key', extra: 'chest', mood: 'curious', hold: 2.4 },
  shape: { text: 'Step on the matching symbol!', icon: 'key', extra: 'lock', mood: 'curious', hold: 2.4 },
} satisfies Record<string, ScriptLine>;

export const needGems = (n: number): ScriptLine => ({ text: `Need ${n} more gems!`, icon: 'gem', extra: 'ticket', mood: 'worried' });

export const suggest = (a: Attraction): ScriptLine => ({ text: `Try the ${ATTRACTIONS[a].name}!`, icon: ATTRACTIONS[a].icon, extra: 'target', mood: 'curious' });

/** Reaction pools: at least eight varied lines each, picked from a shuffle bag. */
const P = (icon: BuddyPicto, mood: Mood, texts: readonly string[]): readonly ScriptLine[] => texts.map((text) => ({ text, icon, mood, praise: true }));

export const POOLS = {
  gem: P('gem', 'happy', ['Shiny! Keep them coming!', 'Ooh, sparkly!', "You're a gem finder!", 'Another one! Yip yip!', 'Your gem pile is growing!', 'Gem-tastic!', 'Sparkle, sparkle!', 'Treasure hunter!', 'More gems, more fun!']),
  mega: P('megaGem', 'excited', ['Whoa, a mega gem!', 'Mega sparkle!', "That one's huge!", 'Super shiny mega gem!', 'Big gem, big smile!', "My tail can't stop wagging!", "Now that's a gem!", 'Ka-ching!']),
  combo: P('combo', 'excited', ['Combo! Keep going!', 'Gem streak!', 'Grab, grab, grab!', 'Combo time!', 'So speedy!', "Don't stop now!", 'Bigger combo!', 'You are on fire!']),
  stunt: P('star', 'excited', ['Whoa! So high!', 'Cool trick!', 'Did you see that?', 'Amazing flip!', 'Up in the clouds!', 'Spin-tastic!', 'That was awesome!', 'Again, again!', 'You fly like a bird!']),
  key: P('key', 'excited', ['Got the key!', 'Jingle jangle!', 'Key time!', 'Good sniffing, buddy!', 'Ooh, a key!', 'Now find its chest!', 'That key looks fancy!', 'Key, key, hooray!']),
  chest: P('chest', 'proud', ['Treasure! Ooh, shiny!', 'It opened! Yay!', "Look what's inside!", 'New stuff for you!', 'Treasure time!', 'Best team ever!', 'We cracked it!', 'Woohoo, treasure!']),
  flop: P('flop', 'silly', ['Silly flop! Boing!', 'Oopsie daisy!', 'Floppy hero!', 'Up you get!', 'Hehe, that was funny!', 'Wibble wobble!', 'Splat! Hehe!', 'Bouncy flop!']),
  landed: P('star', 'proud', ['You did it! Yay!', 'Nice landing!', 'Back on the ground!', 'Smooth landing!', 'Ta-da!', 'What a ride!', 'Ten out of ten!', 'Wow, what a trip!']),
  magic: P('glasses', 'proud', ['Super spotter!', 'You found it!', 'Super sharp!', 'Your glasses rock!', 'Nailed it!', 'Sharp eyes!', 'Spot on!', 'Magic!']),
  bought: P('hat', 'proud', ['Looking sharp!', 'So stylish!', 'Ooh, fancy!', 'Love it!', 'Very cool!', 'Snazzy!', 'Fashion star!', 'Looking good!']),
  stamp: P('mission', 'proud', ['Stamp! Woohoo!', 'Another stamp!', 'Your Fun Pass loves that!', 'Stamp time!', 'One more stamp!', 'Stamped! Next ride?', 'Fun Pass power!', 'Collect them all!']),
  freefall: P('parachute', 'excited', ['Wheee!', 'Weeeee!', 'Fly, fly, fly!', 'Woo-hoo!', 'So fast!', 'Ears flapping!', 'Sky high!', 'Zoom!']),
  goal: P('check', 'proud', ['Goal done! Woohoo!', 'You did it!', 'Goal smashed!', 'Done and done!', 'Easy peasy!', 'High paw!', "That's a win!", 'Super job!']),
  jackpot: P('jackpot', 'excited', ['Jackpot! We are rich!', 'Big prize!', 'Wow, so many gems!', 'Prize time!', 'Jackpot! Yip yip!', 'Rich puppy!', 'Gems, gems, gems!', 'Best day ever!']),
  idle: [
    { text: 'I smell adventure!', icon: 'nose', mood: 'curious' },
    { text: 'Is it snack time?', icon: 'paw', mood: 'silly' },
    { text: 'Wanna race? Go go go!', icon: 'bolt', mood: 'excited' },
    { text: 'Your glasses look super cool!', icon: 'glasses', mood: 'happy' },
    { text: 'Hmm... where next?', icon: 'target', mood: 'curious' },
    { text: 'Scratch my ears? Hehe!', icon: 'paw', mood: 'silly' },
    { text: 'I hear the carnival music!', icon: 'note', mood: 'happy' },
    { text: 'The compass knows fun places!', icon: 'target', mood: 'curious', callout: HUD.compass },
    { text: 'Let us find more gems!', icon: 'gem', mood: 'excited' },
  ],
} satisfies Record<string, readonly ScriptLine[]>;
export type PoolId = keyof typeof POOLS;

/** Trampoline bounce count barks: "One!", "Two!"… */
export const COUNT = ['One!', 'Two!', 'Three!', 'Four!', 'Five!'];

export const SUNSET: ScriptLine = { text: 'Hurry! Sunset is coming!', icon: 'sun', mood: 'worried' };

export { PRIORITY };
