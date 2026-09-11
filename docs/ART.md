# The art bible: every era is that year's flagship game, and happens to be Pong

Tim, 2026-09-10: *"one thing about the art style for each era: it shouldn't look like a _pong_
game from that era, it should look like a AAA game from that era, that just happens to be pong"*.
Asked how far the look goes, he chose **"Characters hold the paddles"**: two animated players per
era swing at the ball.

This document is what the ten era cards that follow it build to, one era each. Every era from 1
(the 1977 Atari 2600) to 10 (the 2005 Xbox 360) has one page under eight fixed headings --
FLAGSHIP LOOK, SCENE, PLAYERS, BALL, SCOREBOARD, MOMENTS, TREATMENT, ASSETS -- and every line is
meant to be built from without a second decision: numbers, not adjectives. `test/art-bible.test.js`
fails if any era from 1 to 10 lacks a heading, if a page's asset rows do not add up to its budget,
or if a budget goes over 12 generations.

**How it sits beside `docs/ERAS.md`.** The era bible owns eras 5 to 10: their palettes, cameras,
table, voices, arrival flourishes and the readability rules R1 to R10. This document never
contradicts it. It adds the players, the scene around the table, the ball as a designed object,
the scoreboard's dressing and the moments, and for eras 5 to 10 it takes every colour it can from
that era's palette in `docs/ERAS.md`; a colour this document adds is marked *(new)*. Where a page
here says "as `docs/ERAS.md` gives it", that chapter is the whole specification and this page adds
nothing to it. For eras 1 to 4 the eras' own files are the current look, and a page here names
what stays.

**Sources.** The flagship games and their years are from memory, not checked against a published
list while this document was written; each is a very widely known title of its year on that
machine, and where a title is a year off the rung it is said so beside it. The borrowings are
style targets, never copies: no character, logo, wordmark or trademark shape from any of them is
drawn (ERAS.md rule 1.9). Every player below is an original stand-in in that game's manner.

---

## Shared rules: what every page assumes

### 1. Play never changes

- The rules are untouched. The paddle rectangle (14 x 84 field units, its outer face 32 units from
  the side wall) is the hit zone and the ball (12 units) is the ball. An era file reads the state
  and never writes it (ERAS.md rules 1.1 and 1.4); a player's animation keeps its memory in
  variables inside its own file, keyed off `state.time` and `state.events`.
- **The paddle is the thing the player holds** -- a bat, a shield, a board -- and it is drawn
  **after** its player, so no part of a figure ever covers it. It keeps its earned ink
  (`api.paddleInk`) at full saturation (R4). The players are drawn around the rectangle; they are
  never the rectangle.
- **Nothing a player does reaches into play.** No part of a figure is drawn inward of its paddle's
  inner face (x 46 on the left, 754 on the right), except the **swing smear**: an arc at most 16
  field units past the face, living 0.12 s, drawn before the ball (R1, R2).
- **The ball stays the brightest and sharpest thing on screen** (R1, R2). No figure, crowd, light
  or flag reaches the ball core's luminance at an opacity above 0.5. Each page names its brightest
  figure colour.
- **The backdrop never competes with the ball.** In the 2D eras (1 to 4) the court fills the whole
  frame, so every backdrop layer behind the play area uses colours of relative luminance **0.35 or
  less**, and anything that moves on its own behind the play area moves at 30 field units a
  second or less (the ball starts at several hundred).

### 2. Where a player stands

**The 2D eras (1 to 4)** draw in the machine's native pixels through `src/display.js`: the era
draws in field units on a field-sized canvas and the display samples it down. A player lives in
its **figure box**: from the side wall to the paddle's inner face (x 0 to 46 on the left, 754 to
800 on the right), and from 30 units above the paddle's top to 30 below its bottom (144 units
tall, clipped to the field). The box in each machine's pixels:

| Era | Native frame | One native pixel is | Figure box | Sprite cell | Figure drawn |
| --- | --- | --- | --- | --- | --- |
| 1 Atari 2600 | 160 x 192 | 5 x 3.125 units | 9.2 x 46 px | 8 x 46 | 8 x 46 |
| 2 NES | 256 x 240 | 3.125 x 2.5 | 14.7 x 57.6 | 16 x 56 | 14 x 56 |
| 3 Genesis | 320 x 224 | 2.5 x 2.68 | 18.4 x 53.8 | 24 x 56 | 18 x 52 |
| 4 Super Nintendo | 256 x 224 | 3.125 x 2.68 | 14.7 x 53.8 | 16 x 56 | 14 x 52 |

