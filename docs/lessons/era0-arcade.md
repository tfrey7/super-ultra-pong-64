# Era 0: 1972 arcade Pong

Open it: `index.html?era=0`. Reference frame: [era0-arcade.png](../shots/eras/era0-arcade.png).
Look file: [src/eras/era0-arcade.js](../../src/eras/era0-arcade.js).

## THE MACHINE

- **Picture:** black field, everything drawn in white. Two bars, a square ball, a dashed centre
  line and the 3 x 5 block score.
- **Native resolution here:** 200 x 120, hard pixel edges (`ROWS` in `src/display.js`). Each pixel
  is four field units wide and five tall: tall blocks, the way the cabinet's discrete logic drew
  them.
- **Palette:** two colours, black and white.
- **Sprite budget:** none in the modern sense. The machine is hard-wired logic, so the whole
  frame is the renderer's stock frame. The era file registers only the ink.
- **Sound:** no sound chip. The board had one beeper, and the mains hum.
- **Screen:** a black-and-white monitor, `crt-mono` at full strength, 240 lines (`src/display-crt.js`).
- **Opponent:** slow, and moves in steps, like a paddle driven by a counter (`src/opponents.js`).
- **Game feel:** intensity 0 in `src/feel.js`, the honest machine. No flash, no shake, no trail.

## WHAT SOLD THE LOOK

1. **Doing almost nothing.** The stock frame, untouched. Every later era is measured against this one.
2. **Tall, hard pixels.** The 200 x 120 picture is scaled up with smoothing off, so the ball and
   the digits are visibly built from blocks.
3. **The mono tube.** `crt-mono` draws heavy, hard scanlines and a strong phosphor glow bleeding
   off the white shapes, with no colour mask. The glow is the native frame shrunk and drawn back
   up with smoothing on, added at low alpha: one drawImage, no pixel loop.
4. **The cabinet around it.** The title screen (item 1207, `src/attract.js`): the tube warming up,
   PONG and INSERT COIN, and a click is a coin, with the coin-drop sound.

## WHAT DID NOT WORK

- **Very little was tried and dropped here.** This era is the stock frame, pinned to the pixel:
  `tools/eralooks-today.json` holds every draw call it made before the ladder existed, and a test
  compares against it. A deliberate change re-records it with `node tools/eralooks.js`.
- **Sampling the field down to 200 x 120 left grey seams in the block digits** (item 1198). The 2D
  eras now draw into a second full-size picture that is sampled down, which removes them. The
  title lettering is drawn sharp over the arcade picture instead of through it.
- **Known small flaw (item 1198):** in the 2D eras the ball can pick up a one-pixel grey edge when
  it sits between two native pixels.
- **"Can the player score?" was a coin flip** (item 1121: 22 seconds of plain ball-tracking scored
  44% of the time). Since item 1160 the playtest plays the scripted hand in
  `tools/scoring-rally.js`. It is a game lesson, not a look lesson, but every era inherits it.

## SOUND AND MUSIC

- **Effect voice:** one square blip and nothing else (`VOICES[0]` in `src/sound.js`).
  - paddle hit: 490 Hz for 0.05 s
  - wall: an octave down, 245 Hz for 0.04 s
  - point: 245 Hz held for 0.3 s
  - All at gain 0.22.
- **Coin drop** (item 1207, the `coin` list): a bright ring sliding down, a heavy clunk, a relay
  click, and a 60-cycle sawtooth hum swelling under it.
- **Music** (`ARRANGEMENTS[0]` in `src/music.js`): the chip rule is *no sound chip at all*, so the
  theme is only hinted.
  - `melody` with `rule: 'bones'`: the first note of each half bar, as one short square tap, two a bar
  - a `drone` of 60 Hz and 120 Hz sines (the mains hum)
  - a sawtooth at 120 Hz through a 3100 Hz band-pass with a 7.3 Hz wobble (a fluorescent tube's buzz)
- Nothing plays before the first click or key: browsers refuse sound before that, and the attract
  rally is always silent.

## REUSABLE PIECES

| Piece | File | For a new 1972 game |
| --- | --- | --- |
| Rules | `src/game.js` | The whole of Pong: bounces, angles, scoring, serve, substeps. Headless and tested. |
| Stock frame | `src/render.js` | Black field, white shapes, block-font digits (`R.DIGITS`, `R.LETTERS`). |
| Display layer | `src/display.js` | Keep only row 0 (200 x 120, smooth off). |
| Mono tube | `src/display-crt.js` | Keep `crt-mono` and its row. |
| Cabinet | `src/attract.js` | Power-on, INSERT COIN, coin to credit. |
| Blip player | `src/sound.js` | Keep `VOICES[0]` and the player. |
| Hum and bones | `src/music.js` | Keep row 0; `THEME` is the one song. |
| Opponent | `src/opponents.js` | Row 0, the stepping counter. |

## START HERE

1. Open `index.html?era=0` and play a point. This is the target.
2. Copy `index.html` and these files:
   - `src/game.js`, `src/input.js`, `src/main.js` and `src/render.js`
   - `src/display.js` and `src/display-crt.js`
   - `src/sound.js` and `src/attract.js`
   - `src/eras/era0-arcade.js`
   - `src/music.js` too, if you want the hum
3. Delete the other ten `src/eras/` files and their `<script>` lines. Also delete:
   - `src/table3d.js` and `src/textures3d.js`
   - `src/display-tv.js`
   - `src/erachange.js`, `src/signboards.js` and `src/match.js`
   - `advanceEra`'s call in `src/game.js`
4. Keep `tools/eralooks-today.json` and its test. It is the proof you did not move a pixel.
5. `node --test`, then `node tools/playtest.mjs --era 0`.
