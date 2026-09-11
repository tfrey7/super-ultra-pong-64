# Era 4: 1991 Super Nintendo, Mode 7

Open it: `index.html?era=4`. Reference frame: [era4-snes.png](../shots/eras/era4-snes.png).
Look file: [src/eras/era4-snes.js](../../src/eras/era4-snes.js).

## THE MACHINE

- **Picture:** a dusk sky running from night blue to a warm horizon, a mountain line and stars.
  Below the horizon is a **Mode 7 floor**: a checkerboard laid out in perspective, sliding slowly
  toward you the way F-Zero's track did. The paddles and the ball are shaded sprites floating over
  it, each with a soft shadow, and the score sits on a translucent panel across the sky.
- **Native resolution here:** 256 x 224, hard pixel edges. This is the last hard-pixel machine on
  the ladder.
- **Palette:** no fixed table is enforced in code. The paddles are era 1's colours (`like: 1`),
  shaded. The generated paddle is a grey capsule that each side dyes with its own colour.
- **The key point about the floor:** it is scenery *behind* the sprites, not a projection of the
  court. The sprites stand on the same field rectangles the rules collide with, and the floor's
  vanishing point sits on the court's centre line, so its centre stripe lines up.
- **Sound chip:** the S-SMP. Eight sampled channels, a soft low-pass and the built-in echo.
- **Screen:** S-video, `crt-svideo`: fine scanlines, a mild glow, no fringing.
- **Opponent:** the first that reads where the ball is *going*. **Game feel:** intensity 0.4,
  adding slow motion on match point. This era draws its own trail.

## WHAT SOLD THE LOOK

1. **The Mode 7 floor**, rows narrowing and columns converging, sliding toward the player.
2. **A painted sky** (pixellab dusk sky and mountains, item 1180) behind soft-shadowed sprites.
3. **Rich sprites**: chrome paddles dyed in each player's colour and a glowing ball, all generated
   on the first try (3 of 12 generations).
4. **The echo.** It is the only 2D era with one, and it is the sound everyone remembers.
5. **The arrival: the field tilts into Mode 7 and back** (item 1140). The frame the ring engine
   just composited, Genesis outside and Super Nintendo inside, tips back into perspective,
   recedes toward the horizon and turns once around, then sweeps back and settles flat. The name
   card spins and zooms in over it. The tilted floor is about seventy horizontal strips, each
   clipped and drawn through one affine transform: no pixel loop.

## WHAT DID NOT WORK

- **Borrowing era 1's look borrowed era 1's arrival** (item 1137). This era draws parts of the
  Atari's frame, and the CRT sweep replayed on the Super Nintendo's arrival until that effect
  checked `toEra`.
- **Thin, dark paddles from the first cut of the generated art** (item 1180). They were fixed by
  cropping and switching to an overlay dye.
- **Carrying the art in the page test** was dropped at step 2 of item 1180. The art lives inside
  the era file, the way the NES does it (`assets/pixellab/era4-snes-embed.mjs`).
- **A 121 ms first frame on a cold page** (item 1140 timed it; with its own flourish removed it
  still measured 108 ms). It belonged to the ring engine, not the tilt. Items 1164 and 1203 traced
  it to Chrome compiling graphics programs for looks nothing had drawn yet, and fixed it with a
  warm-up that draws every real look (`warmUp` in `src/erachange.js`, bootstrap section 8a).
  A smaller hitch, and one 279 ms frame at a ring's start, were left after that. Item 1218 traced
  and fixed them in the ring engine.

## SOUND AND MUSIC

- **Effect voice** (`VOICES[4]` in `src/sound.js`): each note is a small chord of layered voices.
  - paddle hit: triangle 523 Hz, sine 1047 Hz and a quiet sawtooth 262 Hz
  - every note goes through a short slapback echo: `{ time: 0.14, feedback: 0.35, mix: 0.45 }`
    (`ECHOES[4]`)
- **The arrival point is an orchestral hit** (item 1140): a brass stab on a C major chord,
  strings an octave over it, a timpani falling under it and a glockenspiel sparkle on top, all
  through the echo.
- **Music** (`ARRANGEMENTS[4]` in `src/music.js`). The chip rule is *sampled orchestral
  instruments, a soft low-pass on the output, the built-in echo*:
  - melody: a soft brass (a sawtooth with one unison layer at +7 cents, low-passed at 1700 Hz,
    slow attack and vibrato)
  - strings holding the chords (`pad`)
  - bass: plucked (`pizz`)
  - in the B section, a marimba climbing the chords (`broken`, an FM sine at ratio 4) and a choir
    pad swelling in
  - the whole mix: `lowpass: 5200` and an echo of 0.23 s, feedback 0.38, mix 0.35

