# Era 8: 2000 PlayStation 2, the machine that wanted to be a film

Open it: `index.html?era=8`. Reference frame: [era8-ps2.png](../shots/eras/era8-ps2.png).
Look file: [src/eras/era8-ps2.js](../../src/eras/era8-ps2.js). Chapter 9 of [docs/ERAS.md](../ERAS.md).

## THE MACHINE

- **Native resolution here:** 512 x 448, scaled up soft.
- **Framing:** cinematic letterbox bars. The table must stay inside them: the camera check uses
  bounds 60 and 540 for this era instead of the full frame.
- **Camera:** tilt 30 degrees, height 1250, field of view 29, screen y 281. It **drifts** slowly on
  three unrelated periods, between tilt 28.5 and 31.5, sideways shift -10 to +10, and height 1210
  to 1290. Every extreme passes readability rule R3.
- **Texture:** the pixellab steel tread plate (`court-metal`), which shows clearly under the glow
  (item 1187).
- **Sound:** streamed film-score audio, wide and dark.
- **Screen:** a late CRT over component, `tv-component`: cleaner, thinner scanlines and a faint
  bloom.
- This era draws its own ball trail.

## WHAT SOLD THE LOOK

1. **Letterbox bars with the score as a subtitle.** It is a cutscene before the ball moves.
2. **A dark glossy slab that mirrors the paddles**, under a moody night palette.
3. **Particles:** dust hanging in the air, and sparks spraying off every paddle hit. The sparks
   come from a fixed pool, and each spark's position is a pure function of its birth and the
   clock, so drawing a moment twice draws the same frame.
4. **An alpha-glow trail and halo behind a white-hot ball**, drawn behind it. The ball itself is
   white and drawn after every glow (laws R1 and R2).
5. **A lens flare** from a light just above the far rail, its ghost chain drifting down.
6. **The arrival: the boot towers rise** (item 1154).

## WHAT DID NOT WORK

- **The bible's flare light could not be seen** (item 1148). The world point (120, -400, 600)
  projects 490 to 600 pixels above the canvas in every drift pose: a camera looking 60 degrees
  below the horizon cannot see a light that high. Only two of five ghosts reached the frame. The
  light is now (120, -40, 60), just behind the far rail. It lands at screen y 25 to 54, under the
  edge of the top bar, so the glow spills out from behind the letterbox and never sits over the
  table.
- **The boot towers were first filmed mostly off screen or behind the name card** (item 1154).
  They were moved onto the side facing the field before handing over.
- **The TV screen's first draft held this era at 86 ms a frame** (item 1200, page-size blends).
  Blending on the native copy brought it to 33.9 ms, against 27.8 ms with no screen, in software
  Chrome. Card 1216 owns the rest.

## SOUND AND MUSIC

- **Effect voice:** deep and cinematic.
  - paddle hit: a sine thud sliding 80 to 50 Hz, low-passed noise and a soft triangle 392 Hz
  - wall: two sines with slow 0.02 s attacks
  - point: a 55 Hz boom falling to 35 Hz, noise closing from 600 to 120 Hz, and a swelling chord
    of 5-voice unison sawtooths opening through the filter
  - `effects: { reverb: { seconds: 2.8, decay: 3, mix: 0.35 } }`
- **Boot sting, the tower hum:** a low swelling drone (55 Hz sawtooth, 5 voices, filter opening
  200 to 800 Hz) and crystal twinkles at 1760, 2217 and 2637 Hz.
- **Music** (`ARRANGEMENTS[8]`, item 1210): *cinematic*.
  - slow, wide strings singing the melody over a dark string bed
  - a low A drone that never lets go, a deep eighth-note pulse under it
  - a heartbeat of distant drums swelling into taiko hits at the end of each section
  - the chip rule is *film-score texture*: strings spread wide in stereo (`spread`, `pan`),
    `lowpass: 4200` and a long hall, `reverb: { seconds: 4, decay: 2, mix: 0.45 }`

## REUSABLE PIECES

| Piece | File | For a PS2 game |
| --- | --- | --- |
| Letterboxed camera | `tools/table3d-cameras.js` (`bounds: { top: 60, bottom: 540 }`) | Fit a camera inside bars. |
| Look | `src/eras/era8-ps2.js` | Drift (`poseAt`), the spark pool, the glow trail, the flare (`FLARE`, `LIGHT`), reflections. |
| Textures | `src/textures3d.js` | `court-metal`. |
| Component TV | `src/display-tv.js` | `tv-component`. |
| Voice and music | the era file's `voice`, `src/music.js` row 8 | The long reverb, the drone, stereo spread. |

## START HERE

1. Open `index.html?era=8`.
2. Copy the 3D skeleton from [era5-playstation.md](era5-playstation.md), with
   `src/eras/era8-ps2.js` in place of era 5's file.
3. If you move the camera or its drift, re-run `node tools/table3d-cameras.js`. Every pose must
   stay readable inside the bars.
4. Delete the other era files, `src/display-crt.js`, `src/erachange.js`, `src/signboards.js`,
   `src/match.js`, and `advanceEra`'s call.
5. Place any light where the camera can see it. Project it first; the bible's number could not be
   seen.
