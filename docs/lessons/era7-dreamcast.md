# Era 7: 1999 Sega Dreamcast, crisp, loud and graphic

Open it: `index.html?era=7`. Reference frame: [era7-dreamcast.png](../shots/eras/era7-dreamcast.png).
Look file: [src/eras/era7-dreamcast.js](../../src/eras/era7-dreamcast.js). Chapter 8 of [docs/ERAS.md](../ERAS.md).

## THE MACHINE

- **Reference games** (the art bible's [Reference games](../ART.md#reference-games), item 1286):
  *Jet Set Radio* (2000) + *Soulcalibur*. Added: contact effects: the impact burst and speed lines.
  Changed: cel shading with ink outlines at 640x480, no fog.
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
- **The rooftop was built for a camera that hid it** (item 1263's finding, fixed by item 1266).
  Under the old camera the table filled about three quarters of the picture. The posters, tower and
  blimp got a strip about 70 pixels tall, mostly behind the spray-tag score, and the blimp flew at
  screen `y` 9, right under the score. With the ladder camera (tilt 26, height 2000, fov 21) the
  arena gets 0.52 of the picture, up from 0.26. The blimp now flies at `y` 80, under the score's
  cans, which end at 68, and over the skyline. The before and after pictures are
  `docs/shots/item-1266/before-era7-dreamcast.png` and `rally-era7-dreamcast.png`.

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
| The rally counter and callouts as graffiti (item 1262) | `src/feel.js` `LETTERING[7]` | Leans them like the score, yellow over a magenta extrusion with a fat ink outline, so a callout reads as another tag on the wall. |

## START HERE

1. Open `index.html?era=7`.
2. Copy the 3D skeleton from [era5-playstation.md](era5-playstation.md), with
   `src/eras/era7-dreamcast.js` in place of era 5's file.
3. The outline is one camera field, `outline: { width, colour }`. Switch it off per call with
   `style.outline: false` for paint that should not be inked, such as the centre-line dashes.
4. Delete the other era files, `src/display-crt.js`, `src/erachange.js`, `src/signboards.js`,
   `src/match.js`, and `advanceEra`'s call.
5. Check a two-digit score before shipping (see WHAT DID NOT WORK).

## LESSONS: the AAA pass (item 1231)

Tim's direction for this pass: the era should look like *a AAA game of 1999 that happens to be
Pong*, with characters holding the paddles. The target was *Jet Set Radio* on a *Soulcalibur*
arcade table. Rally frame: [rally-era7.png](../shots/item-1231/rally-era7.png).

**What sold the 1999 flagship look here**

- **A place, not a backdrop.** A rooftop skate spot at sunset: three flat poster billboards on
  ink legs along the skyline (a disc, a bolt and stripes, original graphics with no logo), a
  water tower behind the city, twelve window lights switching on their own seeded periods, and
  a blimp crossing the sky at 12 units a second. Every piece is flat poster colour with an ink
  line and no gradient, so it reads as the same cel-shaded world as the table. All of it is
  drawn in code, for 0 generations.
- **A HUD that is part of the world.** The graffiti numbers were already there. Beside them now:
  `P1` and `CPU` spray tags in the score's own block font with the same skew, three spray-can
  icons that fill one per three rally hits, a magenta paint splat behind the scorer's number on a
  point, and the blimp's side panel flashing the new score for a second. At match point the sky
  bands swap (magenta on top) and the tags blink. Graffiti tags and a blimp scoreboard cost
  almost nothing and say "1999 street game" faster than anything on the table.
- **It is free.** The whole dressing A/B'd against master in the playtest's own Chrome
  (`docs/measure/item-1231/era7ab.mjs`): era 7 holds 16.67 ms whenever the machine is free, as
  before. The slow readings (32-36 ms) are machine load, and master's era 7 shows them too.

**What did not work**

- **Flat sprites read as sprites on a 3D table, and were ruled out** (Tim, 23:47 EDT
  2026-09-10: *"if you are trying to do sprites in the 3d eras uh...that is not gonna look AAA
  here dude"*). The two skaters stand at the paddles as stand-ins until this era's
  polygon-model card replaces them (item 1248's renderer). A billboard figure on a perspective
  table looks like a paper cut-out however good its pixels are. A 3D era's players have to be
  models.
- **pixflux does not make sprite sheets.** Asked for 3 x 6 frames of 24 x 54, it drew a 2 x 4
  grid of bigger figures (about 36 x 81), with two ghosted frames. One single-row re-roll per
  side (108 x 80) got the action poses, but drawn about a quarter smaller than the standing ones.
  `assets/pixellab/era7-skater-cut.py` finds each figure as a cluster of pixels, scales the
  action row to the standing height and lays out the rig's six rows. It works, but the scaled
  frames are chunkier than the standing ones. Ask for **one figure per image** if sprites are
  ever wanted again.
- **pixflux refuses odd sizes.** 108 x 81 came back HTTP 422 ("divisible by 2"), with nothing
  billed.
- **Two generations at once lose manifest entries.** Each run of `tools/pixellab.mjs gen` rewrites
  `manifest.json`, so two running side by side each dropped the other's entry. Two had to be
  rebuilt from the printed seeds. Generate one image at a time in a checkout.
- **The bible's placement for the tags crossed R8.** Under the numbers would reach below y 76,
  the far edge's line, so the tags sit beside them. They go on the inside, because the outside of
  the right number is where the opponent's name plate sits.
- **The camera leaves almost no sky** (about 70 of 600 units). Anything tall behind the skyline
  (the water tower) is cut by the top of the frame, so keep set dressing under 100 units.

**What a one-era Dreamcast game would copy**

1. The rooftop: `SCENE`, `WINDOWS`, `blimpX` and the poster, tower and window drawing in
   `src/eras/era7-dreamcast.js`. All flat fills and `T.quad`/`T.box` calls, ready to move to
   any flat-shaded 3D scene.
2. The HUD kit: `tagCells`, `tagCentre`, `drawCans`, `splatShape` and the points memory
   (`notePoints`), which reads only the score and time and never writes the state.
3. The rule that made it cohere: **one outline colour, flat fills, and every new colour taken
   from the era's poster palette.** The only colour this pass added is the empty-can purple.
4. Real models for the players, not sprites (see above). The stand-in's concept (an orange
   skater in headphones against a blue one in a beanie, both on yellow skates) is the brief
   for them.

- **The opponent's name is not drawn in this era (item 1261)**: the placard already says CPU beside the right score, so DREAM CPU beside it said the same thing twice.

## LESSONS: strict 1999, the field only (item 1293)

Before and after, the same serve: [era7-before.png](../shots/item-1293/era7-before.png) and
[era7-after.png](../shots/item-1293/era7-after.png), with the readings beside them
([era7-readings.py](../shots/item-1293/era7-readings.py), nothing to install).

**Which 1999 this is.** The card was written for *Jet Set Radio* -- cel shading and ink outlines --
and Tim answered its decision with **strict 1999: Soulcalibur and Sonic Adventure** instead. A 2000
game was one rung early, and 1999's own launch showcases are smooth, bright and VGA-sharp, not
inked. THE MACHINE's *Reference games* bullet above still quotes the art bible's row, written
before that ruling; `docs/ART.md`'s era 7 row is the place that has to change, and it belongs to
whoever owns the bible rather than to this card.

**It is the FIELD that changed, and only the field.** The rooftop, the sky bands, the skyline, the
blimp, the graffiti score, the tags, the cans, the splat, the arrival flourish and the voice are
all as they were -- and so is the whole era without WebGL: `?gl=off` and `node --test` paint
exactly the cel table they painted before. That is the card's own rule, and it is also what made a
30-minute job possible: the canvas era and the 3D field are two pictures of one rung.

**The four numbers.** `render: { resolution: 0.8, filter: true, fog: null, lighting: 'phong' }`.
0.8 of the 800 x 600 picture the field lands in is exactly **640 x 480**, VGA. `filter: true` is
the whole argument in one flag: 1999's showcases were smooth, so the picture is scaled up smoothed
rather than blocky. `fog: null`: era 6's haze does not carry forward, because a bright stage has no
distance to hide. `'phong'` buys the specular highlight those two games are remembered for -- and
is also, today, the only thing that cleans up after this era (below).

**What an era can and cannot hold in the shared 3D scene.** The scene is one, shared by eras 5 to
10, so `fieldSetup(I, state)` writes on parts every other era draws with.

- **`.color` is not yours.** `PongField3D.pose()` writes the slab's, lines', rails', bats' and
  ball's colour from the era's table style on *every* frame, after `fieldSetup` has run. What
  survives is `emissive`, `specular`, `shininess` and `flatShading` -- so era 7's stage colour is
  carried as an emissive lift over the layer's own fill, which is also why it reads evenly lit.
- **`parts.ball.visible` is not yours either**, for the same reason. The era hides the layer's ball
  with `parts.ballMat.opacity = 0` and hands it straight back the moment `T.field` returns, so no
  other era can ever meet it hidden. "Restore it when another era draws" cannot be implemented by
  the era that hid it: it is not running then.
- **There is no teardown, and the chain relies on that.** Changing `lighting` makes the layer
  rebuild every material and empty its group, disposing of anything an era added -- which is the
  only cleanup there is. Coming up from era 6 (`'lambert'`) that rebuild happens, so era 7 starts
  from clean parts. Going on to era 8 it does **not**: era 8 asks for `'phong'` too, and it calls
  era 7's own `fieldSetup` on purpose, to carry this field forward. So era 7's ring and its lift
  are still there on the PS2, by the chain's design rather than by accident. The one thing that
  must not carry is the hidden ball: era 8 draws no ball of its own, so era 7 hides the layer's
  ball **only on frames whose era is 7**, and a test pins it.
- **Dress the material the mesh is wearing now.** Era 6's `fieldSetup` runs first (era 7 calls it)
  and hands the slab mesh a textured material of its own, so `parts.surfaceMat` is no longer what
  the table is painted with. Era 7 dresses `parts.slab.material` when the two differ, and takes the
  Nintendo 64's grain off every frame, because era 6 puts it back every frame. Two readings from
  getting this wrong: with era 6's material left alone the table stayed a dark N64 checker (field
  mean 81.6), and with era 7's emissive lift stacked on top of era 6's own the table blew out to
  near-white (**203** of 255). Setting that material's *colour* is what works -- safe, because
  `pose()` writes only `surfaceMat.color`.

**What the change is worth, measured** -- same frame, the field band only (the table, under the sky
and above the near lip):

| | distinct colours | mean brightness | brightest pixel in the frame |
| --- | --- | --- | --- |
| before (cel) | 7,500 | 72.4 | 249, 238, 233 -- **not** on the ball |
| after (1999) | 19,564 | 121.2 | 253, 254, 254 -- **on the ball itself** |

The colour count is the reading that separates the two looks: flat poster fills against real smooth
shading. Nothing reaches a pure 255 because the display's tube overlay tints the whole page, so R1
reads as "the brightest pixel in the frame lands on the ball", which it now does and did not
before. Frame time in the playtest's software Chrome: **29.9 ms mean**, between era 6's 27.5 and
era 8's 32.3 in the same run -- the six "holds full frame rate" FAILs on eras 5 to 10 are card
1216's, and are there on master too.

**The ring.** A 1999 fighter's stage is known by its edge, so the table wears one: a painted
boundary lying on the top, one circle stretched across 800 x 600. Two things were wrong on the
first pass, both worth inheriting: a lift as bright as the fill makes a **neon hoop that owns the
frame**, and the same white specular the slab wears **washes the near bat out to pale**, which
costs R4 (each paddle's near face wears its earned colour). Lit rather than glowing, and a grey
gleam on the bats, fixed both.

**LESSONS:** the reference changed the *field* and nothing else -- era 7 stopped being a poster and
became a lit stage (640 x 480 smoothed, no haze, polished surfaces, a painted ring) while every
canvas thing drawn round it stayed as it was, which is how a whole-look change fits in one small
card. Its build-up in the ladder: **added** the contact effects back over the ball (no earlier era
draws an effect at the contact), **changed** cel shading for smooth, bright, VGA-sharp shading.
