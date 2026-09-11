# Why the realism ladder exists (item 1265)

The ladder is sections 6 to 9 of the art bible, [docs/ART.md](../ART.md). It is one table saying,
for each era, what the playfield is, what the ball and bats look like, where the view sits and how
much of each player you see. This page says why it was written, so the next game that climbs eras
starts with the idea rather than finding it the long way.

## What happened

Tim's first art direction (2026-09-10) was that each era should look like *"a AAA game from that
era, that just happens to be pong"*, and he chose characters holding the paddles. Ten era cards
built that, and each one read its era alone. The contact sheet
([contact-sheet.png](../shots/eras/contact-sheet.png)) shows the result. Every era is rich, but
nothing climbs: the NES is a football pitch (later a tennis court), the Genesis a night sky, the
Super Nintendo a racing floor, and the 3D eras one flat slab that fills the frame, with a small
figure glued to each paddle. Every era looked like its machine. None of them looked like the next
step toward anything.

On 2026-09-11 he gave the direction that runs across the eras: *"i was imagining it starting out
as pong in the atari world and becoming more and more like real life table tennis, where finally
in the 3d eras you can see the characters standing around the tables"*. That is a statement about
the whole climb, and no one era card could carry it. Hence one table, owned by the bible, that
every era card reads before it draws.

## What it taught

- **Give a climb a destination, not just a style per rung.** "Look like that year's flagship"
  makes eleven good pictures. "Walk from pong to table tennis" makes one journey. The second is
  what a player feels as the machine grows up, and it has to be written down once, above the eras,
  or each card optimises its own rung.
- **Look for the reading in which the start already is the destination.** Pong's bar is a table
  tennis bat seen from straight above, blade toward the net. Once that was seen, the ladder needed
  no change to play at all. Each rung only adds what the bar is attached to: a handle, a hand, a
  table under it, and at the top a whole player standing behind it. Pong's ball is already a table
  tennis ball's size on this table (12 units against a real 11.7). A theme that forces the rules to
  bend is the wrong theme for an evolving game. This one fitted because the original was already it.
- **Write the sizes as proportions of real things, then scale them to what the frame can hold.**
  Real scale would make a player 510 units tall, taller than the table is deep. The ladder keeps
  the real ratio (a table top at 0.43 of a player's height) and halves both together. It also names
  the fallback, shrinking both together until the camera passes R3, so the 3D table card never has
  to make a second decision.
- **Readability wins every tie, and say so where the tie is.** A real net would be 45 units tall.
  The ladder takes 24, below the bats, and draws it before the ball every frame. Written down, that
  is a rule a card can follow. Left unsaid, it is a card that builds a real net and then finds the
  ball hidden behind it.
- **Check who owns which file before you give an order.** Era 4's upper-body view cannot be drawn
  by the era file, because the rig draws the players after it. The 3D table card may not place the
  figures, because it does not own the rig. The ladder names each snag beside the card that meets
  it (section 9), which costs one sentence now instead of a blocked run later.

## The 3D table and camera, built (item 1266)

The table in the 3D layer is now section 8's: 6-unit edge lines, a 3-unit centre line end to end,
a see-through net 24 units tall with a solid tape on posts at `y` -20 and 620, and four legs inside
the footprint down to a floor 110 below, shown as a soft shadow so each era's painted ground stays
the floor. `PongField3D.tableGeometry()` returns every piece as a field-space box, so the numbers
are tested without a browser, and the low side view (`docs/shots/item-1266/rally-table-side.png`)
shows them in the real layer. Each era keeps its own camera, and that per-era `CAMERA` is the
override the brief asked for. All six were re-solved by `node tools/table3d-cameras.js --players`.

- **Solve the camera, do not tune it by eye.** The rule was a box, not a feeling: two 250-unit
  players 30 units behind the ends, feet to head inside the picture, and R3 in every pose. Keeping
  each era's tilt within 4 degrees and its lens within 6, the solver found the nearest camera that
  held both players, with R3 passing in about a second per era. No era had to shrink its players.
  The PlayStation 2 needed its drift carried into the search, and the PlayStation needed its arrival
  lift and wobble together, a pose the old list never had. That is how the first solve failed a
  test.
- **A wider view shows the edges of every backdrop.** Three arenas had been built only as wide as
  the old table, or placed where the old table hid them. The Dreamcast's blimp flew at a fixed
  screen `y` 9, behind the score. The Xbox hangar wall stopped at the table's ends. The Xbox 360's
  desert plate stopped 70 pixels short of the left edge. Each fix was one number or one loop. An
  arena drawn in screen space (the blimp) needs checking against the HUD, and an arena drawn in
  world space (the wall) needs checking against the widest camera.
- **Hide the tests' camera numbers behind one table.** Nine tests had copied the old camera
  numbers. They now read `cameras.LADDER`, so the next camera move changes one file.
- **Legs you cannot see still count.** From a play camera, the top hides the legs. They are there for
  the polygon players, whose feet go on that floor, and the side view is how to check them.

## For a one-era game

A table tennis game on a single machine takes that machine's rung from the table in section 7 and
the numbers from section 8. The rest of the ladder is how the rungs join, and a game that never
climbs can leave it out.