The sprite is drawn with its inner edge on the paddle's inner face and centred on the paddle's
height, snapped to the native grid; its outer columns fall on or past the side wall and are
clipped there. The right player is its own drawing, not the left one mirrored.

**The 3D eras (5 to 10)** stand the players on the table in `src/table3d.js`, so they are
depth-scaled by the camera for free: every part is a `T.box` at world coordinates, projected with
the era's camera. A player stands on the **end strip**, the 32 units between the end rail and its
paddle's outer face: feet at x 4 to 30 (left; 770 to 796 on the right), centred on the paddle's
`y`, facing the centre. It is **56 world units tall**, so the Xbox's gamertag at `z` 60 (ERAS.md
era 9, item 4) floats just over its head. It is drawn in painter's step 4 immediately **before**
its paddle box, and its contact shadow is an ellipse 30 x 20 units at 0.30 opacity, lighter than
the ball's (R5). A downward-tilted camera makes vertical edges lean outward as they rise, so a
figure on the end strip leans away from the table, never over it; each era card checks that with
`T.project` at the figure's top corners in all of its camera's measured poses (section 12 of
ERAS.md) and reports the numbers. The figures take the era's fog, grade and bloom like any
scenery; the paddles alone are exempt (R4).

**The 3D rig.** Every 3D figure is the same rig of 10 boxes, drawn in code; an era changes its
proportions, materials and shading, never its joints. Sizes in world units (x toward the centre,
y along the paddle, z up), for the standard 56-unit figure:

| Part | Size (x, y, z) | Hangs from |
| --- | --- | --- |
| legs, left and right | 6, 6, 20 | the pelvis, 4 units apart |
| pelvis | 8, 14, 6 | the floor, at z 20 |
| torso | 10, 16, 20 | the pelvis |
| head | 10, 10, 10 | the torso, at z 46 |
| upper arms, left and right | 4, 4, 12 | the torso's top corners |
| forearms and hands, left and right | 4, 4, 11 | the elbows; the hands grip the paddle's outer face |

### 3. The five beats

Every era animates the same five beats on the same triggers. The triggers come from
`state.events` (`paddle` and `score` entries, each with its `side`) and the paddle's smoothed
`vy` (item 1208), remembered in the era file's own variables.

| Beat | Starts on | Lasts | Wins over |
| --- | --- | --- | --- |
| **idle** | nothing else playing | loops every 1.0 s | nothing |
| **move** | the paddle's `vy` above 90 units a second | while it stays above 60 | idle |
| **swing** | a `paddle` event on this side | 0.18 s: wind-up 0.05, contact 0.05, follow-through 0.08 | move, idle |
| **miss** | a `score` event against this side | 0.6 s | swing, move, idle |
| **win** | a `score` event for this side | 0.8 s; 1.6 s on match point | swing, move, idle |

**2D frames.** Each beat has **one generated key pose** per player (five in all, one pose strip).
The in-between frames are derived in code, never generated: idle's second frame is the key pose
one native pixel lower; move alternates the key pose with itself shifted one native pixel toward
the travel, every 0.133 s; swing's wind-up is the move pose and its follow-through the swing pose
with the paddle-side arm one pixel further in; win's hop is the win pose at 2 then 4 native pixels
up and back; miss holds its pose. So a player is 5 drawn frames and about 9 derived ones.

**3D poses.** The rig's angles, in degrees (0 is the idle stance):

| Beat | Torso lean | Arms (shoulder pitch forward) | Legs | Other |
| --- | --- | --- | --- | --- |
| **idle** | 0 | 40, hands on the paddle's outer face | straight | a 1.5-unit bob in `z`, once a second |
| **move** | 12 toward the travel | 40 | split plus and minus 20, 3 times a second | none |
| **swing** | twist 25 toward the ball | 40 to 80 at contact, back to 40 | plant | contact at 0.075 s |
| **miss** | 15 back | drop to 10 | straight | head down 30 |
| **win** | 0 | both up to 160 | jump to `z` 8 at 0.2 s, land at 0.4 s | on match point a second jump at 0.8 s |

