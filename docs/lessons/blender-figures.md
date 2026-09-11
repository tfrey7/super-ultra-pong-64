# Blender figures in the 3D layer (item 1274)

The players on eras 5 to 10 are now real 3D figures. Each is made in Blender by a script, saved as
a standard glTF file with its six moves in it (idle, move up, move down, swing, celebrate, lose the
point), and loaded straight into the 3D layer that draws the table (item 1273). There one figure
stands behind each paddle, bat in hand, lit by the table's light, with a shadow at its feet, wearing
its paddle's colour, and playing the move that matches what its paddle is doing. The contract the
six era figure cards (items 1253 to 1258) build to is [tools/blender/README.md](../../tools/blender/README.md).

The proof figure from item 1248, remade this way, on the Xbox 360 and the PlayStation:
[era10-figures.png](../shots/item-1274/era10-figures.png),
[era5-figures.png](../shots/item-1274/era5-figures.png) and
[era7-figures.png](../shots/item-1274/era7-figures.png) (the Dreamcast). The PlayStation with the old
canvas polygon figure instead (`?figures=off`, the fallback) is
[era5-polygon-fallback.png](../shots/item-1274/era5-polygon-fallback.png). The paddle colours differ
between those two shots because each page load picks its own.

## How it fits in

- **One file per figure, loaded as it is.** `assets/models/<name>.glb` is what Blender's own glTF
  exporter wrote: one skinned mesh, one skeleton, six animations. The page opens off disk and cannot
  `fetch`, so beside it sits `<name>.glb.js`, the same bytes as base64 in one line, which the layer
  adds as a script tag the first time an era asks for that name. `THREE.GLTFLoader.parse` reads the
  bytes, and `THREE.SkeletonUtils.clone` gives each end of the table its own copy with its own
  skeleton and its own `AnimationMixer`. Both were already in `vendor/three.js`.
- **The names are the era's own.** The layer asks `src/characters.js` which figure each side of an
  era wears (`figure`, or until a card sets that, `model`), so no era file and no character block
  changed for this. The proof figure's glTF files share its polygon files' names
  (`player-proof-lo`, `-mid`, `-hi`), so every 3D era picked them up at once.
- **The moves come from the beats.** `src/characters.js` already decides each player's beat from
  the rules' events and the paddle's speed. The layer maps the six beats onto the six clips by name,
  sets the clip's time from the game clock rather than the wall clock, and cross-fades a change over
  0.12 s. So a frame drawn twice, by a ring wipe or by the playtest's offscreen comparison, shows the
  same pose both times.
- **The polygon figure is the fallback, and it never draws twice.** When the layer has stood both
  glTF figures in a frame, it says so once through `PongField3D.takeFigures()`. The polygon renderer
  asks just before it would draw and skips that frame. No WebGL, `?gl=off`, `?figures=off`, or a
  figure whose file has not loaded yet, and it draws exactly as before.
- **Where they stand is the polygon figures' spot.** The idle paddle hand is put on the paddle's
  outer face and the feet on the table's floor level, at the block's `modelScale`, and the
  right-hand player is mirrored. The bat is drawn as tall as that hand. When item 1266 moves the
  camera and the table, the placement changes in one place in the layer.

## What it measured

`node docs/measure/item-1274/figspeed.mjs` times one second of ordinary play at each 3D era, in the
playtest's own headless Chrome (GPU off, WebGL in software), with the glTF figures and with
`?figures=off`. It alternates the two setups era by era, over two rounds, and also counts the frames
in which the layer really stood the figures. The raw readings are in
[figspeed.json](../measure/item-1274/figspeed.json). Mean frame, in ms:

| Era | round 1, glTF figures | round 1, polygon figures | round 2, glTF | round 2, polygon |
| --- | --- | --- | --- | --- |
| 5 PlayStation | 16.67 | 16.67 | 29.04 | 29.05 |
| 6 Nintendo 64 | 16.67 | 16.67 | 32.26 | 34.44 |
| 7 Dreamcast | 16.66 | 17.24 | 37.50 | 41.67 |
| 8 PlayStation 2 | 16.67 | 16.94 | 35.63 | 44.93 |
| 9 Xbox | **19.18** | 16.94 | **51.67** | 43.75 |
| 10 Xbox 360 | 35.71 | 39.74 | 93.94 | 95.45 |

- **Two lit, animated figures cost nothing measurable on five of the six eras**, and on a busy
  machine they are faster than the canvas polygon figures they replace. Round 2 ran while other
  workers loaded the machine, which is why every number roughly doubled. The figures were drawn in
  every frame of every glTF reading (65 of 65 frames, and so on).
- **The Xbox was slower with the figures on both rounds**, and each of those readings had one
  long frame (p95 33 ms, then 333 ms over 20 frames). The Xbox 360 wears the same file and showed no
  such thing, so my suspicion is WebGL building the skinned figure's shader program the first time
  it draws, landing inside the reading on era 9's heavier page. That is the same kind of hitch as
  the bootstrap's section 8a. I did not prove it. The next step is to trace one era 9 page from load
  with `docs/measure/item-1203/trace.mjs`, and if that is the cause, compile the figures during
  load (`renderer.compile`) or ask for their files at page start instead of on first sight.
- The frame-rate lines the playtest fails on eras 5 to 10 in this Chrome are still card 1216's.
  They fail with the polygon figures as well.

## What did not work, or is not done

- **Bone transforms, not a hand-made rig.** The proof figure's joints come from item 1248's pose
  table, where limb lengths change between poses. A chain of connected bones cannot keep those
  lengths, so each body part is a free bone under one root. Each bone is keyed with a position, a
  turn, and a stretch along its own length to match the pose, and every vertex is bound fully to its
  part's bone. It looks right for a proof figure. The real era figures should use a proper connected
  rig with smooth weights, and the contract allows either.
- **Size.** The six clips, sampled 15 times a second over about 5 seconds of animation, are most of
  each file (105 to 120 KB). Sampling at 30 a second made the lo file 131 KB. A file is loaded only
  when an era that wears it is shown.
- **The lighting knob does not reach the figures yet.** An era's `render.lighting` rebuilds the
  table's materials. The figures keep the glTF's own PBR materials, lit by the same sun and fill.
- **The figures stand on the table.** That is where the polygon figures stood, and from the current
  top-down camera the table's ends are cut off at the screen's edges, so on the PlayStation and the
  Dreamcast the heads are clipped. Standing them behind the table ends with a lower camera is item
  1266's job.

## For the cards that build on it

- A new figure is a new script in `tools/blender/`, written to the contract, run headless, with its
  `.glb` and `.glb.js` committed, and its name set on the era's block. Nothing in the layer changes.
- `PongField3D.figureState(name)` reads `{ state: 'loading' | 'ready' | 'failed', why }`, and
  `PongField3D.clipFor(beat)` and `clipTime(...)` are the move rules. `test/figures.test.js` checks
  every `.glb` against the contract.
- `?figures=off` (or `?models=off`) takes the glTF figures out for an A/B.
