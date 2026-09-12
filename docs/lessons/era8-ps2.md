# Era 8: 2000 PlayStation 2, the machine that wanted to be a film

Open it: `index.html?era=8`. Reference frame: [era8-ps2.png](../shots/eras/era8-ps2.png).
Look file: [src/eras/era8-ps2.js](../../src/eras/era8-ps2.js). Chapter 9 of [docs/ERAS.md](../ERAS.md).

## THE MACHINE

- **Reference games** (the art bible's [Reference games](../ART.md#reference-games), item 1286):
  *Metal Gear Solid 2* (E3 2000) + *Tekken Tag Tournament*. Added: weather and particles: rain,
  dust, sparks. Changed: the film presentation: letterbox, a drifting camera, the field mirrored in
  the slab as mirrored geometry, 512x448 interlaced.
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
| The rally counter as a subtitle (item 1262) | `src/feel.js` `LETTERING[8]` | Sets it in thin wide-tracked blue type in the bottom letterbox bar (y 572), and the callouts in the same film type, so the playfield carries only the callout. |

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

## LESSONS

What item 1232 learned making this era look like a AAA game of 2000 that happens to be Pong (the
art bible's era 8 page, [docs/ART.md](../ART.md)).

**What sold the flagship look here**

- **People at the table.** Two operatives stand at the table's ends, one in midnight navy with an
  amber visor and one in slate with a blue visor. They are drawn as upright figures at the paddle's
  spot on the table, and they shrink toward the far rail. Nothing else turned the frame from a
  table game into a scene so quickly.
- **A place, not a backdrop.** The night skyline fills the band between the top bar and the far
  rail, and the wedges beside the table. Behind it a searchlight sweeps, and rain falls over
  everything. The frame shows only about forty pixels of sky, and that was enough.
- **Mirrors.** The glossy slab reflects the players as it reflects the paddles, at the same 0.18.
  That one draw is most of the "PS2 shine".
- **Film interface.** The score stays a subtitle, and codec name plates sit in the bottom bar.
  A point is typed across the top bar a letter at a time, and match point is set in amber. The
  letterbox is the HUD's frame, so the playfield carries nothing.

**What did not work**

- **pixflux does not draw sprite sheets.** Asked for "3 columns by 6 rows of equal cells" at
  72 x 324, it drew a 2 x 4 grid of eight figures for one player and a single column of three for
  the other, at two different heights. [era8-sheets.mjs](../../assets/pixellab/era8-sheets.mjs)
  finds each figure by its alpha, scales every figure to 80 pixels and stands them on one baseline.
  It derives the missing beats: a lean for move, a mirrored figure turning to watch the ball for a
  miss, and a pixel's bob for idle. That script costs 0 generations. **Ask pixflux for figures,
  never for a grid, and cut the grid yourself.**
- **Parallel generations race on the manifest.** Three `tools/pixellab.mjs gen` runs at once each
  rewrote `manifest.json`, and only the last entry survived. Two entries had to be rebuilt from
  their prompts, seeds and bills. Generate one at a time, or merge the entries afterwards.
- **The bible's skyline was placed in world space where the camera cannot see it.** It gave towers
  120 to 300 units tall at world y -100 to -200. Through this camera they land 160 to 500 pixels
  above the canvas. The flare's light failed the same way before. The plate is laid in screen
  space instead, sliding at half the camera's drift. **Project any set dressing before you
  specify it.**
- **The bible's rain colour was invisible.** Slate at 0.25 on a slate slab cannot be seen, so the
  rain is HUD ink at 0.18.
- **The players are drawn after the era, so over the letterbox.** The rig
  (`src/characters.js`) draws them after the era's frame. Without a clip, a far player's head
  pokes into the black bar. Item 1232 first fixed it by wrapping the renderer's draw once more
  and laying the bars again over the players. Item 1249 moved the fix into the rig: the era's
  block there carries `clip: { y0: 52, y1: 548 }`, and the rig draws both players only between
  those heights. Any letterboxed era can do the same.
- **One animation rate for every beat.** The rig cycles idle, move and win at one `fps`. The
  bible's 8 turned a two-frame breath into a flicker, so the era runs at 3.

**What a one-era game would copy**

1. The operative sheets: `assets/pixellab/era8-sheet-left.png` and `era8-sheet-right.png`, six
   rows (idle, up, down, swing, miss, win) of 40 x 84 frames, the hand at (32, 47), drawn 1.125
   table units a pixel.
2. The recipe for making more: generate single figures, then run `era8-sheets.mjs` to cut, scale,
   baseline, grade (12% toward navy) and cap every colour at luma 0.8. The visor stays the
   brightest thing on a figure, and the ball the brightest on screen.
3. The arena layers, in painter's order: sky gradient and amber haze, then the searchlight, the
   skyline plate, the slab, the reflections (paddles and players), dust, paddles, trail, halo and
   sparks, the flare, the rain, the ball, and the letterbox with its subtitle and plates.
4. The typed line: a subtitle that reveals one letter every 0.03 s and holds a second is the
   cheapest "cutscene" there is.

- **The opponent's name is not drawn in this era (item 1261)**: the bottom plates already say CPU, so a second caption beside the digits earned nothing.

## LESSONS: mirrored geometry under a film shot (item 1295)

The reference-ladder pass (docs/ART.md, *Reference games*, era 8). The models are **Metal Gear
Solid 2**'s E3 2000 tanker demo -- letterboxed real-time cutscenes, rain at night, the Codec's
portraits -- and **Tekken Tag Tournament**, the 2000 launch title, in the manner of: not one
Konami or Namco character or mark is drawn. Tim's build-up rule gives each era one ADD and one
CHANGE from the era before it. Era 8 ADDS **weather** (rain, dust and sparks: no earlier rung has
weather at all) and CHANGES **how the inherited field is presented** -- the PlayStation 2 way.

Before and after, the same posed rally frame:
[before.png](../shots/item-1295/before.png) and [after.png](../shots/item-1295/after.png)
(`index.html?era=8`).

**What the reference changed**

- **A glossy floor in 2000 was a second copy of the world, not a shader.** The Graphics
  Synthesizer had no pixel shaders and no hardware bump mapping, so the tanker deck's reflections
  were the geometry drawn *again*, mirrored through the floor's plane, with the floor laid over it
  see-through. Era 8 does exactly that: copies of the 3D layer's two bats, the net, its tape and
  the ball, every height negated, under the slab turned transparent at 0.82 -- which makes the
  copies read at 0.18, measured at 18 on both bats where master reads 0. It cost nothing: 16.7 ms
  a frame, the same as before. **This is the technique to reach for whenever a surface should
  shine and the era predates shaders**, and it is cheap because the machine it imitates was cheap
  at exactly this.
- **The mirror has to be armed per frame, because the scene is shared.** Eras 5 to 10 pose ONE
  scene, so the copies and the see-through slab must belong to era 8's frames alone. `fieldSetup`
  arms a flag every frame era 8 draws, and the scene's own before-render hook hides the copies and
  makes the slab solid again on anybody else's frame. Without that, era 9 inherits a transparent
  table and a second set of bats hanging under it.
- **An opaque backing sheet goes under a see-through floor.** A translucent slab with nothing
  behind it shows the painted arena through the table, which no PS2 game ever did. A dark plane a
  quarter of a unit under the slab's underside stops that and hides anything deeper than the
  mirror wants to go.
- **The render knob is a multiplier, not a width.** `render.resolution` multiplies the picture's
  OWN pixel scale, and era 8's picture is already the display's native 512 x 448 -- so
  `resolution: 1` renders the field 512 across, and the 0.64 that looks like the right number for
  "512 of 800" would have rendered it 328. What the knobs really change here is `filter: true`
  (the GL picture scales smoothly rather than blockily) and `lighting: 'phong'` -- era 7's toon
  materials off, smooth specular ones on, which is the whole difference between a cel-shaded
  Dreamcast and a lit PlayStation 2.
- **Interlace is a stripe tile, never a pixel walk.** The PS2's 448 lines were two fields of 224
  drawn a frame apart, so every other line of the composite is 6% darker and which lines those
  are swaps sixty times a second. Two 1 x 2 canvases are built once and used as repeating
  patterns: ONE fill covers the whole picture. A per-pixel pass over 512 x 448 every frame would
  have cost more than everything else on this rung put together.
- **Probe a reflection from the near edge of what casts it.** A copy hangs straight down from its
  original, so on screen it sits just below the bat's foot -- but a probe aimed at the paddle's
  middle lands on the blade's own standing face and reads the bat, not its reflection. The
  measurement script walks down the screen from the near edge of the footprint and keeps the row
  most tinted by that bat's ink: `node docs/measure/item-1295/shoot.mjs --label after`.

**What a one-era game would copy**

1. `mirrorTransforms(state, heights, sizes)` in `src/eras/era8-ps2.js`: a pure function giving
   every copy's position and scale from the state alone, so the mirror is testable with no
   browser and no GPU.
2. The arm-per-frame pattern above, for any effect that must own a shared scene for its own
   frames only.
3. The stripe-tile interlace, which suits any machine that drew two fields to a frame.