## REUSABLE PIECES

| Piece | File | What it gives a Super Nintendo game |
| --- | --- | --- |
| Look | `src/eras/era4-snes.js` | The Mode 7 floor, the dusk sky, soft sprite shadows, the tilt strips (`tiltPose`, `tiltStrips` are pure and tested). |
| Art | `assets/pixellab/era4-snes-embed.mjs` | Fits the sky, paddle and ball to the machine and embeds them. |
| Display | `src/display.js` row 4 | 256 x 224, hard pixels. |
| S-video | `src/display-crt.js` | `crt-svideo`. |
| Echo | `src/sound.js` `ECHOES[4]`, `src/music.js` row 4 | Slapback echo and the orchestral arrangement. |

## START HERE

1. Open `index.html?era=4`.
2. Copy era 0's skeleton (see [era0-arcade.md](era0-arcade.md)), plus `src/eras/era4-snes.js` and
   `src/eras/era1-atari2600.js`. Era 4 draws parts of era 1's frame and takes its paddle colours
   (`like: 1`), so it cannot run alone.
3. For a racing or Mode 7 game, `tiltStrips` is the piece to lift: any flat picture laid into
   perspective with about seventy clipped `drawImage` strips.
4. Delete eras 0, 2, 3 and 5 to 10, the 3D files, `src/display-tv.js`, `src/erachange.js` (and the
   tilt arrival with it), `src/signboards.js`, `src/match.js`, and `advanceEra`'s call.
5. `node --test` (`test/era4-snes.test.js`, `test/era4-mode7.test.js`, `test/era4-sprites.test.js`),
   then `node tools/playtest.mjs --era 4`.

## LESSONS

