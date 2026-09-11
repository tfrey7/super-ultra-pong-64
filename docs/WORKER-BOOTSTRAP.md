# Worker bootstrap — read this first

You were spawned with a working directory that is **not this repo**, so you inherited some other
project's `CLAUDE.md` and none of ours. This is the two-minute on-ramp. Read it, then your brief.

## 1. What this repo is

**Super Ultra Pong 64: Remastered** is a Pong that evolves while you play it — you start at the
1972 arcade machine (black screen, two white bars, a square ball, a dashed centre line) and the
game is meant to grow up through the eras around it as the session goes on. Evoland, but for Pong.
Every point either side scores moves the machine **up one era** -- 0 the 1972 arcade machine,
1 the 1977 Atari 2600 (the turn to colour), 2 the NES, 3 the Genesis, 4 the Super Nintendo, then
the 3D table: 5 the PlayStation, 6 the Nintendo 64, 7 the Dreamcast, 8 the PlayStation 2, 9 the
Xbox and 10 the 2005 Xbox 360, where it stops. It does not matter which side scored, so a match's
tenth point lands on era 10 and every point after that leaves it there. **All eleven rungs are
built** -- each has its own look, its own voice and a change moment -- and the README's *The era
ladder* tables them, with a tracked reference frame of each in `docs/shots/eras/`. Eras 5 to 10
are specified in `docs/ERAS.md`, the era bible. It opens on a **title screen** -- a real `phase` in
`src/game.js`, where `step()` moves nothing at all until `startGame()` is called -- with a
self-playing demo rally behind it, drawn from the score's own block font. It is plain HTML and plain JavaScript — **no npm, no
`package.json`, no build step, no framework, no dependencies of any kind** — and that is a
deliberate property to preserve, not an accident of it being early. The layout exists so later
eras are *additions*: `src/game.js` is the rules, `src/render.js` the look, `src/input.js` the
hands, `src/sound.js` the voice (each era's notes, synthesised on the page), `src/main.js` the loop
that ties them together, and `src/eras/` one file per era's look.
**An era card replaces its own `src/eras/eraN-*.js` and edits nobody else's**; the rules only
carry `state.era` and `state.eraChangedAt`. Open the page at any era with `index.html?era=3`
(`node tools/playtest.mjs --era 3` likewise). Read the `README.md` for the full tour.

## 2. Cut your own worktree

Several agents run at once, and another agent's worktree is not yours to touch. From the main
checkout:

```bash
cd "G:/Claude Stuff/super-ultra-pong-64"
git worktree add "G:/Claude Stuff/super-ultra-pong-64-<name>" -b <branch> master
```

Or, from the fleet console, the same thing with the checks:

```bash
py -3.10 "G:/Claude Stuff/fleet-console/scripts/start_worker.py" --name <branch> --repo "G:/Claude Stuff/super-ultra-pong-64"
```

A fresh worktree here is **complete** — there is nothing to install and nothing to copy across,
because the repo has no dependencies and no build output. Work only inside
`G:/Claude Stuff/super-ultra-pong-64-<name>`. Quote every path — the space in "Claude Stuff" is the
usual first-step failure — and remember `python` is not on PATH here: every Python command starts
`py -3.10`. Put temp files on G: (`export TMP=G:/claude-tmp TEMP=G:/claude-tmp`).

Your work item lives in the console, not in this repo:

```bash
py -3.10 "G:/Claude Stuff/fleet-console/scripts/workitem.py" step <id> "<your PROGRESS line>" --commit <sha>
```

## 3. How to run it

**Open `index.html` in a browser.** That is the whole install: no build, no dev server, no
`npm install`. Double-clicking the file off disk works, because everything is a plain script —
which is also why `src/game.js` ends in a small UMD wrapper instead of using ES module syntax
(`file://` cannot load ES modules).

If you need a real HTTP origin for something, serve the repo root yourself on a **free port above
8930** (`py -3.10 -m http.server 8931`), record the PID, and kill exactly that PID when you are
done. The repo itself binds nothing.

## 4. How to test it

```bash
node --test
```

From the repo root, Node 18+. **333 tests, about two seconds** (2.3 s measured by item 1157, with all eleven eras built). It is the headless suite over the pure rules
in `src/game.js` — paddle bounces and their angles, wall bounces, scoring on each side, the serve
reset, frame-rate independence and the era ladder — plus the era-look checks, which draw on a
recording canvas and need no browser, and the sound checks (`test/sound.test.js`), which drive the
player through a recording stand-in for Web Audio and need no audio device. There is no faster
subset worth naming; the whole thing is two files and already instant. This is the command you run once, immediately
before writing your report.

The page itself — not the rules — is proved by the **playtest harness**:

```bash
node tools/playtest.mjs
```

Node 22+. It launches Chrome with a debugging port and drives the real `index.html` off disk over
the DevTools protocol (no dependencies — Node's built-in WebSocket client), checking that it opens on the
title screen with the ball held still, that a click and a keypress each start it, that the loop
runs in real time, that the mouse and keys move the paddle, that rallies happen, that a miss
scores, and that the next serve starts from the centre -- and that the title screen opens no audio,
the first click switches sound on, the rally is heard, and every era's voice schedules on the real
Web Audio API -- that a forced era change plays its ring at full frame rate (the page's own rAF
timing over the ring, against ordinary play just before it) with the paddle still following the hand,
saving `era-wipe.png` mid-ring -- and, last, it **walks one match up the whole ladder**: a fresh
era-0 machine, one point let through per rung, a check that each point moved it up exactly one era,
a screenshot of each era in play (`docs/shots/playtest/ladder-era0-arcade.png` to
`ladder-era10-xbox360.png`, cropped to the field) and one more point to prove it stops on era 10.
On the way up it **films each of the ten era changes**: a frame caught mid-ring
(`change-era0-to-era1.png` to `change-era9-to-era10.png`), a check that the ring's radius reached
the farthest corner from where the ball went out, and a check that once the ring has gone the live
canvas matches the new era drawn offscreen more closely than the old one -- or, when the two eras
draw the very same frame (a `like: N` stand-in), matches the new era exactly.
The changes alternate sides (item 1174): a change out of an even era (0 to 1, 2 to 3, ...) starts its ring at the left edge, a real miss past the player, and a change out of an odd era (1 to 2, 3 to 4, ...) starts it at the right edge, the player's own point put just past the computer's paddle -- and a check names the edge each ring came from.
`--ladder` runs only that walk (about a minute for all eleven rungs); `--scoring` runs only the
rally and the scoring check (about fifteen seconds a run); `--reference` also copies its eleven era
frames and ten change frames into the tracked `docs/shots/eras/`. To look at one era without playing up to it, open
`index.html?era=N` (N is 0 to 10) or pass `--era N`. Chrome runs `--mute-audio`, so a playtest never beeps through the
machine's speakers. `--no-audio` takes `AudioContext` away before the page loads and checks the game
plays silently with no errors. Pass `--chrome "<path to chrome.exe>"` if
it cannot find a browser, and `--port <n>` if 9333 is busy; every launch gets a fresh Chrome profile
that is deleted when Chrome exits, so two playtests on two ports can run at once. Use it for any change to
`src/render.js`, `src/input.js`, `src/main.js` or `index.html`; `node --test` alone is enough for a
change confined to the rules.

**Screenshots** come from headless Chrome, never the Browser pane:

```bash
py -3.10 "G:/Claude Stuff/fleet-console/scripts/shot.py" "file:///G:/Claude Stuff/super-ultra-pong-64-<name>/index.html" out.png
```

## 5. How the fleet lands it

A branch here is landed by the fleet's integrator, not by you, and it does not guess how this
repo works — the repo root's **`fleet.json`** tells it:

```json
{ "repo": "super-ultra-pong-64", "suite": "node --test",
  "build": null, "protect": [], "restart": null }
```

The suite is `node --test`; there is **nothing to build**, **nothing protected** and **nothing
to restart** after a merge. Those nulls are a description rather than an unfinished file — a
game you open off disk has no build output and no service to bounce, and since the playtest
screenshots became ignored output there is no path a merge has to tread carefully around. If
you ever add one of those things, this is the file that has to say so.

## 6. What never to commit

- **`node_modules/`** — nothing should ever create one here, and its appearance means something
  pulled in a dependency this repo does not want. If you genuinely need one, that is a
  conversation, not a commit.
- **Playtest screenshots.** The harness rewrites `docs/shots/playtest/` on every run, so that
  directory is gitignored and a playtest leaves `git status --short` empty — there is nothing to
  check afterwards and nothing to restore. The screenshots that *are* tracked are the reference
  frames a reader opens: `docs/shots/eras/era0-arcade.png` to `era10-xbox360.png`, one per rung,
  `change-era0-to-era1.png` to `change-era9-to-era10.png` beside them, one per era change caught
  mid-ring, and the older `docs/shots/bootstrap/era-zero.png`. If you deliberately change how an
  era looks or how it arrives,
  re-take them with `node tools/playtest.mjs --ladder --reference` and commit them on purpose, in
  their own commit. Only `--reference` writes there; a plain playtest never touches them.
- Chrome's throwaway profile directories and any temp files from a playtest run — keep them on
  `G:/claude-tmp`, outside the worktree. `tools/chrome.mjs` puts each profile under the temp
  directory and deletes it itself, so set `TEMP`/`TMP` to `G:/claude-tmp` and there is nothing to tidy.

## 7. Ports this repo owns

**None.** The game is a file you open; nothing in `src/` listens on anything.

Two ports are borrowed rather than owned. `tools/playtest.mjs` opens Chrome's debugging port,
**9333** by default (`--port` to move it), and a static server, if you want one, takes a free port
**above 8930** that you release when you finish. **8790 is Tim's live fleet console and 27183 is
his emulator — never touch either.**

## 8. Traps

- **`src/game.js` must stay free of canvas, DOM, timers and input devices.** It is the rules and
  nothing else, and the headless suite exists only because that is true. Reach for
  `document`, `requestAnimationFrame` or `setTimeout` in there and `node --test` fails outright.
  New state fields and new rules in `step()` are the intended way to grow it; the renderer and the
  input module read the state they are handed and never write it.
- **`step` takes a delta time in seconds and is not allowed to assume 60fps.** Long frames are cut
  into substeps so a fast ball cannot tunnel through a paddle, and a test pins the equivalence of
  one long frame to sixty short ones. Randomness goes through `state.rng` so tests can fix it —
  never call `Math.random()` directly.
- **No ES module syntax in anything `index.html` loads.** The page is opened off disk, and
  `file://` refuses ES modules; that is why `src/game.js` carries a UMD wrapper that serves both
  the browser (`window.Pong`) and `node --test` (CommonJS). `tools/playtest.mjs` is `.mjs` because
  Node runs it, not the page.
- **Run `node --test` from the repo root.** The suite reaches `src/game.js` by relative path.
- **The scoring check plays a scripted hand, so believe its FAIL.** "The player can score against
  the computer" used to give 22 seconds of plain ball-tracking and passed only 44% of the time --
  the computer is beatable by design, not beatable every 22 seconds. Since item 1160 the harness
  plays `tools/scoring-rally.js` instead, which asks the rules where to stand so the computer
  cannot return the shot, and keeps shooting for up to 45 seconds (it stops at the point, usually
  inside fifteen). A FAIL on that line now means scoring is really
  broken, or the computer has been made unbeatable -- both regressions. `node tools/playtest.mjs
  --scoring` runs just that check, about fifteen seconds a run. `node tools/beatability-sample.mjs` still
  measures how beatable the game itself is: its `track` and `corner` rows are the design, its
  `scripted` row is the check's hand.
- **Eras 0 and 1 are pinned to the pixel.** `tools/eralooks-today.json` holds every draw call
  those two eras made before the ladder existed, and a test compares the live renderer against
  it. A deliberate change to either look re-records it: `node tools/eralooks.js`, committed with
  the change and said so in the report. An era 2+ card never needs to.
- **Sound listens to `state.events`, never to `lastEvent`.** The rules append every paddle hit, wall
  bounce and point to `state.events` (emptied at the start of each `step`); `lastEvent` keeps only
  the final one, so a hit and a bounce in one frame would lose a note. `src/sound.js` reads the list
  and writes nothing, plays the real game only (never the attract rally), and opens no audio until
  `begin()` in `src/main.js` unlocks it from a click or key -- browsers refuse sound before that.
  An era's voice is its row in `VOICES` in `src/sound.js`.
- **Nothing under `test/` may be a helper.** `node --test` runs every `.js` file under `test/`,
  which is why the era-look loader and scenes live in `tools/eralooks.js`.
- **The computer paddle is deliberately beatable** — it only chases once the ball heads its way,
  aims slightly off centre, and cannot match a really steep shot. If a change makes it perfect,
  that is a regression in the game even when every test passes.
- **Fleet CI cannot run this repo yet** (item 1130). Every flourish card ran `node --test` by hand
  and said so in its note; do the same rather than waiting on a CI run that never starts.
- **A flourish draws, and nothing else.** The hook is called from the renderer every frame of the
  ring, and may be drawn twice in one frame (a recorder, a redraw), so a sound started from it
  plays twice. An arrival's sound is the arriving voice's `boot` list in `src/sound.js`: the player
  plays it in place of `score` for the point that moved the machine up (item 1162). Eras 1 and 2
  are the worked examples, and each boot list starts with the era's own point note so the point is
  still heard. Items 1137 and 1138 once patched the voice table from their flourishes; that is gone.
- **The ring is under one field unit wide for its first frames.** The eased progress starts slow
  and the plain edge is skipped below a radius of 1, so a flourish that waits for the ring to have
  width misses the start of its own change -- item 1137's power-on line did until it keyed off
  the time instead.
- **A look borrowed is a flourish borrowed.** An era that reuses another era's drawing (the Super
  Nintendo draws parts of era 1's) replays that era's arrival effect unless the effect checks
  `toEra` -- item 1137 caught its CRT sweep replaying on era 4.
- **A test that pins "era N has no flourish" goes stale when a sibling card gives it one.** Item
  1161 had to rewrite era 3's shatter test after era 2 grew a flourish; pin that the effect is your
  era's own hook, not that the others have none.
- **The first ring on a cold page has one long frame** (about 110-120 ms at raw progress 0.006).
  It is the ring engine's (item 1164), not your flourish's: item 1140 proved it by A/B with its
  flourish removed. Do not chase it in an era file.
- **Start Chrome only through `tools/chrome.mjs`, never with a hand-built `--user-data-dir`.** A
  capture script that spawns Chrome itself leaves its profile behind -- about 18 MB a run, and on
  2026-09-10 the flourish cards' scripts left more than forty such folders in `G:/claude-tmp` (item
  1169). `launchChrome(chromePath, flags, { name })` makes a fresh folder per launch and deletes it
  when Chrome exits: when the script ends, on an uncaught error, on `process.exit` and on Ctrl+C.
  Pass your flags as before, minus the profile (it refuses one), and end with `await chrome.close()`
  in a `finally`. The playtest and every capture script under `docs/` already do. What it cannot
  cover is the script itself being killed outright (Task Manager, `taskkill /F`): nothing runs
  then, and that one folder stays.
- **Proof paths in a report must survive the landing.** The integrator deletes your worktree, so
  a picture cited at `G:/Claude Stuff/super-ultra-pong-64-<name>/...` is a dead link the moment the
  branch lands (item 1138). Cite the path the file will have in the main checkout.
- **The ladder walk's "new era draws afterwards" check leaves out the name card's band.** It
  compares the live canvas with each era drawn offscreen, and the card covers the middle 180 rows
  of both until the serve; a look that draws something important only there would pass unseen.

- **An era card that lands before its neighbours reports false FAILs, and they are not yours.**
  While eras 6 to 10 were `like: 5` stand-ins, every run of the full playtest on this repo read
  four or five FAILs of the form *"0 of 336000 pixels differ from era N drawn offscreen, 0 from era
  N-1"*: two adjacent rungs drew the same frame, so "closer to the new era than the old" could not
  hold. Four separate cards (1145, 1148, 1150, 1179) each lost time proving that on clean master.
  Since item 1157 the check asks only an exact match when the two offscreen frames are identical,
  so a stand-in rung passes; a FAIL there now means the new era really is not what draws.
- **An era's reference frames are shot by one climb, never one at a time.** Each era card re-took
  the frames with `--ladder --reference`, which rewrites all twenty-one PNGs, so an era branch cut
  before its neighbours landed carries a stale picture of their rungs (item 1184 had to re-shoot the
  six 3D change frames on the merged tree, where three arrivals it had filmed as stand-ins were
  real by then). Re-take the
  frames once, on the merged tree, in their own commit -- and if your card only changed one era,
  commit only that era's two PNGs and restore the rest with `git checkout -- docs/shots/eras`.
- **A 3D era's ring is slower than play, and that is not a regression.** The arrivals from the
  PlayStation up measured ring frames at 4.2 to 5.4 ms mean against about 4.2 ms of ordinary play
  (items 1153, 1154, 1155), all inside a 16.7 ms frame. The playtest's "ring at full frame rate"
  check compares against play just before it, so on a loaded machine it can miss by a hair with
  the flourish switched off too (item 1156 measured 22.8 against 22.9 ms). A/B with the flourish
  off before you chase it.
- **A pixellab image drawn onto the live canvas breaks the playtest's pixel read, off disk.**
  `tools/playtest.mjs` compares the live canvas with each era drawn offscreen by calling
  `getImageData` in the page, and the page is opened from `file://`, where Chrome counts every
  image as another origin: one `drawImage` of a `assets/pixellab/*.png` taints the canvas, and the
  read throws a SecurityError. The first era card that draws pixellab art has to deal with that
  check (serve the repo over HTTP for it, or compare screenshots instead); item 1177, which built
  the loader, measured none of this in a browser -- it is reasoned from the harness's own code.
- **The pixellab balance lags the bill.** `node tools/pixellab.mjs` reads the subscription's
  generations left before and after a generation; on item 1177's test image the call was billed
  1 generation, the count read 9953 both times, and a `balance` run about two minutes later read
  9952. Trust the call's own `cost` in the manifest, not `generationsUsed` (which records 0 for
  that image), for what one image costs.

