# Era 6: 1996 Nintendo 64, soft, round and foggy

Open it: `index.html?era=6`. Reference frame: [era6-n64.png](../shots/eras/era6-n64.png).
Look file: [src/eras/era6-n64.js](../../src/eras/era6-n64.js). Chapter 7 of [docs/ERAS.md](../ERAS.md).

## THE MACHINE

- **Native resolution here:** 320 x 240, scaled up soft.
- **Texture budget:** tiny. The grass is textured from a **16 x 16 tile** through 8 x 6 finely cut
  quads, under the pixellab wood-grain court (`court-grain`).
- **The world behind play is drawn at half resolution:** sky, hills, table, rails and fog go into
  a 400 x 300 buffer, copied up with smoothing *on*. That gives the bilinear-filtered smear.
- **Camera:** the closest of the six. Tilt 26 degrees (28 at its motion extreme), height 900,
  field of view 39.5, screen y 301.
- **Fog** (after item 1197): end 0.85, power 1.4, max 0.97, so the far rail is gone into a pale
  wall before the table ends.
- **Ball:** radius 0.9 of its box (item 1197), against the stock 0.6. A big smooth ball with a hot
  specular dot, the opposite of the PlayStation's faceted gem.
- **Sound:** cartridge-squeezed samples. The whole mix is rolled off above about 9 kHz.
- **Screen:** `tv-composite` at strength 0.9, with no dither.
- **Game feel:** intensity 0.6, adding the rally counter and its callouts. This era draws its own
  rumble.

## WHAT SOLD THE LOOK

1. **Heavy distance fog** swallowing the far end.
2. **Bilinear blur** on everything behind play. The paddles and the ball are drawn on the main
   canvas *after* the blurred buffer is copied up, so they stay crisp (laws R2 and R4).
3. **Smooth, rounded low-poly**: Gouraud paddles with rounded caps, half-cylinder rails, and the
   big ball.
4. **A saturated toybox world**: blue sky, rolling hills, drifting clouds, a toy-yellow score.
5. **Rumble as screen shake**: 3 pixels or less on a paddle hit, 6 or less on a point, gone within
   0.25 s. It is drawn as a translate around the frame and never applied to the state. The HUD
   does not shake.
6. **The arrival: the fog rolls in and the picture goes soft** (item 1152), with the cube moved
   above the name card.

## WHAT DID NOT WORK

- **The first fog and ball were too gentle** (reviewer on item 1146). The fog only reached full
  strength past the far end of the table, so the court was plainly visible to the far rail, and the
  ball at 0.7 did not read as big. Those are the two traits that most say "Nintendo 64". Item 1197
  thickened the fog before the far rail and raised the ball to 0.9.
- **The playtest could not tell a placeholder from the real era.** While eras 6 to 10 were
  `like: 5` stand-ins, the ladder walk failed "the new era draws afterwards" on every placeholder
  change, because two adjacent rungs drew the same frame. Four cards each lost time proving that
  on clean master. Since item 1157 the check asks only for an exact match when the two frames are
  identical.
- **Slow in software Chrome:** 27.5 ms a frame with the display layer, 31.8 ms with the TV screen
  on (items 1192, 1200; card 1216 still running).
- **The boot sound is invented.** The machine had none, and the bible and the file both label it
  so.

## SOUND AND MUSIC

- **Effect voice:** low sample rate, rounded and springy, everything through a muffling bus.
  - paddle hit: a square at 392 Hz whose low-pass closes from 1400 to 500 Hz, plus a bassy sine
    thud sliding 98 to 70 Hz
  - wall: a triangle sliding up, 587 to 880 Hz
  - `effects: { bus: { type: 'lowpass', freq: 3200 }, reverb: { seconds: 1.0, decay: 3, mix: 0.2 } }`
- **Boot sting:** a cartridge snap of band-passed noise, then a bright chorus chord (sawtooth
  unison, 3 voices, 15 cents), and a rounded sine swooping up an octave and a half as the fog rolls
  in (item 1152).
- **Music** (`ARRANGEMENTS[6]`, item 1210): *synth-orchestral*.
  - a fat, slowly vibrating string pad and brassy stabs
  - melody on a breathy flute in A and a proud horn in B, over bowed basses, timpani and a crash
    at each section
  - the chip rule is *cartridge-squeezed samples*: `lowpass: 9000` and a big hall,
    `reverb: { seconds: 3.2, decay: 2.5, mix: 0.42 }`
  - item 1210's Chrome check measured it as more muffled than the Dreamcast

## REUSABLE PIECES

| Piece | File | For an N64 game |
| --- | --- | --- |
| 3D table | `src/table3d.js` | `T.fogAmount`, `T.fogColour`, `T.fogBand`, `T.offscreen` for the half-resolution world. |
| Look | `src/eras/era6-n64.js` | The half-resolution world buffer, the fog numbers, the rounded shapes, `SHAKE`. |
| Camera | `tools/table3d-cameras.js` | The close camera and its R3 check. |
| Textures | `src/textures3d.js` | `court-grain`. |
| Voice and music | the era file's `voice`, `src/music.js` row 6 | The muffling `bus` and the hall reverb. |

## START HERE

1. Open `index.html?era=6`.
2. Copy the 3D skeleton from [era5-playstation.md](era5-playstation.md), with
   `src/eras/era6-n64.js` in place of era 5's file.
3. Keep the order that keeps play sharp: blurred world first, then the crisp paddles and ball on
   top.
4. Delete the other era files, `src/display-crt.js`, `src/erachange.js`, `src/signboards.js`,
   `src/match.js`, and `advanceEra`'s call.
5. Judge the fog at a glance: can you see the far rail? If yes, it is too gentle.