### 4. The moments

- **A point in eras 0 to 9 is also an era change.** The point that is scored moves the machine up
  a rung, and the ring (ERAS.md section 4, `src/erachange.js`) wipes the old era away from where
  the ball went out. So each page's point moment is played by **both** eras: the departing one for
  as long as the ring leaves it on screen, and the **arriving** one over its first 0.8 s, keyed off
  its own memory of the last score total it saw. The name card covers the middle 180 rows until the
  serve; anything a moment draws in that band is not seen, so a page's moment puts its
  drawing in the players and the scoreboard.
- **Era 10 is the only era a point is scored without leaving.**
- **Match point** is whatever the feel layer's `isMatchPoint(state)` says (`src/feel.js`): the
  rules' own `Pong.isMatchPoint` once the match card lands, and until then the point that reaches
  era 10 -- a point scored in era 9. Every page gives its match-point moment anyway, so it is
  ready for the match card.

### 5. The asset budget

Every era gets **at most 12 pixellab.ai generations**, through `tools/pixellab.mjs gen` (text to
image; each side 16 to 400 pixels and at least 1,024 pixels of area, the tool's own limits), saved
to `assets/pixellab/` with a manifest entry, and reduced offline to the era's palette where the era
has one, the way `assets/pixellab/era2-nes-quantize.mjs` does: a derived file costs 0 generations.
Each page's ASSETS table lists every generation one row each, the first column the count, and
**two generations are always held back as re-rolls** for whichever image comes back wrong.
Anything a page does not list is drawn in code.

- **A pose strip is untried.** No generation in this repo has yet asked pixflux for five poses of
  one character in a row. The first era card to try measures it and says how it went. If a strip
  comes back with fewer than five usable poses, that player's missing poses are asked for once
  more from a re-roll; if that fails too, the missing beat is derived in code from the idle pose
  (move: shifted one pixel toward the travel; miss: its top quarter one pixel lower; win: two
  pixels higher) and the page's report says which.
- **The 3D eras' textures go in as data: URIs** through `src/textures3d.js`, the way item 1187 did
  (`assets/pixellab/tex3d-embed.mjs`), so they never taint the canvas.
- **The 2D eras' images are drawn with `drawImage` only once decoded**, with a hand-drawn stand-in
  until then and always under `node --test` (the era 3 file is the worked example).

---

## Era 0: 1972 arcade Pong

**It stays 1972 Pong: two white bars, a square dot and a dashed centre line on black**, because
1972's flagship game *was* Pong -- the arcade machine is already the AAA game of its year, and it
happens to be Pong by definition. No players, no scene, no ball design, no scoreboard beyond the
machine's two block numbers, and no generated assets. Era 0 is pinned to the pixel by
`tools/eralooks-today.json` and nothing in this document changes it.

---

## Era 1: 1977 Atari 2600

### FLAGSHIP LOOK

Style targets: *Combat* (1977, the cartridge that came in the box), *Air-Sea Battle* (1977) and
*Street Racer* (1977). What the era borrows from them:

- **How much is on screen:** one playfield, two player sprites and one ball -- exactly the objects
  the 2600's picture chip had, and nothing else. No text but the score.
- **Palette:** 4 colours at once: black background, one playfield colour, and the two players'
  inks, which are the paddles' earned colours from era 1's own 12-entry palette.
- **Sprite size:** players are 8 native pixels wide, one colour per sprite, drawn in **double
  lines** (each sprite row is 2 of the 192 scanlines), so a 46-line figure is 23 drawn rows.
- **Animation:** 2 frames a beat at most, swapped every 8 frames (0.133 s), the way a 2600 kernel
  swapped a graphics pointer.
- **Interface:** the score as two big playfield-block numbers at the top, each in its player's
  ink, exactly as era 1 draws them now.

### SCENE

- **Where:** a *Combat*-style arena: a black field ringed by a playfield wall.
- **What fills the frame:** a wall 4 native lines tall along the top and bottom edges and a
  **stand** of mirrored playfield blocks: 3 rows of 4-pixel-wide blocks, 6 lines each, behind the
  top 18 lines of the field, every other block missing so it reads as heads. Wall and stand in
  `#2c3a7a` *(new; relative luminance under 0.05)*.
- **Backdrop layers:** 2 -- the black field and the playfield (wall and stand).
- **What moves on its own:** the stand **flickers** as 2600 crowds did: its two alternate block
  patterns swap every 16 frames (0.27 s). Nothing else moves.

### PLAYERS

- **Who:** two blocky athletes in the manner of *Street Racer*'s cars and *Combat*'s tanks made
  into people: the left player in the left paddle's ink, the right in the right paddle's. Brightest
  figure colour: the brighter paddle ink, never the ball's white.
- **Silhouette** (8 x 46 native, rows are double lines): a 4 x 3-row head, a 6 x 8-row torso, 2
  legs 2 pixels wide and 8 rows long with a 2-pixel gap. The left player's is the right's with the
  head one pixel toward the centre, so they do not read as one sprite mirrored.
- **How it holds the paddle:** upright in front of it, one arm a single double-line row, 3 pixels
  long, from the torso to the paddle's outer face at the paddle's middle height.
- **idle:** legs together; the 1-row bob. **move:** legs apart on alternate frames. **swing:** the
  arm row jumps up 4 rows, then back. **miss:** the head drops into the torso (the torso 2 rows
  shorter). **win:** both arm rows raised above the head, with the 2-pixel hop.

### BALL

The picture chip's ball object: a **2 x 4 native-pixel block** (12 field units), in `#f0fff6`,
the phosphor white era 1 already uses. No shading, no trail; it is the only object that never
changes colour.

### SCOREBOARD

Era 1's own score, unchanged: two playfield-block numbers across the top, each in its player's
ink. Added: a **1-line bar under each number** as long as that player's rally hits this serve, 1
native pixel a hit, to at most 20 pixels -- the kind of meter a 1977 cartridge drew from the
playfield.

### MOMENTS

- **A point scored:** the scorer's number flashes its ink and the black background for 4 frames
  on, 4 off, 3 times (0.4 s); the stand's flicker speeds to every 4 frames for 1 s; the players
  play win and miss.
- **Match point:** the background under the playfield wall turns the leading player's ink for 2
  lines every other frame while `isMatchPoint` holds.

### TREATMENT

What era 1 already does keeps doing it on top: the **RF picture** -- the arrival's rolling
picture, red and blue-green fields drifting apart and back (chroma fringing), the colour bleed
round the ring and the phosphor scanline band -- and the display layer's CRT (scanlines, glow,
curvature, item 1199) over every frame. The players take all of it; they add no effect of their
own. **Era 1 is pinned to the pixel** by `tools/eralooks-today.json`: the card that adds these
players re-records it with `node tools/eralooks.js` and says so.

