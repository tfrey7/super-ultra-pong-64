# Era 2: 1985 NES, the 8-bit machine

Open it: `index.html?era=2`. Reference frame: [era2-nes.png](../shots/eras/era2-nes.png).
Look file: [src/eras/era2-nes.js](../../src/eras/era2-nes.js).

## THE MACHINE

- **Picture:** a dark tiled court with a white border, not the black void. Paddles and ball are
  chunky sprites with a lit side and a shaded side. A dotted net runs between two posts. The score
  is in an NES-style pixel font: thick two-pixel strokes with a drop shadow.
- **Native resolution here:** 256 x 240, hard pixel edges. Every sprite is snapped to the sprite
  grid, over the exact box the rules hit-test.
- **Palette:** only the NES's own, each colour named by the index NES code uses (`$0C`, `$30`
  ...). Each paddle keeps the hue it earned at the turn to colour: its Atari colour becomes the
  nearest NES hue column, lit (`$2x`) on the body and shaded (`$1x`) on the right-hand side, so the
  change of machine does not swap anyone's colour.
- **Sound chip:** the 2A03. Two pulse channels with a changeable duty cycle, a triangle with no
  volume control, and a noise channel.
- **Screen:** a 1980s TV over composite, `crt-composite` at full strength, 240 lines.
- **Opponent:** quicker than the Atari's. **Game feel:** intensity 0.2, adding paddle squash and
  the ball's squash against a wall.

## WHAT SOLD THE LOOK

1. **A court instead of a void.** Tiles, a border and a net make it a different box under the TV
   before anything moves.
2. **The palette by index.** Every colour comes out of the NES table and nowhere else, including
   the generated art.
3. **Sprites with a lit side and a shaded side**, on the grid, in hard 256 x 240 pixels.
4. **Composite fringes.** `crt-composite` adds visible scanlines, a phosphor-triad grain, red and
   blue fringes on sharp edges (the frame multiplied by red and by blue, added one native pixel
   either side), rounded corners and a vignette.
5. **The arrival is a cartridge reset** (item 1138):
   - the picture blinks black for one frame
   - just ahead of the ring, the old picture breaks into the court's own 40-unit tiles, which turn
     over one by one from the miss outward, old era on the front and NES on the back
   - just inside the edge, a band of the new picture rolls with the vertical hold slipping

## WHAT DID NOT WORK

- **Generated paddles, twice** (item 1178). Both pixellab tries came back wrong, so the paddles
  stay hand-drawn. The court and the ball are generated, using 5 of the 12 generations allowed.
- **Art loaded off disk** (item 1178, measured before building). In headless Chrome a PNG loaded
  from `file://` taints the canvas and breaks the playtest's pixel check. The art is embedded as
  data: URIs instead.
- **The generated court had two grey boxes that read as a "3"**, one in each goal mouth beside
  the paddles, and its own halfway line sat left of the game's centre line (item 1178, fixed by
  1191). They are painted out offline in the quantizer (`PAINT_OUT`), with no generations spent,
  and a test pins it. Some ragged grey dashes remain and read as texture.
- **The power-on chime was played from the flourish, and the voice table was patched at run
  time** (item 1138). Both broke the rule that a flourish only draws. Item 1162 moved the chime
  onto the voice's `boot` list.
- **Sibling era cards collided on a shared placeholder test** (items 1122 to 1124). Three branches
  each changed the same test, on adjacent lines. The lesson: put an era's tests in its own file,
  and pin only what your own card owns.

## SOUND AND MUSIC

- **Effect voice** (`VOICES[2]` in `src/sound.js`): a pulse lead over the triangle's bass.
  - paddle hit: square 784 Hz with triangle 392 Hz under it
  - wall: triangle sliding 523 to 392 Hz
  - point: a little rising arpeggio (`NES_POINT`)
- **Boot sting:** the point's arpeggio, then B5 and E6 on the pulse over an E on the triangle. It
  starts at 0.45 s, after the arpeggio, and is over by 0.85 s.
