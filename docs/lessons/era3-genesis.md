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
