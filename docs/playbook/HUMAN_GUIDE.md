# How to explain a game to the AI

A guide for the owner. You don't need to know game development. You need to make about a dozen
choices, and this sheet shows the options for each in plain words, the way a photographer's sheet
would list lens, lighting and angle.

- **Playbook (for the AI):** https://github.com/avner-creator/red-green-open-world/blob/main/docs/playbook/PLAYBOOK.md
- **Folder with everything:** https://github.com/avner-creator/red-green-open-world/tree/main/docs/playbook
- **In the repo:** `docs/playbook/` (`PLAYBOOK.md`, `BRIEF_TEMPLATES.md`, `CHECKLISTS.md`, `GAME_BRIEF.md`, this file)
- **Your form to fill in:** https://github.com/avner-creator/red-green-open-world/blob/main/docs/playbook/GAME_BRIEF.md

## How to use this

1. Read sections 1–12 below. In each, pick an option or write "not sure".
2. Put your picks into `GAME_BRIEF.md`. Half a page is enough to start.
3. Paste the start prompt (last section) into a new session.
4. The AI asks one batch of questions, then shows you style samples and a tiny playable piece.
   **Your most valuable job is reacting to things you can see and play.**

Three habits that save the most time:

- **Point at examples.** "Like the colours in X, the characters in Y, but calmer" beats any
  description. Screenshots and links are welcome. Also say what you *don't* want.
- **Describe the player's minute, not the features.** "A kid opens it, a dog runs up and says
  follow me, they bounce on something within 20 seconds" tells the AI more than "open world with
  a buddy and a trampoline".
- **Say it early, say it blunt.** "No clue what this is" on day one is cheap. The same sentence
  after twenty things are built is expensive.

---

## 1. The pitch

One sentence: *"A ___ game where you ___ so that ___."*

Also say why it exists. This changes everything downstream:

| Purpose | What it means |
|---|---|
| Just fun | Fun is the only measure |
| Teaches or trains | There is one rule that must always hold; say it in a sentence so it can be tested |
| Promotes something | Short, shareable, brand look matters |

## 2. The player

| Choose | Options | Why it matters |
|---|---|---|
| Age / reading | Non-readers · early readers · fluent kids · teens · adults | Decides text vs. pictures vs. voice |
| Device | Phone · tablet · school laptop · home PC | Decides controls, screen size, how heavy the graphics can be |
| Setting | Alone · with a grown-up · classroom · waiting room | Decides sound, session length, need for a pause |
| Motivation | Chose to play · was asked to play | "Asked to" needs faster fun and more guidance |
| Experience | Never games · casual · plays a lot | Decides how much you can assume about controls |

## 3. The session

| Choose | Options |
|---|---|
| Length | 2 minutes (snack) · 5–10 (short) · 20–30 (sitting) · open-ended |
| Coming back | One-time · daily habit · whenever |
| Saved between visits | Nothing · unlocks and outfits · full progress |
| Ending | Timer runs out · goal reached · player decides · never ends |

## 4. What you do

**Genre**, as a starting word (mixes are fine):

| Genre | You mostly… | Feels like |
|---|---|---|
| Sandbox / open world | Wander and try things | Freedom, discovery |
| Platformer | Run and jump through a course | Skill, flow |
| Puzzle | Think, then act | "Aha!" |
| Arcade / score chase | React fast, beat your score | "One more go" |
| Collect-a-thon | Find and gather | Completion |
| Racing | Steer, go fast | Speed |
| Builder / creative | Make and decorate | Ownership |
| Sim / caretaking | Look after something | Calm, routine |
| Story / adventure | Follow a tale, make choices | Curiosity |
| Party / mini-games | Many short different games | Variety, laughs |
| Rhythm | Act in time with music | Groove |
| Card / board / strategy | Plan turns | Cleverness |

**Verbs.** Pick 2–4 the player does most: run · jump · drive · fly · collect · match · sort · build ·
aim · throw · dodge · balance · explore · talk · dress up · solve · time a press · draw.

**The loop.** Fill in: *do ___ → get ___ → which lets you ___.* If you can't fill this in, the
game has no pull yet; say so and ask the AI for three loops to choose from.

**Challenge.**

| Level | Failing looks like |
|---|---|
| Relaxed | You can't fail |
| Gentle | A funny stumble and an instant retry |
| Tricky | Lose a little progress |
| Hard | Start the level over |

**Structure.** Open world (go anywhere) · hub with doors · levels in a row · one endless screen.

## 5. View and controls

| Choose | Options | Notes |
|---|---|---|
| Dimension | 2D · 2.5D (3D look, flat movement) · 3D | 3D costs several times more to make feel good |
| Camera | Side view · top-down · angled from above (isometric) · behind the character · through the character's eyes · fixed screen | "Behind the character" in 3D is the hardest to get right |
| Input | Keyboard + mouse · touch · gamepad | Each one you add is real work; say which is the main one |
| Complexity | One button · move + one action · move + jump + use · many | Fewer is better for young or casual players |
| Orientation (phones) | Landscape · portrait | Pick one |

## 6. Look

This is where examples matter most. Choose a row in each table, and send pictures.

**Art style**

| Style | Looks like | Cost |
|---|---|---|
| Flat / vector | Clean shapes, solid colours | Low |
| Pixel art | Chunky retro squares | Low–medium |
| Hand-drawn / storybook | Pencil, paint, paper texture | Medium–high |
| Cut-paper / craft | Felt, cardboard, clay | Medium |
| Low-poly 3D | Simple faceted shapes | Low–medium |
| Toy / vinyl 3D | Smooth, rounded, glossy | Medium |
| Cartoon / cel-shaded 3D | Outlines, flat shading | Medium |
| Stylised realistic | Believable but simplified | High |
| Realistic | Photo-like | Very high; rarely right for the web |