### ASSETS

**Budget:** 4 of 12 generations. The 2600's look is so few pixels that code draws it better than
a generator can; pixellab gives only the players' shapes.

| Gens | Name | pixflux size | In game at | What it is |
| --- | --- | --- | --- | --- |
| 1 | `era1-players-left` | 40 x 46, 5 cells of 8 x 46 | 8 x 46 native, 1 colour | the left player's five key poses, `lineless`, `flat shading`, reduced to one colour |
| 1 | `era1-players-right` | 40 x 46 | 8 x 46 native | the right player's five |
| 2 | re-roll reserve | -- | -- | for a strip that comes back wrong |

Drawn in code instead: the playfield wall and stand, the flicker, the score and its rally bar,
every flash, and each player's derived frames. If both player strips fail, the players are drawn
in code from the silhouette rows above.

---

## Era 2: 1985 NES

### FLAGSHIP LOOK

Style targets: *Super Mario Bros.* (1985), *Tennis* (1984 in Japan, a 1985 launch title in North
America) and *Duck Hunt* (1985). What the era borrows:

- **How much is on screen:** a full-screen background of 8 x 8 tiles, 8 to 10 sprites, a status
  line at the top.
- **Palette:** the 2C02's 54 usable colours (era 2's `NES` table), **4 background palettes of 3
  colours plus a shared backdrop, and 4 sprite palettes of 3 colours plus transparent**. Every
  colour named here is an index into that table.
