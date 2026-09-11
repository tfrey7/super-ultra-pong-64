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

### 2. Where a player stands: the rig that landed (item 1223)

**`src/characters.js` is the players' engine, and every page below is written to it.** It wraps
the renderer's `draw`, so after an era has drawn its frame it draws one figure behind each paddle:
the player on the left, the computer on the right, mirrored. Each era has a config block in its
`ERAS` table, and **an era card that brings art fills in that block and nothing else there**:

- `sheet` -- a pixellab name (`assets/pixellab/<sheet>.png`, loaded through `src/sprites.js`),
  **one row per beat in the order idle, up, down, swing, miss, win**, one frame per column, each
  frame `frame.w` x `frame.h` sheet pixels. A beat with no frames falls back to idle, so a sheet
  that is only an idle row still plays.
- `frames` -- frames per beat; the default is idle 2, up 2, down 2, swing 3, miss 1, win 2, so a
  sheet is 3 frames wide and 6 rows tall. Every page below uses that default.
- `hand` -- the sheet pixel, in a frame facing right, that holds the paddle; `anchor` -- where it
  goes, from the middle of the paddle's **outer** edge, in field units (on the 3D eras also `dz`,
  the hand's height off the table, default 18).
- `scale` -- field units per sheet pixel; on the 3D eras, table units, multiplied by the table's
  depth scale at the paddle, so a figure shrinks toward the far wall.
- `fps` -- how fast idle, up, down and win cycle (default 6).
- **Two players, two sheets.** The rig takes one `sheet` per era and mirrors it for the right-hand
  player. Every page below gives two different players, so the rig needs one optional field,
  `sheets: { left, right }`, falling back to `sheet` -- card 1245, filed beside this document,
  and the first era card to bring art waits for it. Until it lands, an era card ships the left
  player's sheet as `sheet` and both sides wear it.

So a player always stands **outside** its paddle, its hand on the outer edge, and never reaches
into play. It is drawn after the era's frame (and so over its paddle's outer edge only where the
hand is); the paddle rectangle stays the whole hit zone. Each page's PLAYERS section ends with
its **Sheet** line: the frame size, the hand pixel and the scale for that era's block.

**The room a 2D player has** is the 32 field units between the side wall and the paddle's outer
face; a frame is sized so `frame.w x scale` is at most 32, and anything past the wall is clipped.
Its height is about 1.6 times the paddle's (84 units). In the machine's own pixels, which the
display samples the frame down to (`src/display.js`):

| Era | Native frame | One native pixel is | Sheet frame | Scale | On screen, field units | In native pixels |
| --- | --- | --- | --- | --- | --- | --- |
| 1 Atari 2600 | 160 x 192 | 5 x 3.125 units | 6 x 28 | 5 | 30 x 140 | 6 x 45 |
| 2 NES | 256 x 240 | 3.125 x 2.5 | 10 x 44 | 3.125 | 31 x 138 | 10 x 55 |
| 3 Genesis | 320 x 224 | 2.5 x 2.68 | 12 x 52 | 2.6 | 31 x 135 | 12 x 50 |
| 4 Super Nintendo | 256 x 224 | 3.125 x 2.68 | 10 x 44 | 3.1 | 31 x 136 | 10 x 51 |

**The 3D players (eras 5 to 10) are the same sheets drawn as upright billboards**, at the
projection of the paddle's outer edge with the hand `dz` 18 units off the table, scaled by the
table's depth there -- the "depth-scaled figure at the paddle's projected spot" the climb asks
for. Every 3D page draws its figure 90 table units tall and about 40 wide (twice the paddle box's
height of 22 to 28 is the point: the players read as people standing at the table's ends). Those 90 units are the sprite stand-ins'. The realism ladder's players, which the polygon cards build, stand 250 units tall on a floor below the table (section 8). Because
the rig draws after the era's own frame, **the era's treatment is not applied to the players by
the era's draw**: each 3D page's TREATMENT says what the sheet carries baked in (its shading,
outline, grade) and what the era card adds in the rig's draw for its era (a fog tint by depth, a
letterbox clip). The display layer's TV treatment still lands on top of them (item 1223's own
note).

### 3. The five beats

Tim's five beats are idle, move, swing, miss and win; the rig splits **move** into two rows,
**up** and **down** (the paddle moving toward the top or the bottom of the field), so each page's
move pose is drawn twice, leaning each way. The rig's own timing, which no page changes:

| Beat | Row | Starts on | Lasts | Frames |
| --- | --- | --- | --- | --- |
| **idle** | 1 | nothing else playing | cycles at `fps` | 2 |
| **move** | 2 (up) and 3 (down) | the paddle's `vy` past 60 units a second | while it lasts | 2 each |
| **swing** | 4 | a `paddle` event on this side | 0.3 s, the 3 frames spread across it | 3 |
| **miss** | 5 | a `score` event for the other side | 1.2 s | 1 |
| **win** | 6 | a `score` event for this side | 1.2 s | 2 |

A pose a page describes ("the arm to 80 degrees", "lean 12 into the travel") is **how that row's
frames are drawn in the sheet**, and the proportions it gives are the drawn figure's.

### 4. The moments

- **A point in eras 0 to 9 is also an era change.** The point that is scored moves the machine up
  a rung, and the ring (ERAS.md section 4, `src/erachange.js`) wipes the old era away from where
  the ball went out. So each page's point moment is played by **both** eras: the departing one for
  as long as the ring leaves it on screen, and the **arriving** one over its first 0.8 s, keyed off
  its own memory of the last score total it saw (the rig plays win and miss for that point on its
  own). The name card covers the middle 180 rows until the serve; anything a moment draws in that
  band is not seen, so a page's moment puts its drawing in the players and the scoreboard.
- **Era 10 is the only era a point is scored without leaving.**
- **Match point** is `Pong.isMatchPoint(state)` (item 1211): a match is eleven points, one per era
  (`rules.matchPoints`), so the match point is the eleventh point, and with ten scored the machine
  is already on era 10. **Only era 10's match point plays in a normal match.** Every other page
  still gives one, drawn whenever `isMatchPoint` holds while that era is on screen, so a match
  made longer than the ladder (a raised `matchPoints`) is dressed on every rung.

### 5. The asset budget

