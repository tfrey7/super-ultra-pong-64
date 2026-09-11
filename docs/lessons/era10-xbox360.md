# Era 10: 2005 Xbox 360, HD, the top of the ladder

Open it: `index.html?era=10`. Reference frame: [era10-xbox360.png](../shots/eras/era10-xbox360.png).
Look file: [src/eras/era10-xbox360.js](../../src/eras/era10-xbox360.js). Chapter 11 of [docs/ERAS.md](../ERAS.md).

## THE MACHINE

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