**Characters**

| Choose | Options |
|---|---|
| Kind | People · animals · creatures · robots · objects with faces · no character |
| Proportions | Big head, small body (cute) · cartoon · natural |
| Face | Dots and a smile · expressive cartoon · detailed |
| Movement | Bouncy and exaggerated · smooth · stiff on purpose (funny) |
| Choice | One hero · pick from a few · build your own |

**Colour and mood**

| Choose | Options |
|---|---|
| Palette | Bright primary · pastel · warm sunset · cool night · earthy · neon · black-and-white with one accent |
| Mood | Cheerful · cosy · silly · mysterious · epic · calm · spooky-but-safe |
| Lighting | Sunny midday · golden hour · overcast soft · night with glows · indoor |
| Detail | Sparse and clean · medium · busy and rich |
| Setting | Park · city · island · space · underwater · house · fantasy land · abstract |

**Screen furniture (the HUD and menus)**

| Choose | Options |
|---|---|
| Amount | Nothing on screen · a couple of icons · full dashboard |
| Language | Icons only · icons + a few words · text |
| Shape | Round and chunky · sharp and techy · hand-drawn |

**"Juice"** (how much the game reacts to you): subtle · lively (squash, bounce, sparkles, sound on
everything) · over the top. More juice makes simple actions feel good; it is usually worth asking
for "lively".

Also tell the AI what to avoid: "not babyish", "not dark", "no mixed styles", "nothing that looks
like <game>".

## 7. Sound

| Choose | Options |
|---|---|
| Music | None · calm loop · upbeat loop · changes with what you do · player picks (a radio) |
| Sound effects | Realistic · cartoony · musical (actions make notes) |
| Voice | None · narrator · a character talks · gibberish voices |
| Sound-off play | Must work silent · sound is essential |

Voice is the best way to reach non-readers. If you want it, say so on day one; it shapes how every
instruction is delivered.

## 8. Guidance and story

| Choose | Options |
|---|---|
| Teaching | Learn by trying · a short guided first minute · a companion who leads and talks · arrows and signs · written tutorial |
| How much hand-holding | Always shows the next thing · hints when you're stuck · none |
| Story | None · a one-line excuse ("help the dog find its toys") · chapters with characters |
| Text bubbles | Often · rarely · never |

A new player must know what to do in the first 10 seconds and where to go next at every moment.
Decide here who or what tells them.

## 9. Rewards

| Choose | Options |
|---|---|
| Collect | Coins/gems · stars per level · stickers or stamps · creatures · nothing |
| Unlock | Outfits and hats · new characters · new areas · new powers · new music |
| Show off | End-of-session summary · a collection book · a score to beat · a thing you built |
| Surprise | Predictable · some randomness · lots of silly surprises |

Say how many kinds of collectable you want. One or two is clear; four is confusing.

## 10. Content rules

- **Tone:** gentle · silly · adventurous · competitive · spooky-but-safe.
- **Never include:** violence, scary things, real brands, reading-required steps, ads, chat,
  personal data… list yours.
- **Wording to avoid:** any topic or claim the game must not make.
- **Originality:** "inspired by the feel of X" is fine; copying X's characters, names or levels is not.

## 11. Size

| Size | Means | Honest cost |
|---|---|---|
| One thing, polished | A single mechanic that feels great | Smallest, safest |
| A handful | 3–6 activities sharing one world | Medium |
| Big world | 15+ things to find | Large; quality per thing drops unless you allow time |

Name the **three things that must be great** and the things that can be cut. The AI will build
the first 60 seconds to a finished standard before anything else; expect to play that first.

## 12. Practical

- Where it lives (a hosting account you sign in to), and whether paid art or sound is allowed.
- Who can playtest and how often. Ten minutes from one real member of the audience, early, is
  the single most useful thing you can arrange.
- Deadline, languages, accessibility needs (colour-blind safe, one-handed, subtitles, etc.).
- Whether you can run a second account in parallel to speed up the build.

---

## What you'll be asked to do during the build

| When | What you get | What you do |
|---|---|---|
| Day 1 | A batch of questions with options | Pick; "you choose" is a valid answer |
| Day 1–2 | 3–5 style samples (pictures) | Pick one, or mix: "A's characters with C's colours" |
| First playable | The first 60 seconds, finished | Play it; give it to one real player; answer the 8 playtest questions in `CHECKLISTS.md` |
| Each day after | A link + what changed + what to look at | Play 10 minutes; reply blunt and short |
| Near the end | A list only you can check | Real phone, other browsers, sound by ear, real players |

**Good feedback** says where you were, what you expected, and what happened: *"At the hill with the
balloon I had no idea what it was for."* You don't need to propose the fix.

---

## Start prompt for a new game

Before pasting: create (or pick) the new game's repo, add **both** repos to the session — the new
game repo and `avner-creator/red-green-open-world` (for the playbook) — and have your filled-in
brief ready.

```
You are the lead/orchestrator for a new web-based game. Work in the repo <owner/new-game-repo>.

First read the playbook in avner-creator/red-green-open-world, folder docs/playbook/:
PLAYBOOK.md, BRIEF_TEMPLATES.md, CHECKLISTS.md. Follow its phases and gates in order. Treat the
other game's own design, style, audience and tech choices as NOT applying here; only the process does.

My brief is below. Where I wrote "not sure", ask me once, in one batch, with 2–3 options and your
recommendation for each. Then: set up the repo docs and shared rules, show me 3–5 style samples as
pictures, and build the finished first 60 seconds for me to play before building anything else.
Explain things simply, show me pictures or a link for anything visible, and tell me when to play.

--- MY BRIEF ---
<paste your filled-in GAME_BRIEF.md here>
```