Every era gets **at most 12 pixellab.ai generations**, through `tools/pixellab.mjs gen` (text to
image; each side 16 to 400 pixels and at least 1,024 pixels of area, the tool's own limits), saved
to `assets/pixellab/` with a manifest entry, and reduced offline to the era's palette where the era
has one, the way `assets/pixellab/era2-nes-quantize.mjs` does: a derived file costs 0 generations.
Each page's ASSETS table lists every generation one row each, the first column the count, and
**two generations are always held back as re-rolls** for whichever image comes back wrong.
Anything a page does not list is drawn in code.

- **Each player is one generation: the whole six-row sheet at once**, 3 frames by 6 rows at the
  page's frame size, prompted row by row ("row 1 idle, two frames; row 2 moving up ..."). **That is
  untried**: no generation in this repo has yet asked pixflux for a sprite sheet. The first era
  card to try it says how it went. A row that comes back unusable is asked for once more from a
  re-roll, as a single-row image; if that fails too, the row is left empty and the rig plays idle
  in its place (it does that already), and the report names the beat.
- **The 3D eras' images go in as data: URIs**, the way item 1187 did
  (`assets/pixellab/tex3d-embed.mjs` writing `src/textures3d.js`), so they never taint the canvas.
- **The 2D eras' images are drawn with `drawImage` only once decoded**, with a hand-drawn stand-in
  until then and always under `node --test` (the era 3 file is the worked example).

---

## The realism ladder: from Atari pong to table tennis (item 1265)

Tim, 2026-09-11: *"ok as far as art style goes: i was imagining it starting out as pong in the
atari world and becoming more and more like real life table tennis, where finally in the 3d eras
you can see the characters standing around the tables"*.

This sits on top of the flagship rule above and changes none of it: each era still looks like
that year's AAA game, and the characters that landed stay who they are. The ladder decides four
other things per era: **what the playfield is, what the ball and the bats look like, where the
view sits, and how much of each player you see.** Each era page below opens with its rung.

### 6. What the ladder never changes

- **Play.** Shared rule 1 stands whole. The table top is the rules' field, 800 by 600 field
  units: the top and bottom walls are the table's side edges, the left and right edges its ends.
  The paddle rectangle is the whole hit zone and moves along its end of the table. The ball is the
  ball. The ladder changes how things are drawn and never how they move.
- **Pong's bar is a table tennis bat seen from above.** A bat held upright, blade toward the net,
  looks from straight overhead like a thin bar as long as its blade. So the bar never changes
  shape in play. Each rung adds something around it: a handle, a hand, a table under it, and
  finally a whole player standing behind it.
- **The sizes are already close to real.** A 40 mm ball on a 2.74 m table is 11.7 units in 800,
  and the ball is 12. The table is deeper than a real one: a real top would be 800 by 445, and the
  ladder keeps the rules' 600 rather than shrink play to match. The blade (84 units, about 29 cm)
  is twice a real blade's width. Both are kept, because both are play.
- **Readability wins every tie with realism.** ERAS.md's R1 to R10 hold on every rung. The net is
  the one thing a real table has that stands up in play, so it is the one thing the ladder limits
  (below).

### 7. The rungs

| Era | Machine | Playfield | Ball | Bats | View | Each player |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 1972 arcade | a bare court: black, dashed centre line | the square dot | white bars | flat, top-down | nothing |
| 1 | 1977 Atari 2600 | a bare court in the *Combat* arena: playfield wall and stand | the 2 x 4 block | bars in the earned inks | flat, top-down | a block: the one-colour athlete |
| 2 | 1985 NES | **the table appears**: the court's border becomes the table's white edge lines, the net and its two posts cross the middle, a centre line runs end to end, the tennis lines go | a round white ball with its shadow sprite | **the bar gains a handle**, gripped by one fist | flat, top-down | a side figure with a bat, the whole small sprite |
| 3 | 1989 Genesis | **a drawn table with every marking**: a table-tennis blue top, white edge and centre lines, the net as a band with posts and a shadow, the arena's stone floor round it | the landed chrome orb, its shadow on the blue | **bats that read as bats**: rubber in the earned ink on the inner face, black on the outer, a wood edge, a handle | flat, top-down | a side figure with a bat, as landed |
| 4 | 1991 Super Nintendo | **the table in perspective**: the whole top tilted back in Mode 7, net and lines foreshortened with it | the landed glowing orb, its shadow on the table | as era 3, foreshortened | **tilted**: far edge at least 0.85 of the near edge's width | **the upper body**: waist up behind each end, the end of the table hiding the legs |
| 5 | 1994 PlayStation | **a real table tennis table in 3D**: top, edge and centre lines, net on posts, legs to a floor | ERAS.md's era 5 ball, unchanged | 3D bats: a blade with rounded top, rubber and handle | **full 3D with the players in frame** | **a whole standing character behind its end**, bat in hand |
| 6 | 1996 Nintendo 64 | the table as era 5, in the era's toy colours and fog | ERAS.md's era 6 ball | as era 5 | as era 5 | as era 5: the penguin and the frog |
| 7 | 1999 Dreamcast | the table as era 5, cel-shaded and ink-outlined | ERAS.md's era 7 ball | as era 5, cel bands | as era 5 | as era 5: the two skaters |
| 8 | 2000 PlayStation 2 | the table as era 5, glossy, inside the letterbox | ERAS.md's era 8 ball | as era 5, with reflections | as era 5, inside the bars | as era 5: the two operatives |
| 9 | 2001 Xbox | the table as era 5, bump-mapped plate, hard shadows from the ball | ERAS.md's era 9 ball | as era 5, specular | as era 5 | as era 5: the marine and the cyborg |
| 10 | 2005 Xbox 360 | the table as era 5, bloom, grade and depth of field | ERAS.md's era 10 ball | as era 5, rim-lit | as era 5 | as era 5: the two soldiers |

So eras 0 and 1 are pure pong, the arcade and the Atari. Eras 2 to 4 walk to table tennis one
step each: the table, then its markings and real bats, then the tilt and the bodies. Eras 5 to 10
are the same real table tennis in 3D, and what changes between them is the machine's treatment,
already written in ERAS.md and on each page.

### 8. The numbers every rung builds to

**The table in 2D (eras 2 to 4).** Its ends are drawn at the paddles' **outer faces**, x 32 and
768, so each bat stands on its end of the table and each player stands on the floor behind it, in
the 32 units shared rule 2 gives. A ball past x 32 has gone off the end, which is a point in real
table tennis too. The edge lines are 6 field units wide, and the centre line (y 300, from end to
end) is 3. All of them use the court-line colour the era already has, darker than the ball's core
(R1). The net is at x 400, across the whole top, 8 units wide, with a post 10 units square on each
side edge. Every line and the net are drawn before the ball.

**The table in 3D (eras 5 to 10).** The top stays the slab each era builds now, 0 to 800 by 0 to
600, so every arena, rail and R3 measurement holds; its ends are x 0 and 800. On it, drawn as
world shapes on the table (ERAS.md's step 3):

- edge lines 6 units wide round all four edges, and the centre line along y 300, 3 units wide, in
  the era's line colour;
- the **net** across x 400, 24 units tall, from a post at y -20 to a post at y 620, its body a
  mesh at 0.5 opacity or less and its top tape the era's line colour. A real net would be 45 units
  (15.25 cm); 24 keeps it below the bats' 28 (R6's paddle height). The side camera's eye is at
  x 400, so it sees the net nearly edge on: it covers about as much as the centre line does. It is
  drawn before the ball every frame, so the ball always passes over it;
- **legs** under the top to a **floor 110 units below it**, in the era's rail colours. They stand
  inside the top's footprint, so nothing is drawn between the camera and the near edge (R6).

**The players in 3D.** They are a real player's proportions against a real table: a 76 cm table
top against a 175 cm player puts the top at **0.43 of the player's height**. Real scale here
would make a player 510 units tall, taller than the table is deep, so the ladder takes the
players and the table's height at half scale together: the **floor 110 units below the top and a
player 250 units tall**. Each stands with the front foot **30 units behind its end** (x -30 on the
left, 830 on the right), centred on its paddle's `y` and following it along the end. It faces the
net, and holds the bat's handle in its near hand, reaching over its end. Feet stay on the floor in
every beat except win's hop.

**The camera in 3D.** It is the side camera ERAS.md section 2.1 describes, standing in front of
the near edge and looking across, pulled back and raised until **both players are whole, feet to
head, with the paddle at `y` 300**. With the paddle at either wall, no more than the head may pass
behind the HUD band. R3's four conditions still hold, measured by `tools/table3d-cameras.js`. If no
camera holds both whole figures and passes R3, the players and the floor shrink together, keeping
the 0.43, to the largest size that passes, and the card names that size.

**The bat in 3D.** The paddle box stays the hit zone and R5's true footprint. It is drawn as a
**blade**: the top corners rounded to a 10-unit radius, the inner face and top in rubber of the
earned ink, and the outer face black rubber (`#1a1a1a` before the era's grade). The near face keeps
the earned ink at full saturation, after any grade (R4). A **handle**, a box 20 x 6 x 6 in wood
(`#b07a44` *(new)*, through the era's treatment), comes off the outer face's middle at `z` 14, and
the player's hand is on its far end.

**The bat in 2D.** The bar keeps its rectangle. From era 2 a handle comes off the outer face's
middle into the player's room: 3 native pixels long on the NES, 4 on the Genesis and the Super
Nintendo, in the era's nearest wood brown. The figure's hand pixel, which the rig already puts at
the paddle's outer middle, is where the handle ends. From era 3 the bar is split along its length:
the inner half is rubber in the earned ink, the outer half black rubber, with a 1-pixel wood line
between them.

### 9. What each queued card delivers

- **Eras 0 and 1: no card.** Both are pinned to the pixel (`tools/eralooks-today.json`) and stay as
  they are.
- **Card 1267, eras 2 to 4, the field becomes a table.** It delivers rungs 2, 3 and 4 as the table
  above and section 8's 2D numbers give them: era 2's tennis paint turned into the table (edge
  lines, net and posts, and the centre line kept; the service lines, singles sidelines and centre
  marks painted out) and the handle; era 3's blue top, full markings, net band and shadow, and the
  two-rubber bats; era 4's Mode 7 tilt of the table in play, at 0.85 or more, with the pointer
  still reaching the same field `y`. One snag for its planner: **era 4's upper-body view cannot be
  drawn by the era file**, because the rig draws the players after the era's frame, so nothing
  the era draws covers a leg. The two ways that stay inside 1267's files are a re-cut sheet under
  the same pixellab names, its frames holding the pilot from the waist up and made offline from the
  landed sheet (0 generations), or, failing that, a finding naming the one line of era 4's block in
  `src/characters.js` that would crop it.
- **Card 1266, the 3D table and camera.** It delivers section 8's 3D table (lines, net and posts,
  legs, floor) and the camera, in `src/table3d.js`, keeping the projection's contract. The
  stand-ins stay where the rig draws them. Placing figures on the floor is the polygon cards'
  work, so 1266's screenshots show the camera's room for them rather than the figures standing.
  **Card 1263** (a per-era camera, so the Dreamcast arena shows) works in the same camera code:
  1266's pulled-back camera gives every arena much of the room 1263 asks for, and whichever of
  the two lands second merges onto the other.
- **Cards 1253 to 1258, the polygon players, one per era from 5 to 10.** Each delivers its era's
  two characters as its page names them. They stand as section 8's 3D players do: 250 units tall,
  feet on the floor 1266 draws, the front foot 30 units behind the end, centred on the paddle's
  `y`, the near hand on the bat's handle, and the whole body in frame. That staging replaces each
  card's own line saying the figure holds its paddle where the look card placed the stand-in: the
  stand-ins were placed for the shield-and-board grips the ladder retires. Each card sets it in
  its own era's block in `src/characters.js`, after 1266 has landed. What each player wears and how
  each beat reads stay as the page gives them. Only the grip changes, to a bat held by its
  handle:

  | Card | Era | The two characters | Budget each, from the card (fewer if 1248's measurements say so) |
  | --- | --- | --- | --- |
  | 1253 | 5 PlayStation | the red-gi and blue-top fighters | about 200 triangles |
  | 1254 | 6 Nintendo 64 | the penguin and the frog | about 350 triangles |
  | 1255 | 7 Dreamcast | the orange and blue skaters | about 600 triangles |
  | 1256 | 8 PlayStation 2 | the midnight and slate operatives | about 800 triangles |
  | 1257 | 9 Xbox | the space marine and the steel cyborg | about 1000 triangles |
  | 1258 | 10 Xbox 360 | the green-trim and grey-trim soldiers | about 1200 triangles |

---

## Era 0: 1972 arcade Pong

**Realism rung 0 of 10: pure pong.** A bare court, the square dot, white bars, a flat top-down view, and no player at all. The ladder starts here and never touches it.

**It stays 1972 Pong: two white bars, a square dot and a dashed centre line on black**, because
1972's flagship game *was* Pong -- the arcade machine is already the AAA game of its year, and it
happens to be Pong by definition. No players, no scene, no ball design, no scoreboard beyond the
machine's two block numbers, and no generated assets. Era 0 is pinned to the pixel by
`tools/eralooks-today.json` and nothing in this document changes it.

---

## Era 1: 1977 Atari 2600

**Realism rung 1 of 10: pong in the Atari world.** A bare court in the *Combat* arena, the 2 x 4 block ball, bars in the earned inks, a flat top-down view, and each player a one-colour block beside its bar. No table, no net, no handle: everything on this page stays as it is.

### FLAGSHIP LOOK

Style targets: *Combat* (1977, the cartridge that came in the box), *Air-Sea Battle* (1977) and
*Street Racer* (1977). What the era borrows from them:

- **How much is on screen:** one playfield, two player sprites and one ball -- exactly the objects
  the 2600's picture chip had, and nothing else. No text but the score.
- **Palette:** 4 colours at once: black background, one playfield colour, and the two players'
  inks, which are the paddles' earned colours from era 1's own 12-entry palette.
- **Sprite size:** players are 6 native pixels wide (a 2600 player graphic is 8; its outer 2
  columns stay clear), one colour per sprite, 28 sheet rows laid over 45 of the 192 scanlines.
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
- **Silhouette** (6 x 28 sheet pixels): a 4 x 5 head, a 6 x 10 torso, 2 legs 2 pixels wide and
  12 long with a 2-pixel gap. The right player is its own sheet with the head one pixel lower, so
  the two do not read as one sprite mirrored.
- **How it holds the paddle:** upright in front of it, one arm a single double-line row, 3 pixels
  long, from the torso to the paddle's outer face at the paddle's middle height.
- **idle:** legs together; the 1-row bob. **move:** legs apart on alternate frames. **swing:** the
  arm row jumps up 4 rows, then back. **miss:** the head drops into the torso (the torso 2 rows
  shorter). **win:** both arm rows raised above the head, with the 2-pixel hop.
- **Sheet:** `frame` 6 x 28, `hand` (6, 14), `scale` 5, `anchor` dx 0 dy 0, `fps` 7.5 (every 8
  frames, the 2600 swap), the default frames: an 18 x 168 sheet.

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
| 1 | `era1-players-left` | 18 x 168, 3 x 6 frames of 6 x 28 | 30 x 140 field units, 1 colour | the left player's sheet, `lineless`, `flat shading`, reduced to one colour |
| 1 | `era1-players-right` | 18 x 168 | 30 x 140 field units | the right player's sheet |
| 2 | re-roll reserve | -- | -- | for a strip that comes back wrong |

Drawn in code instead: the playfield wall and stand, the flicker, the score and its rally bar,
every flash. If both player sheets fail, the players are drawn
in code from the silhouette rows above.

---

## Era 2: 1985 NES

**Realism rung 2 of 10: the table appears.** Still flat and top-down, but the court is now a table: white edge lines round it, the net and posts across the middle and a centre line from end to end, with the tennis lines gone. The ball is a round white ball with its shadow, and each bar gains a handle gripped by one fist of a side figure. Card 1267 builds it (the realism ladder, sections 7 to 9); where a line below still says tennis court, this rung wins.

### FLAGSHIP LOOK

Style targets: *Super Mario Bros.* (1985), *Tennis* (1984 in Japan, a 1985 launch title in North
America) and *Duck Hunt* (1985). What the era borrows:

- **How much is on screen:** a full-screen background of 8 x 8 tiles, 8 to 10 sprites, a status
  line at the top.
- **Palette:** the 2C02's 54 usable colours (era 2's `NES` table), **4 background palettes of 3
  colours plus a shared backdrop, and 4 sprite palettes of 3 colours plus transparent**. Every
  colour named here is an index into that table.
- **Sprite size:** players are 10 x 44 sheet pixels (about 10 x 55 NES pixels), 3 colours each --
  *Tennis*'s players are 2 x 4 tiles, so these are the big, *Super Mario Bros.*-heavy version, a
  head one third of the height.
- **Animation:** the default 2 frames a beat (3 for the swing) at `fps` 7.5, every 8 frames; *Duck Hunt*'s dog is the
  model for a readable win pose held still.
- **Interface:** *Tennis*'s umpire-and-scoreline presentation: white-on-black pixel text in a
  status band, the NES pixel font era 2 already draws.

### SCENE

- **Where:** a floodlit night hall with a table tennis table filling it, seen from overhead. The
  floor is `era2-court.png`: the pixellab generation's teal floor and its dark tile grid, and
  nothing else, and it is now read as the table's top. (The generation was a football pitch, and
  item 1259 painted out every pitch marking offline.) As landed, item 1259 draws *Tennis*'s court
  lines over it in code, in `$10` (darker than the ball's `$30` core): a baseline at each end in
  front of the paddles, doubles sidelines along the top and bottom walls with the singles sidelines
  inside them, a service line on each side of the net, the centre service line between them and a
  centre mark on each baseline, inside the white border and with the dotted net between two posts.
  **Rung 2 turns that into a table.** It keeps the white border as the table's edge lines, with the
  ends moved to the paddles' outer faces (x 32 and 768). It keeps the dotted net and its posts,
  which stay the game's centre line, and runs the centre service line from end to end as the
  table's centre line. It paints out the baselines, the service lines, the singles sidelines and the
  centre marks.
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
- **Silhouette:** 10 x 44 sheet pixels: head 8 x 9 with the headband or cap, torso 8 x 14, legs 2
  at 3 x 16, a 1-pixel black outline on the outside edge only (NES sprites had none; *Super Mario
  Bros.* drew one in the palette).
- **How it holds the bat:** one fist on the end of the handle, which comes 3 native pixels off
  the paddle's outer face at its middle (rung 2); the other arm free.
- **idle:** a knee bend, 2 frames. **move:** a shuffle, feet apart and together. **swing:** the
  body turns side-on for the contact frame, the fists jump 6 pixels up the paddle. **miss:** the
  head turns away, shoulders slump 2 pixels. **win:** a fist in the air, the *Duck Hunt* dog's
  held pose, with the hop.
- **Sheet:** `frame` 10 x 44, `hand` (10, 22), `scale` 3.125, `fps` 7.5, the default frames: a
  30 x 264 sheet.

### BALL

A **table tennis ball** sprite (rung 2): 4 x 5 native pixels (12 field units) in `$30` white. At
that size a tennis ball and a table tennis ball are the same sprite, so the `$38` seam pixel is
dropped with the tennis lines. It is drawn over era 2's existing pixellab ball when it has decoded, and a 4 x 2
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
| 1 | `era2-players-left` | 30 x 264, 3 x 6 frames of 10 x 44 | 31 x 138 field units, NES palette | the left player's sheet, `single color black outline`, `basic shading` |
| 1 | `era2-players-right` | 30 x 264 | 31 x 138 field units | the right player's sheet |
| 1 | `era2-crowd` | 96 x 32, 3 cells of 32 x 32 | 3 patterns, 8 x 8 tiles, 3 colours | the crowd patterns, quantised to `$0C`, `$1C`, `$2D` |
| 1 | `era2-umpire` | 32 x 48 | 16 x 24 native | the chair and the umpire, two head positions drawn in code |
| 2 | re-roll reserve | -- | -- | for a strip that comes back wrong |

Each image is reduced to the NES palette by a derived step like `era2-nes-quantize.mjs` (0
generations). Drawn in code instead: the status band, the umpire's calls, the ball's seam and
shadow and the flashes. The court, net and ball sprite already on master stay.

---

## Era 3: 1989 Sega Genesis

**Realism rung 3 of 10: a drawn table with every marking.** Still flat and top-down: a table-tennis blue top (snapped to the 512 colours) with white edge and centre lines, the net as a band with its posts and a shadow, set on the torch-lit arena's stone floor. The ball is the landed chrome orb, its shadow now on the blue. The bats read as bats: the inner half of each bar is rubber in the earned ink, the outer half black rubber, with a wood line between and a handle 4 native pixels long. The barbarian and the knight stay, as side figures holding the bats by their handles. Card 1267 builds it (the realism ladder, sections 7 to 9).

### FLAGSHIP LOOK

Style targets: *Altered Beast* (1989, the launch pack-in), *Golden Axe* (1989 on the Genesis) and
*Ghouls 'n Ghosts* (1989). What the era borrows:

- **How much is on screen:** two scrolling planes, big sprites, a life-bar interface; more on
  screen than the NES by a factor of about two.
- **Palette:** the 512-colour, 3-bit-a-channel palette era 3 already snaps to (values `00`, `24`,
  `49`, `6d`, `92`, `b6`, `db`, `ff`); **4 palettes of 15 colours plus transparent**, so each
  player has 15 colours.
- **Sprite size:** players are 12 x 52 sheet pixels, about 12 x 50 Genesis pixels on screen --
  *Golden Axe*'s heroes are about that tall on a 224-line screen.
- **Animation:** `fps` 10 over the default frames (2 a beat, 3 for the swing).
- **Interface:** *Golden Axe*'s bottom panel: portraits, bars of magic pots, a stone frame; here
  shifted to the top so it stays off play (rule R8's spirit in 2D).

### SCENE

- **Where:** a torch-lit stone arena at night, the court of a fantasy castle.
- **What fills the frame:** the two parallax planes era 3 draws now -- the far plane (the
  pixellab night court, stars and the distant range, drifting at one third of the near speed) and
  the near plane of hills at 18 units a second -- with the near plane replaced by an **arena
  wall**: a band of stone blocks 24 native lines tall across the top, with **4 torches** on it at x
  100, 300, 500 and 700 field units. The floor is stone, and the table (rung 3) fills the play
  area on it, its ends at the paddles' outer faces.
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
- **Silhouette:** 12 x 52 sheet pixels: a broad-shouldered V (shoulders 12 wide, waist 7), head 7 x 9,
  stepped two-tone shading (lit toward the centre, one palette step darker away from it), 1-pixel
  dark outline in the palette's darkest.
- **How it holds the bat:** by the handle, in the near fist at the paddle's middle (rung 3 retires
  the tower-shield grip); the far arm raised in guard.
- **idle:** a breathing heave, shoulders up 1 pixel. **move:** a crouched step, 2 frames.
  **swing:** a *Golden Axe* shield bash -- the body lunges 2 pixels toward the paddle, the smear
  (shared rule 1) in the palette's lightest orange. **miss:** knocked back 3 pixels, knees bent.
  **win:** the barbarian raises an axe, the knight a sword, above the head, with the hop.
- **Sheet:** `frame` 12 x 52, `hand` (12, 26), `scale` 2.6, `fps` 10, the default frames: a 36 x
  312 sheet.

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
| 1 | `era3-players-left` | 36 x 312, 3 x 6 frames of 12 x 52 | 31 x 135 field units, 15 colours | the barbarian's sheet, `single color black outline`, `medium shading` |
| 1 | `era3-players-right` | 36 x 312 | 31 x 135 field units | the knight's sheet |
| 1 | `era3-arena-wall` | 320 x 48 | 320 x 24 native band, tiled | the near plane's stone wall |
| 1 | `era3-torch` | 48 x 32, 3 cells of 16 x 32 | 8 x 16 native | the torch's three flame frames |
| 1 | `era3-portraits` | 64 x 32, 2 cells of 32 x 32 | 16 x 16 native each | the two portraits |
| 1 | `era3-panel` | 320 x 32 | 320 x 16 native | the stone score panel, reduced to 512 colours |
| 2 | re-roll reserve | -- | -- | for a strip that comes back wrong |

Each image is snapped to the 512 colours offline (0 generations). Drawn in code instead: the
magic pots, the pennants, every flash, and the stand-ins for all of it until
the images decode. The far plane and the chrome ball on master stay.

---

## Era 4: 1991 Super Nintendo

**Realism rung 4 of 10: the table in perspective.** The whole table top is tilted back in play with Mode 7, the far edge at least 0.85 as wide as the near edge, with the net and lines foreshortened on it; the dusk sky, mountains and checker floor stay round it. The ball is the landed glowing orb, its shadow on the table. The bats are rung 3's, foreshortened. Each pilot is seen from the waist up behind its end: the table's end hides the hover pad, the flame and the legs in play, so the beats that move them read in the torso's bob and lean instead. Card 1267 builds it (the realism ladder, sections 7 to 9, and the snag about cropping the figures).

### FLAGSHIP LOOK

Style targets: *Super Mario World* (1991 in North America), *F-Zero* (1991) and *Pilotwings*
(1991). What the era borrows:

- **How much is on screen:** a Mode 7 floor under a sky, big bright sprites, a translucent
  interface -- colour math was the SNES's showpiece.
- **Palette:** 15-bit colour, 256 on screen; **8 sprite palettes of 15 colours**, so each player
  has 15, with the soft, saturated ramps of *Super Mario World*.
- **Sprite size:** 10 x 44 sheet pixels, about 10 x 51 Super Nintendo pixels on screen.
- **Animation:** `fps` 12 over the default frames (2 a beat, 3 for the swing): quick and bouncy.
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
- **Silhouette:** 10 x 44 sheet pixels: a round helmet 8 x 8 with a dark visor band, a slim suit,
  the pad an ellipse 10 x 3 at the feet with its flame 3 x 5 under it.
- **How it holds the bat:** by the handle, one gloved hand at the paddle's outer middle (rung 4
  retires the energy-board grip); the other arm out for balance.
- **idle:** the pad bobs 1 pixel, the flame flickers 2 frames. **move:** the body leans 2 pixels
  into the travel, the flame stretches to 8 pixels. **swing:** a spin -- 3 frames of the pilot
  turning, *F-Zero*'s spin attack. **miss:** the pad dips 3 pixels and the flame gutters.
  **win:** a *Super Mario World* victory pose, both arms up, the flame at full 10 pixels, with the
  hop.
- **Sheet:** `frame` 10 x 44, `hand` (10, 22), `scale` 3.1, `fps` 12, the default frames: a 30 x
  264 sheet.

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
| 1 | `era4-players-left` | 30 x 264, 3 x 6 frames of 10 x 44 | 31 x 136 field units, 15 colours | the red pilot's sheet on the pad, `single color outline`, `detailed shading` |
| 1 | `era4-players-right` | 30 x 264 | 31 x 136 field units | the blue pilot's sheet |
| 1 | `era4-balloon` | 32 x 32 | 10 x 14 native | one hot-air balloon, the second a palette swap in code |
| 1 | `era4-pylon` | 32 x 32 | 4 x 10 native | the marker pylon |
| 1 | `era4-helmets` | 64 x 32, 2 cells of 32 x 32 | 8 x 8 native each | the two scoreboard icons |
| 1 | `era4-flame` | 32 x 32 | 4 x 6 to 4 x 10 native | the jet flame, stretched in code |
| 2 | re-roll reserve | -- | -- | for a strip that comes back wrong |

Drawn in code instead: the halo, the panels and power bars, the streamers, every blink, and the
flame's stretch. The sky, the Mode 7 floor, the paddle and the ball on master stay.

---

## Era 5: 1994 Sony PlayStation

**Realism rung 5 of 10: real table tennis, in 3D.** The table tennis table in 3D, per the realism ladder's section 8: edge and centre lines, the net on its posts and legs down to a floor, with this era's arena round it and the pulled-back side camera card 1266 sets. The bats are blades with a handle. Both players stand whole behind their ends, 250 units tall, bat in hand. The figure sizes on this page (40 x 90 table units) are the sprite stand-ins'; the polygon player that card 1253 builds is section 8's. Everything else on this page stays.

### FLAGSHIP LOOK

Style targets: *Ridge Racer* (1994, the Japanese launch), *Tekken* (1995 on the PlayStation, a
year past the rung; the arcade game is 1994) and *Battle Arena Toshinden* (1995 in Japan). What
the era borrows:

- **How much is on screen:** one lit 3D arena, two polygon fighters, a few hundred flat-shaded
  triangles in all.
- **Palette:** 15-bit colour through ERAS.md's era 5 palette; each fighter adds 3 colours
  *(new)* of its own.
- **Figure size:** a 20 x 45 sheet frame drawn 40 x 90 table units, painted as a low-poly figure
  of about 30 visible flat faces, snapped to the 2.5-pixel chunk grid (TREATMENT).
- **Animation:** `fps` 8 and no in-betweens: each frame held hard and then jumped, the choppy
  keyframing of early 3D fighters.
- **Interface:** *Tekken*'s long health bars at the top, and the round text in big chunky
  letters.

### SCENE

- **Where:** a harbour rooftop at night, a *Toshinden* arena with a *Ridge Racer* city behind it.
- **What fills the frame:** ERAS.md's backdrop (the 6-band dithered ramp and the pool of light)
  and table, plus a **skyline** behind the far wall: 10 flat-shaded boxes, 40 to 90 units wide
  and 60 to 200 tall, at world `y` -60 to -120, faces in table texture dark and light, 24 window
  quads in accent yellow at 0.5 opacity.
- **Backdrop layers:** 3 -- the dithered ramp, the skyline, the table with its pool of light.
- **What moves on its own:** **2 searchlight beams** behind the skyline, each a triangle from a
  point on the skyline's roofline, 40 units wide at the top, sweeping plus and minus 25 degrees
  once every 5 s, accent blue at 0.18 opacity; the windows switch, one at a time, every 0.7 s.

### PLAYERS

- **Who:** two martial artists: left in a red gi with a black belt (accent red, `#1a1a1f`, skin
  `#c8906a` *(new)*), right in a blue sleeveless top and grey trousers (accent blue, rail colour,
  skin `#a8704a` *(new)*). Brightest figure colour: the gi's lit face, accent red lit by 0.3,
  never white.
- **Silhouette:** a blocky low-poly fighter, shoulders 12 of the frame's 20 pixels, every face one
  flat colour (lit toward the table, the far side 0.4 darker, the paddles' flat light), the head a
  plain box with a painted face.
- **How it holds the bat:** in a fighting stance, the bat's handle in the lead hand, reaching over
  its end; the rear fist up in guard.
- **idle:** a two-frame stance bob. **move:** the side-step,
  legs split. **swing:** a palm strike -- the lead arm to 80 at contact. **miss:** the stagger,
  torso back 15. **win:** a *Tekken*-style victory: one fist up to 160, the other on the hip.
- **Sheet:** `frame` 20 x 45, `hand` (20, 33), `scale` 2 (table units, so the figure is about 40
  x 90 on the table), `anchor` dz 24 (the paddle box's top), `fps` 8, the default frames: a
  60 x 270 sheet.

### BALL

ERAS.md's era 5 ball, the **low-poly gem** -- an octagon in 8 facets, `#ffffff`, `#dcdcdc` and
`#b4b4b4`, full resolution, drawn last -- as a fighting-game **power gem**. This page adds nothing
to its drawing.

### SCOREBOARD

ERAS.md's score in the block font at cell 6, into the 320 x 240 buffer, kept. Added, inside the
HUD band (R8; each card checks the band's bottom is above the far edge's `y` minus 6 with
`T.project`): two **health bars**, 110 buffer pixels by 4, from the score outward, accent yellow
on `#4a4e59`, that drain one tenth for each point the other side has taken, and `P1` and `CPU`
under them in the block font at cell 2.

### MOMENTS

- **A point scored:** the conceding bar drains with a red chunk that shrinks over 0.4 s
  (*Tekken*'s white-then-red damage) in accent red; the word `POINT` in the block font at cell 8,
  accent yellow with a 1-buffer-pixel red shadow, in the HUD band for 0.8 s; the players play win
  and miss.
- **Match point:** `FINAL ROUND` in the same style, held while `isMatchPoint` holds, and both
  searchlights swing onto the table's centre line and stop.

### TREATMENT

ERAS.md's **wobbly polygons**, all six of them: the 320 x 240 chunk buffer, the affine texture
swim, vertex snapping with the camera wobble, flat and Gouraud shading, dithered gradients and
seam sparkle. The fighters are drawn by the rig after the era's frame, so they are not in the
chunk buffer: the era card draws their sheet with smoothing off and snaps each figure's anchor to
the 2.5-pixel chunk grid, so they jitter with the table. R4 protects only the paddles.

### ASSETS

**Budget:** 6 of 12 generations.

| Gens | Name | pixflux size | In game at | What it is |
| --- | --- | --- | --- | --- |
| 1 | `era5-fighter-left` | 60 x 270, 3 x 6 frames of 20 x 45 | 40 x 90 table units | the red fighter's sheet, `lineless`, `flat shading`, low-poly facets |
| 1 | `era5-fighter-right` | 60 x 270 | 40 x 90 table units | the blue fighter's sheet |
| 1 | `era5-windows` | 64 x 64 | a 64 x 64 tile | the skyline's window texture, affine-mapped |
| 1 | `era5-hud-text` | 128 x 32 | 128 x 32 | `POINT` and `FINAL ROUND` lettering, snapped to the chunk grid |
| 2 | re-roll reserve | -- | -- | for a texture that comes back wrong |

Embedded as data: URIs through `src/textures3d.js`. Drawn in code instead: the figures' chunk-grid
snap, the skyline boxes, the searchlights, the health bars and the damage chunk.

---

## Era 6: 1996 Nintendo 64

**Realism rung 6 of 10: real table tennis, in 3D, in toy colours and fog.** The table tennis table in 3D, per the realism ladder's section 8: edge and centre lines, the net on its posts and legs down to a floor, with this era's arena round it and the pulled-back side camera card 1266 sets. The bats are blades with a handle. Both players stand whole behind their ends, 250 units tall, bat in hand. The figure sizes on this page (40 x 90 table units) are the sprite stand-ins'; the polygon player that card 1254 builds is section 8's. The players are fogged at their own depth as the TREATMENT below says.

### FLAGSHIP LOOK

Style targets: *Super Mario 64* (1996), *Wave Race 64* (1996) and *Pilotwings 64* (1996). What
the era borrows:

- **How much is on screen:** a whole toybox world to the horizon, cut off by fog; round, smooth
  low-poly characters.
- **Palette:** ERAS.md's era 6 toy colours; each character 3 colours *(new)* plus the palette.
- **Figure size:** a 20 x 45 sheet frame drawn 40 x 90 table units: a **chunky mascot**, the head
  30% of the height, every limb rounded and Gouraud-smooth like the paddles' capped ends.
- **Animation:** `fps` 6, squash and stretch drawn into the frames: each beat's second frame 5%
  shorter and wider (*Super Mario 64*'s squash).
- **Interface:** big outlined numbers and a round pie-slice power meter.

### SCENE

- **Where:** a grassy toy park on a sunny afternoon.
- **What fills the frame:** ERAS.md's sky, 3 fogged hills and 2 drifting clouds, plus **2
  flagpoles just beyond the end rails**, at world `(-40, 150)` and `(840, 150)`, 90 units tall,
  toy yellow poles with a triangular pennant 30 x 20 in toy blue (left) and toy green (right),
  fogged at their depth like the rails.
- **Backdrop layers:** 3 -- sky, hills, the table with its poles.
- **What moves on its own:** the clouds at 4 units a second (ERAS.md); the pennants wave, their
  tip swinging plus and minus 6 units at 1.5 times a second; **3 butterflies** in toy yellow, 4
  units wide, circling above the far hills on a 60-unit loop every 8 s, fogged.

### PLAYERS

- **Who:** left, a round **penguin** in a red scarf (body `#1f3fbf` HUD outline blue, belly
  cloud-soft `#f4f0e0` *(new)*, scarf rail red); right, a round **frog** in a yellow cap (toy
  green, toy yellow, `#9ee6a0` *(new)* belly). Brightest figure colour: the penguin's belly,
  `#f4f0e0`, below the ball's white.
- **Silhouette:** a big round head on a pear-shaped body, stubby arms, drawn smooth.
- **How it holds the bat:** by the handle in one flipper or hand, reaching over its end; the other
  held out for balance.
- **idle:** a waddle-bob, squashing 5% at the bottom of each bob. **move:** a hop-step, the body
  tilting 12 into the travel. **swing:** a belly bump -- the body lunges 6 units toward the paddle
  at contact. **miss:** a spin-out, drawn mid-turn with 3 stars round the head (miss is one frame).
  **win:** a *Super Mario 64* jump -- up to `z` 12, arms up, with a 3-frame squash on landing.
- **Sheet:** `frame` 20 x 45, `hand` (20, 33), `scale` 2 (table units, so the figure is about 40
  x 90 on the table), `anchor` dz 24 (the paddle box's top), `fps` 6, the default frames: a
  60 x 270 sheet.

### BALL

ERAS.md's era 6 ball, the **smooth sphere**: a radial gradient from the hot spot, `#ffffff` to
`#ffe9a8` to `#f0b020`, radius 0.9 times the ball's size -- a toy rubber ball. Nothing added to
its drawing.

### SCOREBOARD

ERAS.md's toy-outlined score at cell 12, kept. Added in the HUD band: under each score a **power
meter**, a circle of radius 14 page pixels in 8 pie slices, one lit per rally hit (toy yellow on
toy blue at 0.6), resetting at the serve, outlined 2 pixels in HUD outline.

### MOMENTS

- **A point scored:** ERAS.md's rumble shake (amplitude 6, 0.25 s); **5 toy-yellow stars**, 8
  page pixels wide, pop from the scorer's paddle and arc up and out over 0.6 s; the players play
  win and miss.
- **Match point:** the power meters spin once a second, and the sky's horizon colour pulses
  toward toy yellow at 0.15 opacity, once a second.

### TREATMENT

ERAS.md's **fog** (full from `d` 0.85, the scenery beyond fully fogged) and **bilinear smear**,
and the rumble. The players are drawn by the rig after the era's frame, so the era card fogs
them there: a fill of `T.fogColour` at the paddle's depth over the figure (`'source-atop'` on the
figure's own copy), at that depth's fog amount **capped at 0.35**, as the paddles are, and the
sheet drawn with smoothing on, smeared like the table.

### ASSETS

**Budget:** 6 of 12 generations.

| Gens | Name | pixflux size | In game at | What it is |
| --- | --- | --- | --- | --- |
| 1 | `era6-penguin` | 60 x 270, 3 x 6 frames of 20 x 45 | 40 x 90 table units, smoothed | the penguin's sheet, `medium shading` |
| 1 | `era6-frog` | 60 x 270 | 40 x 90 table units | the frog's sheet |
| 1 | `era6-pennants` | 64 x 32, 2 cells | 32 x 32 | the two pennant faces |
| 1 | `era6-star` | 32 x 32 | 8 page px | the pop star, drawn smoothed |
| 2 | re-roll reserve | -- | -- | for a texture that comes back wrong |

Drawn in code instead: the players' fog, the poles, the butterflies, the power
meters and the shake.

---

## Era 7: 1999 Sega Dreamcast

**Realism rung 7 of 10: real table tennis, in 3D, cel-shaded.** The table tennis table in 3D, per the realism ladder's section 8: edge and centre lines, the net on its posts and legs down to a floor, with this era's arena round it and the pulled-back side camera card 1266 sets. The bats are blades with a handle. Both players stand whole behind their ends, 250 units tall, bat in hand. The figure sizes on this page (40 x 90 table units) are the sprite stand-ins'; the polygon player that card 1255 builds is section 8's. The table's lines, net and legs are ink-outlined like every other shape.

### FLAGSHIP LOOK

Style targets: *Soulcalibur* (1999), *Sonic Adventure* (1999 in North America) and *Jet Set
Radio* (2000, a year past the rung: the cel-shaded, graffiti look ERAS.md already gives the era).
What the era borrows:

- **How much is on screen:** a crisp 640 x 480 city, bold flat colour, ink outlines, big type.
- **Palette:** ERAS.md's poster colours, **no gradients anywhere** -- flat fills and 2-band cel
  shading only.
- **Figure size:** a 24 x 54 sheet frame drawn 40 x 90 table units, **long legs** (45% of the
  height) and a skate under each foot, ink-outlined 1 sheet pixel.
- **Animation:** `fps` 10, each frame a sharp held pose -- *Soulcalibur*'s poses rather than
  tweening.
- **Interface:** graffiti numbers and tags.

### SCENE

- **Where:** a rooftop skate spot above a city at sunset.
- **What fills the frame:** ERAS.md's 3 flat sky bands and its skyline of 9 seeded purple
  rectangles, plus **3 poster billboards** on the skyline, each 60 x 30 units, flat poster
  colours, ink-outlined, and a **water tower** (a box 40 x 40 x 70 on 4 legs) at world `(700,
  -80)`.
- **Backdrop layers:** 3 -- sky bands, skyline with billboards, the table's 3 depth bands.
- **What moves on its own:** **12 window lights** on the skyline in poster yellow, each toggling
  every 0.5 to 2 s (seeded); a **blimp** 80 x 24 units in poster blue crossing the sky band at 12
  units a second, wrapping every 70 s.

### PLAYERS

- **Who:** two **inline skaters** in the *Jet Set Radio* manner: left in a swirl-orange jacket
  and big headphones, right in a poster-blue hoodie and a beanie, both in poster-yellow skates.
  Brightest figure colour: poster yellow; **no paper white on a figure** (R1: paper white is the
  ball's luminance).
- **Silhouette:** tall and lean with big feet: long legs, the headphones two 4 x 4 x 4
  boxes on the head, the hood a 12 x 12 x 6 box behind it.
- **How it holds the bat:** one-handed by the handle, at arm's length over its end; the free arm
  out for balance at 60.
- **idle:** rolling on the spot, the skates sliding 2 units back and forth. **move:** a skating
  stride, legs split plus and minus 25. **swing:** a spin -- the figure turns 180 and back across the
  swing's 3 frames, the paddle hand leading. **miss:** a stumble, torso forward 20 then back. **win:** a
  trick jump to `z` 10 with a 360 turn, the landing pose its second frame.
- **Sheet:** `frame` 24 x 54, `hand` (24, 40), `scale` 1.667 (table units, so the figure is about 40
  x 90 on the table), `anchor` dz 24 (the paddle box's top), `fps` 10, the default frames: a
  72 x 324 sheet.

### BALL

ERAS.md's era 7 ball: **two cel bands** (a white circle, the ball shade band offset inside it,
the ink outline at width 2), its hard contact shadow, the comic **speed lines** behind it and the
**impact starburst** on a hit. Nothing added to its drawing.

### SCOREBOARD

ERAS.md's graffiti score (cell 13, skewed, extruded in magenta, ink outline, drips), kept. Added
under each number: a **tag** -- `P1` and `CPU` in the block font at cell 4, same skew, poster
cyan fill, ink outline -- and a row of **3 spray-can icons** 10 x 18 page pixels, one filled per 3
rally hits.

### MOMENTS

- **A point scored:** a **paint splat** in poster magenta, 90 x 60 page pixels, stamped behind the
  scorer's number in the HUD band and fading over 1.2 s; the blimp's side flashes the new score
  for 1 s; the players play win and miss.
- **Match point:** the sky bands swap order (magenta top, yellow bottom) and both tags blink 4
  times a second.

### TREATMENT

ERAS.md's **cel shading with thick ink outlines**: outline mode on for every shape (the players
carry theirs in the sheet: a 1-pixel ink outline and 2 flat bands), banded shading with the hard edge 40% down each face, flat poster
fills and the speed lines -- all at 640 x 480 with no smoothing.

### ASSETS

**Budget:** 7 of 12 generations. Cel shading is code for the scene; the skaters are generated as
flat, outlined sheets.

| Gens | Name | pixflux size | In game at | What it is |
| --- | --- | --- | --- | --- |
| 1 | `era7-skater-left` | 72 x 324, 3 x 6 frames of 24 x 54 | 40 x 90 table units | the orange skater's sheet, `single color black outline`, `flat shading` |
| 1 | `era7-skater-right` | 72 x 324 | 40 x 90 table units | the blue skater's sheet |
| 1 | `era7-decals` | 64 x 32, 2 cells of 32 x 32 | 32 x 32, flat | the scoreboard tags' spray marks: original graffiti, no real logo |
| 1 | `era7-posters` | 192 x 32, 3 cells of 64 x 32 | 60 x 30 units each | the three billboards, `lineless`, `flat shading` |
| 1 | `era7-spraycan` | 32 x 32 | 10 x 18 page px | the scoreboard icon |
| 2 | re-roll reserve | -- | -- | for a decal that comes back wrong |

Drawn in code instead: the water tower, the blimp, the windows, the
tags and the splat.

---

## Era 8: 2000 PlayStation 2

**Realism rung 8 of 10: real table tennis, in 3D, in the letterbox.** The table tennis table in 3D, per the realism ladder's section 8: edge and centre lines, the net on its posts and legs down to a floor, with this era's arena round it and the pulled-back side camera card 1266 sets. The bats are blades with a handle. Both players stand whole behind their ends, 250 units tall, bat in hand. The figure sizes on this page (40 x 90 table units) are the sprite stand-ins'; the polygon player that card 1256 builds is section 8's. Both players' heads stay inside the picture between the bars (the rig's clip, item 1249), and the table, net and legs are reflected in the slab.

### FLAGSHIP LOOK

Style targets: *SSX* (2000), *Tekken Tag Tournament* (2000 on the PlayStation 2) and *Metal Gear
Solid 2* (2001, a year past the rung: the film look ERAS.md gives the era). What the era borrows:

- **How much is on screen:** a moody night set, particles everywhere, a letterboxed frame.
- **Palette:** ERAS.md's era 8 navy, slate and amber; the players add 2 colours *(new)*.
- **Figure size:** a 24 x 54 sheet frame drawn 40 x 90 table units, standard proportions, **soft
  edges**: a 1-pixel bevel in the slab's sheen colour round every form.
- **Animation:** `fps` 8, the frames drawn as motion-captured poses: the head and arms a beat
  behind the torso from frame to frame.
- **Interface:** film subtitles and codec-style name plates in the letterbox bars.

### SCENE

- **Where:** a helipad on a skyscraper roof at night, in the rain.
- **What fills the frame:** ERAS.md's letterbox, glossy slab, dust motes, lens flare and
  reflections, plus a **skyline** of 8 slate towers, 120 to 300 units tall, at world `y` -100
  to -200, with **30 amber window lights** at 0.5 opacity; and **rain**.
- **Backdrop layers:** 3 -- the deep-navy sky, the towers, the slab.
- **What moves on its own:** **rain**, 50 streaks, each a 1-pixel line 12 page pixels long,
  slate at 0.25 opacity, falling at 900 page pixels a second with a 10-degree slant, seeded and
  wrapping, drawn at step 6 before the letterbox; the dust motes and the camera drift
  (ERAS.md); a **searchlight** from behind the towers, a triangle in flare blue at 0.08 sweeping
  once every 9 s.

### PLAYERS

- **Who:** two **operatives** in sneaking suits: left in midnight with an amber visor (amber
  light at 0.8), right in slate with a flare-blue visor. Brightest figure colour: the visor,
  amber light or flare blue at 0.8 -- never white.
- **Silhouette:** lean and tall, a tactical belt (a box 10 x 16 x 3 at the waist), the visor a
  box 2 units deep across the head's front.
- **How it holds the bat:** low and ready, the handle in the near hand at hip height; the other
  hand open beside it.
- **idle:** a slow breath, 1.5-unit bob every 2 s (half the shared rate). **move:** a crouched
  run, legs split plus and minus 20, torso forward 15. **swing:** a shoulder charge into the
  paddle. **miss:** the head turns to follow the ball out. **win:** a two-finger salute,
  one arm to 120, both frames.
- **Reflections:** each player's frame drawn a second time, flipped vertically about its feet, at
  0.18 opacity before the real one, as the paddles' reflections are (ERAS.md).
- **Sheet:** `frame` 24 x 54, `hand` (24, 40), `scale` 1.667 (table units, so the figure is about 40
  x 90 on the table), `anchor` dz 24 (the paddle box's top), `fps` 8, the default frames: a
  72 x 324 sheet.

### BALL

ERAS.md's era 8 ball: the white core with its **alpha-glow trail** of 10 points and its amber
halo -- an **amber tracer** crossing the dark. Nothing added to its drawing.

### SCOREBOARD

ERAS.md's subtitle score in the top bar (cell 5, HUD ink at 0.85), kept. Added in the **bottom
bar**: two codec **name plates**, each 140 x 28 page pixels, `#0b1020` with a 1-pixel slate edge,
at x 40 and 620, `P1` and `CPU` in the block font at cell 3 in HUD ink with a 20 x 20 visor icon
beside it in that player's visor colour.

### MOMENTS

- **A point scored:** the top bar's subtitle types `POINT - P1` or `POINT - CPU` one letter every
  0.03 s, holding 1 s; the sparks burst a second time at the point's exit, 24 more; the players
  play win and miss.
- **Match point:** the subtitle reads `MATCH POINT` in amber light, and the rain doubles to 100
  streaks.

### TREATMENT

ERAS.md's **cinematic letterbox** (52 pixels top and bottom), the spark particles, the glow trail,
the slow drift, the lens flare, the dust and the glossy reflections. The players are drawn by the rig
after the era's frame, so the era card clips them to the picture between the bars (`y` 52 to 548)
and bakes the slab's sheen and the navy grade into their sheet.

### ASSETS

**Budget:** 6 of 12 generations.

| Gens | Name | pixflux size | In game at | What it is |
| --- | --- | --- | --- | --- |
| 1 | `era8-suit-left` | 72 x 324, 3 x 6 frames of 24 x 54 | 40 x 90 table units, smoothed | the midnight operative's sheet, `detailed shading` |
| 1 | `era8-suit-right` | 72 x 324 | 40 x 90 table units | the slate operative's sheet |
| 1 | `era8-skyline` | 400 x 100 | a 400 x 100 plate, smoothed | the towers and their windows at night |
| 1 | `era8-visor-icons` | 64 x 32, 2 cells | 20 x 20 page px | the name plates' icons |
| 2 | re-roll reserve | -- | -- | for a texture that comes back wrong |

Drawn in code instead: the reflections and the letterbox clip, the rain, the searchlight, the
name plates and the typed subtitle.

---

## Era 9: 2001 Xbox

**Realism rung 9 of 10: real table tennis, in 3D, lit by the ball.** The table tennis table in 3D, per the realism ladder's section 8: edge and centre lines, the net on its posts and legs down to a floor, with this era's arena round it and the pulled-back side camera card 1266 sets. The bats are blades with a handle. Both players stand whole behind their ends, 250 units tall, bat in hand. The figure sizes on this page (40 x 90 table units) are the sprite stand-ins'; the polygon player that card 1257 builds is section 8's. The net and legs cast hard shadows from the ball's light as the paddles do (R5: lighter than the contact shadow). The gamertags stay at `z` 60 over the paddles, so with rung 9's players they sit at chest height, not head height.

### FLAGSHIP LOOK

Style targets: *Halo: Combat Evolved* (2001), *Dead or Alive 3* (2001) and *Project Gotham
Racing* (2001). What the era borrows:

- **How much is on screen:** hard metal surfaces, a light that moves, every surface lit
  per pixel.
- **Palette:** ERAS.md's era 9 black, steel and green; the players take it whole, one colour
  *(new)*.
- **Figure size:** a 24 x 54 sheet frame drawn 40 x 90 table units, **armoured**: broad shoulder
  pads, the helmet 20% of the height.
- **Animation:** `fps` 6, heavy and weighted: the swing's middle frame, the contact, is the widest
  pose.
- **Interface:** *Halo*'s segmented shield bar and name tags over the players.

### SCENE

- **Where:** a starship hangar deck.
- **What fills the frame:** ERAS.md's black backdrop and faint green horizon line, plus a **hangar
  wall** behind the far rail: 6 steel ribs, boxes 12 x 12 x 160 units at world `y` -60, `x` 50 to
  750 evenly, in steel with the plate tile; **2 beacon posts** just beyond the end rails at world
  `(-30, 60)` and `(830, 60)`, 60 units tall.
- **Backdrop layers:** 3 -- the black and its horizon line, the ribbed wall, the diamond-plate
  table.
- **What moves on its own:** the **beacons** rotate, a green-glow wedge sweeping once every 2 s;
  **steam vents** at the foot of ribs 2 and 5 puff every 3 s, 5 steel-light circles rising 40 units
  and fading over 1 s at 0.3.

### PLAYERS

- **Who:** left, a **space marine** in gunmetal armour with green trims and a mirrored visor in
  specular colour at 0.7; right, a tall **steel cyborg** with a single shield-alarm-red eye slit.
  Brightest figure colour: the visor's specular, `#e8ffe0` at 0.7, never the ball's white at full.
- **Silhouette:** broad and top-heavy: the shoulder pads, a helmet box 11 x 11 x 11, the visor a
  box 2 deep across its front.
- **How it holds the bat:** in the armoured lead fist by its handle (rung 9 retires the
  energy-shield grip); the other hand at the belt.
- **idle:** a weapon-ready bob, 1 unit. **move:** a strafing step, legs split plus and minus 18,
  torso level. **swing:** a melee bash, the shield arm to 80, the contact frame the widest.
  **miss:** the armour flashes shield alarm red on its outline for 0.3 s and the torso rocks back.
  **win:** a single fist pump to 160, both frames.
- **Shadows and light:** each player casts one hard shadow from the ball's moving light, a quad
  40 units long from its feet away from the light in `#000000` at 0.30 (lighter than the paddles'
  0.45, R5), and when the ball is within 160 units its frame is drawn a second time with
  `'lighter'` at 0.35 -- the specular pool reaching the armour (ERAS.md's bump map).
- **Sheet:** `frame` 24 x 54, `hand` (24, 40), `scale` 1.667 (table units, so the figure is about 40
  x 90 on the table), `anchor` dz 24 (the paddle box's top), `fps` 6, the default frames: a
  72 x 324 sheet.

### BALL

ERAS.md's era 9 ball: the white core that **is the light** -- the pool, the specular stripe on
the paddles and every hard shadow follow it. Nothing added to its drawing.

### SCOREBOARD

ERAS.md's shield bars (10 skewed segments each, the total beside them), kept, and its gamertags at
`z` 60 over each paddle -- which float at the players' head height, as the tags of
*Halo*'s multiplayer did. Added: a **motion-tracker dot** 12 page pixels across in the HUD band's
centre, a green ring with a green-glow dot at the ball's `x` along its width.

### MOMENTS

- **A point scored:** ERAS.md's shield-alarm flash and recharge on the conceding bar; the beacons
  turn shield-alarm red for 1 s; the players play win and miss.
- **Match point:** the beacons stay red, the gamertags' borders pulse green glow once a second, and the steam
  vents blow continuously.

### TREATMENT

ERAS.md's **bump-mapped metal** with the moving specular pool, the **hard dynamic shadows** and
the **green glow** -- the players' sheet carries the plate's emboss baked in, the pool's glint is
the second pass above, and their outlines are not stroked with `shadowBlur` (the era's two blurs stay the paddles').

### ASSETS

**Budget:** 6 of 12 generations.

| Gens | Name | pixflux size | In game at | What it is |
| --- | --- | --- | --- | --- |
| 1 | `era9-armour-left` | 72 x 324, 3 x 6 frames of 24 x 54 | 40 x 90 table units | the marine's sheet, `detailed shading`, the plate emboss drawn in |
| 1 | `era9-armour-right` | 72 x 324 | 40 x 90 table units | the cyborg's sheet |
| 1 | `era9-hangar` | 400 x 80 | a 400 x 80 plate | the hangar wall between the ribs |
| 1 | `era9-beacon` | 32 x 64 | 32 x 64 | the beacon post's face |
| 2 | re-roll reserve | -- | -- | for a texture that comes back wrong |

The landed `tex3d-court-metal` stays the table's. Drawn in code instead: the players' shadows and glint pass,
the ribs, the rotating wedge, the steam, the tracker and every flash.

---

## Era 10: 2005 Xbox 360

**Realism rung 10 of 10: real table tennis, in 3D, with every post-process.** The table tennis table in 3D, per the realism ladder's section 8: edge and centre lines, the net on its posts and legs down to a floor, with this era's arena round it and the pulled-back side camera card 1266 sets. The bats are blades with a handle. Both players stand whole behind their ends, 250 units tall, bat in hand. The figure sizes on this page (40 x 90 table units) are the sprite stand-ins'; the polygon player that card 1258 builds is section 8's. The top of the ladder: the table, net and players all under the bloom, the grade and the grain.

### FLAGSHIP LOOK

Style targets: *Project Gotham Racing 3* (2005), *Perfect Dark Zero* (2005) and *Gears of War*
(2006, a year past the rung: the brown-and-grey grade ERAS.md gives the era). What the era
borrows:

- **How much is on screen:** HD detail everywhere, every post-process effect at once, a ruined
  world behind the action.
- **Palette:** ERAS.md's era 10 umber, mud, concrete, ash and blade green, through the grade.
- **Figure size:** a 32 x 66 sheet frame drawn 44 x 90 table units, **bulked**: huge pads and a
  small head (15% of the height) -- the first era with room for detail.
- **Animation:** `fps` 8, follow-through drawn into the frames: the arms a beat behind the torso,
  the up and down rows carrying a side sway.
- **Interface:** the Blades, gamerpics and the achievement toast.

### SCENE

- **Where:** a bombed-out city plaza at sunset.
- **What fills the frame:** ERAS.md's HDR sun behind the far wall and the concrete slab, plus a
  **ruin**: 6 broken columns (boxes 20 x 20 x 80 to 160 units, tops cut at seeded angles) at
  world `y` -60 to -140 in umber and mud, and a **torn banner** 60 x 90 units on the second
  column, drawn into the depth-of-field buffer so it is soft.
- **Backdrop layers:** 3 -- the sun and sky, the ruin (soft, in the DOF buffer), the slab.
- **What moves on its own:** **40 ash flakes** drifting down at 8 to 20 page pixels a second,
  1 to 2 pixels, ash at 0.3 opacity, seeded and wrapping; the banner's lower edge ripples plus and
  minus 4 units at 0.8 times a second; the sun's bloom breathes plus and minus 5% every 6 s.

### PLAYERS

- **Who:** two **heavy soldiers** in battered armour: left with blade-green trims, right with
  ash-grey trims and a mud-brown cloth hood. Brightest figure colour: the rim light, HDR sun at
  0.6 -- never bloom white.
- **Silhouette:** a wide wedge -- the huge pads, a chest plate box 16 x 16 x 4 over the torso, thick
  forearms (5 x 5 x 11).
- **How it holds the bat:** by the handle in the lead hand, crouched low behind its end -- the
  cover crouch the era is remembered for, without the cover; the free hand on the knee.
- **idle:** a heavy breath, the pads rising 1 unit every 2 s. **move:** a roadie run, torso forward
  25, legs plus and minus 20. **swing:** a mantle-and-shove, the torso up over the paddle's top
  edge to 80 and back. **miss:** a flinch, the head down 30 and the arms up to shield it.
  **win:** a slow fist to the chest, then up to 160, the two frames.
- **Rim lights:** each player's sun side carries a 1-pixel HDR-sun rim at 0.6, drawn into the
  sheet, and one `'lighter'` pass of the frame at 0.25 over it gives the glow.
- **Sheet:** `frame` 32 x 66, `hand` (32, 48), `scale` 1.36 (table units, so the figure is about 40
  x 90 on the table), `anchor` dz 24 (the paddle box's top), `fps` 8, the default frames: a
  96 x 396 sheet.

### BALL

ERAS.md's era 10 ball: the white core with its **motion-blur capsule**, 3 ghost discs and its
blooming halo -- a **tracer round** through the haze. Nothing added to its drawing.

### SCOREBOARD

ERAS.md's Blades (four tabs, the scores in the HD font) and the achievement toast, kept. Added: a
**gamerpic** 24 x 24 page pixels at the top of each of the first two blades -- the left player's
helmet in blade green, the right's in ash -- with a 1-pixel blade-silver frame.

### MOMENTS

- **A point scored:** ERAS.md's toast, `10G - POINT SCORED`; the ash flakes gust sideways at 60
  pixels a second for 0.5 s; the players play win and miss. This is the one era where a point
  does not change the machine.
- **Match point:** the toast reads `MATCH POINT` over `100G - FINISH IT` *(new text; the block
  font fallback must draw each letter)*, the vignette's clear radius tightens from 250 to 220, and
  the feel layer's slow motion plays.

### TREATMENT

ERAS.md's **bloom and grain** and all the rest: HD crispness, multi-scale bloom, the
brown-and-grey grade, the vignette, film grain, motion blur on the ball and depth of field on the
far end. The players are drawn by the rig after the era's frame, so their sheet is generated
pre-graded (brown and grey, the `#c9b89a` tint) and the era card lays the frame's grain tile over
them at 0.12.

### ASSETS

**Budget:** 7 of 12 generations. Pixel art at this resolution is the wrong look, so every image
is generated `highly detailed` and drawn with smoothing on, never shown at its own pixel size.

| Gens | Name | pixflux size | In game at | What it is |
| --- | --- | --- | --- | --- |
| 1 | `era10-armour-left` | 96 x 396, 3 x 6 frames of 32 x 66 | 44 x 90 table units, smoothed | the green-trim soldier's sheet |
| 1 | `era10-armour-right` | 96 x 396 | 44 x 90 table units | the grey-trim soldier's sheet |
| 1 | `era10-ruin` | 400 x 120 | a 400 x 120 plate in the DOF buffer | the broken columns' faces |
| 1 | `era10-banner` | 64 x 96 | 60 x 90 units | the torn banner, an original emblem, no real logo |
| 1 | `era10-gamerpics` | 64 x 32, 2 cells of 32 x 32 | 24 x 24 page px | the two gamerpics |
| 2 | re-roll reserve | -- | -- | for a texture that comes back wrong |

Drawn in code instead: the rim-light glow pass, the grain over the players, the ash, the banner's ripple,
the gamerpic frames and the toast's new text.