- **Music** (`ARRANGEMENTS[2]` in `src/music.js`). The chip rule is *pulse channels with a
  changing duty cycle, chords only as fast arpeggios, and a triangle bass with no volume control*:
  - melody on a 25% pulse in the A section, narrowing to a 12.5% pulse for the B section, each
    with delayed vibrato
  - chords as a whirring `arp` on the 50% pulse (speed 2) in A; in B that channel echoes the
    melody three steps late instead, because there are only two pulses
  - bass: triangle leaping octaves, at a fixed level
  - drums: noise hats through a 7 kHz high-pass, and a snare through an 1800 Hz band-pass

## REUSABLE PIECES

| Piece | File | What it gives an NES game |
| --- | --- | --- |
| Look | `src/eras/era2-nes.js` | The NES palette table by index, the hue mapping, the sprite drawing and the tile flip. |
| Art pipeline | `tools/pixellab.mjs`, then `assets/pixellab/era2-nes-quantize.mjs` | Generate, then boil down to the NES palette and embed into the era file. It reads the palette from the era file, so there is one table. |
| Recipes | `assets/pixellab/manifest.json` | Prompt, seed and request for every image, so it can be made again. |
| Display | `src/display.js` row 2 | 256 x 240, hard pixels. |
| Composite TV | `src/display-crt.js` | `crt-composite`. |
| Voice and music | `src/sound.js` row 2, `src/music.js` row 2 | Pulse, triangle, noise; `arp` and `echo` parts. |

## START HERE

1. Open `index.html?era=2`.
2. Copy era 0's skeleton (see [era0-arcade.md](era0-arcade.md)), plus `src/eras/era2-nes.js` and
   `src/eras/era1-atari2600.js`. The paddle colours are Atari picks mapped to NES hues, so era 1's
   palette is the source.
3. New art: `node tools/pixellab.mjs gen <name> "<prompt>"` (the key is `PIXELLAB_API_KEY`), then a
   quantize script like `era2-nes-quantize.mjs`. Hold back any colour as bright as the ball's core.
4. Delete the other era files, the 3D files, `src/display-tv.js`, `src/erachange.js`,
   `src/signboards.js`, `src/match.js`, and `advanceEra`'s call.
5. `node --test` (the NES tests are `test/era2-nes.test.js` and `test/era2-pixellab.test.js`), then
   `node tools/playtest.mjs --era 2`.

## LESSONS (item 1225: the AAA pass, Nintendo's Tennis that happens to be Pong)

Tim's direction for this pass: not a Pong of 1985 but the flagship game of 1985 that happens to
be Pong, with "Characters hold the paddles". The model was *Tennis* (a 1985 launch title in
North America), with the heft of *Super Mario Bros.* in the sprites.

### What sold the flagship look