- **Sprite size:** players are 2 x 7 tiles (16 x 56 cell, 14 x 56 drawn), 3 colours each --
  *Tennis*'s players are 2 x 4 tiles, so these are the big, *Super Mario Bros.*-heavy version, a
  head one third of the height.
- **Animation:** 2 or 3 frames a beat, changed every 8 frames (0.133 s); *Duck Hunt*'s dog is the
  model for a readable win pose held still.
- **Interface:** *Tennis*'s umpire-and-scoreline presentation: white-on-black pixel text in a
  status band, the NES pixel font era 2 already draws.

### SCENE

- **Where:** a floodlit night tennis court, the court era 2 already draws (the pixellab court
  tiles, `era2-court.png`, the white border and the dotted net between two posts).
- **What fills the frame:** the court, plus a **crowd** of 8 x 8 tiles in the top 2 tile rows
  behind the top wall line: 32 tiles, 3 crowd patterns, in `$0C`, `$1C`, `$2D` (dark cyan, teal,
  grey) so it stays under the 0.35 luminance line; an **umpire's chair** at top centre, 2 x 3
  tiles, behind the net post, the umpire a 2 x 2-tile figure.
- **Backdrop layers:** 2 -- the court tiles and the crowd strip (one background, as the NES had).
- **What moves on its own:** the crowd's 3 patterns rotate every 16 frames (0.27 s); the umpire
  turns his head toward the side the ball is travelling, 1 tile, on every `paddle` event.

### PLAYERS

- **Who:** left, a boy athlete in a red headband and white shorts (`$16`, `$30`, `$27` -- red,
  white, orange skin); right, a rival in a blue cap and green shirt (`$12`, `$1A`, `$27`). Each
  figure's shirt takes the nearest NES hue to its paddle's earned colour, the way era 2 already
  maps a paddle's ink. Brightest figure colour: `$30` white on the shorts, 4 pixels at most, never
  adjacent to the ball's path (they are behind the paddle).
- **Silhouette:** 14 x 56 native: head 8 x 10 with the headband or cap, torso 10 x 18, legs 2 at 4
  x 20, a 1-pixel black outline on the outside edge only (NES sprites had none; *Super Mario
  Bros.* drew one in the palette).
- **How it holds the paddle:** two-handed, like a bat held upright, both fists on the paddle's
  outer face at its middle 12 pixels.
- **idle:** a knee bend, 2 frames. **move:** a shuffle, feet apart and together. **swing:** the
  body turns side-on for the contact frame, the fists jump 6 pixels up the paddle. **miss:** the
  head turns away, shoulders slump 2 pixels. **win:** a fist in the air, the *Duck Hunt* dog's
  held pose, with the hop.

### BALL

A **tennis ball** sprite: 4 x 5 native pixels (12 field units) in `$30` white with a `$38`
pale-yellow seam pixel, drawn over era 2's existing pixellab ball when it has decoded, and a 4 x 2
`$0F` black shadow 3 pixels below it (one extra sprite, as *Tennis* drew it). The ball's white is
the brightest thing on screen (R1).

### SCOREBOARD

*Tennis*'s scoreline: a black status band 2 tile rows tall across the top, `P1` and `CPU` in the
NES pixel font at left and right, each score beside its name in `$30` with the era's drop shadow,
and between them the rally count as `RALLY 00`. The umpire's call appears in the band for 1 s
after a point: `FIFTEEN`, `THIRTY`, `FORTY`, `GAME` by the scorer's points modulo 4.

### MOMENTS

- **A point scored:** the umpire's call in the band; the crowd's patterns rotate every 4 frames
  for 1 s; the scorer plays win and the other miss.
- **Match point:** the band reads `MATCH POINT` in `$16` red, blinking 0.5 s on and 0.5 s off,
  and the crowd holds its brightest pattern.

### TREATMENT

Era 2 keeps its **tile flip**: the arrival breaks the old picture into the court's 40-unit tiles
that turn over from the miss outward, with the black power blink and the rolling hold -- and the
display layer's CRT on top (item 1199). The players and the crowd are drawn into the frame the tile
flip copies, so they turn over with the court.