*Item 1227, the AAA pass: era 4 drawn as a 1991 flagship (F-Zero's track under a Pilotwings sky,
Super Mario World's sprites) that happens to be Pong. Picture:
[era4-rally.png](../shots/item-1227/era4-rally.png).*

**What sold the flagship look here**

- **Two characters with real personalities, not stand-ins.** A red and a blue hover pilot, each on
  a jet pad, standing behind their paddle with the glove on its outer edge. Big, round, saturated
  Super Mario World shading reads as 1991 even after the display samples the figure down to about
  12 x 38 Super Nintendo pixels.
- **Things that move on their own, at different rates.** Two balloons drift at 3 and 2 field units
  a second (the far one smaller), the floor slides at 14, the high stars twinkle and the pylons
  blink in turn. Three layers moving at three speeds is what 16-bit parallax *feels* like, even
  with a camera that never moves.
- **F-Zero's interface, not a generic panel.** Two small see-through boxes with a 1-pixel light
  edge, a helmet icon beside each, and a power bar that fills with the rally and flashes when full.
  The see-through fill is the colour math the machine was famous for.
- **Colour math on the ball**: a soft added-light halo 1.6 times the orb, under its core, so it
  glows without ever losing R1.
- **Moments made of what is already on screen**: the pylons all light for half a second after a
  point, the conceding pad blinks, and at match point the track runs at double speed, the bars
  pulse and the balloons fly streamers.

**What did not work**

- **Asking pixflux for a whole six-row sprite sheet in one image.** The bible marked it untried;
  it came back as one column of tiny identical figures (`era4-players-left-sheet.png`, kept in the
  manifest as the record). **A single full-body pose per character works on the first try**, and
  every beat was cut from it offline (`assets/pixellab/era4-players-build.mjs`): a 1-pixel bob,
  a lift and a drop for the moves, a squeeze-flip-squeeze for the spin, a dimmed dip for the miss,
  arms drawn on for the win, and the jet flame drawn in code on every frame. 0 generations for all
  of that.
- **Asking for a victory pose** ("both arms raised high above the head, jumping") at the same size
  and seed style gave two smaller figures with their arms down. Drawing two raised arms *behind*
  the figure, so only the part above the helmet shows, did the job instead. Drawing them over the
  figure put stripes across the helmet.
- **7 of 12 generations spent, 5 of them used.** Balance 9,900 of 10,000 before the pass, 9,896
  after.
- **A test that pins "only era N wears a sheet" goes stale the moment another era brings art**, and
  the rig threw under `node --test` (there is no `Image` there) instead of falling back to its
  placeholder. Both are fixed in this pass; a sibling era card would have hit both.
- **A made canvas outlives "not decoded yet".** The dusk-lit balloon is cached on a canvas; it must
  still ask whether its picture is decoded before it is drawn, or a page drawn before the art
  arrives shows a cached copy from another state.

**What a one-era Super Nintendo game would copy**

- `assets/pixellab/era4-players-build.mjs`: one generated pose in, a six-beat sheet out, snapped
  to 15-bit colour and capped under the ball's brightness. Point it at any side-view character.
- The rig block in `src/characters.js` (`ERAS[4]`): `sheets: { left, right }`, frame 12 x 42
  since item 1281 (32 x 101 before), hand on the frame's right edge (12, 17), scale 3.125, fps
  12, and **two** miss frames, so the conceding pad blinks without any extra code.
- `drawPanel`, `drawBalloons` and `drawPylons` in `src/eras/era4-snes.js`: the F-Zero HUD, the
  drifting set dressing and the blinking lights, each a handful of `fillRect` and `drawImage`
  calls with no pixel loop.
- The rule that kept it readable: everything behind play is lit for dusk (a 50% navy wash over the
  balloons), and only the ball, the paddles and the HUD edge are near white.

### Realism rung 4: the table in perspective (item 1267)

- **LESSON: tilt the widths and leave the heights alone.** The table is tipped back in play: every
  field point is drawn at x' = 400 + (x - 400) * s(y), with s running in perspective from 0.9 at
  the far edge (y 0) to 1 at the near edge. Heights stay exactly where the rules put them. So the
  pointer still reaches the same field y, and every layer that draws in field units (the feel
  layer, the ring, the rig's players) still lands on the right row. Squashing the heights as
  well, which is truer Mode 7, would have drawn each bat and the ball well away from the rows
  where their players and sparks are drawn (I reasoned this out, I did not build it). The table is
  a few filled paths a frame, and the strip-drawn tilt stays in the arrival flourish.
- **What 1267 could not do in its own file:** the pilots are drawn by the rig
  (`src/characters.js`) after the era's frame, in flat field units. So they still stand at the
  paddle's flat outer face, while their bat is drawn up to 37 units nearer the net at the top wall,
  and their pads and legs still show. For now each handle reaches out to the flat outer face, so
  the glove holds it at every height. Card 1282 anchors the pilots at `look.project(...)` and crops
  them to the waist up.
- The bats are rung 3's (earned-ink rubber, wood line, black rubber, handle), drawn as filled quads
  through the tilt. The dyed capsule sprite (`tintedPaddle`) is no longer drawn in play.
- **The opponent's name is not drawn in this era (item 1261)**: the racer's helmet already sits beside the right score box, and the caption left over the track was three unreadable glyphs.

### The pilots redrawn as text grids (item 1281)

Tim: *"some of these sprites are pretty jacked"*, and he ruled "Redraw all of them". Proof, old
beside new: [contact.png](../shots/item-1281/contact.png); in play:
[rally-era4.png](../shots/item-1281/rally-era4.png).

- **LESSON: draw at the machine's pixel, not finer.** The pixellab pilots were 32 x 101 sheet pixels
  at 1.2 field units each, and the display then sampled them down to about 12 x 39 Super Nintendo
  pixels, so most of their shading never reached the screen. The new grids are 12 x 42 at 3.125
  field units (800 / 256), one sheet pixel to one SNES pixel, so every pixel drawn is a pixel shown.
  `assets/spritegen/era4-pilot-red.json` is the drawing; its prompt line says who he is.
- **LESSON: player two is a second palette, not a second drawing.** The blue pilot is the red
  grid in another 15-colour OBJ palette (`assets/spritegen/era4-pilots-compose.mjs`), the way
  F-Zero and Street Fighter II made their second players. It is one character on each side in
  every frame by construction. The pixellab pair was a visored racer and a kid with a bare face.
- **LESSON: make the beats move the torso as well as the pad**, so a crop to the waist still shows
  them (card 1282 crops these to the waist up). Up rises 2 pixels on an 8-pixel flame, down sinks
  2 on a short one, the swing is a real spin (front, back, follow-through), and the miss slumps 3
  pixels with the visor bowed and the pad going dark. The arm is redrawn in each of those frames,
  so the glove stays on the handle row (17). Every beat moves at least 20 pixels from idle, and
  `test/era4-players.test.js` pins that.
- **The checker's Super Nintendo rules**: 5 bits a channel, 15 colours and clear in one OBJ palette,
  and 12 of the machine's 34 OBJ tiles a scanline for one figure (`lineTiles`). Two figures, the
  orb, its shadow and the scenery share the 34. The pilots light at most 2 tiles on any line.
- **Drawing time, by the clock:** the red pilot's 13 frames took about 6 minutes of writing, the
  blue one a script. The first `lint` named 11 colours off the 5-bit grid, each with its nearest
  legal value, which was pasted straight back in.
