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
| The rally counter and callouts in the toy HUD's lettering (item 1262) | `src/feel.js` `LETTERING[6]` | Sets RALLY and NICE/GREAT in fat toy-yellow type in the score's blue outline, the counter on a round blue plate; a new HUD word on this era takes that row. |

## START HERE

1. Open `index.html?era=6`.
2. Copy the 3D skeleton from [era5-playstation.md](era5-playstation.md), with
   `src/eras/era6-n64.js` in place of era 5's file.
3. Keep the order that keeps play sharp: blurred world first, then the crisp paddles and ball on
   top.
4. Delete the other era files, `src/display-crt.js`, `src/erachange.js`, `src/signboards.js`,
   `src/match.js`, and `advanceEra`'s call.
5. Judge the fog at a glance: can you see the far rail? If yes, it is too gentle.

## LESSONS

*Item 1230 made this era 1996's flagship game that happens to be Pong (docs/ART.md, Era 6): two
toy mascots hold the paddles, the table sits in a toy park, and the score wears a round
power meter. Pictures: [the rally at the first look](../shots/item1230/rally-era6-first-look.png)
and [after the fixes it called for](../shots/item1230/era6-after-fixes.png).*

### What sold 1996's flagship look here

- **The characters, as concepts**: a round penguin in a red scarf for the player and a round
  frog in a yellow cap for the computer, chunky *Super Mario 64*-era toys. The concept holds; the
  flat sprite that draws them now is a stand-in (see *What did not work*). Smoothing the sheet and
  laying the era's fog over the figure at its paddle's depth, capped at 0.35 like the paddles
  (`src/characters.js`, block fields `smooth` and `fogCap`), did help it sit in the soft world.
- **Set dressing that moves on its own**: pennants waving on toy-yellow poles past the table's
  ends, butterflies over the horizon. Drawn into the half-resolution world, so the blur takes them
  too and they never compete with the crisp ball.
- **A round, toy HUD**: the outlined toy score plus an eight-slice pie power meter that fills with
  the rally, and five toy-yellow stars popping from the scorer's paddle on a point.

### What did not work

- **Flat sprites read as sprites on a 3D table, and were ruled out.** Tim, seeing the 3D eras'
  sprite players: *"if you are trying to do sprites in the 3d eras uh...that is not gonna look AAA
  here dude"*. However soft and fogged, a pixel-art billboard on a polygon table says 2D. The 1996
  answer is a low-poly model drawn by the game's own 3D; the penguin and the frog are to be built
  in Blender on a card of their own, and the sprites stay only as a stand-in until then.
- **pixflux does not draw sprite sheets.** Asked for "3 columns and 6 rows" at 60 x 270, it drew
  the frog as one pose repeated seven times down a single column, and the penguin as fourteen
  10-pixel figures in two columns. Two generations for nothing usable as a sheet
  (`assets/pixellab/era6-frog-sheet-raw.png`, `era6-penguin-sheet-raw.png`). **What worked: one
  figure per generation** (32 x 40, "full body, three quarter view facing right"), and the six rows
  built offline from it by transforms ([era6-n64-sheets.py](../../assets/pixellab/era6-n64-sheets.py)):
  bob, squash, a 12-degree lean, a lunge, an edge-on spin-out with stars, a jump. A pose a
  transform cannot make (arms up for the win) needs its own generation. Five generations in all,
  of the twelve allowed.
- **Two pixellab runs at once lose a manifest entry.** Each reads the manifest, generates, and
  writes it back, so the slower run overwrote the faster one's entry. Run generations one after
  another.
- **Fogged "at their depth like the rails", the poles vanished.** At y 150 the fog is 0.9, and the
  first browser look showed two faint lines and no cloth. Capped at 0.45, like the paddles' cap,
  they read. The butterflies had the same fate under the pale wall; they fly over it now.
- **The bible's meter "under each score" crosses R8 on this camera**: the far edge is at y 102 and
  the score ends at 80, so a radius-14 meter under it breaks the line at 96. It sits beside the
  score, on the inner side, because the computer's name is written on the outer side of the
  right-hand score.
- **What it costs a frame** ([eraspeed.json](../measure/item1230/eraspeed.json) against master's
  [eraspeed-master.json](../measure/item1230/eraspeed-master.json), taken back to back by
  `docs/measure/item1230/eraspeed.mjs`): with the GPU, era 6 went from 4.37 to 6.07 ms a frame
  (p95 4.3 to 8.6), well inside 16.7. In the playtest's GPU-less Chrome it reads 35.1 against
  master's 37.7, which is noise on a loaded machine; both are over that harness's 18.5 ms line, as
  every 3D era is there (card 1216). The figures' fog pass (three draws each) and the pennants'
  curves are the new work, if a later card needs the 1.7 ms back.
- **The rig could not smooth or fog a figure**, and it threw under `node --test` once an era named
  a sheet (no `Image` in Node). Both are fixed in the rig for every 3D era, not just this one.

### What a one-era game would copy

1. **Players as low-poly models, not sprites.** Keep the penguin and the frog as the concept (the
   silhouette, the colours, the scarf and the cap) and build them in 3D. The sprite recipe here (one
   pixflux figure per pose, the rows built offline by `era6-n64-sheets.py`) is for a 2D era.
2. **The draw order that keeps play readable**: the blurred world, then the crisp paddles and ball,
   then the players fogged at their depth, then the stars, and the HUD last, not shaking.
3. **Cap every fog you put on something the player should see** (paddles, figures, dressing); let
   only the world itself go fully into the wall.
4. **The toy park and the round HUD**: poles, pennants and butterflies drawn in code into the
   half-resolution world; an eight-slice pie meter filling with the rally; stars on a point.