### ASSETS

**Budget:** 6 of 12 generations.

| Gens | Name | pixflux size | In game at | What it is |
| --- | --- | --- | --- | --- |
| 1 | `era2-players-left` | 80 x 56, 5 cells of 16 x 56 | 14 x 56 native, NES palette | the left player's five key poses, `single color black outline`, `basic shading` |
| 1 | `era2-players-right` | 80 x 56 | 14 x 56 native | the right player's five |
| 1 | `era2-crowd` | 96 x 32, 3 cells of 32 x 32 | 3 patterns, 8 x 8 tiles, 3 colours | the crowd patterns, quantised to `$0C`, `$1C`, `$2D` |
| 1 | `era2-umpire` | 32 x 48 | 16 x 24 native | the chair and the umpire, two head positions drawn in code |
| 2 | re-roll reserve | -- | -- | for a strip that comes back wrong |

Each image is reduced to the NES palette by a derived step like `era2-nes-quantize.mjs` (0
generations). Drawn in code instead: the status band, the umpire's calls, the ball's seam and
shadow, the flashes and the derived frames. The court, net and ball sprite already on master stay.

---

## Era 3: 1989 Sega Genesis

### FLAGSHIP LOOK

Style targets: *Altered Beast* (1989, the launch pack-in), *Golden Axe* (1989 on the Genesis) and
*Ghouls 'n Ghosts* (1989). What the era borrows:

- **How much is on screen:** two scrolling planes, big sprites, a life-bar interface; more on
  screen than the NES by a factor of about two.
- **Palette:** the 512-colour, 3-bit-a-channel palette era 3 already snaps to (values `00`, `24`,
  `49`, `6d`, `92`, `b6`, `db`, `ff`); **4 palettes of 15 colours plus transparent**, so each
  player has 15 colours.
- **Sprite size:** players are 24 x 56 cells, 18 x 52 drawn -- *Golden Axe*'s heroes are about
  that tall on a 224-line screen.
- **Animation:** 3 or 4 frames a beat, changed every 6 frames (0.1 s).
- **Interface:** *Golden Axe*'s bottom panel: portraits, bars of magic pots, a stone frame; here
  shifted to the top so it stays off play (rule R8's spirit in 2D).

### SCENE

- **Where:** a torch-lit stone arena at night, the court of a fantasy castle.
- **What fills the frame:** the two parallax planes era 3 draws now -- the far plane (the
  pixellab night court, stars and the distant range, drifting at one third of the near speed) and
  the near plane of hills at 18 units a second -- with the near plane replaced by an **arena
  wall**: a band of stone blocks 24 native lines tall across the top, with **4 torches** on it at x
  100, 300, 500 and 700 field units. The floor is the court.
- **Backdrop layers:** 3 -- far plane, near plane (the wall and torches), court floor.
- **What moves on its own:** torch flames, 3 frames at 0.1 s each, in `#ff9200`, `#ffdb00`,
  `#db2400` (the flame's brightest, `#ffdb00`, is under the ball's white); the far plane's drift
  and the near plane's scroll at their current speeds; a **pennant** on each torch, 2 frames.

### PLAYERS

- **Who:** left, a barbarian warrior -- bare-chested, fur boots, a horned helmet
  (`#b66d49` skin, `#6d4924` fur, `#b6b6b6` helmet); right, an armoured knight in a crested helm
  (`#6d6d92`, `#b6b6db`, `#924924` crest). The left one's belt and the knight's crest take the
  paddle's earned colour snapped to 512. Brightest figure colour: `#dbdbff` on the helmet's lit
  edge, 3 pixels, never the ball's white.
- **Silhouette:** 18 x 52 native: a broad-shouldered V (shoulders 16 wide, waist 10), head 8 x 9,
  stepped two-tone shading (lit toward the centre, one palette step darker away from it), 1-pixel
  dark outline in the palette's darkest.
- **How it holds the paddle:** as a **tower shield**, the near arm's forearm across it at the
  paddle's middle, the far fist on its top corner.
- **idle:** a breathing heave, shoulders up 1 pixel. **move:** a crouched step, 2 frames.
  **swing:** a *Golden Axe* shield bash -- the body lunges 2 pixels toward the paddle, the smear
  (shared rule 1) in the palette's lightest orange. **miss:** knocked back 3 pixels, knees bent.
  **win:** the barbarian raises an axe, the knight a sword, above the head, with the hop.

### BALL

A **chrome orb**, the pixellab chrome sprite era 3 draws now, with its **motion trail** back along
the ball's own velocity (era 3's trail, kept as it is) and its drop shadow. The glint stays
`#ffffff` and is the brightest thing on screen.

