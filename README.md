# Super Ultra Pong 64: Remastered

**Play it live:** https://tfrey7.github.io/super-ultra-pong-64/

A Pong that **evolves while you play it**. You start at the 1972 arcade machine —
black screen, two white bars, a square ball, a dashed line down the middle — and
as the session goes on the game grows up through the eras around it: colour,
sound, sprites, physics, whatever each later era brings. Evoland, but for Pong.

**Every point either side scores moves the machine up one era**, from the 1972
arcade machine to the 2005 Xbox 360 (see *The era ladder* below): black and
white, the Atari's turn to colour, the NES's 8-bit sprites, the Genesis's 16-bit
shading and the Super Nintendo's Mode 7 floor, then the table tilts into 3D for
the PlayStation, the Nintendo 64, the Dreamcast, the PlayStation 2, the Xbox and
the Xbox 360, each with its own sound -- and each arriving as a ring that
spreads the new machine across the field from the spot where the ball went out,
followed by its name card.

## Play it

Open **`index.html`** in a browser. That is the whole install: no `npm install`,
no build step, no dev server. Double-clicking the file off disk works, because
everything is a plain script and there is nothing to compile.

It opens on the **cabinet powering on** (item 1207, `src/attract.js`): the tube
warms up -- a dot of light blooms in the middle of the black glass, stretches
into a line, and the line opens into the picture -- and then the attract screen:
**PONG** in the machine's block lettering, **INSERT COIN** blinking under it,
CREDIT 0 in the corner, and behind it the machine playing itself, computer
against computer, score ticking, the way an idle cabinet in a bar did. Nothing
counts there: the ball is held still and no point can be scored. **A click or any
key is a coin**: the quarter clunks into the box with the cabinet's hum under it,
CREDIT 1 flashes up, then PLAYER 1 READY, and the ball serves on the 1972
machine about two seconds later. When a match is over, `Pong.backToTitle(game)`
is the one call that puts the cabinet back on INSERT COIN. All of it is drawn on
the canvas out of the score's own block font — there is no HTML text on the page
at all. (Browsers allow no sound before the first click, so the hum is heard
with the coin, not while the tube warms up.)

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
has cleared, films each of the ten era changes mid-ring, and scores one more at
the top to prove the ladder stops on the Xbox 360. `--ladder` runs only that
walk, in about a minute:

```bash
node tools/playtest.mjs --ladder              # just the walk up the ladder
node tools/playtest.mjs --ladder --reference  # and re-take the tracked era frames
node tools/playtest.mjs --scoring             # just a rally and a point against the computer
```

The point against the computer is played by a scripted hand
(`tools/scoring-rally.js`) that plans each return against the rules, so that
check passes every run -- the computer itself stays exactly as beatable as it
was, and `node tools/beatability-sample.mjs` is how to measure that.

