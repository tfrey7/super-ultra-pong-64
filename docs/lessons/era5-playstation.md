# Era 5: 1994 Sony PlayStation, the first 3D, and it wobbled

Open it: `index.html?era=5`. Reference frame: [era5-playstation.png](../shots/eras/era5-playstation.png).
Look file: [src/eras/era5-playstation.js](../../src/eras/era5-playstation.js). Chapter 6 of
[docs/ERAS.md](../ERAS.md) is its specification.

## THE MACHINE

- **Reference games** (the art bible's [Reference games](../ART.md#reference-games), item 1286):
  *Ridge Racer* + *Tekken*. Added: real 3D: lit polygons, the players standing whole. Changed: the
  picture through the PlayStation's limits: 320x240, no filtering, flat and Gouraud, affine swim,
  jitter, dither.
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

## LESSONS

What item 1228 learned making this rung "a AAA game of 1994 that happens to be Pong" (docs/ART.md,
era 5): *Tekken* and *Toshinden* on a *Ridge Racer* night. Frames of the result, off the real page:
[a rally](../shots/item-1228/rally.png), [a point](../shots/item-1228/point.png),
[match point](../shots/item-1228/final-round.png).

**What sold the flagship look**

- **The fight HUD did more than any single effect.** Two long yellow health bars from the score
  outward, a tenth gone for every point the other side has taken, `P1` and `CPU` under them, a red
  damage chunk that shrinks over 0.4 s where the bar just drained, `POINT` in yellow with a red drop
  shadow for 0.8 s, and `FINAL ROUND` held at match point. It turns the frame from "a tilted table"
  into "a 1995 fighting game". All of it is the block font and `fillRect` into the same 320 x 240
  buffer as the table, so it is exactly as chunky.
- **A city over the far rail.** Ten flat-shaded boxes (a dark front, a lit roof, a darker side
  facing the centre) with 24 windows in accent yellow at 0.5 that switch one at a time every 0.7 s,
  and two accent-blue searchlight beams at 0.18 sweeping +-25 degrees on a 5 s period. Drawn through
  the same snapping, wobbling camera as the table, so the skyline pops between chunks with it. At
  match point both beams swing down onto the table's centre line and stop.
- Everything new is drawn in code: no generation was spent on the arena or the HUD, and the bible's
  `era5-windows` and `era5-hud-text` images were not needed.

**What did not work**

- **Flat sprites read as sprites on a 3D table, and Tim ruled them out** (23:47 EDT 2026-09-10:
  *"if you are trying to do sprites in the 3d eras uh...that is not gonna look AAA here dude"*). A
  pixel fighter standing on a perspective table is a cardboard cut-out: it does not foreshorten,
  does not take the table's light and does not wobble with the vertices. The two fighters at the
  paddles are a stand-in until this era's polygon-model card (item 1248's renderer) replaces them.
- **pixflux does not draw to a grid.** Asked for a 3 x 6 sheet of 20 x 45 frames, it drew about
  thirty red fighters of 13-17 x 23 pixels in ten loose rows (some black-haired, some blond) and
  fifteen blue ones in two uneven columns. `assets/pixellab/era5-fighters-cut.mjs` finds each figure
  and packs it one to a frame, which is how the stand-in cost no third generation.
- **The bible's skyline was out of shot.** It asked for boxes 60 to 200 units tall at y -60 to -120.
  Under this camera only the top 100 screen units lie behind the far wall, and a 200-unit roof at
  y -90 projects to screen y -69, off the top of the frame. The city is 30 to 90 tall at y -20 to
  -50 here, and the searchlights rise from street level behind their buildings so there is enough
  beam to see. **Measure a backdrop with `T.project` before you size it.**
- **A killed run lost a manifest entry.** The first attempt was ended by the account's usage limit
  after it wrote the left fighter's image but before it wrote that image's manifest entry. The entry
  was rebuilt from the right-hand one and is marked so.
- **Nothing cost frame time.** The arena, the HUD and the fighters together read the same as
  master, back to back on the same machine, in the playtest's software Chrome: 23.4 and 22.7 ms
  against 22.5 ms, each the mean of four one-second readings
  (`node docs/measure/item1228/era5ab.mjs`, results beside it). Both trees split the same way, two
  legs at 16.7 ms and two near 29 ms, so that split is the page's or the machine's, not the dressing.

**What a one-era PlayStation game would copy**

- The fight HUD as it is (`hud`, `barFractions`, `pointMoment`, `chunkOf`, `hudCall` in the era
  file): the damage chunk and the round call are the cheapest "this is 1995" there is.
- The skyline recipe: a seeded row of boxes, three flat faces each, windows switched by a
  staggered counter so exactly one flips per beat, beams as single translucent triangles. All of it
  goes into the low-resolution buffer, never over it.
- Real polygon fighters, not sprites. Keep the two concepts: the left player in a red gi with a
  black belt, the right in a blue sleeveless top and grey trousers.