### SCOREBOARD

A stone panel across the top 16 native lines: the score in era 3's bold block digits with their
drop shadow, and beside each a **portrait** of the player, 16 x 16 native, in a 1-pixel
`#b6b6db` frame, left portrait at native x 8, right at 296. Under each portrait a bar of **5
magic pots** (4 x 6 each), one filled per 2 hits of the current rally, as *Golden Axe*'s magic
meter.

### MOMENTS

- **A point scored:** the conceding portrait flashes `#ff0000` 3 times over 0.3 s; all 4 torches
  flare to 2 frames of their tallest flame; the players play win and miss.
- **Match point:** the torches burn at double speed and the panel's frame turns `#ffdb00` while
  `isMatchPoint` holds.

### TREATMENT

Era 3 keeps its **parallax and trail**, and its **shatter** arrival -- the old picture breaking
like glass from where the ball went out, the shards flying off over the new era with its planes
already scrolling -- plus the display layer's CRT (item 1199). The players are in the frame the
shatter copies, so they break with it. Feel's intensity table leaves era 3's trail alone
(`OWNED` in `src/feel.js`); the players add nothing to it.

### ASSETS

**Budget:** 8 of 12 generations.

| Gens | Name | pixflux size | In game at | What it is |
| --- | --- | --- | --- | --- |
| 1 | `era3-players-left` | 120 x 56, 5 cells of 24 x 56 | 18 x 52 native, 15 colours | the barbarian's five key poses, `single color black outline`, `medium shading` |
| 1 | `era3-players-right` | 120 x 56 | 18 x 52 native | the knight's five |
| 1 | `era3-arena-wall` | 320 x 48 | 320 x 24 native band, tiled | the near plane's stone wall |
| 1 | `era3-torch` | 48 x 32, 3 cells of 16 x 32 | 8 x 16 native | the torch's three flame frames |
| 1 | `era3-portraits` | 64 x 32, 2 cells of 32 x 32 | 16 x 16 native each | the two portraits |
| 1 | `era3-panel` | 320 x 32 | 320 x 16 native | the stone score panel, reduced to 512 colours |
| 2 | re-roll reserve | -- | -- | for a strip that comes back wrong |

Each image is snapped to the 512 colours offline (0 generations). Drawn in code instead: the
magic pots, the pennants, every flash, the derived frames, and the stand-ins for all of it until
the images decode. The far plane and the chrome ball on master stay.

---

## Era 4: 1991 Super Nintendo

### FLAGSHIP LOOK

Style targets: *Super Mario World* (1991 in North America), *F-Zero* (1991) and *Pilotwings*
(1991). What the era borrows:

- **How much is on screen:** a Mode 7 floor under a sky, big bright sprites, a translucent
  interface -- colour math was the SNES's showpiece.
- **Palette:** 15-bit colour, 256 on screen; **8 sprite palettes of 15 colours**, so each player
  has 15, with the soft, saturated ramps of *Super Mario World*.
- **Sprite size:** 16 x 56 cells, 14 x 52 drawn.
- **Animation:** 4 frames a beat for idle and move, 3 for the rest, changed every 5 frames (0.083 s).
- **Interface:** *F-Zero*'s translucent panels and *Pilotwings*' instrument readouts: numbers in
  boxes with a 50% see-through fill.

### SCENE

- **Where:** a hover-racing test ground at dusk, the *F-Zero* track under a *Pilotwings* sky.
- **What fills the frame:** era 4's dusk sky (night blue to warm horizon), mountain line and stars,
  and the Mode 7 checkerboard floor sliding toward you. Added: **2 hot-air balloons** in the sky
  band, 10 x 14 native each, and **4 marker pylons** on the floor at its far edge, 4 x 10 native,
  blinking.
