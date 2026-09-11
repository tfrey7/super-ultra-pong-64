# Super Ultra Pong 64: Remastered

A Pong that **evolves while you play it**. You start at the 1972 arcade machine —
black screen, two white bars, a square ball, a dashed line down the middle — and
as the session goes on the game grows up through the eras around it: colour,
sound, sprites, physics, whatever each later era brings. Evoland, but for Pong.

**Every point either side scores moves the machine up one era**, from the 1972
arcade machine to the Super Nintendo (see *The era ladder* below): black and
white, the Atari's turn to colour, the NES's 8-bit sprites, the Genesis's 16-bit
shading and the Super Nintendo's Mode 7 floor, each with its own sound and a
flash-and-name-card moment as the machine moves up.

## Play it

Open **`index.html`** in a browser. That is the whole install: no `npm install`,
no build step, no dev server. Double-clicking the file off disk works, because
everything is a plain script and there is nothing to compile.

It opens on the **title screen**, with a demo rally playing itself behind the
name the way an idle cabinet did. Nothing counts there: the ball is held still
and no point can be scored until you press any key or click. All of it is drawn
on the canvas out of the score's own block font — there is no HTML text on the
page at all.

- **Your paddle is on the left.** Move the mouse over the field to place it, or
  use the **arrow keys** / **W** and **S**. Whichever you touched last is the one
  in charge, so you can swap mid-rally.
- The **computer plays the right paddle**. It is beatable on purpose: it only
  chases the ball once the ball is heading its way, it aims slightly off centre,
  and it cannot move as fast as a really steep shot travels. Aim for the corners.
- **Where the ball hits your paddle decides the angle.** Dead centre sends it
  straight back; the tips send it steep. Every hit makes the ball a little faster.
- A point scores when the ball leaves either side, and the next serve starts from
  the centre after a short pause. The score is drawn across the top.

**The sound grows up with the machine.** Paddle hits, wall bounces and points
each play a note made on the page itself, with no audio files: a bare
square-wave blip on the arcade machine and the Atari, square and triangle
chiptune on the NES, a bright FM bell on the Genesis, and full layered chords
with a short echo on the Super Nintendo. The game is silent until your first key
or click, because browsers do not let a page make sound before that, and it
plays on silently in a browser with no audio at all.

## Run the tests

```bash
node --test
```

Node's own test runner, no dependencies, nothing to install (Node 18 or newer).
The suite is headless — paddle bounces and their
angles, wall bounces, scoring on each side, the serve reset, and the fact that
the same second of play produces the same result whether it arrives as one long
frame or sixty short ones — plus each era's look, and each era's sound, played
through a recording stand-in for the browser's audio so no audio device is needed.

There is also a **playtest** that proves the page itself is playable, by opening
the real `index.html` off disk in a real browser and playing it:

```bash
node tools/playtest.mjs
```

It launches Chrome with a debugging port and drives it over the DevTools
protocol — still no dependencies, using Node's built-in WebSocket client (Node
22 or newer) — then checks that the loop runs in real time, that the mouse and
the keys move the paddle, that rallies happen, that a miss scores, and that the
next serve starts from the centre. It also checks the sound: nothing is opened on
the title screen, the first click switches it on, the rally is heard, and every
era's voice plays in the real browser. Chrome runs muted, so the checks never
beep through your speakers. `--no-audio` runs the same checks with the browser's
audio taken away, to prove the game still plays silently. Pass
`--chrome "<path to chrome.exe>"` if it cannot find a browser on its own.

Last of all it **walks one match up the whole ladder**: a fresh machine on era
0, then it lets a point through for each rung, checks that every point moved the
machine up exactly one era, photographs each era in play once its change moment
has cleared, and scores one more at the top to prove the ladder stops on the
Super Nintendo. `--ladder` runs only that walk, in about half a minute:

```bash
node tools/playtest.mjs --ladder              # just the walk up the ladder
node tools/playtest.mjs --ladder --reference  # and re-take the tracked era frames
```

Every run rewrites the screenshots it drops in `docs/shots/playtest/` —
`ladder-era0-arcade.png` to `ladder-era4-snes.png` among them. Those are ignored
output, not source: the directory is gitignored, nobody needs to check them
afterwards and there is nothing to restore, so a playtest leaves `git status`
empty. The tracked reference frames are the five in `docs/shots/eras/`, one per
era, plus the older `docs/shots/bootstrap/era-zero.png`. Only `--reference`
writes to `docs/shots/eras/`: if you deliberately change how an era looks,
re-take them that way and commit them on purpose, in their own commit.

## Working on it as a fleet agent

If a background worker was sent here, read **`docs/WORKER-BOOTSTRAP.md`** first: it is the
two-minute on-ramp covering the worktree, the commands above, what never to commit, and the
traps this repo has already cost someone time over.

## How it is laid out

The point of the layout is that later eras are additions, not rewrites.

