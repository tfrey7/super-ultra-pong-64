# Era 7: 1999 Sega Dreamcast, crisp, loud and graphic

Open it: `index.html?era=7`. Reference frame: [era7-dreamcast.png](../shots/eras/era7-dreamcast.png).
Look file: [src/eras/era7-dreamcast.js](../../src/eras/era7-dreamcast.js). Chapter 8 of [docs/ERAS.md](../ERAS.md).

## THE MACHINE

- **Native resolution here:** 640 x 480, the VGA box's picture, scaled up soft. The era itself
  draws straight onto the canvas at full resolution, with no low-resolution buffer, no smoothing
  and no post pass. Next to the Nintendo 64's smear, the first thing a player sees is how sharp it
  got.
- **Palette:** poster colours, flat fills only. Three sky bands, a skyline of flat buildings and
  a table in three flat depth bands.
- **Shading:** `banded`, two hard bands a face (the cel look), from the shared helper.
- **Camera:** a long lens and perfectly still. Tilt 22 degrees, height 1500, field of view 23.5,
  screen y 314, no motion.
- **Texture:** `court-grain`, kept light on purpose (item 1187).
- **Sound:** the AICA, 64 voices at full CD quality.
- **Screen:** a sharp VGA picture, `tv-vga`: only a faint line structure and a little edge glow.
- This era draws its own ball trail (`OWNED` in `src/feel.js`).

## WHAT SOLD THE LOOK

1. **Cel shading with ink outlines.** The camera's outline mode (`cam.outline`) strokes every shape
   in thick ink before it fills, so the ink sits outside each silhouette and never eats a small
   shape. Paddles are two hard bands a face, and so is the ball.
2. **Poster colour.** Flat bands everywhere, with no gradients to soften them.
3. **A graffiti score:** the block font skewed and tilted, with a magenta extrusion, a fat ink
   outline and yellow drips.
4. **Comic motion:** ink speed lines trail a fast ball (never ahead of it), and a yellow starburst
   pops where a paddle hits it.
5. **The arrival: ink outlines draw themselves** (item 1153), with orange swirl arcs leading the
   ring over the old PlayStation table.

## WHAT DID NOT WORK

- **The graffiti digits touch the top of the picture** (reviewer, item 1147). They sit on the far
  rail and their tops reach the very top of the frame, so a taller digit or a two-digit score may
  be clipped. Worth checking once a score reaches 10. Not yet followed up.
- **The texture barely shows.** The pixellab grain was kept light on purpose to fit the cel bands
  (item 1187), and the court reads almost flat, with faint horizontal lines. It is one setting per
  era if it should be felt.
- **The name card covers the arrival.** On the PlayStation and the Dreamcast, the card sits in
  the middle of the screen at the moment the arrival is showing off (reviewer, item 1151). This was
  raised for the signboard cards. Item 1183 restyled eras 0 to 4 and left eras 5 to 10 on the plain
  card for item 1184.
- **Slow in software Chrome:** 22.6 ms a frame, 28.2 ms with the VGA screen on (card 1216 still
  running).

## SOUND AND MUSIC

- **Effect voice:** punchy synth-funk.
  - paddle hit: a slap-bass sawtooth sliding 110 to 82 Hz through a resonant low-pass closing from
    2200 to 300 Hz (q 8), plus a clap of band-passed noise
  - point: synth stabs, a sawtooth unison of 3 voices at 10 cents, with a clap between
  - the era's own short echo: `{ time: 0.12, feedback: 0.25, mix: 0.2 }`. Before item 1181 it
    borrowed the Super Nintendo's 0.14 s.
- **Boot sting:** the modem answering and screeching (a 2100 Hz tone, band-passed noise, square
  chirps), then the startup chime, three drops and two drum hits.
- **Music** (`ARRANGEMENTS[7]`, item 1210): *bright and upbeat*.
  - jazzy ninth chords comped on an electric piano, a funky bass popping octaves and a crisp synth
    lead
  - a vibraphone climbing the chords in B
  - a swung breakbeat with ghost-note snares, a sizzling ride and a crash at each section
  - the chip rule is *crisp, full-band sound for the first time*: real chord extensions (the
    `ninth` voicing), real cymbals, and no filter on the top end
  - a short, light reverb (1.2 s, mix 0.16). Item 1210's Chrome check measured it brighter than the
    Nintendo 64.

## REUSABLE PIECES

| Piece | File | For a Dreamcast game |
| --- | --- | --- |
| Outline mode | `src/table3d.js` (`cam.outline`, `shade: 'banded'`) | Cel shading for any shape the helper draws. |
| Look | `src/eras/era7-dreamcast.js` | Poster palette, graffiti score, speed lines, starburst. |
| VGA screen | `src/display-tv.js` | `tv-vga`. |
| Voice and music | the era file's `voice`, `src/music.js` row 7 | The slap bass and its filter sweep; the `swing` and `ninth` arrangement options. |

## START HERE

1. Open `index.html?era=7`.
2. Copy the 3D skeleton from [era5-playstation.md](era5-playstation.md), with
   `src/eras/era7-dreamcast.js` in place of era 5's file.
3. The outline is one camera field, `outline: { width, colour }`. Switch it off per call with
   `style.outline: false` for paint that should not be inked, such as the centre-line dashes.
4. Delete the other era files, `src/display-crt.js`, `src/erachange.js`, `src/signboards.js`,
   `src/match.js`, and `advanceEra`'s call.
5. Check a two-digit score before shipping (see WHAT DID NOT WORK).