Every run rewrites the screenshots it drops in `docs/shots/playtest/` —
`ladder-era0-arcade.png` to `ladder-era10-xbox360.png` among them. Those are ignored
output, not source: the directory is gitignored, nobody needs to check them
afterwards and there is nothing to restore, so a playtest leaves `git status`
empty. The tracked reference frames are the twenty-one in `docs/shots/eras/`, one per
era and one per era change, plus the older `docs/shots/bootstrap/era-zero.png`. Only `--reference`
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
| `src/sprites.js` | **Named pixel art.** `PongSprites.draw(ctx, name, x, y, w, h)` draws `assets/pixellab/<name>.png` with one `drawImage`, and answers `false` until it has loaded so the era draws its own look meanwhile. |
| `tools/pixellab.mjs` | Makes that pixel art through [pixellab.ai](https://www.pixellab.ai) — see *Pixel art* below. |
| `assets/pixellab/` | The generated PNGs, committed, and `manifest.json`: the prompt, size, style, seed, date, cost and exact request behind each one. |

### Pixel art

```bash
node tools/pixellab.mjs balance
node tools/pixellab.mjs gen paddle-nes "an NES tennis paddle, side view" --size 32x64 \
     --outline "single color black outline" --shading "flat shading" --no-background
```

Node 18+, no dependencies, and nothing in it is about Pong, so another game can copy the file as
it is. It needs `PIXELLAB_API_KEY` in the environment. Every run **checks the key first** and
prints the account balance and the cost of one image (as the newest manifest entry measured it); a
refused key stops it there with exit code 2. `gen` makes one image, saves it as
`assets/pixellab/<name>.png` and records it in `manifest.json`, always with a seed (a random one
unless you pass `--seed`), so the entry holds everything needed to ask for the same picture again.
An existing name is refused unless `--force`. Sizes are 16 to 400 a side with an area of at least
32x32 — the server enforces the area, its schema does not say so. The account is billed in
*generations* on a subscription, so `credits $0.00` is not "out of credit". An era file draws the
result by name through `src/sprites.js`; it is loaded before the era files, so `root.PongSprites`
is always there.

`step` takes a **delta time in seconds** and never assumes 60fps; long frames are
cut into substeps so a fast ball cannot pass through a paddle. Randomness goes
through `state.rng`, so a test can pin it down.

## The era ladder

A match starts on the 1972 machine. **Every point either side scores moves it
up one era** -- it does not matter who scored, only that a point was scored --
so the tenth point of a match lands on the Xbox 360, and it stops there: an
eleventh point, or a fiftieth, leaves it on the top rung. A reload starts a fresh
match back on era 0. All eleven rungs are built.

### The story, 1972 to 2005

- **1972, arcade Pong:** black and white, two bars, a square ball and a blip -- where it all starts.
- **1977, Atari 2600:** the turn to colour; each side gets its own.
- **1985, NES:** 8-bit sprites, the NES palette and chiptune.
- **1989, Sega Genesis:** 16-bit shading, parallax and a bright FM bell.
- **1991, Super Nintendo:** a Mode 7 floor, rich sprites and chords with an echo.
- **1994, Sony PlayStation:** the table tilts into 3D, and it wobbles -- snapped polygons, swimming textures, dithered chunky pixels.
- **1996, Nintendo 64:** soft blurred textures, heavy fog, round toybox shapes and rumble.
- **1999, Sega Dreamcast:** crisp cel shading, thick ink outlines, a graffiti score and the modem's screech.
- **2000, PlayStation 2:** letterbox bars, sparks, a glow trail, a lens flare and taiko drums.
- **2001, Xbox:** bump-mapped metal, hard moving shadows, gamertags and green light.
- **2005, Xbox 360:** bloom, a brown grade, film grain, motion blur, the blades and an achievement -- the top of the ladder.

| Era | Machine | Look | Voice | Reference frame |
| --- | --- | --- | --- | --- |
| 0 | 1972 arcade Pong | black and white: two white bars, a square ball, a dashed centre line | a bare square-wave blip | [`era0-arcade.png`](docs/shots/eras/era0-arcade.png) |
| 1 | 1977 Atari 2600 | the turn to colour: each paddle and its score in its own colour | the same blip | [`era1-atari2600.png`](docs/shots/eras/era1-atari2600.png) |
| 2 | 1985 NES | 8-bit sprites, the NES palette and a pixel score | square and triangle chiptune | [`era2-nes.png`](docs/shots/eras/era2-nes.png) |
| 3 | 1989 Sega Genesis | 16-bit shading, parallax and a trail behind the ball | a bright FM bell | [`era3-genesis.png`](docs/shots/eras/era3-genesis.png) |
| 4 | 1991 Super Nintendo | a Mode 7 floor and rich sprites | layered chords with a short echo | [`era4-snes.png`](docs/shots/eras/era4-snes.png) |
| 5 | 1994 Sony PlayStation | wobbling snapped polygons, swimming affine textures, dithered 320x240 | plucky CD notes in a room reverb | [`era5-playstation.png`](docs/shots/eras/era5-playstation.png) |
| 6 | 1996 Nintendo 64 | blurred textures, heavy fog, round toybox shapes, rumble shake | muffled, springy samples | [`era6-n64.png`](docs/shots/eras/era6-n64.png) |
| 7 | 1999 Sega Dreamcast | crisp cel shading, thick ink outlines, graffiti score, speed lines | punchy synth-funk, the modem | [`era7-dreamcast.png`](docs/shots/eras/era7-dreamcast.png) |
| 8 | 2000 PlayStation 2 | letterbox, sparks, glow trail, lens flare, slow camera drift | taiko, orchestral pads, a big hit | [`era8-ps2.png`](docs/shots/eras/era8-ps2.png) |
| 9 | 2001 Xbox | bump-mapped metal, hard moving shadows, gamertags, shield-bar score | sub-heavy metallic clangs | [`era9-xbox.png`](docs/shots/eras/era9-xbox.png) |
| 10 | 2005 Xbox 360 | bloom, brown grade, grain, motion blur, Blades HUD, Achievement Unlocked | big clean hits, the achievement blip | [`era10-xbox360.png`](docs/shots/eras/era10-xbox360.png) |

The reference frames in `docs/shots/eras/` are each era in play, taken by the
playtest as it walks one match up the ladder (see *Run the tests*).

Eras 5 to 10 are specified in **`docs/ERAS.md`**, the era bible: every rung's name
card, palette, camera on the shared 3D table, the look to exaggerate, its sounds
and its arrival flourish, plus the readability rules that keep it playable.

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
no query), `?era=2` the NES, `?era=10` the Xbox 360. Anything above 10 opens
on 10, and anything that is not a number opens on 0. A page opened with an era
skips the cabinet and goes **straight into play** at that era, its score at 0-0
-- so `?era=9` is one point from the top -- and a reload comes back to the era in
the address. `?title=off` goes straight into play at era 0, and `?title=on` keeps
the cabinet even with an era (the playtest's `--era` uses it).
The playtest takes `--era 3` for the same thing, and `--ladder` walks the whole
ladder from era 0 instead.

**The change is a moment.** When a point moves the machine up a rung, the new
machine spreads across the field from the spot where the ball went out
(`state.missAt`): a ring grows from there over 1.5 s, eased, and inside it the
new era's renderer draws the field while outside it the old era's keeps drawing
-- the same live state in both, so nothing disappears and the paddles stay in
the player's hands. Once the ring has passed the centre a name card comes up --
`ERA 2`, then `1985 · NES`, year and machine read from `Pong.ERAS` -- in that
machine's own style: the Atari's paddle colours, the NES's double-framed black
dialog box, the Genesis's blue window, the Super Nintendo's purple window with
its four buttons. It is all `src/erachange.js`: two offscreen canvases, one per
era, composited through a circular clip, then the ring's glowing edge. The rules
stretch the serve pause after an era-change point only (`rules.eraChangePause`,
1.8 s, against the plain 0.9 s), so the ring always finishes inside it and the
whole moment is gone the frame the ball launches. The title screen's demo rally
plays its ring too, dimmed and without a card. A game opened at a later era, or a
point at the top of the ladder, shows nothing. An era file can restyle its own
card with a `card` object (the fields of `STYLES` in that file), and give its
arrival its own look with a `flourish(ctx, p, origin, fromEra, toEra, info)`
hook, drawn over the ring's edge every frame of the ring that brings it in --
the header of `src/erachange.js` is the contract.

### Each era at its machine's own resolution

Every frame is drawn at the resolution of the machine on screen and then scaled
up to the page (`src/display.js`, item 1198): 200 x 120 tall blocks for the 1972
arcade, 160 x 192 for the Atari 2600, 256 x 240 for the NES, 320 x 224 for the
Genesis, 256 x 224 for the Super Nintendo, 320 x 240 for the PlayStation and the
N64, 640 x 480 for the Dreamcast and the Xbox, 512 x 448 for the PS2 and the 720
lines of 720p for the Xbox 360. The 2D machines are scaled with hard pixel edges
(each is drawn at field size and sampled down, so every pixel is one whole
colour), the 3D ones with the soft scaling a television gave them. During an era
change the display switches to the new machine the moment the ring passes the
centre. Each row of the table also names the screen the machine was seen on --
an overlay kind and its strength; this card ships only `none`, and
`src/display-crt.js` and `src/display-tv.js`, already in the page's script list,
are where the CRT and TV overlays plug in. `index.html?display=off` draws
straight onto the page as before. All eleven side by side:
`docs/shots/eras/contact-sheet-native.png` (from
`docs/measure/item1198/contact-sheet.html`).

### Each era change, step by step

Every rung arrives with its own flourish riding the ring. The playtest's ladder
walk films each one mid-ring and checks it ran (the ring reached the far corner,
and the new era is what draws once it has gone):

| Change | What the player sees | Mid-change frame |
| --- | --- | --- |
| Arcade to Atari 2600 | a CRT scanline sweep rides the ring's edge and bleeds the colour in, with a power-on line and a sting | [`change-era0-to-era1.png`](docs/shots/eras/change-era0-to-era1.png) |
| Atari 2600 to NES | the picture blinks once and turns over in tiles ahead of the ring like a cartridge reset, to the NES power-on chime | [`change-era1-to-era2.png`](docs/shots/eras/change-era1-to-era2.png) |
| NES to Genesis | the old picture cracks on the ring's edge into shards that spin and fly off, to a bassy FM sting | [`change-era2-to-era3.png`](docs/shots/eras/change-era2-to-era3.png) |
| Genesis to Super Nintendo | the field tilts back into a Mode 7 plane and sweeps flat under the new era, its name card spinning in, to an orchestral hit | [`change-era3-to-era4.png`](docs/shots/eras/change-era3-to-era4.png) |
| Super Nintendo to PlayStation | the flat world shatters into snapped polygons at the point, the ring's edge is a wobbling many-sided shape over a dithered band, and the table pops in like a model loading, to the shimmering swell and the deep tone | [`change-era4-to-era5.png`](docs/shots/eras/change-era4-to-era5.png) |
| PlayStation to Nintendo 64 | fog rises at the point, the old picture melts soft at the ring while toy balls ride its edge, fog pours over the far end and a cube spins once above the card | [`change-era5-to-era6.png`](docs/shots/eras/change-era5-to-era6.png) |
| Nintendo 64 to Dreamcast | a white page and a bouncing orange dot, an ink line leading the ring so each shape is inked before its colour arrives, a swirl on the edge, then a comic-panel snap, to the modem | [`change-era6-to-era7.png`](docs/shots/eras/change-era6-to-era7.png) |
| Dreamcast to PlayStation 2 | the letterbox bars slam in and the colour drains through the ring, boot towers rise on its edge with sparks and dust, and the lens flare sweeps home | [`change-era7-to-era8.png`](docs/shots/eras/change-era7-to-era8.png) |
| PlayStation 2 to Xbox | a green orb swells at the point, glowing tendrils reach the ring's edge, and the light snaps on so every hard shadow swings across the table | [`change-era8-to-era9.png`](docs/shots/eras/change-era8-to-era9.png) |
| Xbox to Xbox 360 | a white-out at the point, the dashboard blades sweep with the ring under bloom and grain, the HUD blades slide in and the Top of the Ladder achievement pops | [`change-era9-to-era10.png`](docs/shots/eras/change-era9-to-era10.png) |

From the PlayStation on, each arriving machine also shows its own signboard in
the name card (item 1184).
