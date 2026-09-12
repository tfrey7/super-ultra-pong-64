# Warming the 3D figures (item 1299)

Item 1274 measured one second of ordinary play at each 3D era with the Blender glTF figures on and
off, found the Xbox (era 9) slower with them on in both rounds, and each of those readings holding
one long frame (p95 33 ms, then **333 ms**). It suspected WebGL building the skinned figure's shader
program on first draw, and said so without proving it. This card measured that frame.

Everything below is the playtest's own headless Chrome: `--disable-gpu`, WebGL in software through
`--enable-unsafe-swiftshader`. **Since item 1283 no era block names a figure**, so every reading here
asks for one the way a test does, `?figure=player-proof-hi`; item 1274's `figspeed.mjs` run unchanged
today reads `name: null` and measures no figures at all.

## What the long frame is

`node docs/measure/item-1299/figfirst.mjs --label before --query "&figure=player-proof-hi"` records
every frame of a cold era 9 page from before it loads, beside what the figures were doing that
frame, and reads `PongField3D.figureTimings()` at the end. Three cold pages, before this card:

| | first frame that drew the figures | reading the file in | building both posed copies |
| --- | --- | --- | --- |
| page 1 | 133.4 ms | 2.9 ms | 4.4 ms |
| page 2 | 133.3 ms | 3.3 ms | 2.8 ms |
| page 3 | 150.0 ms | 3.0 ms | 3.0 ms |

So the file is not the cause: unpacking it and building the two posed copies come to about 6 ms of
the 133. The recorder then learned to time how long the **page thread** stays busy each frame (a
timeout posted from the first rAF callback, which runs after the frame's own work). Three more cold
pages, [figfirst-after.json](figfirst-after.json):

| | first figure frame | page busy in it | the WebGL draw call | unpack | build |
| --- | --- | --- | --- | --- | --- |
| page 1 | 100.0 ms | 14.7 ms | 11.2 ms | 2.5 ms | 2.6 ms |
| page 2 | 100.1 ms | 16.3 ms | 6.0 ms | 3.0 ms | 2.2 ms |
| page 3 | 133.2 ms | 33.7 ms | 8.3 ms | 2.8 ms | 2.7 ms |

**The page is idle for most of that frame.** And the same pages with `&figures=off`
([figfirst-nofigures.json](figfirst-nofigures.json)) hold frames of 83.3, 83.3, 100 and 100 ms in
the same stretch, with no figure anywhere: on a machine running six workers, era 9 has long frames
with or without them.

`node docs/measure/item-1299/figtrace.mjs` records the same cold page with Skia's and ANGLE's
categories in the trace — item 1203's `--skia`, the ones that name every GPU program built
([figtrace-figures.json](figtrace-figures.json)). Everything the GPU process spends building
shaders over the **whole page**:

| what | how many | total | longest one |
| --- | --- | --- | --- |
| `ProgramExecutableVk::warmUpGraphicsPipelineCache` | 4 | 42.4 ms | 16.3 ms |
| `Compile/Link (unlocked)` | 12 | 17.2 ms | 4.3 ms |
| `ShaderTranslateTask::run` | 7 | 16.2 ms | 4.2 ms |

**76 ms for every program the page ever builds, and no single build over 16.3 ms.** So item 1274's
suspicion is half right and half wrong: a program *is* built when the figure is first drawn, and it
costs something, but it is nothing like 333 ms. The 333 ms reading was taken in item 1274's round 2,
the round whose own `?figures=off` readings ran at 43.75 and 95.45 ms mean — a loaded machine, not a
shader.

**What a figure's first frame really costs, then: about 20-30 ms** — 3 ms to unpack, 3 ms to build
both posed copies, 5-11 ms in the draw call that builds the program, on top of an ordinary frame.
Worth paying before an era arrives rather than during it, which is what this card does, but not the
freeze the card was written about.

## Era 9, with the figures and without, alternated inside each round

`node docs/measure/item-1299/figspeed.mjs --eras 9 --rounds 3 --label rounds` — item 1274's reading,
one second of ordinary play, with `--eras`, `--figure` and `--label` added
([figspeed-rounds.json](figspeed-rounds.json), and an earlier two-round pass in
[figspeed-after.json](figspeed-after.json)). With the warm in:

| round | setup | mean | p95 | max |
| --- | --- | --- | --- | --- |
| 1 (quiet machine) | **glTF figures** | **16.67 ms** | 16.7 ms | **16.8 ms** |
| 1 | no figures | 16.67 ms | 16.7 ms | 16.8 ms |
| 2 | no figures | 16.95 ms | 16.8 ms | 33.4 ms |
| 2 | **glTF figures** | 32.29 ms | 33.4 ms | 50.0 ms |
| 3 | **glTF figures** | 33.34 ms | 33.4 ms | 50.0 ms |
| 3 | no figures | 31.77 ms | 33.4 ms | 49.9 ms |

- **On a quiet machine era 9 with the figures is exactly as fast as without, and no reading has a
  frame over 50 ms** — its longest frame is 16.8 ms, one ordinary frame.
- **Under load both setups are the same, and both reach 50 ms.** Rounds 2 and 3 ran while other
  workers were on the machine; the no-figures reading is 31.77 ms with a 49.9 ms frame of its own.
  Round 2's pairing (16.95 against 32.29) is the load arriving between the two readings, not the
  figures: round 3, both readings inside the load, has them within 5%.
- The reading's own "figures drawn" counter says 0/0 now. It counts calls into
  `PongField3D.takeFigures`, which `src/models3d.js` makes only when an era block names a model, and
  since item 1283 none does. That the figures were really there is `file ready` on every figures row,
  and `figfirst`'s count of objects in the 3D scene, which rises by four (two bodies, two contact
  shadows) at the frame named above.

## What the warm does

`src/field3d.js`, in the model-loading code item 1274 added. Every frame the layer draws it calls
`warmFigures(state.era)`, which lines up the figures **this era and the next era** want
(`figuresWanted`, the pure rule `test/figures-warm.test.js` pins) and asks for their files at once —
a script tag each, so the loads overlap. Then one warming step a frame (`warmStep`) builds the next
ready one's posed copy and stands it in that frame's own render at a thousandth of its size at the
table's centre: far under a pixel, so nothing is seen, but the draw call is made and the program is
built. By the time the era arrives, its figures are built and compiled.

**One era ahead and no further**, so a match never loads figures for eras it has not nearly reached
and the title screen loads nothing at all. That is the choice the card offered against loading all
six figure files at page start.

`PongField3D.figureTimings()` reports what the page paid: `parseMs`, `buildMs`, `compileMs` (the
render call of a frame that built a figure) and `warmMs` (the render call of a warming frame).
