# Era lessons: what building each machine taught

Tim, 2026-09-10: *"lessons learned about making games from each era. That way, in the future, if i
want a game that is in just one era we have a good starting point."*

Super Ultra Pong 64 climbs eleven machines, one per point. Each one was built by several cards: its
look, its arrival, its screen, its pixel art, its sound and its music. This folder has one page per
machine. Each page says what that work taught, written from the code as it stands and from the
landed cards' reports. Where nothing has been learned yet, the page says so rather than guessing.

| Era | Machine | Page | Reference frame |
| --- | --- | --- | --- |
| 0 | 1972 arcade Pong | [era0-arcade.md](era0-arcade.md) | [era0-arcade.png](../shots/eras/era0-arcade.png) |
| 1 | 1977 Atari 2600 | [era1-atari2600.md](era1-atari2600.md) | [era1-atari2600.png](../shots/eras/era1-atari2600.png) |
| 2 | 1985 NES | [era2-nes.md](era2-nes.md) | [era2-nes.png](../shots/eras/era2-nes.png) |
| 3 | 1989 Sega Genesis | [era3-genesis.md](era3-genesis.md) | [era3-genesis.png](../shots/eras/era3-genesis.png) |
| 4 | 1991 Super Nintendo | [era4-snes.md](era4-snes.md) | [era4-snes.png](../shots/eras/era4-snes.png) |
| 5 | 1994 Sony PlayStation | [era5-playstation.md](era5-playstation.md) | [era5-playstation.png](../shots/eras/era5-playstation.png) |
| 6 | 1996 Nintendo 64 | [era6-n64.md](era6-n64.md) | [era6-n64.png](../shots/eras/era6-n64.png) |
| 7 | 1999 Sega Dreamcast | [era7-dreamcast.md](era7-dreamcast.md) | [era7-dreamcast.png](../shots/eras/era7-dreamcast.png) |
| 8 | 2000 PlayStation 2 | [era8-ps2.md](era8-ps2.md) | [era8-ps2.png](../shots/eras/era8-ps2.png) |
| 9 | 2001 Xbox | [era9-xbox.md](era9-xbox.md) | [era9-xbox.png](../shots/eras/era9-xbox.png) |
| 10 | 2005 Xbox 360 | [era10-xbox360.md](era10-xbox360.md) | [era10-xbox360.png](../shots/eras/era10-xbox360.png) |

All eleven at their native resolution, side by side: [contact-sheet-native.png](../shots/eras/contact-sheet-native.png).

**The realism ladder** (item 1265): from pong in the arcade and Atari eras to real table tennis in
the 3D eras, one step per era. Why it exists is on [realism-ladder.md](realism-ladder.md), and the
rungs themselves are in the art bible, [docs/ART.md](../ART.md), sections 6 to 9.

## The six headings every page answers

The headings are fixed, and [test/lessons.test.js](../../test/lessons.test.js) fails if a page loses one or
puts them out of order. The AAA era cards (items 1224 to 1234) append a `## LESSONS` section to their
era's page when they land. Add below the six; never rename them.

1. **THE MACHINE**: native resolution, palette, what it could put on screen, its sound chip, and the
   numbers this repo actually uses.
2. **WHAT SOLD THE LOOK**: the three or four tricks that make it read as that machine at a glance.
3. **WHAT DID NOT WORK**: what was tried and dropped or reworked, from the landed cards.
4. **SOUND AND MUSIC**: the effect voice and the music arrangement, and the chip rule each follows.
5. **REUSABLE PIECES**: the files a new game copies.
6. **START HERE**: the shortest path to a one-era game.

## How to start a new single-era game from these pages

These steps are the same for every machine. Each page's START HERE gives the parts specific to that
machine.

1. **Look at it first.** Open `index.html?era=N` off disk, with N from 0 to 10. It skips the title and
   opens straight into play on that machine. `?display=off` shows the frame without the machine's
   resolution or screen, which tells you how much of the look comes from the display layer.
