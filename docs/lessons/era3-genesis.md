# Era 3: 1989 Sega Genesis, sixteen bits

Open it: `index.html?era=3`. Reference frame: [era3-genesis.png](../shots/eras/era3-genesis.png).
Look file: [src/eras/era3-genesis.js](../../src/eras/era3-genesis.js).

## THE MACHINE

- **Native resolution here:** 320 x 224, hard pixel edges.
- **Palette:** 3 bits a channel, 512 colours. The paddles keep the colours the rules picked
  (era 1's), snapped to that palette. They are shaded by moving whole palette steps lighter and
  darker: the stepped gradient a 1989 sprite artist painted by hand.
- **Sprite and plane budget used:** two parallax scroll planes behind the field, the way the video
  chip's two planes were used. A far plane (stars and a distant range) barely drifts, and a near
  plane of hills moves three times faster. Both scroll with game time, so they belong to the frame
  and have no effect on play.
- **Sound chip:** the YM2612 FM synth, with the PSG square chip on top.
- **Screen:** composite TV, `crt-composite` at strength 0.9, 224 lines.
- **Game feel:** intensity 0.3, adding screen shake. This era draws its own ball trail, so the
  feel layer leaves the trail to it (`OWNED` in `src/feel.js`).

## WHAT SOLD THE LOOK

1. **The palette snap.** 512 colours, with shading done in whole steps and no smooth ramps.
2. **Parallax.** Two planes at different speeds say "16-bit" before the ball moves.
3. **A shaded ball with a motion trail.** The trail is placed back along the ball's own velocity
   and not remembered from earlier frames, so the file still only reads the state.
4. **A bolder block score with a drop shadow**, and generated art snapped to the machine (item
   1179): the far plane is a pixellab night court and the ball a pixellab chrome sprite, both
   snapped offline to the 512 colours.
5. **The arrival: the old picture shatters** (item 1139). The field around the miss is cut into a
   fixed set of angular shards, seeded from the origin, so one point always shatters the same way.
   They crack as the ring's edge reaches them, break loose once it passes, and spin away over the
   new era with its planes already scrolling. Each shard's flight ends exactly when the ring
   reaches the far corner. It is drawn with polygon clips of one offscreen copy of the old frame.

## WHAT DID NOT WORK

- **Generated paddles, twice** (item 1179). One came back as a baseball bat and one as a battery.
  They stay hand-drawn, and the rejected art was never committed. That used 5 of 12 generations.
- **A test that pinned "era 2 has no flourish"** (item 1139's `assert.ok(!R.eraLook(2).flourish)`)
  went red the moment the NES flourish landed, and continuation card 1161 had to rewrite it. Pin
  that the effect is your era's own hook, never that the others have none.
- **The CRT screen pushed this era over the frame line** (found on item 1200). It read 18.8 ms a
  frame against the playtest's 18.5 ms line on the merged tree. The screen came from item 1199,
  which went green before the frame check (item 1192) existed. Card 1201, still running, owns it.
- **The first item 1123 edit to the shared placeholder test conflicted with its siblings'.** See
  [era2-nes.md](era2-nes.md). Own test file, own lines.

## SOUND AND MUSIC

- **Effect voice** (`VOICES[3]` in `src/sound.js`): two-operator FM, the bright metallic YM2612 bell.
  - paddle hit: 880 Hz, modulator ratio 3.5, index 2.2
  - wall: 587 Hz, ratio 2, index 1.6
- **Its score row is the arrival sting.** A point's note belongs to the era it moves the machine
  up *to*, so this row plays exactly once a session: as the Genesis arrives and the NES shatters.
  It is a growling FM slap bass dropping an octave (82 to 41 Hz), a metallic hit on top, and the
  bell stab riding in.
- **Music** (`ARRANGEMENTS[3]` in `src/music.js`). The chip rule is *FM: punchy metallic bass and
  brass, the PSG square on top, a crunchy output*:
  - bass: sixteenths on an FM sine (ratio 1, index 3.4), with an octave pop on the off-16ths
  - melody: a brassy FM horn (index 2.4) with delayed vibrato
  - chords: a thin square stabbing the off-beats, as the PSG
  - drums: a hard kick and snare, plus a 16th-note hat
  - `grit: 0.35` on everything, for the crunchy output

## REUSABLE PIECES

| Piece | File | What it gives a Genesis game |
| --- | --- | --- |
| Look | `src/eras/era3-genesis.js` | `LEVELS` (the 8 steps a channel), stepped shading, two parallax planes, the velocity trail, the shatter. |
| Palette snap | `tools/palette-snap.mjs --bits 3` | Moves any generated PNG onto 512 colours offline, and cuts alpha to solid or clear (1989 sprites had no half-transparent pixels). `--trim` crops. It updates the manifest entry. |
| Sprites | `src/sprites.js` | Draws a named PNG with one `drawImage`, with a hand-drawn fallback until it decodes. |
| Art pipeline | `tools/pixellab.mjs` | One image a run, with the seed recorded. |
| Display | `src/display.js` row 3 | 320 x 224, hard pixels. |
| Voice and music | `src/sound.js` row 3, `src/music.js` row 3 | FM notes (`fm: { ratio, index }`), `grit`. |

## START HERE

1. Open `index.html?era=3`.
2. Copy era 0's skeleton (see [era0-arcade.md](era0-arcade.md)), plus `src/eras/era3-genesis.js`,
   `src/eras/era1-atari2600.js` (the paddle colours start there), `src/sprites.js` and the two
   `assets/pixellab/genesis-*.png`.
3. The art loads from files through `src/sprites.js`. A page opened by hand off disk taints its
   canvas. Only the playtest reads pixels back, and it starts Chrome with
   `--allow-file-access-from-files`. Embed the art as data: URIs (as the NES does) if your game
   reads its canvas.
4. Delete the other era files, the 3D files, `src/display-tv.js`, `src/erachange.js` (and with it
   the shatter), `src/signboards.js`, `src/match.js`, and `advanceEra`'s call.
5. Measure with `node tools/playtest.mjs --era 3` and watch its "holds full frame rate" line. This
   era sits right on it.

## LESSONS: the AAA pass (item 1226)

Tim: *"it shouldn't look like a _pong_ game from that era, it should look like a AAA game from
that era, that just happens to be pong"*. This era was built to its page in `docs/ART.md` (Era 3)
as a *Golden Axe* match: a barbarian and a knight holding the paddles as tower shields, in a
torch-lit castle arena. It used 6 of its 12 pixellab generations.

**What sold the flagship look**

1. **People at the paddles.** The two warriors (`sheets: { left: 'era3-p1', right: 'era3-p2' }`
   in `src/characters.js`) do more than anything else on the screen. Once a figure lunges with its
   shield on a hit, the paddle reads as something being held. The magic pots filling across the
   rally help too.
2. **The interface is the era.** A stone panel across the top with a portrait per side and a
   *Golden Axe* meter of magic pots (one per 2 hits of the rally) says 1989 Sega in a way no score
   font does. The digits went down to 7-unit blocks to fit the panel's 16 native lines, and they
   still read.
3. **Things that move on their own.** Four torches with 3-frame flames (0.1 s each) and 2-frame
   pennants, riding the near plane's wall at its scroll speed. The arena looks alive before the
   ball moves.
4. **Everything on the 512 colours**, generated art included (`tools/palette-snap.mjs --bits 3`),
   so pixflux's pictures sit in the same world as the hand-drawn paddles.
5. **Moments in the dressing, not over play.** A point flashes the loser's portrait red 3 times in
   0.3 s and flares every torch; at match point the torches burn double speed and the panel's frame
   turns gold. Nothing is drawn in the name card's band.

Measured on the playtest, on the tree merged with master: ordinary play on the ladder ran 61 frames
in 1.02 s at a mean of 16.7 ms (the line is 18.5), and the twelve-hit rally with the feel layer on
ran 1,116 frames at a mean of 16.7 ms, p95 16.7 ms. The pictures are about ten `drawImage` calls a
frame, and they cost nothing measurable. The tenth hit is `docs/shots/item-1226/rally-era3-genesis.png`.

**What did not work**

- **Asking pixflux for a sprite sheet.** The request was "3 columns by 6 rows" at 36 x 312, 1
  generation each. Both players came back as ONE column of 11 small figures, about 16 x 20 (the
  barbarian) and 12 x 24 (the knight), not the 12 x 52 frames the bible wanted. They were usable,
  and in prompt order: 11 is idle 2 + up 2 + down 2 + swing 2 + miss 1 + win 2. So
  `assets/pixellab/era3-players-cut.mjs` re-cuts them offline, for 0 generations, into the rig's
  3 x 6 grid of 20 x 25 frames (swing's third frame repeats its first), feet down and the shield
  edge on the right. The scale is 3.2, not 2.6, so a figure is 80 units tall, about one paddle; any
  bigger and a 20-pixel-wide frame would not fit the 32 units behind the paddle.
- **The panel came back with a stray golden axe** lying across its left half. Its right half was
  clean stone, so the game draws that half twice, the left copy mirrored. That cost no re-roll.
- **The wall came back with its own torch sconces baked in** (six of them), so the four animated
  torches sit among six static glows. Next time, put "no torches, no lights" in the prompt. Its
  bottom rows are a bright floor edge; only the top 36 rows are drawn.
- **The computer's name tag ("BLAST PROCESSOR", from `src/opponents.js`) now sits on the stone
  wall** rather than on dark sky. It still reads, but it is the busiest spot on the screen.
- **The rig's tests assumed no era had a sheet.** Loading one under `node --test` threw (there is
  no `Image`), and a test pinned every era but 2 as a placeholder. This card and item 1232 (the
  PlayStation 2) each fixed both at the same time, and 1232 landed first. Its version (a stand-in
  loader in the test, an era with art skipped) is the one that stands, and this branch took it at
  the merge. Ten era cards editing one shared test is a conflict waiting to happen: take master's
  side.

**What a one-era game would copy**

- The `ARENA` table in `src/eras/era3-genesis.js`: panel 43 units (16 native lines), wall band 96
  (36 lines), torches at x 100/300/500/700, portraits 40 units at x 20 and 740, and 5 pots of 10 x
  16. It is a *Golden Axe* status bar and set, sized to a 320 x 224 screen.
- The six images (`era3-p1`, `era3-p2`, `era3-arena-wall`, `era3-torch`, `era3-portraits`,
  `era3-panel`) and their manifest entries, which hold every seed and prompt.
- For players, ask pixflux for **one figure strip per request**, or expect a stacked column and
  re-cut it with `era3-players-cut.mjs`. Do not plan a sheet around the grid you asked for.
- Every picture has a `fillRect` stand-in that draws until it decodes, so the page never shows a
  hole and the headless tests can check colours on the recording canvas.

### Realism rung 3: a drawn table with every marking (item 1267)

- **LESSON: let the backdrop stand across the far end of the table, the way a crowd would.** The
  blue top fills the whole play field, 0 to 600, because the walls are its side edges. Drawing it
  after the arena wall would have hidden the torches, so it goes down first and the stone wall and
  torches are drawn over its far end. The landed wall, torches, panel and portraits are unchanged,
  and the table reads as standing in front of the wall.
- A bat reads as a bat at 14 units wide once it has three stripes: black rubber on the player's
  side, a 2-unit wood line, and the earned ink toward the net, plus a 10-unit handle. Item 1179's
  generated baseball-bat paddle failed because its handle took a third of its length, so it
  looked shorter than it hits. Here the handle sits outside the hit box, off the outer face, so
  the bar keeps its full length.
- The net replaced the dashed centre line it grew from. It is an 8-unit grey band with a 6-unit
  drop shadow on the blue and a 10-unit post on each side edge, drawn before the ball (R1, R2).
