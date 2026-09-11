# Worker bootstrap — read this first

You were spawned with a working directory that is **not this repo**, so you inherited some other
project's `CLAUDE.md` and none of ours. This is the two-minute on-ramp. Read it, then your brief.

## 1. What this repo is

**Super Ultra Pong 64: Remastered** is a Pong that evolves while you play it — you start at the
1972 arcade machine (black screen, two white bars, a square ball, a dashed centre line) and the
game is meant to grow up through the eras around it as the session goes on. Evoland, but for Pong.
Every point either side scores moves the machine **up one era** -- 0 the 1972 arcade machine,
1 the 1977 Atari 2600 (the turn to colour), 2 the NES, 3 the Genesis, 4 the Super Nintendo, where
it stops. It does not matter which side scored, so a match's fourth point lands on era 4 and every
point after that leaves it there. **All five rungs are built** -- each has its own look, its own
voice and a change moment -- and the README's *The era ladder* tables them, with a tracked
reference frame of each in `docs/shots/eras/`. It opens on a **title screen** -- a real `phase` in
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

From the repo root, Node 18+. **75 tests, well under a second** (0.15 s measured). It is the headless suite over the pure rules
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
`ladder-era4-snes.png`, cropped to the field) and one more point to prove it stops on era 4.
`--ladder` runs only that walk (about half a minute); `--scoring` runs only the rally and the
scoring check (about fifteen seconds a run); `--reference` also copies its five frames into
the tracked `docs/shots/eras/`. To look at one era without playing up to it, open
`index.html?era=N` (N is 0 to 4) or pass `--era N`. Chrome runs `--mute-audio`, so a playtest never beeps through the
machine's speakers. `--no-audio` takes `AudioContext` away before the page loads and checks the game
plays silently with no errors. Pass `--chrome "<path to chrome.exe>"` if
it cannot find a browser, and `--port <n>` if 9333 is busy; each port gets its own Chrome profile,
so two playtests on two ports can run at once. Use it for any change to
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
  frames a reader opens: `docs/shots/eras/era0-arcade.png` to `era4-snes.png`, one per rung, and
  the older `docs/shots/bootstrap/era-zero.png`. If you deliberately change how an era looks,
  re-take them with `node tools/playtest.mjs --ladder --reference` and commit them on purpose, in
  their own commit. Only `--reference` writes there; a plain playtest never touches them.
- Chrome's throwaway profile directories and any temp files from a playtest run — keep them on
  `G:/claude-tmp`, outside the worktree.

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

Add to this list every time a run loses time to something avoidable — it is the only section that
earns its keep by growing.
