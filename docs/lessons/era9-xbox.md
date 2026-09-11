# Era 9: 2001 Xbox, hard, shiny, metal and green

Open it: `index.html?era=9`. Reference frame: [era9-xbox.png](../shots/eras/era9-xbox.png).
Look file: [src/eras/era9-xbox.js](../../src/eras/era9-xbox.js). Chapter 10 of [docs/ERAS.md](../ERAS.md).

## THE MACHINE

- **The real hardware:** the first console with programmable pixel shaders, and it showed them off.
- **Native resolution here:** 640 x 480, scaled up soft.
- **Palette:** green on black and gunmetal (`C` in the era file: black `#050605`, gunmetal
  `#2a2f2b`, steel `#5b635d`).
- **Camera:** tilt 27 degrees, height 1000, field of view 35, screen y 303, still.
- **Texture:** a 64 x 64 diamond-plate tile built once from paths, plus the pixellab tread plate
  (`court-metal`) laid over the court and the paddles in `overlay` blend.
- **The light:** it is the ball. It rides 160 units over the ball, a little ahead of it.
- **Sound:** a PC sound chip in a box, streaming real recordings.
- **Screen:** component, `tv-vga` at strength 0.85.

## WHAT SOLD THE LOOK

1. **Bump-mapped diamond plate.** Each lozenge is embossed dark, light and face. The plate is laid
   over the table in 12 depth strips, each lit in a hard band by how near it is to the moving
   light. A specular pool under the light has a highlight-only tile clipped to it, so the emboss
   lights up where the light is.
2. **Hard dynamic shadows.** Each paddle's box and the ball are cast onto the table as flat black
   shapes at 0.45 opacity: lighter than the ball's true contact shadow, so the eye still reads the
   real position (law R5).
3. **Green on black**: green rail tops with glow lines, and paddles edged in green glow (the era's
   only `shadowBlur`).
4. **Gamertags floating over both paddles**, and a Halo-style segmented shield bar as the score,
   which flashes alarm red when its side concedes and then recharges. From the Xbox on, the
   opponent taunts through its gamertag on a point it wins, from a short fixed list
   (`src/opponents.js`).
5. **The arrival: the green sphere expands and the shadows snap on** (item 1155), with tendrils,
   and the gamertags fading in.

## WHAT DID NOT WORK

- **The first shadows were too faint** (item 1149). The run looked at its own first picture,
  lowered the light and re-shot. It moved the light to 160 up where the bible said 520, and the
  bible was not updated at the time. Even after the change, the ball's hard shadow is hard to find
  in a still.
