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