1. **People.** A boy in a red headband holds the left bat two-handed, and a rival in a blue cap
   and green shirt holds the right. They are drawn behind the paddles by the player rig
   (`src/characters.js`, the NES block's `sheets`). Two figures standing there turn it from a
   bat-and-ball demo into a sports game before the ball moves.
2. **Tennis's status band.** A black band across the top with a grey rule under it. P1 and CPU
   are in their paddles' colours, the scores in white over the era's black drop shadow, and
   `RALLY 00` in the middle. For a second after a point, the middle shows the umpire's call
   instead (`FIFTEEN`, `THIRTY`, `FORTY`, `GAME`, by the scorer's points modulo 4). On a match
   point it reads `MATCH POINT` in red, blinking. The big mid-court digits of the first NES pass
   are gone, and that alone makes it read as a console game rather than an arcade one.
3. **A place with people watching.** Two rows of 32 spectators in three dark inks (`$0C`, `$1C`,
   `$2D`) sit in the stands. Their three poses (sitting, leaning, arms up) ripple along the stand
   every 16 frames, every 4 for a second after a point, and all arms go up at match point. The
   umpire sits on a high chair at the net and turns his head toward the ball's travel. Nothing in
   the backdrop moves faster than the crowd's ripple.
4. **The ball is a tennis ball.** It has a `$38` seam pixel on its lit side and a black 4 x 2
   shadow three NES pixels below it, one extra sprite, as *Tennis* drew it.
5. **All of it is fillRect.** The band, the crowd and the umpire are in code, and each figure is
   one `drawImage` a frame. The page never loops over pixels.

### What did not work

- **Asking pixflux for a sprite sheet.** The bible's plan was one generation per player: the
  whole 30 x 264 sheet (3 frames by 6 rows of 10 x 44), prompted row by row. Both sheets came back
  almost empty, a dozen stray pixels down a clear strip (`era2-players-left.png` and
  `-right.png`, kept with their verdicts in the manifest). **pixflux does not draw a grid of
  animation frames from a prompt. Do not spend a generation on it.**
- **Shrinking a good pose to fit.** A single 32 x 64 standing pose per player came back well (red
  headband, big *Mario* head, fists out). But the figure is 28 pixels wide and the room behind a
  paddle is 10 NES pixels (32 field units at 3.125 a pixel). Squeezed by 2.8 across and 1.4 down,
  the arms and the face turn to mush. The poses became the reference instead.
- **What worked:** drawing the sheets in a script. `assets/pixellab/era2-players-sheet.mjs` paints
  every frame from the bible's proportions: head 8 x 9, torso 8 x 14 with the arms, legs 3 x 16,
  a black outline on the back edge only, hand at (10, 22). The frames are parts moved per beat:
  the body drops a pixel for the knee bend, the legs go apart and together for the shuffle, the
  fists jump 6 up the bat on the swing, the head mirrors for the miss, and one fist goes in the
  air behind the head for the win. It costs 0 generations and can be edited like any code, and
  4 of the 12 generations went on learning this.
- **The ball's white is the figures' problem.** `$30` is the ball's colour, and the bible caps a
  figure at 4 pixels of it. So the left player's "white shorts" are `$10` grey, and the white is
  only on the shoes.
- **The rig had never drawn a real sheet headless.** Under `node --test` there is no `Image`, and
  the sprite loader threw rather than answering "not loaded", so every era with a sheet dropped
  its players in the test recorder. The rig now treats that throw as not loaded
  (`sheetFrames` in `src/characters.js`).
- **The stands sit over the play area.** The court fills the frame and the wall is the top edge,
  so the band and the crowd are drawn behind the play and the ball flies over them. They stay
  dark (the crowd's inks are the bible's three under-0.35 colours) so the ball still reads.
  The rule for any 2D era: HUD and stands go over the court, never beside it, and dark.
- **Not done here:** the shirts do not take the paddle's earned hue (a PNG sheet has one set of
  colours, and recolouring per ink would need one sheet per slot, or a palette swap in code). No
  crowd or umpire art was generated: both are drawn in code, and the generations were better
  kept.

### What a one-era NES game would copy

1. **The band, the crowd and the umpire** from `src/eras/era2-nes.js`: `drawBand`, `drawCrowd`,
   `drawUmpire`, and the `LETTERS` capitals (5 x 7, one cell per NES pixel). They are generic
   sports-HUD pieces with no Pong in them.
2. **The sheet script** `assets/pixellab/era2-players-sheet.mjs`, for any 10 x 44 NES figure. Change
   the parts in `paintFrame` and the inks in `PLAYERS`, then run it. It writes the PNGs and their
   manifest entries.
3. **The rig's beat machine** (`src/characters.js`). Idle, move up and down, swing, miss and win
   come from events the rules already emit, so the art never touches play.
4. **The order:** court, border, net, crowd, umpire, band, paddles, ball shadow, ball, seam, then
   the players over the frame. The ball is the last thing but its own seam.
