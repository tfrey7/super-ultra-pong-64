# Era 4: 1991 Super Nintendo, Mode 7

Open it: `index.html?era=4`. Reference frame: [era4-snes.png](../shots/eras/era4-snes.png).
Look file: [src/eras/era4-snes.js](../../src/eras/era4-snes.js).

## THE MACHINE

- **Picture:** a dusk sky running from night blue to a warm horizon, a mountain line and stars.
  Below the horizon is a **Mode 7 floor**: a checkerboard laid out in perspective, sliding slowly
  toward you the way F-Zero's track did. The paddles and the ball are shaded sprites floating over
  it, each with a soft shadow, and the score sits on a translucent panel across the sky.
- **Native resolution here:** 256 x 224, hard pixel edges. This is the last hard-pixel machine on
  the ladder.
- **Palette:** no fixed table is enforced in code. The paddles are era 1's colours (`like: 1`),
  shaded. The generated paddle is a grey capsule that each side dyes with its own colour.
- **The key point about the floor:** it is scenery *behind* the sprites, not a projection of the
  court. The sprites stand on the same field rectangles the rules collide with, and the floor's
  vanishing point sits on the court's centre line, so its centre stripe lines up.
- **Sound chip:** the S-SMP. Eight sampled channels, a soft low-pass and the built-in echo.
- **Screen:** S-video, `crt-svideo`: fine scanlines, a mild glow, no fringing.
- **Opponent:** the first that reads where the ball is *going*. **Game feel:** intensity 0.4,
  adding slow motion on match point. This era draws its own trail.

## WHAT SOLD THE LOOK

1. **The Mode 7 floor**, rows narrowing and columns converging, sliding toward the player.
2. **A painted sky** (pixellab dusk sky and mountains, item 1180) behind soft-shadowed sprites.
3. **Rich sprites**: chrome paddles dyed in each player's colour and a glowing ball, all generated
   on the first try (3 of 12 generations).
4. **The echo.** It is the only 2D era with one, and it is the sound everyone remembers.
5. **The arrival: the field tilts into Mode 7 and back** (item 1140). The frame the ring engine
   just composited, Genesis outside and Super Nintendo inside, tips back into perspective,
   recedes toward the horizon and turns once around, then sweeps back and settles flat. The name
   card spins and zooms in over it. The tilted floor is about seventy horizontal strips, each
   clipped and drawn through one affine transform: no pixel loop.

## WHAT DID NOT WORK

- **Borrowing era 1's look borrowed era 1's arrival** (item 1137). This era draws parts of the
  Atari's frame, and the CRT sweep replayed on the Super Nintendo's arrival until that effect
  checked `toEra`.
- **Thin, dark paddles from the first cut of the generated art** (item 1180). They were fixed by
  cropping and switching to an overlay dye.
- **Carrying the art in the page test** was dropped at step 2 of item 1180. The art lives inside
  the era file, the way the NES does it (`assets/pixellab/era4-snes-embed.mjs`).
- **A 121 ms first frame on a cold page** (item 1140 timed it; with its own flourish removed it
  still measured 108 ms). It belonged to the ring engine, not the tilt. Items 1164 and 1203 traced
  it to Chrome compiling graphics programs for looks nothing had drawn yet, and fixed it with a
  warm-up that draws every real look (`warmUp` in `src/erachange.js`, bootstrap section 8a).

## SOUND AND MUSIC

- **Effect voice** (`VOICES[4]` in `src/sound.js`): each note is a small chord of layered voices.
  - paddle hit: triangle 523 Hz, sine 1047 Hz and a quiet sawtooth 262 Hz
  - every note goes through a short slapback echo: `{ time: 0.14, feedback: 0.35, mix: 0.45 }`
    (`ECHOES[4]`)
- **The arrival point is an orchestral hit** (item 1140): a brass stab on a C major chord,
  strings an octave over it, a timpani falling under it and a glockenspiel sparkle on top, all
  through the echo.
- **Music** (`ARRANGEMENTS[4]` in `src/music.js`). The chip rule is *sampled orchestral
  instruments, a soft low-pass on the output, the built-in echo*:
  - melody: a soft brass (a sawtooth with one unison layer at +7 cents, low-passed at 1700 Hz,
    slow attack and vibrato)
  - strings holding the chords (`pad`)
  - bass: plucked (`pizz`)
  - in the B section, a marimba climbing the chords (`broken`, an FM sine at ratio 4) and a choir
    pad swelling in
  - the whole mix: `lowpass: 5200` and an echo of 0.23 s, feedback 0.38, mix 0.35

## REUSABLE PIECES

| Piece | File | What it gives a Super Nintendo game |
| --- | --- | --- |
| Look | `src/eras/era4-snes.js` | The Mode 7 floor, the dusk sky, soft sprite shadows, the tilt strips (`tiltPose`, `tiltStrips` are pure and tested). |
| Art | `assets/pixellab/era4-snes-embed.mjs` | Fits the sky, paddle and ball to the machine and embeds them. |
| Display | `src/display.js` row 4 | 256 x 224, hard pixels. |
| S-video | `src/display-crt.js` | `crt-svideo`. |
| Echo | `src/sound.js` `ECHOES[4]`, `src/music.js` row 4 | Slapback echo and the orchestral arrangement. |

## START HERE

1. Open `index.html?era=4`.
2. Copy era 0's skeleton (see [era0-arcade.md](era0-arcade.md)), plus `src/eras/era4-snes.js` and
   `src/eras/era1-atari2600.js`. Era 4 draws parts of era 1's frame and takes its paddle colours
   (`like: 1`), so it cannot run alone.
3. For a racing or Mode 7 game, `tiltStrips` is the piece to lift: any flat picture laid into
   perspective with about seventy clipped `drawImage` strips.
4. Delete eras 0, 2, 3 and 5 to 10, the 3D files, `src/display-tv.js`, `src/erachange.js` (and the
   tilt arrival with it), `src/signboards.js`, `src/match.js`, and `advanceEra`'s call.
5. `node --test` (`test/era4-snes.test.js`, `test/era4-mode7.test.js`, `test/era4-sprites.test.js`),
   then `node tools/playtest.mjs --era 4`.