2. **Copy the skeleton.** It is plain HTML and plain scripts: no npm, no build step, no ES modules,
   because `file://` refuses them. That is what lets the game open with a double-click, so keep it.
   Every game needs these files:
   - `index.html`
   - `src/game.js`, the rules. It has no canvas, no timers and no DOM, which is why its tests run headless.
   - `src/input.js`
   - `src/main.js`
   - `src/render.js`
   - `src/display.js`, plus `src/display-crt.js` for eras 0 to 4 or `src/display-tv.js` for eras 5 to 10
   - `src/sound.js`
   - `src/music.js`
   - the one `src/eras/eraN-*.js` you want
   - `src/table3d.js` and `src/textures3d.js` for a 3D era
   - `src/sprites.js` for an era that draws pixellab art from files
   - `src/characters.js` if you want the players (item 1223). From era 1 up, a figure stands
     behind each paddle with its hand on it. The figure only reads the state, and its beats come
     from what the rules already report (idle, up, down, swing, miss, win). Each era has a config
     block, and until an AAA era card (items 1224 to 1234) brings a sheet, the figure is a
     placeholder silhouette. What each era's players taught is **not yet learned**; those cards
     add it under `## LESSONS`.
3. **Delete the climb.** The one-point-one-era ladder lives in these places:
   - `advanceEra` in `src/game.js`
   - the ring wipe and name card in `src/erachange.js`
   - `src/signboards.js`
   - the match finale in `src/match.js`, which rewinds down every era
   - the other era files, and their `<script>` lines in `index.html`

   A one-era game starts at its era and never calls the ring. Keep `warmUp` from `src/erachange.js`
   if you keep any big first-frame fills. It draws each look once, so Chrome compiles its graphics
   programs before play (bootstrap section 8a).

   **Not yet learned:** nobody has built a one-era game from this repo yet. `src/main.js` already
   checks that the finale, the feel layer and the cabinet exist before it uses them. It has never
   been run with the ring wipe removed, so the first one-era game should be its own card, and it
   should add what it learns here.
4. **Trim the tables to one row.** Five tables hold a row per era, and a one-era game needs only
   its own row from each:
   - `ROWS` in `src/display.js`
   - the overlay rows in the CRT or TV file
   - `VOICES` in `src/sound.js` for eras 0 to 4, or the era file's own `voice` for 5 and up
   - `ARRANGEMENTS` in `src/music.js`
   - `INTENSITY` in `src/feel.js`

   Keep `THEME` in `src/music.js` or write your own. The arrangement format is the same.
5. **Keep the laws that made every era playable.** They are [docs/ERAS.md](../ERAS.md) section 5,
   R1 to R10:
   - the ball is the brightest and sharpest thing on screen
   - the paddles never blur
   - footprints are the true collision boxes
   - nothing stands up in front of play
   - no per-pixel loops: tiles are built once from rectangles
6. **Test the way this repo does.** `node --test` runs the rules and the look headless, on a
   recording canvas. `node tools/playtest.mjs --era N` drives real Chrome, with the frame-rate check.

## Lessons that held on every machine

- **Draw the flaw on purpose, and exaggerate it.** The eras that read at a glance are the loud ones:
  the PlayStation's wobble, the Dreamcast's ink, the Xbox 360's bloom. The reviewers' commonest
  note on a finished era was that it was "gentle", as with the Nintendo 64's fog and the
  PlayStation's tiny ball. That note became a follow-up card every time.
- **Resolution and screen do half the work, and they are one table row each.** The display layer
  (item 1198) draws each machine at its native size and scales it up once a frame: hard pixels to
  the Super Nintendo, soft TV scaling from the PlayStation up. The screens (items 1199 and 1200)
  are drawn over that. An era file never has to know either exists.
- **A screen effect is blended on the small native picture, never on the page.** Item 1200's first
  draft blended at page size and held the 3D eras to 10 to 20 frames a second. Blending on the
  native copy brought them back.
- **Generated art is snapped and embedded offline.** It gets snapped to the machine's palette
  offline, once (`tools/palette-snap.mjs`, or the per-era quantize scripts). A PNG loaded off
  `file://` taints the canvas, so art the playtest reads back is embedded as data: URIs.
  Paddles came back wrong from pixellab on the NES and the Genesis, twice each, so they stay
  hand-drawn there.
- **Sound is data, played by one player.** The sound player listens to `state.events` and never to
  a drawing hook. A flourish may be drawn twice in a frame, so a sound started from it plays twice
  (item 1162 moved the Atari and NES stings off their flourishes for exactly this).
- **Fleet CI cannot run this repo yet** (item 1130). Every card ran `node --test` by hand and said
  so.
