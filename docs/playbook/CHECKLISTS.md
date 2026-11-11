# Checklists

## Gate 0 — before any building

- [ ] Brief filled in; every "not sure" has a logged decision
- [ ] Audience, session length, devices and input methods written down
- [ ] Style sample approved by the owner from real in-engine pictures
- [ ] First 60 seconds storyboarded: what the player sees, does, hears, and wins
- [ ] Shared rules written: input map, HUD layout, world/site map, budgets, core rule as a test
- [ ] Tech and art pipeline chosen, with reasons
- [ ] Deploy-on-push to a real URL works with an empty page

## Gate 1 — vertical slice

- [ ] One activity is finished: start, how-to, round, ending, reward, exit
- [ ] A new player knows what to do within 10 seconds, without reading if the audience can't
- [ ] Guidance to the *next* thing exists and keeps working for the whole session
- [ ] Sound and feedback on every action
- [ ] Runs on the weakest target device at the target frame rate
- [ ] Owner played it; one real member of the audience played it
- [ ] They wanted to keep going (if not: fix the slice, do not add content)

## Done for a feature (worker, before reporting)

**Clear**
- [ ] Findable: visible from the path, or the guide leads there
- [ ] The rule is shown, not written (demo, pictogram, voice), and understood in 10 seconds
- [ ] One action per key, from the shared input map; prompt shows what the key will do

**Complete**
- [ ] Played a full round with real key presses, not test shortcuts
- [ ] It always ends: win, time-out, or a kind ending for a player who keeps failing
- [ ] Result is shown and the reward arrives
- [ ] A visible exit at all times; holding keys during a countdown breaks nothing
- [ ] Idle player: nothing stalls longer than 15 seconds without a cue

**Solid**
- [ ] Walked into everything from eight directions: nothing passes through, nothing traps
- [ ] Stuck check: no spot where the player pushes for 3 seconds without moving and can't get out
- [ ] Camera never inside the player, a character, or scenery, on desktop and phone sizes
- [ ] Both input methods work (keyboard/mouse and touch, or gamepad if targeted)

**Fits**
- [ ] On its reserved site; no overlap with neighbours or HUD at every target screen size
- [ ] Within budget in its named camera views, measured with the deterministic script
- [ ] The product's core rule holds, proven by its test
- [ ] Content rules hold (tone, age rating, wording)
- [ ] Every new asset has a licence row

**Honest**
- [ ] Fun score 1–5 with one sentence why; below 3 is not done
- [ ] Looked at own screenshots (and single-channel or contrast variants if relevant)
- [ ] Report says what was not tested

## Before a push to the live site (orchestrator)

- [ ] All branches for the batch merged; no conflict markers; typecheck and lint clean
- [ ] Machine is quiet (no other jobs); full check run by the orchestrator, exit code read
- [ ] Budget check run if geometry or effects changed
- [ ] Failures investigated, never skipped; a "test problem" has a stated cause
- [ ] Docs updated: progress, decisions, handoff
- [ ] Owner told: time to play, what changed, what to look at, what's known broken

## QA round (independent)

- [ ] Every previous finding re-checked: fixed / partly / not, with evidence
- [ ] Full first session as a new player who follows the guide
- [ ] Full first session as a player who ignores the guide
- [ ] One full round of every activity not yet played
- [ ] Phone size with touch; second input method
- [ ] Deliberate misuse: hold keys in countdowns, walk away mid-round, reverse, spam the use key
- [ ] Core-rule spot checks at each place played
- [ ] Console errors; text the player must read; content rules
- [ ] Findings ranked Blocker / Major / Minor with repro steps
- [ ] "Not tested" list written out

## Owner's ten-minute playtest

Play once without reading any notes, then answer:

1. In the first 30 seconds, did you know what to do? What did you try first?
2. Was there a moment you didn't know where to go next? Where?
3. Which thing was the most fun? Which was the most boring or confusing?
4. Did anything feel broken, stuck, or unfair?
5. Did anything look or sound out of place with the rest?
6. Did it repeat itself (same line, same reward, same sound) until it got annoying?
7. Would the real audience want a second go? Why or why not?
8. On your phone: could you reach and read everything?

Short, blunt answers are best. "No clue what the balloon thing is" is perfect feedback.

## Release

- [ ] Definition of done in the design doc checked line by line
- [ ] Real devices and browsers on the target list tried by a person
- [ ] Audio listened to by a person
- [ ] Credits and licences complete
- [ ] Load size and time within budget on a slow connection
- [ ] Tag, final report, handoff doc current
