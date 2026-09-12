# Era 10: 2005 Xbox 360, HD, the top of the ladder

Open it: `index.html?era=10`. Reference frame: [era10-xbox360.png](../shots/eras/era10-xbox360.png).
Look file: [src/eras/era10-xbox360.js](../../src/eras/era10-xbox360.js). Chapter 11 of [docs/ERAS.md](../ERAS.md).

## THE MACHINE

- **Reference games** (the art bible's [Reference games](../ART.md#reference-games), item 1286):
  *Gears of War* (2006) + *Project Gotham Racing 3*. Added: achievements: the toast and the
  gamerscore. Changed: HD 720p with the full post chain (bloom, depth of field, motion blur, grain,
  grade) over everything the ladder built.
- **Native resolution here:** 720p. The field is 4:3, so it gets the 960 x 720 middle of a
  1280 x 720 frame, and the HDTV's side bars fall outside the page's canvas. That is 9 times a
  PlayStation's pixels, and it is what every full-frame pass costs.
- **Camera:** the longest lens. Tilt 32 degrees, height 1600, field of view 20.5, screen y 312,
  still.
- **Surface:** a crisp concrete slab with a 2-pixel grating, bevels and rail light strips, plus the
  pixellab tread plate (`court-metal`).
- **Post-processing budget:** at most three full-frame offscreen passes a frame (law R10). Bloom
  uses two scales of one small bright buffer.
- **Sound:** big, clean, loud production.
- **Screen:** a 720p flat panel, `hdtv-720p`: no scanlines, a hint of LCD softness and a slight
  smear on fast movement.
- **Game feel:** intensity 1, the maximum. Every effect is at full size.

## WHAT SOLD THE LOOK

The rule was every post-process effect of the generation at once, turned up until nobody could
mistake it for the Xbox a rung below.

1. **Bloom off every emissive thing**: the HDR sun, the rail light strips, the paddles' rim
   lights, the ball's halo and the score blades. It is a small bright buffer scaled up, added with
   `'lighter'`.
2. **The brown-and-grey grade**, a vignette and **film grain** from a tile built once.
3. **Motion blur and depth of field**: a capsule 1/30 s long and three ghost discs behind the
   ball, and the far strip softened from a half-scale copy.
4. **The Blades HUD and a gamerscore**, with an "Achievement Unlocked" toast on entering the era
   and on every point.
5. **The arrival: the blades sweep in and the achievement pops** (item 1156). Green-and-silver
   dashboard blades ride the ring's edge, with bloom and grain pouring in behind them.

**The order the laws force** (painter's order, bible section 2.5): the depth-of-field copy of the
far strip is taken *before* the paddles go down, so no paddle is ever softened (law R4). After
the bloom and the grade, each paddle's earned colour is restored at full saturation. The ball goes
last, after every post pass.

## WHAT DID NOT WORK

- **The arrival toast said "10G - POINT SCORED"** instead of "50G - WELCOME TO HD" (item 1150).
  The run caught it in its own browser pass and fixed it.
- **The boot blip first played two seconds after the serve** (item 1156). It was moved to play
  with the toast, which the tests pin: the toast comes after the ring passes the centre, and before
  the serve.
- **The slowest era by far in software Chrome:** 64.6 to 66.5 ms a frame (items 1192 and 1205). The
  TV screen adds about 18 ms (82.0 ms on), because every blend on the native copy is on a
  960 x 720 picture. Its first page-size draft read 100 ms. With a GPU every era runs at about
  4.2 ms. Card 1216 owns it, and card 1201 is to tone down any screen that costs frames.
- **The feel layer costs nothing measurable here** (item 1205: 66.5 ms with it, 65.0 ms without).
  Its first A/B switch threw every frame, killed the game loop and timed an idle page at a perfect
  16.7 ms. A switch that takes a layer out must leave the loop running.
- **The ring-frame check can miss by a hair on a loaded machine** (item 1156: 22.8 ms with the
  flourish on against 22.9 ms off). Do an A/B with the flourish off before chasing it.

## SOUND AND MUSIC

- **Effect voice:** big, clean hits.
  - paddle hit: a sine sliding 120 to 60 Hz, a band-passed noise crack and a tiny 1760 Hz tick
  - point: **the achievement blip**, a soft click and two bright rising sines, 1175 Hz then
    1568 Hz
  - `effects: { reverb: { seconds: 2.5, decay: 2.5, mix: 0.4 } }`
- **Boot sting:** a whoosh (noise band-passed 300 to 5000 Hz), a swelling open chord on A (220, 330
  and 440 Hz) of 5-voice unison sawtooths opening 600 to 4000 Hz, a 55 Hz hit, a chime, and the achievement blip.
- **Music** (`ARRANGEMENTS[10]`, item 1210): *big-room*.
  - a huge four-on-the-floor kick
  - a wobbling bass whose low-pass throbs twice a beat (`filter.lfo: { perBeat: 2 }`)
  - supersaw pads, a 4-layer unison spread wide, pumping against the kick (`pump: 0.8`, the
    side-chain duck)
  - the melody spun into plucked arpeggios, and a supersaw lead on the tune in B, with a snare
    roll building into each section
  - the chip rule is *big-room production*
- **The finale** (item 1211): a match is eleven points, and the eleventh, scored here, ends it.
  `src/match.js` plays MATCH POINT, a 360-style result, the rewind down every era, and the 1972
  thanks screen.

## REUSABLE PIECES

| Piece | File | For an HD-era game |
| --- | --- | --- |
| Look | `src/eras/era10-xbox360.js` | Bloom buffer, grade, vignette, grain tile, motion blur, depth of field, blades, toast. It shows how to order post passes around the laws. |
| 3D table | `src/table3d.js` | Camera, boxes, ball, `T.offscreen` for every buffer (with a stated fallback when it returns null under `node --test`). |
| HDTV | `src/display-tv.js` | `hdtv-720p`, and the 960 x 720 row in `src/display.js`. |
| Game feel | `src/feel.js` | Hit-stop, shake, flash, squash, trail, rally callouts and match-point slow motion, all at intensity 1. |
| Finale | `src/match.js` | Match point, result, rewind and thanks. |
| Voice and music | the era file's `VOICE`, `src/music.js` row 10 | Achievement blip; `pump`, `filter.lfo`, `spread`. |
| The callout is an achievement toast (item 1262) | `src/feel.js` `LETTERING[10]` | Draws GREAT and the rest on a dark rounded plate with a green badge and the rally on a silver line above, in the blades' clean sans with a soft green glow; the counter is a small plate of the same kind. |

## START HERE

1. Open `index.html?era=10`.
2. Copy the 3D skeleton from [era5-playstation.md](era5-playstation.md), with
   `src/eras/era10-xbox360.js` in place of era 5's file, plus `src/feel.js`.
3. Decide about `src/match.js`. Its rewind walks every era down, so a one-era game keeps only its
   result and thanks screens, or drops it. `matchPoints: 0` in the rules is a game that never ends.
4. Delete the other era files, `src/display-crt.js`, `src/erachange.js`, `src/signboards.js`, and
   `advanceEra`'s call.
5. Measure on a machine with a GPU. In the playtest's software Chrome this era reads 4 times over
   budget, by design (bootstrap, *Traps*).

## LESSONS

*Item 1234, the AAA pass: two armoured soldiers hold the paddles, the plaza is a bombed-out city
at sunset, and the score blades carry gamerpics. A rally, as the playtest filmed it:
[rally-era10.png](../shots/item-1234/rally-era10.png).*

**What sold the flagship look here.**

- **The treatment does most of the work, and the players have to wear it too.** The character
  rig draws after the era's frame, so its figures would have come out clean and saturated
  over a graded, grained, bloomed picture. The fix was to bake the era's treatment into the sheet
  offline (`assets/pixellab/era10-derive.mjs`): colour drained 45 %, multiplied toward the
  `#c9b89a` tint, a 1-pixel HDR-sun rim on the side facing the ball with a soft glow inside
  it, and seeded grain at 0.12. Then the soldiers sat in the picture instead of on it.
- **Draw HD art at twice its size, pre-smoothed.** The rig draws every sheet with smoothing off,
  which is right for eras 1 to 4 and wrong for 2005. Scaling the sheet up 2x with bilinear
  filtering offline (a 96 x 132 frame for the bible's 32 x 66) makes the unsmoothed draw read
  smooth, without a change to the shared rig.
- **One plate behind the far wall, softened by the depth of field, is enough of a world.** The
  backdrop band on this camera is only about 106 units tall, so a single 400 x 120 ruin plate
  drawn into the depth-of-field buffer, with the banner rippling on a column and 40 ash flakes
  drifting over everything, reads as a ruined city without competing with the ball.
- **Gamerpics are the players' own heads.** Cutting each soldier's helmet out of his sheet
  (0 generations) ties the HUD to the figures on the table, which a separately generated icon
  did not.

**What did not work.**

- **Flat sprites read as sprites on a 3D table, and Tim ruled them out** (23:47 EDT on
  2026-09-10: *"btw if you are trying to do sprites in the 3d eras uh...that is not gonna look AAA
  here dude"*). Even graded, rimmed, grained and pre-smoothed, a billboard soldier on a
  perspective slab looks pasted on. It does not turn with the table, catch the sun or sit in the
  depth of field. The soldiers on this page are **stand-ins** until this era's model card swaps in
  polygon players made in Blender (item 1248's renderer). A one-era HD game starts from models,
  not sheets. The concept carries over: who the two soldiers are, their trims, and the gamerpics
  cut from their heads.
- **pixflux does not draw sprite sheets to a grid.** Asked for 3 x 6 frames of 32 x 66, it
  drew front-facing soldiers two to a row with irregular band heights. One sheet had a
  fireball on a frame and the other a magenta visor. The poses barely differ from row to row
  (only the raised-fist frames are really new). So the derive script finds each figure by
  its opaque rows and columns, and makes the beats itself by tilting and lifting a figure
  about its feet: lean 9-11 degrees into the travel for the run, 14 degrees and 9 up for the
  shove, 9 back and 4 down for the flinch. The bible's cover pose (a shoulder braced against
  the paddle) was never drawn: no generation offered a side view.
- **Two gamerpic generations looked like one famous franchise helmet** (green, gold visor),
  even with a negative prompt naming it. ERAS.md rule 1.9 forbids trademark shapes, so both were
  dropped for the head crops.
- **Five generations fired in parallel lost two manifest entries.** `tools/pixellab.mjs` rewrites
  `manifest.json` whole, so parallel runs overwrite each other's entries. The two images had to be
  asked for again, which cost 2 generations. Run generations one at a time.
- **A tiled plate repeats its sun.** The ruin plate was first tiled across the width, which put two
  suns in the sky. It is drawn once, twice as wide, so its sun sits under the HDR sun at x 560.
- **The rig threw under `node --test` once an era had a sheet** (no `Image` to load with). The
  rig's sheet loader now falls back to the placeholder instead, and the test that pinned "no era
  has a sheet" skips an era whose card brought its art.

**The cost.** 8 of the 12 generations (the two sheets, the ruin twice, the banner, the gamerpics
three times) and 0 for everything derived. The frame time on the playtest's GPU-less Chrome did
not move: in the twelve-hit rally, 82.9 ms a frame with the soldiers and the plaza against 89.9 ms
on master, run minutes apart on the same busy machine. That is the software-canvas cost card
1216 owns, not this pass.

**What a one-era game would copy.**

1. `era10-derive.mjs` whole: find the figures, pose the beats, bake the grade, rim and grain,
   and upscale 2x. Point it at any generated character sheet.
2. Treat the HUD as part of the cast: gamerpics from the players, the toast for moments, and
   MATCH POINT over 100G - FINISH IT as a held toast with the vignette tightened from 250 to 220.
3. For anything moving on its own behind the play (ash, the banner, the sun's bloom breathing
   plus and minus 5 % every 6 s), use a few dozen seeded fills a frame. Never loop over pixels.

## LESSONS: HD under the whole post chain (item 1298)

*The reference is still Gears of War (Tim's ruling, 2026-09-11), with Project Gotham Racing 3's
720p HDR beside it. What this pass changed is not the palette but the picture: the field is drawn
by the real 3D layer now, so the ball and the bats sit INSIDE the composite the post passes work
on, and the readability laws had to be won back one at a time. One frozen rally frame, before and
after: [era10-before.png](../shots/item-1298/era10-before.png) and
[era10-after.png](../shots/item-1298/era10-after.png) (`?era=10`).*

**What the reference changed.** The Xenos had 10 MB of eDRAM so a 2005 game could anti-alias at
720p while the post chain ran on top. The canvas equivalent is the layer's own `render` knobs:
era 10 is the first era to set any -- `{ resolution: 1.2, filter: true, lighting: 'standard' }`,
which draws the field 1.2 times over the picture's own 960 x 720 and samples it back down smoothly.
The bats' edges come out of the composite already resolved, which is what lets bloom, depth of
field, grain and the grade run over them and still leave them sharp.

**The add is the one the ladder had already earned.** Achievements (items 1156 and 1234) stay, on
the one rung where a point does not leave the era; no earlier era has one.

**The change, measured.** `node docs/measure/item1298/hdcheck.mjs --label after --port 9355` (and
`--root` at the main checkout for the before) freezes one rally frame -- the far bat up in the
depth-of-field strip, the near bat down, the ball mid-flight -- and reads the native 960 x 720
picture back out of the page. Headless Chrome with the GPU off, so these are the slowest numbers
the game ever shows:

| | before | after |
| --- | --- | --- |
| pixels brighter than the ball's core (R1) | 224 | **0** |
| the ball's core, of 255 | 250 | **255** |
| far bat's outer edge, in pixels (R4) | 3 | **2** |
| near bat's outer edge | 1 | 1 |
| the ruins' detail, far band | 2.68 | 2.69 |
| mean frame, one second of play | 33.5 ms | 38.4 ms |

- **A law written for a painter's order stops holding the moment somebody else paints.** R1 and R4
  were free while the era drew its own paddles and ball after the post chain. With the layer
  drawing them into the same buffer as the table, the grade drained the bats' earned ink and the
  bloom put 224 pixels of sky above the ball. Each law needed its own move back: the ball's white
  core repainted after every pass, and the bats' rectangles knocked out of the depth-of-field
  strip with an even-odd clip before the soft copy goes down.
- **Restore an ink with the `color` blend, not a fill.** Refilling the bat's faces with its ink
  throws the 3D lighting away and gives you a flat lozenge. Painting the ink through
  `globalCompositeOperation = 'color'` puts the hue and the full saturation back and keeps the
  lit surface's own brightness -- one line, and the shading survives. It restores at 100 %; if a
  later pass wants the ink calmer against the brown grade, that is an alpha on this one call.
- **One light, tagged, and put out again the same frame.** The 3D scene is shared by eras 5 to 10,
  so a light added for one era lights all of them -- including the finale's rewind down the ladder
  and the frames either side of a ring. Era 10's `fieldSetup(I, state)` adds its warm rim light
  once, poses it every frame, and hands it back so `draw` can set its intensity to 0 the moment
  the field is drawn. Intensity 0, never `visible = false`: three.js keys its shader programs on
  how many lights are in the scene, so toggling visibility swaps programs every frame.
- **A carry-forward has to be guarded, because the era below may not have landed yet.** This is
  the first `fieldSetup` on the ladder. It calls `R.eraLook(9).fieldSetup` first *when there is
  one* -- which is how era 9's moving light and shadows, era 8's mirrored slab and era 6's blob
  shadows will arrive here once those cards land -- and works exactly as well while there is not.
- **1.2 is not free: it cost 4.9 ms a frame** on the software-drawn Chrome, inside the 5 ms this
  card allowed but not by much. If a later card needs that back, `resolution: 1` renders at the
  picture's own 960 x 720 and gives up only the anti-aliasing; nothing else on this page depends
  on it.
- **The far ruins did not move** (2.68 to 2.69): knocking the bats out of the depth-of-field strip
  takes nothing away from the distance, which is the point of masking rather than of taking the
  soft copy earlier.
