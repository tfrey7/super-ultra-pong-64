# The real 3D layer (item 1273)

Eras 5 to 10 draw their field, meaning the table, its centre line, the net, the two bats, the ball
and its shadow, through a real 3D library on WebGL. Everything else stays canvas 2D: each era's
painted arena behind the table, its HUD and effects in front, the display, the CRT and TV
overlays, the ring wipes and eras 0 to 4. Tim chose this on 2026-09-11 ("Real 3D for the 3D
eras"): the later machines needed real lighting and shading, and a full game engine was ruled out.

Before and after, the PlayStation on the same frame of play:
[era5-before.png](../shots/item-1273/era5-before.png) (the canvas table, master) and
[era5-after.png](../shots/item-1273/era5-after.png) (the 3D layer).

## How it fits in

- **One library, checked in, no build.** `vendor/three.js` is three.js r186 plus its glTF loader
  and skeleton utilities, bundled **once** with esbuild into one plain script that sets
  `window.THREE`. The game still opens off disk with a double-click. There are no modules, nothing
  is installed and nothing is fetched at play time. The model-loading and animation classes ride
  along (`THREE.GLTFLoader`, `THREE.AnimationMixer`, `THREE.SkeletonUtils`) for the model card that
  follows.
- **The layer draws, and nothing else.** `src/field3d.js` reads the state and poses the scene: the
  slab, the far rail and near lip, the dashed centre line, a low see-through net on it, one bat
  standing on each paddle's own rectangle with a handle out toward its owner's wall, the ball as a
  sphere, and a contact-shadow disc under it. It is lit by one directional light plus a low ambient
  fill. The paddle rectangle is still the hit zone. The rules never hear of any of this.
- **Same camera, same pixels.** A 3D era's arena is painted around where `src/table3d.js` projects
  the table, so the 3D camera is built from the very same numbers (tilt, height, fov, screenY,
  panX). `matrices()` turns them into a view and a projection whose principal point sits at
  `(400, screenY)`, not the middle of the frame, because that is where table3d's projection puts
  it. `test/field3d.test.js` checks ten field points under five cameras, and under every era's own
  camera, and each lands within 1e-6 of table3d's pixel.
- **Composited, not layered in the page.** The WebGL canvas is never put on the page. Each frame it
  renders at the pixel size of the picture it is going into, which is 320 x 240 for the
  PlayStation's buffer and more for the later machines. It is then copied into the era's context
  with one `drawImage` over the 800 x 600 field, at the moment the era used to call `T.table()`.
  Whatever the era draws after that lands on top, as it always did.
- **Wiring is three lines an era.** `T.field(ctx, cam, tableStyle, state, api)` replaces
  `T.table(...)` and answers whether the 3D layer drew. If it did, the era skips its own paddles,
  its ball, and whatever belonged under them: the Xbox's hard shadows, the PS2's mirrored paddles,
  and the Xbox 360's re-inked paddle faces.
- **The fallback is today's drawing.** No WebGL, no `THREE`, `?gl=off`, or `node --test`: `T.field`
  paints the canvas table and answers false, and the era draws exactly what it drew before this
  card. The canvas projection and item 1248's polygon players are that fallback, untouched.
- **Render knobs, none set.** An era's look may carry `render: { resolution, filter, fog, lighting }`,
  read on every frame. The header of `src/field3d.js` lists what each takes. The lighting model can
  be `standard`, `phong`, `lambert`, `flat` or `unlit`, and changing it rebuilds the materials, not
  the geometry.

## What it measured

I ran the ladder playtest twice back to back on 2026-09-11, on a machine shared with other
workers, in the playtest's headless Chrome with the GPU off. The first run went through WebGL in
software and the second through the canvas fallback (`--gl-off`). Both logs are in
[docs/measure/item-1273/](../measure/item-1273/). Mean frame in one second of ordinary play:

| Era | WebGL (software) | Canvas fallback |
| --- | --- | --- |
| 5 PlayStation | 27.9 ms | 27.8 ms |
| 6 Nintendo 64 | 29.9 ms | 35.1 ms |
| 7 Dreamcast | 38.5 ms | 36.9 ms |
| 8 PlayStation 2 | 36.3 ms | 39.7 ms |
| 9 Xbox | 37.7 ms | 39.7 ms |
| 10 Xbox 360 | 86.1 ms | 87.5 ms |

- **The 3D layer costs no frame time the canvas table was not already costing.** On the two runs
  the two paths are within a few milliseconds of each other either way, era by era. Rendering the
  whole field lit, even in software, costs about what painting it as polygons and gradients did.
- **Both paths fail the same six "holds full frame rate" lines**, eras 5 to 10. Those FAILs predate
  this card: they belong to card 1216, per the bootstrap's trap list, and come from the display
  layer's per-frame work on a CPU-only Chrome. Everything else on the ladder passed on both runs:
  36 of 42 checks each, including every ring, every "new era draws afterwards" pixel comparison
  and the finale.
- **Eras 0 to 4 are untouched**: 16.7 ms on both runs.

## What did not work, or is not done

- **The first surface colour is the default, not the era's.** An era whose court is a pattern or a
  function (the PlayStation's checker, the Nintendo 64's grass-lit grain) hands `T.field` no
  `#rrggbb`, so the slab is the default blue-grey. The textures and each era's real look are the
  next cards' work (item 1266 and the model pipeline). This card only makes the geometry solid and
  lit.
- **Some 2D effects now land on top of the ball.** The Dreamcast's speed lines and the PS2's trail
  were drawn before the ball, which was the last fill (R1). The 3D ball is composited with the
  table, so these effects now draw over it. Moving the ball out of the composite into a second pass
  is a small change for whichever card retunes those eras.
- **The net is a stand-in.** It is 10 units high and 45% opaque, so the ball, which is 14 units
  tall, reads through and over it. The realism ladder's net (24 units, drawn before the ball) is
  item 1266's.

## For the cards that build inside it

- `PongField3D.internals()` hands back `{ THREE, renderer, scene, camera, parts }`. `parts` holds
  the meshes by name (`slab`, `net`, `ball`, `shadow`, `bats.left.blade` ...), so a card can
  replace one without rebuilding the rest. `SIZES` and `COLOURS` hold the numbers.
- Load a model with `new THREE.GLTFLoader().parse(...)` from a data: URI or an embedded buffer.
  A page opened off `file://` cannot fetch a `.glb` next to it, which is the same reason the 3D
  textures are data: URIs.
- Re-make the bundle only on purpose. In a scratch folder outside the repo, run
  `npm install three@<version> esbuild`, then
  `npx esbuild tools/three-bundle/entry.js --bundle --minify --format=iife --global-name=__THREE_BUNDLE --footer:js="globalThis.THREE=__THREE_BUNDLE.default;" --outfile=vendor/three.js`,
  put the provenance header back on line 1, and never commit `node_modules`.
- Headless Chrome with `--disable-gpu` renders WebGL in software only when also given
  `--enable-unsafe-swiftshader`, and the playtest passes it. `shot.py` in the fleet console gets
  WebGL without being asked.