| File | What it is |
| --- | --- |
| `src/game.js` | **The rules.** Pure state plus one `step(state, dt, intent)`. No canvas, no DOM, no timers, no input devices — which is why the tests can run headless. |
| `src/render.js` | **The look.** Draws a state onto a canvas. Reads the state; never changes it. |
| `src/input.js` | **The hands.** Turns mouse and keyboard into a plain intent object (`pointerY`, `up`, `down`). Knows nothing about the rules. |
| `src/sound.js` | **The voice.** Each era's notes (`VOICES`), and a player that plays the step's `state.events` through Web Audio. Reads the state; never changes it. Silent until the first click or key. |
| `src/main.js` | The loop that ties them together and hands `step` the real elapsed time. |
| `src/eras/` | **One file per era**, each registering that era's look with the renderer. |
| `test/game.test.js` | The headless suite over `src/game.js`, plus the era-look checks. |
| `test/sound.test.js` | The rules' event list, each era's voice, and the player through a recording stand-in for Web Audio. |
| `tools/eralooks.js` | Draws fixed scenes on a recording canvas; `eralooks-today.json` beside it is what eras 0 and 1 drew before the ladder. |

`step` takes a **delta time in seconds** and never assumes 60fps; long frames are
cut into substeps so a fast ball cannot pass through a paddle. Randomness goes
through `state.rng`, so a test can pin it down.

## The era ladder

A match starts on the 1972 machine. **Every point either side scores moves it
up one era** -- it does not matter who scored, only that a point was scored --
so the fourth point of a match lands on the Super Nintendo, and it stops there:
a fifth point, or a fiftieth, leaves it on the top rung. A reload starts a fresh
match back on era 0. All five rungs are built:

| Era | Machine | Look | Voice | Reference frame |
| --- | --- | --- | --- | --- |
| 0 | 1972 arcade Pong | black and white: two white bars, a square ball, a dashed centre line | a bare square-wave blip | [`era0-arcade.png`](docs/shots/eras/era0-arcade.png) |
| 1 | 1977 Atari 2600 | the turn to colour: each paddle and its score in its own colour | the same blip | [`era1-atari2600.png`](docs/shots/eras/era1-atari2600.png) |
| 2 | 1985 NES | 8-bit sprites, the NES palette and a pixel score | square and triangle chiptune | [`era2-nes.png`](docs/shots/eras/era2-nes.png) |
| 3 | 1989 Sega Genesis | 16-bit shading, parallax and a trail behind the ball | a bright FM bell | [`era3-genesis.png`](docs/shots/eras/era3-genesis.png) |
| 4 | 1991 Super Nintendo | a Mode 7 floor and rich sprites | layered chords with a short echo | [`era4-snes.png`](docs/shots/eras/era4-snes.png) |

The reference frames in `docs/shots/eras/` are each era in play, taken by the
playtest as it walks one match up the ladder (see *Run the tests*).

The rules (`Pong.ERAS` in `src/game.js`) carry only the number: `state.era`,
and `state.eraChangedAt`, the game time it last moved, for a transition to read.
What each number looks like is its own plain script in `src/eras/`, loaded by
`index.html` after `src/render.js`, making one `PongRender.registerEra({...})`
call. **An era card edits its own file and nobody else's**: to build the NES,
replace `src/eras/era2-nes.js`. A look gives `paddleInk(state, side)`, and may
give `draw(ctx, state, opts, PongRender)` to take over the whole frame
(`PongRender.drawBase` is the stock frame to paint over). A brand-new rung is one
new file, one `<script>` line in `index.html`, and one entry in `Pong.ERAS`.

**Open the page at any era** with a query, so you can look at one machine
without playing up to it: `index.html?era=0` is the arcade machine (the same as
no query), `?era=2` the NES, `?era=4` the Super Nintendo. Anything above 4 opens
on 4, and anything that is not a number opens on 0. The match still starts on
the title screen, its score at 0-0, and climbs from that era -- so `?era=3` is
one point from the top -- and a reload comes back to the era in the address.
The playtest takes `--era 3` for the same thing, and `--ladder` walks the whole
ladder from era 0 instead.

**The change is a moment.** When a point moves the machine up a rung the field
flashes, a band of the new machine's colours wipes across it, and a name card
comes up -- `ERA 2`, then `1985 · NES`, year and machine read from `Pong.ERAS` --
in that machine's own style: the Atari's paddle colours, the NES's double-framed
black dialog box, the Genesis's blue window, the Super Nintendo's purple window
with its four buttons. It is drawn by `src/erachange.js` over the finished
frame and lives entirely inside the serve pause the point already started
(`rules.serveDelay`, 0.9 s), so it is gone the frame the ball launches and the
serve is never held back. A game opened at a later era, or a point at the top of
the ladder, shows nothing. An era file can restyle its own card by giving its
look a `card` object with the same fields as `STYLES` in that file.
