# Era 1: 1977 Atari 2600, the turn to colour

Open it: `index.html?era=1`. Reference frame: [era1-atari2600.png](../shots/eras/era1-atari2600.png).
Look file: [src/eras/era1-atari2600.js](../../src/eras/era1-atari2600.js).

## THE MACHINE

- **Reference game** (the art bible's [Reference games](../ART.md#reference-games), item 1286):
  *Combat*. Added: the arena (a playfield wall and a flickering stand round the court). Changed:
  colour: bars, ball and digits in the TIA's inks.
- **Picture:** the 1972 field and frame, but each paddle and its score wear a colour. The first
  point of a session picks those colours (`state.paddleColour` holds a palette index), and every
  later era keeps them (`like: 1`).
- **Native resolution here:** 160 x 192, hard pixel edges: the 2600's 160-wide playfield and its
  192 lines, so the pixels come out wide.
- **Palette:** a dozen colours picked by eye to sit in the range a 2600 could show. They are warm
  and slightly muddy, with no pure `#ff` channel anywhere. **It is not the real 128-entry NTSC
  palette**, and the file says so. Every entry is deliberately bright, because a paddle that
  vanishes into the black field is a broken game. `PongRender.isLegible()` checks that, and the
  palette's length must match `RULES.paletteSize` in `src/game.js` (a test pins the join).
- **Sound chip:** the TIA. Two channels, with coarse pitch dividers that land every note off true.
- **Screen:** a 1970s colour TV over an RF cable, `crt-rf` at full strength, 192 lines.
- **Opponent:** the CPU sees the ball late (`src/opponents.js`).
- **Game feel:** intensity 0.1, a one-frame flash on every paddle hit.

## WHAT SOLD THE LOOK

1. **Colour arriving at all.** The frame stays the arcade's, so the change reads as the same game
   in a living room.
2. **Wide pixels.** 160 x 192 scaled up hard.
3. **The RF picture** (`crt-rf`): soft, fuzzy scanlines, wide colour bleed, a slow band of
   brightness rolling down the tube, and a little snow from a pre-drawn noise tile.
4. **The arrival: the television coming alive** (item 1137). It is drawn over the ring as it grows:
   - a power-on line flung across the field at the height the ball went out, for 0.28 s
   - inside the ring, a picture that rolls up one frame and settles, with its red and blue-green
     fields drifting apart and back (RF chroma fringing), locked by eased progress 0.8
   - the palette smeared round just behind the edge
   - a band of bright scanlines with a green-white phosphor glow on the edge itself

   All of it is canvas copies, gradients, patterns and composite operations.

## WHAT DID NOT WORK

- **The power-on line was skipped at first** (item 1137). The ring is under one field unit wide
  for its first frames, so a flourish that waits for the ring to have width misses its own start.
  It keys off the time now.
- **The Super Nintendo replayed this era's TV effect** (item 1137). Era 4 draws parts of era 1's
  look, and a look borrowed is a flourish borrowed. The effect checks `toEra` now.
- **The sting was first played from the drawing code** (items 1137 and 1138). A flourish can be
  drawn twice in a frame, so the sound played twice. Item 1162 moved it onto the voice's `boot`
  list, where the player sounds it once per change.
- **The signboard was hard to read** (found on item 1183). Item 1196 re-lettered it, and the
  reference frames were re-taken with the CRT screen on.

## SOUND AND MUSIC

- **Effect voice** (`VOICES[1]` in `src/sound.js`): still a single square, but with the TIA's
  coarse, slightly flat pitches.
  - paddle hit: 440 Hz
  - wall: 220 Hz
  - point: a buzzier, longer note (`ATARI_POINT`)
- **Boot sting** (the point that brings era 1 in): the point's own notes first, so the point is
  still heard. Under them, a square hum slides up an octave with a slow wobble, like a set not yet
  on its channel, then two coarse steps as the picture locks. It plays at a third of a paddle
  hit's loudness and is over by 0.86 s, inside the serve pause.
- **Music** (`ARRANGEMENTS[1]` in `src/music.js`). The chip rule is *two channels, and a drum has
  to steal one*:
  - melody: every note, on one square
  - bass: eighth notes, on the other square
  - snare: noise through a 1400 Hz band-pass, with `steals: 'bass'`, so the bass drops out
    whenever it hits
  - `detune`: twelve cents offsets, one per pitch class (0, +31, -18, +12, ...), which puts every
    note sour in the same way a divider does
  - it never sounds more than two notes plus the drum

## REUSABLE PIECES

| Piece | File | What it gives a 2600 game |
| --- | --- | --- |
| Look | `src/eras/era1-atari2600.js` | The palette, the legibility check, the TV-on arrival. |
| Display | `src/display.js` row 1 | 160 x 192, smoothing off. |
| RF tube | `src/display-crt.js` | `crt-rf`: scanlines, bleed, rolling band, snow. |
| Voice | `src/sound.js` `VOICES[1]`, `ATARI_POINT` | Blips and the boot sting. |
| Music | `src/music.js` row 1 | The two-channel rule: `detune` and `steals`. |
| Pixel pin | `tools/eralooks-today.json` | Era 1 is pinned to the pixel like era 0. |

## START HERE

1. Open `index.html?era=1`.
2. Copy era 0's skeleton (see [era0-arcade.md](era0-arcade.md)), plus `src/eras/era1-atari2600.js`.
   Keep `flipToColour` in `src/game.js`: it is what hands each paddle its colour.
3. To start a match in colour with no ladder, begin at era 1 (`startEra: 1`, or `?era=1`) and
   remove `advanceEra`'s call.
4. Delete the other era files, the 3D files, `src/display-tv.js`, `src/erachange.js` (the flourish
   only plays on a ring), `src/signboards.js` and `src/match.js`.
5. For a real 2600 palette, replace the dozen colours with the NTSC table. That was never done
   here, so `isLegible()` is your first check.

## LESSONS

What item 1224 learned making this era look like a AAA game of 1977 that happens to be Pong (the
art bible's era 1 page, [docs/ART.md](../ART.md)). A rally at this era:
[rally-era1-atari2600.png](../shots/item-1224/rally-era1-atari2600.png).

**What sold the flagship look here**

- **Everything on the chip's own grid.** The frame is laid out in 2600 units -- one pixel is 5
  field units across and one scanline 3.125 down -- so the wall is 4 lines, a stand block is 4
  pixels by 6 lines, the ball is 2 pixels by 4 lines and a digit block is 4 by 4. When the display
  samples the frame down to 160 x 192, nothing lands between two pixels, and the picture reads as
  a cartridge instead of a blurry Pong.
- **A Combat arena instead of a blank field.** A dark blue playfield wall along the top and bottom,
  and a stand of mirrored blocks along the top with every other block missing. That is the whole
  scene, and it is enough: two colours of playfield turn a black screen into a place.
- **The crowd is a flicker.** The stand's two block patterns swap every 16 frames, and every 4
  for a second after a point. It is the cheapest "living" background there is, and it is exactly
  what 2600 crowds did.
- **People holding the paddles.** Each player is a 6 x 28 one-colour sprite drawn 5 units a pixel,
  in its own paddle's ink, so a figure and its bat read as one object. That is how a 2600 player
  and its missile shared one colour register.
- **Playfield-block digits.** The score is the old 3 x 5 font, but each block is a playfield block
  (4 pixels by 4 lines), so the numbers come out wide and squat, like Combat's. Under each number,
  a 1-line meter grows a pixel for every hit that side makes this serve.

**What did not work**

- **pixflux cannot draw a 2600 sprite sheet.** Asked for 3 x 6 frames of 6 x 28 at 18 x 168 (two
  generations, one a side), it drew a column of crawling shapes and a smear of grey noise --
  [pixflux-sheets-rejected.png](../shots/item-1224/pixflux-sheets-rejected.png). At this size a
  single row is too small to ask for at all: 18 x 28 is under the tool's 1,024-pixel minimum area.
  So the players are painted in code by
  [era1-sheets.mjs](../../assets/pixellab/era1-sheets.mjs), pixel by pixel, from the bible's
  silhouette rows, for 0 generations. **At 2600 sizes, write the pixels yourself; a generator is
  slower and worse.** The two rejected images stay in the manifest, marked rejected.
- **The bible's torso does not fit.** A 6-wide torso in a 6-wide frame leaves no column for the
  arm. The torso is 4 wide and the arm takes the last two columns.
- **The rig draws a PNG as it is, and this era's colours are earned.** The session picks each
  paddle's ink at its first point, one of twelve, and the rig has no way to tint a sheet. So every
  ink has its own pair of sheets (24 files of about 200 bytes), and era 1's look names the pair a
  frame wears: its `playerSheets()`, which the rig's era 1 block asks through a getter. A tint
  option in the rig would replace all of this with two sheets.
- **The win pose's arms merged with the head.** A 6-pixel-wide figure has no room for arms beside
  a 4-wide head. The arms go straight up above the head (a `\o/` of two columns), and the hop is
  the feet tucking up two rows rather than the whole body rising, which would push the head off
  the frame.

**What a one-era game would copy**

1. `src/eras/era1-atari2600.js`, the `draw` function: the black field, the match-point stripe, the
   flickering stand, the wall, the one-pixel dashed net, the block digits with their meter and
   flash, the paddles, and the ball, in that order. Every number in it is in pixels and lines.
2. [era1-sheets.mjs](../../assets/pixellab/era1-sheets.mjs): `pose(side, beat, i)` is the whole
   figure -- five beats in one small function -- and `sheet(side, ink)` writes it in any colour.
3. The rig block: frame 6 x 28, hand (6, 14), scale 5, fps 7.5 (a swap every 8 frames, the
   kernel's rate).
4. [rally.mjs](../shots/item-1224/rally.mjs): plays a real rally in headless Chrome by following
   the ball with the mouse, and times two seconds of it (16.7 ms a frame, mean and p95).

- **The opponent's name is not drawn in this era (item 1261)**: the HUD is two digits in the paddles' own colours, and the 3x5 caption under the right one read as a smudge at the 2600's resolution; a 2600 cart named nobody anyway.

**Redrawn the EarthBound way (item 1278)**

- **LESSON: at 6 x 28 the movement has to come from the body moving around a hand that stays put.**
  The first draft pushed the arm up for "move up" and down for "move down", and era 1's own test
  failed it: the paddle is drawn at the hand, so an arm that leaves row 13-14 is a hand that leaves
  the paddle. Moving the whole body instead reads better anyway: up is a stretched runner in two
  strides (head at the top of the frame), down is a crouch with the knees swapping (head three rows
  lower), and the arm meets the paddle at the same pixel in every idle, up and down frame. Every beat
  now moves at least 12 of the frame's 168 pixels away from standing, and the test holds it there.
- The figures are now two text grids, [era1-left.json](../../assets/spritegen/era1-left.json) (the
  player, a ponytail and an eye cut out of the head) and
  [era1-right.json](../../assets/spritegen/era1-right.json) (the computer, a billed cap, the head
  straight on its shoulders one row lower), checked by `tools/spritegen.mjs`, which knows the 2600
  now: **8 pixels a line** (one player graphics register), **one colour a line**, and **era 1's
  twelve inks** as the colours. `era1-sheets.mjs` only lays each grid out once per ink. Before and
  after: [contact.png](../shots/item-1278/contact.png) (grey bar the old frames, ink bar the new;
  the player then the computer; game scale 5 above, 4x below). A rally with them:
  [rally-era1.png](../shots/item-1278/rally-era1.png).