- **The opponent's name is not drawn in this era (item 1261)**: the top bar already says CPU over the right score, so the caption under it said the same thing twice.

---

What item 1291 learned putting the same limits inside the **real 3D layer** (`src/field3d.js`,
item 1273), now that the table, net, bats and ball are lit polygons rather than drawn by hand:
[the frame before](../shots/item-1291/before-era5-rally.png) and
[the frame after](../shots/item-1291/after-era5-rally.png), the same rally, the same camera pose.

**What the reference changed**

- *Ridge Racer*'s road and *Tekken*'s stage are the same trick, and it is the one thing the layer
  had no knob for: **a texture with no perspective correction**. Before this card the 3D table was
  a plain lit slab with no texture at all, and it read as a modern engine's grey floor. A 64 x 64
  checker mapped affine is what makes it 1994 — the checker kinks along each triangle's diagonal
  and slides as the camera wobbles, which is the flaw everybody remembers.
- **Cut the top into few, large triangles.** The kink lives at the triangle edges, so a finely
  divided slab hides it. The canvas table's own 2 x 2 quads — 8 triangles for the whole 800 x 600
  top — are what make the swim large enough to see, and the same number the hand-drawn table used.
- Everything else that says PlayStation was already a knob the layer reads from the look:
  `render { resolution: 1, filter: false, lighting: 'flat' }`. The field goes into the era's
  320 x 240 buffer, so one GL pixel per picture pixel is 320 x 240; no filtering is what makes the
  copy up sharp, so every edge lands on a 2.5-pixel chunk; flat is one colour a face.

**How the affine map is done**

- three.js interpolates every varying *perspective-correctly*, so you cannot simply ask it not to.
  The trick is to undo it: multiply the texture coordinate by `gl_Position.w` in the vertex shader
  and divide it back by an interpolated `w` in the fragment shader. What arrives at the fragment is
  then the coordinate interpolated linearly **in screen space** — exactly what the PlayStation's
  texture mapper did, because it had no divider.
- It goes in through `onBeforeCompile` on the slab's material: `#include <project_vertex>` grows
  two lines, and `#include <map_fragment>` is replaced outright. Nothing in the layer is edited,
  which is what lets one era reshape a scene six eras share.
- **The scene is shared, so the setup must be re-appliable, and must cost nothing when nothing has
  changed.** `fieldSetup` re-installs itself when the last frame was another era's and when the
  layer has rebuilt its materials (a lighting change does), and otherwise returns on the first
  `if`. A version bump on a material every frame would recompile a shader every frame.

**What did not work, and what it cost**

- **The picture-quality knobs are free; the texture is not, on a CPU.** In the playtest's headless
  Chrome, which rasterises WebGL in software, the textured slab costs about **4 ms a GL draw** more
  than the untextured one (1.9-2.2 ms against 6.0-7.1 ms, 3 runs each, back to back), and the page
  reads 17.4 ms a frame before and 21.3-23.3 after. **On the graphics card the whole difference is
  inside the noise**: 4.63 ms a frame before against 4.77 after, 0.72 ms a GL draw against 0.80.
  That is one texture fetch and one divide per fragment over most of the screen, which is what a
  software rasteriser charges full price for and a GPU does not notice. Judge a 3D era's speed with
  `--gpu`; `node docs/measure/item-1291/rally.mjs --label after --gpu` re-takes it.
- **The first seconds of a page are not its speed.** A material with a custom shader chunk has its
  program compiled the first time it is drawn, and in SwiftShader that showed up as a single
  216 ms frame in the middle of a three-second window — enough to move that window's mean from
  22 to 62 ms and to make the card look 13 ms slower than it is. The capture script throws six
  seconds away before it measures anything and reports the **median** of its windows, and the
  difference went to 0.1 ms. Section 8a of the worker bootstrap is the same lesson from the ring.
- **Pin the bat's colour before measuring its edges, and pin it to a colour nothing else wears.**
  Era 5 borrows era 1's paddle colours, which the session picks at random, so two runs photograph
  two differently coloured bats. Pinning it to the accent red fixed that and broke something else:
  the left player's gi is the same red, so the edge scan traced the *figure* and reported 5 of 9
  edges on the chunk grid instead of 3 of 3 — identically on both trees, which is what gave it
  away. A purple and a teal nothing else on this table uses keep the scan honest.

**What a one-era PlayStation game would copy**

- The affine shader chunk verbatim (`layer.AFFINE` and `layer.affineChunk` on the look). It is ten
  lines and it is the single strongest period signal on a textured 3D surface.
- The rule that the era's scene work is one function, `fieldSetup(F, state)`, which asks the layer
  for its internals and does nothing at all when there are none — that is what keeps `node --test`
  and `?gl=off` drawing exactly what they drew before.

LESSONS: the reference games moved this rung from "a low-resolution 3D table" to "a 1994 3D table",
and the whole of that move is one texture mapped without perspective correction across eight big
triangles; the resolution, the filtering and the flat shading were already knobs, and the 64 x 64
checker that kinks and swims is the thing a player recognises.
