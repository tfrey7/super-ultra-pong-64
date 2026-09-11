# Era 5: 1994 Sony PlayStation, the first 3D, and it wobbled

Open it: `index.html?era=5`. Reference frame: [era5-playstation.png](../shots/eras/era5-playstation.png).
Look file: [src/eras/era5-playstation.js](../../src/eras/era5-playstation.js). Chapter 6 of
[docs/ERAS.md](../ERAS.md) is its specification.

## THE MACHINE

- **The real hardware's flaws, drawn on purpose:** no perspective-correct texture mapping, no
  sub-pixel precision and no z-buffer, typically at 320 x 240.
- **Native resolution here:** 320 x 240, scaled up soft (`smooth: true` in `src/display.js`) the
  way a TV did. The era file also draws its backdrop, table, shadow, paddles and score into its own
  320 x 240 buffer, copied up with smoothing *off*, so every chunk is 2.5 pixels and hard-edged.
- **Polygon budget used:** the table is textured through only **8 big triangles**. The ball is a
  low-poly gem of 8 facets.
- **Camera** (`tools/table3d-cameras.js`): tilt 28 degrees, height 1150, field of view 30,
  screen y 306. It wobbles a little every frame, and `snap` rounds every projected vertex to the
  2.5-pixel chunk grid.
- **Texture:** a 64-pixel checker tile built once from rectangles, under the pixellab wood-grain
  tile (`court-grain`, item 1187).
- **Sound chip:** the SPU. 24 voices of compressed samples, with a built-in reverb.
- **Screen:** a 1990s CRT over composite, `tv-composite` with the 4 x 4 ordered dither on
  (`src/display-tv.js`).
- **Game feel:** intensity 0.5, adding hit-stop and the ball trail.

## WHAT SOLD THE LOOK

1. **Affine texture swim.** Each of the 8 triangles is mapped with one affine transform and no
   perspective correction, so the checker kinks along every diagonal and slides as the camera moves.
2. **Vertex snapping and wobble.** Every edge pops between chunks, even on a still rally.
3. **Ordered dithering.** The backdrop ramp is 6 flat bands with Bayer-stippled seams, and a pool
   of light on the table is 3 stippled bands (`T.ditherTile`, `T.BAYER4`).
4. **Seam sparkle.** The triangles are filled separately with no base fill under them, so a
   snapped edge leaves a hairline of void showing.
5. Flat-shaded paddles with a stippled sheen, and Gouraud gradient rails.
6. **The arrival: the flat field lifts into 3D** (item 1151). The Super Nintendo field tilts up
   inside a jagged red and yellow edge.

## WHAT DID NOT WORK

- **Gentle rather than loud** (reviewer, item 1145). The ball read as a tiny white dot and the
  paddles as thin slabs rather than chunky textured boxes, so the era read more as "a 3D table"
  than as a loud PlayStation. Not yet followed up by a card of its own.
- **The reverb tail could not be heard** until item 1181 taught the player the 3D voice grammar
  (noise, filters, unison, reverb). Before that, the era's sound played only its plain notes.
- **The look cost 44 ms a frame on its own** (found by item 1150). Because the playtest compared a
  ring only against the era it started from, a slow era hid itself. Item 1192 added a per-era
  frame check: a mean over 18.5 ms fails.
- **The 3D eras miss 16.7 ms in the playtest's software-drawn Chrome** (item 1192, card 1216 still
  running). The playtest runs Chrome with `--disable-gpu`. Measured there: 18.8 to 21 ms a frame
  here; with a GPU, every era runs at about 4.2 ms.
- **The first TV screen held this era at 105 ms a frame** (item 1200's first draft, which blended
  at page size). Blending on the 320 x 240 copy brought it to 25.4 ms, against 21.3 ms with no
  screen.
- **The year is a choice, not a fact.** The PlayStation launched in Japan in December 1994 and in
  North America in September 1995. The ladder says 1994, but every rung below uses the North
  American year (bible section 0). The music row calls it 1995.

## SOUND AND MUSIC

- **Effect voice** (the era file's `voice`, the bible's "clean CD-era samples, plucky, one room
  reverb"):
  - paddle hit: triangle 659 Hz, sine 1318 Hz and a 15 ms click of high-passed noise
  - point: a triangle arpeggio (330, 392, 494, 659 Hz) over a 165 Hz sine
  - `effects: { reverb: { seconds: 1.2, decay: 2.5, mix: 0.25 } }`
- **Boot sting:** a shimmering swell of four sines (1047 to 2093 Hz, 0.4 s attacks), a filtered
  unison sawtooth opening from 400 to 2400 Hz, then a deep 65 Hz logo tone at 0.9 s.
- **Music** (`ARRANGEMENTS[5]` in `src/music.js`, item 1210): *ambient techno*. The chip rule is
  *CD-era sequenced samples: a slightly grainy compressed edge, real chords for the first time,
  resonant filter sweeps and the SPU's reverb*.
  - four-on-the-floor under seventh-chord pads, squelchy off-beat stabs and a rolling bass
  - `crush: 8` (bits), for the grainy edge
  - `sweep: { freq: 2600, depth: 2100, bars: 4, q: 5 }`, a resonant low-pass rising and falling
    over the whole mix every four bars
  - a dotted-eighth echo (0.34 s) and a 2.2 s reverb
- **The voice grammar** used from here up ([docs/ERAS.md](../ERAS.md) section 3): `wave: 'noise'`,
  `attack`, `filter { type, freq, q, to }`, `unison { voices, spread }`, `lfo`, `shape`, and
  per-era `echo`, `reverb`, `bus`.

## REUSABLE PIECES

| Piece | File | For a PlayStation game |
| --- | --- | --- |
| 3D table | `src/table3d.js` | Camera, `project`, `quad`, `box`, `ball` with contact shadow, `table`, fog, dither tile, offscreen buffers. It draws the same 2D state onto a tilted plane, with nothing simulated in 3D. |
| Camera check | `tools/table3d-cameras.js` | Measures any camera against readability rule R3. |
| Textures | `src/textures3d.js` (written by `assets/pixellab/tex3d-embed.mjs`) | Pixellab tiles as data: URIs. |
| Look | `src/eras/era5-playstation.js` | `affine`, the 8 triangles, `cameraAt` (wobble), the snap, the dithered pool. |
| TV | `src/display-tv.js` | `tv-composite` with dither; every blend is done on the native copy. |
| Voice and music | the era file's `voice`, `src/music.js` row 5 | The 3D grammar and the techno arrangement. |

## START HERE

1. Open `index.html?era=5`, then `index.html?era=5&display=off` to see what the TV adds.
2. Copy era 0's skeleton (see [era0-arcade.md](era0-arcade.md)), plus these files:
   - `src/table3d.js` and `src/textures3d.js`
   - `src/display-tv.js` in place of `src/display-crt.js`
   - `src/eras/era5-playstation.js` and `src/eras/era1-atari2600.js` (the paddle colours)
3. Read [docs/ERAS.md](../ERAS.md) sections 1, 2 and 5 first: painter's order, outline, fog and
   the readability laws. Every 3D era keeps them.
4. Delete the other era files, `src/display-crt.js`, `src/erachange.js`, `src/signboards.js`,
   `src/match.js`, and `advanceEra`'s call.
5. Judge speed on a machine with a GPU. The playtest's software Chrome reads slow for every 3D era.