- **Sixteen minutes with no commit** (item 1155's first attempt). The account's rate limit ended
  it at 21:19 with no plan, step or checkpoint on the card. The second run found the draft still
  uncommitted in the folder, saved it, noticed it had never been hooked into the era, and finished
  in 4 minutes. It survived only because nothing had cleaned the folder. The lesson is about the
  run rather than the look: commit early.
- **Slow in software Chrome:** 26.3 ms a frame, 32.8 ms with the screen on (items 1192, 1200;
  card 1216 still running).

## SOUND AND MUSIC

- **Effect voice:** sub-heavy FM metal.
  - paddle hit: an FM sine at 180 Hz (ratio 1.41, index 3), a 45 Hz sub dropping to 35 Hz, and a
    band-passed noise click
  - wall: an FM clang at 620 Hz (ratio 2.76) over a 60 Hz thump
  - point: a falling filtered sawtooth, three square alarm beeps at 880 Hz, a 40 Hz boom and a
    rising sweep
  - `effects: { shape: 0.3, reverb: { seconds: 1.4, decay: 2, mix: 0.3 } }`. The `shape` is a
    WaveShaper drive on the era's bus, for grit.
- **Boot sting, the sphere thrum:** a pulsing 45 Hz sub (an `lfo` at 6 Hz, depth 0.6), a filtered
  unison sawtooth rising, a band-passed whoosh sweeping 400 to 3000 Hz, and a power-up chime at
  1320 and 1980 Hz. It played once for the point in item 1155's browser check.
- **Music** (`ARRANGEMENTS[9]`, item 1210): *drop-tuned rock*.
  - low palm-muted power-chord chugs double-tracked hard left and right
  - the melody screamed out on an overdriven lead guitar, and a growling bass an octave down
  - a heavy kick, and a cracking snare rolling into each new section
  - the chip rule is *a guitar amp in software*: a sawtooth through a heavy `drive`, the `power`
    chord voicing, wide stereo
  - a short, dry reverb (1 s, mix 0.12)

## REUSABLE PIECES

| Piece | File | For an Xbox game |
| --- | --- | --- |
| Look | `src/eras/era9-xbox.js` | The plate tile, strip lighting, projected shadows, green glow, gamertags, shield bar. |
| 3D table | `src/table3d.js` | `T.quad` for projected shadow shapes; the texture overlay on court and faces. |
| Textures | `src/textures3d.js` | `court-metal`. |
| Taunts | `src/opponents.js` | Clean by construction: a fixed list, nothing generated. |
| Voice and music | the era file's `voice`, `src/music.js` row 9 | FM metal, `shape`, and the rock arrangement's `drive` and `power` chords. |

## START HERE

1. Open `index.html?era=9`.
2. Copy the 3D skeleton from [era5-playstation.md](era5-playstation.md), with
   `src/eras/era9-xbox.js` in place of era 5's file. Keep `src/opponents.js` for the gamertag
   taunts.
3. Keep every extra shadow lighter than the contact shadow. It is what keeps a moving light fair.
4. Delete the other era files, `src/display-crt.js`, `src/erachange.js`, `src/signboards.js`,
   `src/match.js`, and `advanceEra`'s call.
5. Look at your own screenshot before calling the light done. That is how item 1149 found its
   faint shadows.

## LESSONS

*The AAA pass, item 1233: era 9 drawn as a 2001 Xbox flagship (a Halo-style hangar match) that
happens to be Pong, to its page in [docs/ART.md](../ART.md).*

**What sold the flagship look here**

- **People standing at the table** (the idea sold; the sprite form did not, see below). An
  armoured space marine on the left and a steel cyborg on the right, each 90 table units tall at
  the paddle's outer edge, holding the paddle as an energy shield.
- **The light touches the players too.** Each player casts a hard shadow 40 units long from its
  feet, directly away from the ball's moving light, at 0.30, lighter than the paddles' 0.45 (R5).
  When the ball comes within 160 units the player's frame is drawn a second time in `'lighter'`,
  up to 0.35, fading with distance. That glint is what makes the armour read as metal under the
  same light as the plate.
- **A place, not a void.** A pixellab hangar wall (400 x 80, dimmed to about half so it never
  competes with the ball, and lifted where the light is) stands behind the far rail with six
  steel ribs out of it. Two beacon posts past the end rails sweep a green wedge every 2 s, and
  steam puffs from the feet of ribs 2 and 5 every 3 s.
- **The moments are the set's.** A point turns both beacons alarm red for 1 s, and the losing
  player's outline flashes red for 0.3 s. At match point the beacons stay red, the steam blows
  without stopping and the gamertags' borders pulse green once a second. A Halo motion-tracker
  ring sits in the HUD band's centre with a dot at the ball's `x`.

**What did not work**

- **Flat sprites read as sprites on a 3D table, and were ruled out.** Tim, seeing the 3D eras'
  players: *"if you are trying to do sprites in the 3d eras uh...that is not gonna look AAA here
  dude"*. A 2001 flagship's people are polygon models lit by the scene; a pixel billboard standing
  on a perspective table reads as a cut-out, whatever its shading. The marine and the cyborg here
  are a **stand-in** only, wired through era 9's block in `src/characters.js`. The real players are
  Blender-built models drawn by the game's own 3D, on a card that follows this one and keeps these
  two characters' concept. The shadow, glint and miss-flash code in the era file is written against
  the rig's anchor, so it carries over to a model standing in the same spot. The pixellab lessons
  below still hold for any 2D era.
- **pixflux does not draw a sprite sheet on a grid.** Asked for 3 x 6 frames of 24 x 54, it drew
  the marine as 13 figures in 7 rows of two, and the cyborg as four figures of two different
  sizes. The fix costs no generations: `assets/pixellab/era9-derive.mjs` keys out the ground (the
  border's exact colour, flood filled, so the near-black outline survives), cuts each figure from
  its cell, and pastes it onto the rig's grid with its feet down and its front on the hand edge.
  **Ask pixflux for one row of three frames at the frame size.** The cyborg's re-roll asked for
  exactly that (72 x 54) and came back on the grid.
- **The re-roll kept the grid but lost the poses.** The cyborg's three frames are three nearly
  identical stances, so its swing and recoil are made by sliding a stance 1 to 3 pixels. Read
  plainly, the cyborg's beats show through its position and the red miss flash, not its body.
  One row per beat (six small images) would have given real poses, and would still fit the
  12-image budget.
- **The rig draws the players after the era, so an era cannot light them from inside its own
  draw.** The glint and the miss flash need to land on the players. The era file hooks the
  renderer once more, outside the rig, and draws those two things over era 9 frames only.
- **The rig loads a sheet by name off disk** (`src/sprites.js`), not as a `data:` URI, so a page
  opened off disk by hand has its canvas tainted by the players. Nothing in the game reads pixels
  back, and the playtest's Chrome is started with file access, so nothing breaks today. The
  hangar and the beacon, which the era draws itself, are embedded in `src/textures3d.js`.
- **The gamertags at `z` 60 covered the players' chests.** The bible put them "at the players'
  head height", but a 90-unit player's head is at about 100, so the tags float at 118 now.

**What it costs.** Nothing measurable. `docs/measure/item1233/era9ab.mjs` times era 9 on this
branch and on master in the same minute, three rounds each, with era 8 beside it to show the
machine's load (`era9ab.json`, 12 rows). Era 9 ran 0.86 to 1.02 times era 8 on the branch, and 0.90
to 0.97 times on master. In the one quiet round the branch held 17.24 ms a frame, inside the
playtest's 18.5 ms line, in software-drawn Chrome. With other runs loading the machine, every 3D era
(master's included) read 36 to 53 ms, which is card 1216's known slowness.

**What a one-era game would copy**

1. Players as polygon models, not sprites (see above). Keep the two characters' concept: a
   gunmetal space marine with green trim and a pale-green mirrored visor, and a tall polished-steel
   cyborg with one red eye slit, each holding the paddle as an energy shield. For a 2D era, the rig
   plus `era9-derive.mjs` is still the recipe for turning whatever pixflux draws into a grid.
2. The four light rules, together: the ball is the light, every shadow falls away from it, every
   extra shadow is lighter than the contact shadow, and anything metal within reach glints.
3. One set, three moving things: a dimmed backdrop picture behind the far rail, two beacons and a
   vent. That is enough for a place, and each costs one or two draws a frame.
4. The moments on the set rather than on the HUD: red beacons and a red outline say "point" in a
   2001 game's own language.