- **The ball carries more than its position and velocity** (item 1208): `ball.spin` bends its
  flight and `ball.burst` is a smash's extra speed, and each paddle has a smoothed `vy`. Anything
  that copies the ball to replay it -- the scripted scoring hand's `snapshotOf`/`copyOf`, the
  playtest's `state()` -- must copy spin and burst too, or it plans against a straight ball that
  is not coming. The spin read for the computer is `Pong.spinBend(state, x)` times
  `rules.cpuSpinRead`; a spin change is re-measured with `node tools/beatability-sample.mjs`,
  whose `track` row must stay between 35 and 60 percent (55.7 when item 1208 tuned it).

Add to this list every time a run loses time to something avoidable — it is the only section that
earns its keep by growing.

## 9. Talk in the room as you go (item 1170)

*Copied word for word from the fleet console's own bootstrap, section 21a, so a worker here gets
the same rule without leaving this repo (item 1171). If that section changes, copy it again.*

Tim follows the fleet in this room, and a worker that says nothing until its report leaves it silent
for twenty minutes. **There is no post command to learn: the room invents nothing and draws only
your own markers** (`chatroom.py`). What you post with is the marker, written at the start of a line
in your ordinary output, and recorded on the card straight after with
`mcp__fleet__queue_step(id, text, commit)` (or `workitem.py step`). Post at four moments, a sentence
or two each, in plain words for Tim -- no file, branch, function or test names, never a stack trace:

| when | what you write | the room draws |
| --- | --- | --- |
| you start | `PLAN:` with each step saying what you will do and how | *plan* |
| each step | `PROGRESS k/n: <what just got done>; next, <what is next>` | *progress* |
| something did not work | the next `PROGRESS` line says what you tried, what failed and what you will try instead | *progress* |
| you finish or hand back | the ending line (`DONE` / `FAILED` / `TIMED OUT` / `STOOD DOWN`), its first sentence written for Tim | *outcome* |

**A failed attempt has no post of its own yet.** A `PROGRESS` line re-emitted at the step you are
still on replaces that step's earlier post instead of adding one, so the failure rides your next
real marker. Item 1175 asks for a post kind that says it on its own.

One of each:

```
PLAN:
1. Find why the board forgets which columns you collapsed, by reloading it with two columns shut
2. Keep that choice across a reload and a console restart
3. Check it on a phone-sized screen

PROGRESS 1/3: the board only remembered collapsed columns until the page reloaded; next, keeping that choice somewhere that lasts.
PROGRESS 2/3: keeping the choice in the browser did not work, because a console restart wiped it, so the console keeps it now; next, the phone-sized check.
DONE: the board remembers which columns you collapsed, across reloads and restarts, on a wide screen and a narrow one.
```