- **Backdrop layers:** 3 -- sky (with stars and balloons), mountain line, Mode 7 floor.
- **What moves on its own:** the floor's slide (as now); the balloons drift left to right at 3
  field units a second and wrap; the pylons blink `#f8a000` 0.5 s on, 0.5 s off, alternating; the
  stars twinkle as now.

### PLAYERS

- **Who:** two hover-pilots in racing suits and round helmets, each standing on a small **hover
  pad** with a jet flame under it -- left in `#f83800` red and white, right in `#3868f8` blue and
  yellow; each suit's stripe is the paddle's earned colour. Brightest figure colour: the helmet's
  highlight, `#f8f8d0`, 2 pixels, under the ball's white.
- **Silhouette:** 14 x 52 native: a round helmet 10 x 10 with a dark visor band, a slim suit, the
  pad an ellipse 14 x 4 at the feet with its flame 4 x 6 under it.
- **How it holds the paddle:** as a **glowing energy board** gripped at both ends by
  outstretched arms; the paddle's own sprite is unchanged, the hands sit on its outer face at its
  top and bottom quarters.
- **idle:** the pad bobs 1 pixel, the flame flickers 2 frames. **move:** the body leans 2 pixels
  into the travel, the flame stretches to 8 pixels. **swing:** a spin -- 3 frames of the pilot
  turning, *F-Zero*'s spin attack. **miss:** the pad dips 3 pixels and the flame gutters.
  **win:** a *Super Mario World* victory pose, both arms up, the flame at full 10 pixels, with the
  hop.

### BALL

The **glowing orb** era 4 draws now (the pixellab `snes-ball`) with its soft shadow on the floor
beneath it, and a colour-math halo *(new)*: a circle 1.6 times the ball's radius in `#f8f8d0` at
0.3 opacity, `'lighter'`, drawn under the core so the core stays the brightest (R1).

### SCOREBOARD

Era 4's translucent panel across the sky, kept, restyled as *F-Zero*'s: two boxes 40 x 16 native,
`#0b0f3c` at 0.5 opacity with a 1-pixel `#f8f8d0` edge, each score in the block font inside, a
helmet icon 8 x 8 beside it, and under each box a **power bar** 32 x 3 native that fills with the
rally, 4 pixels a hit, and flashes when full.

### MOMENTS

- **A point scored:** the conceding pilot's pad blinks 4 times over 0.4 s; the pylons all light
  at once for 0.5 s; the players play win and miss.
- **Match point:** both power bars pulse, the floor's slide speeds to twice its rate, and the
  balloons show `#f8a000` streamers, while `isMatchPoint` holds.

### TREATMENT

Era 4 keeps its **Mode 7**: the arrival tilts the whole field back into perspective, turns it once
round like an *F-Zero* floor and sweeps it back flat with the name card spinning in -- and the
floor itself stays Mode 7 in play, under the display layer's CRT (item 1199). The players and
balloons are drawn into the composite the flourish tilts, so they spin with it.

### ASSETS

**Budget:** 8 of 12 generations.

| Gens | Name | pixflux size | In game at | What it is |
| --- | --- | --- | --- | --- |
| 1 | `era4-players-left` | 80 x 56, 5 cells of 16 x 56 | 14 x 52 native, 15 colours | the red pilot's five key poses on the pad, `single color outline`, `detailed shading` |
| 1 | `era4-players-right` | 80 x 56 | 14 x 52 native | the blue pilot's five |
| 1 | `era4-balloon` | 32 x 32 | 10 x 14 native | one hot-air balloon, the second a palette swap in code |
| 1 | `era4-pylon` | 32 x 32 | 4 x 10 native | the marker pylon |
| 1 | `era4-helmets` | 64 x 32, 2 cells of 32 x 32 | 8 x 8 native each | the two scoreboard icons |
| 1 | `era4-flame` | 32 x 32 | 4 x 6 to 4 x 10 native | the jet flame, stretched in code |
| 2 | re-roll reserve | -- | -- | for a strip that comes back wrong |

Drawn in code instead: the halo, the panels and power bars, the streamers, every blink, the derived
frames, and the flame's stretch. The sky, the Mode 7 floor, the paddle and the ball on master stay.
