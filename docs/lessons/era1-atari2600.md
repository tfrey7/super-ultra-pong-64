# Era 1: 1977 Atari 2600, the turn to colour

Open it: `index.html?era=1`. Reference frame: [era1-atari2600.png](../shots/eras/era1-atari2600.png).
Look file: [src/eras/era1-atari2600.js](../../src/eras/era1-atari2600.js).

## THE MACHINE

- **Picture:** the 1972 field and frame, but each paddle and its score wear a colour. The first
  point of a session picks those colours (`state.paddleColour` holds a palette index), and every
  later era keeps them (`like: 1`).
- **Native resolution here:** 160 x 192, hard pixel edges: the 2600's 160-wide playfield and its
  192 lines, so the pixels come out wide.
- **Palette:** a dozen colours picked by eye to sit in the range a 2600 could show. They are warm
  and slightly muddy, with no pure `#ff` channel anywhere. **It is not the real 128-entry NTSC
  palette**, and the file says so. Every entry is deliberately bright, because a paddle that
  vanishes into the black field is a broken game. `PongRender.isLegible()` checks that, and the
  palette's length must match `RULES.paletteSize` in `src/game.js` (a test pins the join).
- **Sound chip:** the TIA. Two channels, with coarse pitch dividers that land every note off true.
- **Screen:** a 1970s colour TV over an RF cable, `crt-rf` at full strength, 192 lines.
- **Opponent:** the CPU sees the ball late (`src/opponents.js`).
- **Game feel:** intensity 0.1, a one-frame flash on every paddle hit.

## WHAT SOLD THE LOOK

1. **Colour arriving at all.** The frame stays the arcade's, so the change reads as the same game
   in a living room.
2. **Wide pixels.** 160 x 192 scaled up hard.
3. **The RF picture** (`crt-rf`): soft, fuzzy scanlines, wide colour bleed, a slow band of
   brightness rolling down the tube, and a little snow from a pre-drawn noise tile.
4. **The arrival: the television coming alive** (item 1137). It is drawn over the ring as it grows:
   - a power-on line flung across the field at the height the ball went out, for 0.28 s
   - inside the ring, a picture that rolls up one frame and settles, with its red and blue-green
     fields drifting apart and back (RF chroma fringing), locked by eased progress 0.8
   - the palette smeared round just behind the edge
   - a band of bright scanlines with a green-white phosphor glow on the edge itself

   All of it is canvas copies, gradients, patterns and composite operations.

## WHAT DID NOT WORK

- **The power-on line was skipped at first** (item 1137). The ring is under one field unit wide
  for its first frames, so a flourish that waits for the ring to have width misses its own start.
  It keys off the time now.
- **The Super Nintendo replayed this era's TV effect** (item 1137). Era 4 draws parts of era 1's
  look, and a look borrowed is a flourish borrowed. The effect checks `toEra` now.
- **The sting was first played from the drawing code** (items 1137 and 1138). A flourish can be
  drawn twice in a frame, so the sound played twice. Item 1162 moved it onto the voice's `boot`
  list, where the player sounds it once per change.
- **The signboard was hard to read** (found on item 1183). Item 1196 re-lettered it, and the
  reference frames were re-taken with the CRT screen on.

## SOUND AND MUSIC

- **Effect voice** (`VOICES[1]` in `src/sound.js`): still a single square, but with the TIA's
  coarse, slightly flat pitches.
  - paddle hit: 440 Hz
  - wall: 220 Hz
  - point: a buzzier, longer note (`ATARI_POINT`)
- **Boot sting** (the point that brings era 1 in): the point's own notes first, so the point is
  still heard. Under them, a square hum slides up an octave with a slow wobble, like a set not yet
  on its channel, then two coarse steps as the picture locks. It plays at a third of a paddle
  hit's loudness and is over by 0.86 s, inside the serve pause.
- **Music** (`ARRANGEMENTS[1]` in `src/music.js`). The chip rule is *two channels, and a drum has
  to steal one*:
  - melody: every note, on one square
  - bass: eighth notes, on the other square
  - snare: noise through a 1400 Hz band-pass, with `steals: 'bass'`, so the bass drops out
    whenever it hits
  - `detune`: twelve cents offsets, one per pitch class (0, +31, -18, +12, ...), which puts every
    note sour in the same way a divider does
  - it never sounds more than two notes plus the drum

## REUSABLE PIECES

| Piece | File | What it gives a 2600 game |
| --- | --- | --- |
| Look | `src/eras/era1-atari2600.js` | The palette, the legibility check, the TV-on arrival. |
| Display | `src/display.js` row 1 | 160 x 192, smoothing off. |
| RF tube | `src/display-crt.js` | `crt-rf`: scanlines, bleed, rolling band, snow. |
| Voice | `src/sound.js` `VOICES[1]`, `ATARI_POINT` | Blips and the boot sting. |
| Music | `src/music.js` row 1 | The two-channel rule: `detune` and `steals`. |
| Pixel pin | `tools/eralooks-today.json` | Era 1 is pinned to the pixel like era 0. |

## START HERE

1. Open `index.html?era=1`.
2. Copy era 0's skeleton (see [era0-arcade.md](era0-arcade.md)), plus `src/eras/era1-atari2600.js`.
   Keep `flipToColour` in `src/game.js`: it is what hands each paddle its colour.
3. To start a match in colour with no ladder, begin at era 1 (`startEra: 1`, or `?era=1`) and
   remove `advanceEra`'s call.
4. Delete the other era files, the 3D files, `src/display-tv.js`, `src/erachange.js` (the flourish
   only plays on a ring), `src/signboards.js` and `src/match.js`.
5. For a real 2600 palette, replace the dozen colours with the NTSC table. That was never done
   here, so `isLegible()` is your first check.
