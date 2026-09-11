# The era bible: PlayStation to Xbox 360

Tim, 2026-09-10: *"the eras need to go up to xbox 360, dramatically emphasing the defining
characteristics for each era."* This document is what every card of that climb builds to. It
answers, for eras 5 to 10, every question a worker would otherwise have to guess: what the name
card says, the colours in hex, where the camera sits, the five or six things to exaggerate and how
to draw each one in canvas 2D, what every sound is made of, what the arrival flourish does, and the
rules that keep the game playable while all of it happens.

**How to use it.** Read sections 0 to 5 once -- they are shared by every era. Then read your own
era's chapter (6 to 11) and build that, and nothing else. Every number here is a starting value
that has been checked against the readability rules; change one only for a reason you can state
in your report, and re-run `node tools/table3d-cameras.js` if it is a camera number.

**The order the cards land in.**

| Order | Card | What it lands |
| --- | --- | --- |
| 1 | 1143 (this) | this document, `tools/table3d-cameras.js`, `test/eras-bible.test.js` |
| 1 | 1136 | the ring-wipe transition engine and the per-era `flourish` hook (section 4) |
| 2 | 1144 | `src/table3d.js` (section 2), the six ladder rows, six placeholder era files, the sound hook (section 3) |
| 3 | 1145 to 1150, in parallel | one era each: `src/eras/eraN-*.js` and its own test file, **nothing else** |
| later | the flourish cards | each era's `flourish` function, storyboarded in its chapter |

---

## 0. The ladder

The rules' table (`Pong.ERAS` in `src/game.js`) gains exactly these rows, in this order.
`test/eras-bible.test.js` pins this table: the order, every year and machine string, and every
name card's text, and it checks every row the rules already carry against it.

<!-- ladder:start -->
| Era | Year | Machine (the `Pong.ERAS` string) | Name card |
| --- | --- | --- | --- |
| 0 | 1972 | arcade Pong | `1972 · ARCADE PONG` |
| 1 | 1977 | Atari 2600 | `1977 · ATARI 2600` |
| 2 | 1985 | NES | `1985 · NES` |
| 3 | 1989 | Sega Genesis | `1989 · SEGA GENESIS` |
| 4 | 1991 | Super Nintendo | `1991 · SUPER NINTENDO` |
| 5 | 1994 | Sony PlayStation | `1994 · SONY PLAYSTATION` |
| 6 | 1996 | Nintendo 64 | `1996 · NINTENDO 64` |
| 7 | 1999 | Sega Dreamcast | `1999 · SEGA DREAMCAST` |
| 8 | 2000 | PlayStation 2 | `2000 · PLAYSTATION 2` |
| 9 | 2001 | Xbox | `2001 · XBOX` |
| 10 | 2005 | Xbox 360 | `2005 · XBOX 360` |
<!-- ladder:end -->

The card text is not typed anywhere: `src/erachange.js` builds it as the year, a middle dot, and
the machine string upper-cased. Every character above exists in the block font, and the widest
card (`1994 · SONY PLAYSTATION`, 586 field units) fits the card with its padding (the test
checks both).

**One year is a choice, not a fact.** Every rung below 5 uses the **North American** launch year
(the NES is 1985, not the Famicom's 1983; the Genesis 1989, not the Mega Drive's 1988; the Super
Nintendo 1991, not the Super Famicom's 1990; the Dreamcast 1999, not 1998). The PlayStation
launched in Japan on 3 December 1994 and in North America on 9 September 1995. The brief and card
1145 both say 1994, so the ladder says 1994. If Tim wants the ladder consistent, it becomes 1995:
one row here and one row in the test.

---

## 1. What never changes

These hold for every era, 0 to 10, and no era card may break one:

1. **The rules.** `src/game.js` is not touched by an era card. The same state, the same
   `step(state, dt, intent)`, the same collisions against the same 800 x 600 field rectangles.
   Card 1144 adds the six `Pong.ERAS` rows and nothing else in that file.
2. **The paddle control.** The mouse's height over the canvas is the paddle's field height,
   exactly as `src/input.js` computes it today (`clientY` over the canvas box, times 600). **No era
   un-projects the pointer through its camera.** A mouse at the top of the canvas puts the paddle
   against the far wall in every era. The keys move it at the same 480 units a second.
3. **The same 2D state, drawn onto a tilted plane.** The 3D eras do not simulate anything in 3D.
   The field is a flat table lying on the floor of a 3D scene. A field point `(x, y)` is a point
   on that table, and the paddles and the ball stand on the table at exactly the rectangles the
   rules collide with (section 2).
4. **An era file reads the state and never writes it.** It may keep private memory of its own
   (the last rally count it saw, particle positions, a trail) in variables inside its own file,
   keyed off `state.time`. It never adds a field to the state.
5. **Sound listens to `state.events`, and only in the real game.** The attract rally is silent,
   and nothing plays before the first click or key.
6. **The attract rally behind the title uses the stock dimmed frame.** An era's `draw` begins
   `if (opts && opts.ink) return api.drawBase(ctx, state, opts);`, the same as era 4.
7. **The serve pause.** The era change (1126, 1136) lives inside the pause the point started, and
   the ball never launches late because of anything drawn.
8. **Plain scripts.** No dependencies, no build, no ES modules; `index.html` opens off disk. Canvas
   2D only. **No per-pixel loops**: no `getImageData`/`putImageData` walk over the frame. Clip
   paths, gradients, composite operations, transforms, `drawImage` between canvases and pre-drawn
   pattern tiles are the whole toolkit. A tile is built once, from rectangles, and cached.
9. **No real logos.** No maker's logo, mark or wordmark is drawn: not the PlayStation shapes, the
   N64 cube, the Dreamcast swirl as a trademark, or the Xbox X. Each era evokes its machine with
   colour, shape, motion and sound. The name card naming the machine is the one exception, as it
   is for eras 1 to 4.

---

## 2. The shared 3D table: `src/table3d.js`

Card 1144 builds this file to this interface, exactly. The six era cards are written against it in
parallel, so a name or argument order changed here breaks six branches: if 1144 cannot build
something as written, it changes this section in its own branch and says so.

It is a plain script with the same UMD wrapper as `src/game.js`. In the page it is
`window.PongTable3D`, loaded by `index.html` after `src/render.js` and before the era files. Under
`node --test` it is `require('../src/table3d.js')`. It is also handed to every era's `draw` as
`api.table3d` (1144 adds that one field to the renderer's `api`), so an era file reaches it either
way.

### 2.1 Coordinates

- **Field coordinates** are the rules' own: `x` from 0 (the player's wall, left) to 800, and `y`
  from 0 (the top wall) to 600. `z` is height **up off the table**, in the same units.
- **The top wall (y = 0) is the far edge of the table, and the bottom wall (y = 600) is the near
  edge.** The camera stands in front of the bottom wall, above it, looking across the table. The
  left and right paddles stay left and right, as a TV camera at the side of a tennis court sees
  them.

### 2.2 The camera object

```js
var cam = T.camera({
  tilt: 28,        // degrees the view leans away from straight down: 0 = today's flat top-down frame
  height: 1150,    // how high the eye is above the table, in field units
  fov: 30,         // vertical field of view, degrees
  screenY: 306,    // screen y where the table's centre (400, 300) lands; default 300
  panX: 0,         // sideways shift of the look point, field units; default 0
  snap: 0,         // round every projected vertex to this many pixels (PlayStation); default 0 = off
  outline: null    // { width, colour }: outline mode for every helper call (2.6); default null
});
```

`T.camera` returns a new object carrying the fields above plus these derived fields, which
`project` reads. An era may animate a camera by building a fresh one each frame; it is cheap.

| Field | Value |
| --- | --- |
| `sin`, `cos` | `Math.sin(tilt)`, `Math.cos(tilt)` (tilt in radians) |
| `back` | `height * Math.tan(tilt)`: how far in front of the table centre the eye stands |
| `distance` | `height / cos`: eye to table centre |
| `focal` | `300 / Math.tan(fov / 2)` (half the 600-unit canvas height over the half-angle) |
| `view` | `{ w: 800, h: 600 }` |

**Tilt 0 with `height` equal to `focal` is today's flat frame, to the unit.** `(0, 0)` projects
to `(0, 0)` and `(800, 600)` to `(800, 600)`. 1144's tests should pin that, and
`tools/table3d-cameras.js` prints it on every run.

### 2.3 `T.project(cam, x, y, z)` → `{ x, y, scale, depth }`

The one formula every drawing helper uses. `tools/table3d-cameras.js` holds the same function, and
the two must agree:

```js
X  = x - 400 - cam.panX;
Y  = 300 - y + cam.back;            // toward the far wall is +Y
Z  = (z || 0) - cam.height;
yc = Y * cam.cos + Z * cam.sin;     // up, in the camera's frame
zc = Y * cam.sin - Z * cam.cos;     // depth along the view axis (always > 0 on the table)
k  = cam.focal / zc;
return { x: 400 + X * k, y: cam.screenY - yc * k, scale: k, depth: zc };
```

- `scale` is **screen pixels per field unit at that point**. Use it to size anything drawn there:
  a line width, a particle, a shadow's radius.
- With `cam.snap > 0`, `x` and `y` come back rounded: `Math.round(v / snap) * snap`.
- A point on the near edge lands lower and wider on screen than the same `x` on the far edge. That
  is 1144's projection test.

### 2.4 The drawing helpers

Every helper takes `(ctx, cam, ..., style)`, builds its path from projected points, fills and
strokes according to `style`, and **returns the projected points** so an era can draw more on the
same shape (a highlight, a clip). None of them saves or restores `ctx` state except where noted.

| Helper | What it draws |
| --- | --- |
| `T.path(ctx, cam, points)` | Begins a path through `points` (`[[x, y, z], ...]`), projected, and closes it. Does not fill. The way to clip to any table shape: `T.path(...); ctx.clip();`. |
| `T.quad(ctx, cam, points, style)` | A filled 4-point polygon (any 3 or more points work). |
| `T.box(ctx, cam, rect, z0, z1, style)` | A box standing on the table: footprint `rect = { x, y, w, h }` in field units, from height `z0` to `z1`. Paddles are `T.box(ctx, cam, state.left, 0, 24, style)`. It draws only the faces the camera can see, in this order: the side face that faces the eye (the right face `x + w` when `x + w < 400 + panX`, the left face `x` when `x > 400 + panX`, neither otherwise), then the near face (`y + h`), then the top. Returns `{ top, near, side }`, each an array of four projected points; `side` is `null` when neither side face shows (as built by 1144). |
| `T.ball(ctx, cam, ball, style)` | The ball, standing on the table. Centre `(ball.x + ball.size / 2, ball.y + ball.size / 2)`, world radius `r = ball.size * (style.radius || 0.6)`. It draws, in order: **the contact shadow** (an ellipse on the table at `z = 0` under the centre, radii `r * scale` by `r * scale * cos`, `style.shadow` default `'rgba(0,0,0,0.55)'`), then the ball as a circle of screen radius `r * scale`, centred on the projection of `z = r`. `style.fill` is a colour, or `function (sx, sy, sr) -> fillStyle` for a gradient. Returns `{ x, y, r, footX, footY }` in screen pixels. |
| `T.ballScreen(cam, state)` | The same `{ x, y, r, footX, footY }` without drawing: a pure function of the state and the camera. Use it for trails, sparks and glows, and for 1144's purity test. |
| `T.table(ctx, cam, style)` | The court: the surface quad `(0,0)-(800,600)` at `z = 0`, the centre line as 6-unit-wide dashes (20 on, 16 off, exactly the 2D line), the far rail as a box `(0, -18, 800, 18)` from `z` 0 to 22, and the near rail as a **flat** strip `(0, 600, 800, 10)` at `z = 0` (rule R6). Style keys are `surface`, `line`, `rail`, `railTop` and `nearLip`, each a colour or `function (ctx, cam, pts)` that fills the shape itself (textures). The centre-line dashes are paint on the surface and never take the outline. |

**Style keys the helpers share:**

| Key | Meaning |
| --- | --- |
| `ink` | Base colour of the shape (`'#rrggbb'`). |
| `shade` | `'flat'` (one colour a face), `'banded'` (hard-edged bands), or `'gradient'` (a linear gradient across the face: Gouraud). Default `'flat'`. |
| `bands` | For `'banded'`: how many bands, lit to dark, top of the face to bottom. Default 2. One gradient with doubled stops, so the edges are hard: two bands split 40% down the face (the cel look), more bands split evenly. |
| `light` | `{ top, near, side }`: how far each face is lightened (+) or darkened (-) from `ink`, through `T.shade`. Default `{ top: 0.25, near: 0, side: -0.35 }`. |
| `fill` | Overrides everything above: a colour, a gradient or pattern, or `function (face, pts) -> fillStyle`, where `face` is `'top'`, `'near'`, `'side'` or `'shape'`. |
| `outline` | `{ width, colour }`, or `false` to switch off the camera's outline for this call (2.6). |
| `alpha` | `globalAlpha` for this shape; restored after. |

**Colour helpers:** `T.shade(hex, t)` blends toward white (t > 0) or black (t < 0), the same
function era 4 has. `T.mix(hexA, hexB, t)` returns `'#rrggbb'`. `T.rgba(hex, a)` returns an
`rgba()` string.

### 2.5 Painter's order: every 3D era draws in this sequence

```
if (opts && opts.ink) return api.drawBase(ctx, state, opts);    // the attract rally, rule 1.6
1. backdrop      sky and scenery behind the far wall
2. table         T.table, with the era's textures
3. on the table  fog band, reflections, cast shadows, dust
4. paddles       far one first: the one whose rect.y + rect.h is smaller
5. behind ball   trails, sparks, speed lines, gamertags
6. post passes   grade, grain, bloom, depth of field, the low-resolution upscale
7. the ball      T.ball, last of everything on the table, never under a post pass
8. HUD band      score and toasts, in the screen band above the far edge (rule R8)
```

### 2.6 Outline mode

`cam.outline = { width: 4, colour: '#111111' }` makes every helper **stroke before it fills**:
`lineWidth = 2 * width * scale` (with `scale` taken at the shape's first point), `lineJoin` and
`lineCap` `'round'`. The fill then covers the inner half of the stroke, so the ink sits
**outside** the silhouette and never eats into a small shape. The ball keeps its full size. A
per-call `style.outline` overrides the camera's, and `false` switches it off.

### 2.7 Fog

Fog is measured along the table, not along the camera, so the numbers mean the same thing under
every camera:

```js
T.fogAmount(y, fog)        // d = (600 - y) / 600: 0 at the near edge, 1 at the far edge, above 1 behind it
                           // amount = clamp((d - fog.start) / (fog.end - fog.start), 0, 1) ** (fog.power || 1) * (fog.max || 1)
T.fogColour(hex, y, fog)   // T.mix(hex, fog.colour, T.fogAmount(y, fog))
T.fogBand(ctx, cam, fog)   // one vertical gradient over the table: fog.colour at T.fogAmount(0) opacity
                           // on the far edge's screen y, fading to 0 where d = fog.start. Draw it at step 3.
```

`fog = { start, end, power, max, colour }`. The cheap whole-table fog is `T.fogBand`, one gradient.
`T.fogColour` tints an individual object at its own depth (a paddle, a rail, a hill).

### 2.8 The dither tile

```js
T.BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];   // row-major 4x4 threshold order
T.ditherTile(a, b, level, cell)   // -> CanvasPattern, or null with no document
```

A 4 x 4 ordered-dither tile of two colours: each cell whose `BAYER4` value is below `level`
(0 to 16) is colour `b` and the rest are `a`. Each cell is `cell` pixels square, so the tile is
`4 * cell` pixels. It is built once from 16 `fillRect`s on a small canvas, cached under
`a + b + level + cell`, and returned as `ctx.createPattern(tile, 'repeat')`. Level 8 is the 50%
checker; 4 and 12 are the quarter tones.

### 2.9 Offscreen canvases

`T.offscreen(key, w, h)` returns `{ canvas, ctx }`, created on the first call for that key and
reused afterwards (resized only if `w` or `h` changed), or `null` when there is no `document`
(under `node --test`). **Every recipe that uses one names what to draw instead when it returns
null**: that fallback is what the headless era tests see. No era creates canvases any other way.

### 2.10 The plumbing 1144 lands with the helper

So the six era cards never touch the same line:

- **The six `Pong.ERAS` rows** from section 0, all at once.
- **Six era files**: `src/eras/era5-playstation.js` (the plain flat-shaded table 1144's goal names),
  and `era6-n64.js`, `era7-dreamcast.js`, `era8-ps2.js`, `era9-xbox.js` and `era10-xbox360.js` as
  one-line placeholders `like: 5`, each with its own `card` (so the ladder climbs to 10 and every
  card already reads right).
- **Seven `<script>` lines** in `index.html`: `src/table3d.js`, then the six era files, before
  `src/erachange.js`. As built, `src/table3d.js` sits straight after `src/render.js`, before every
  era file, and `PongRender.table3d` is a getter that finds it in the page or `require`s it under
  node, so `tools/eralooks.js`'s loader needs no change.
- **The sound hook** (section 3), and `TOP_ERA` in `src/sound.js` following `Pong.ERAS` rather than
  the hard-coded 4. As built, a rung above the `VOICES` rows whose look has no `voice` yet plays the
  Super Nintendo's row and echo, so the placeholders are never silent. Of the section 3 additions,
  1144 builds only the hook: `wave: 'noise'` notes are skipped rather than played, and `attack`,
  `filter`, `unison`, `lfo`, `shape`, `reverb`, `bus` and the boot sting are still to build.
- **Name cards** carry `dots: null`, so no rung above 4 inherits the Super Nintendo's four
  buttons from `STYLES[4]` in `src/erachange.js`.

An era card then **replaces its own era file and adds its own test file. Nothing else.**

### 2.11 What an era file registers

```js
R.registerEra({
  era: 7,
  name: '1999 Sega Dreamcast',
  like: 1,                         // paddle colours: the ones the session earned on its first point
  camera: { tilt: 22, height: 1500, fov: 23.5, screenY: 314 },
  card: { ... },                   // the name card's style: the STYLES fields in src/erachange.js
  voice: { ... },                  // section 3
  draw: function (ctx, state, opts, api) { ... },
  flourish: function (ctx, p, origin, fromEra, toEra, info) { ... }  // section 4; a later card
});
```

---

## 3. The voice: grammar and hook

**The hook.** An era's sounds live **on its look**, as `voice`. `voicesFor(era, type)` in
`src/sound.js` keeps its `VOICES` rows for eras 0 to 4, and for a rung with no row it reads
`root.PongRender.eraLook(era).voice`. Card 1144 lands this. A sound test for an era loads the
renderer and that era's file first, the way `test/erachange.test.js` loads the renderer.

**A voice** is `{ paddle: [...], wall: [...], score: [...], boot: [...], effects: {...} }`. Each
list holds notes, and today's note fields keep their meaning: `wave`, `freq`, `slideTo`, `at`,
`dur`, `gain` and `fm`. **Additions**, all optional, which the player ignores until they are built:

| Field | Meaning |
| --- | --- |
| `wave: 'noise'` | White noise: one shared 2-second buffer, made once at unlock and looped. `freq` is ignored. |
| `attack` | Seconds to peak. Default 0.004, today's value. |
| `filter` | `{ type: 'lowpass' \| 'highpass' \| 'bandpass', freq, q, to }`: a BiquadFilter on the note. `q` defaults to 0.7; `to` glides the cutoff exponentially to that frequency over the note. |
| `unison` | `{ voices, spread }`: that many copies, detuned evenly from `-spread` to `+spread` cents, each at `gain / voices`. |
| `lfo` | `{ freq, depth }`: tremolo on the note's gain (0 to 1 depth). |
| `shape` | 0 to 1: WaveShaper drive, curve `tanh(k * x)` with `k = 1 + 20 * shape`, 1024 points built once. |

**Effects**, per era: `echo: { time, feedback, mix }` (exists); `reverb: { seconds, decay, mix }`,
a ConvolverNode whose impulse is noise times `(1 - i / n) ** decay`, built once per era on first
use (a one-time sample fill of an audio buffer, not a pixel loop); `bus: { type, freq, q }`, one
filter every note of the era passes through.

**The boot sting.** When the player plays a `score` event whose `era` is higher than the last era
it sounded, and that era's voice has a `boot` list, it plays `boot` instead of `score`. The sting
lands with the ring wipe's first frame. A sting may ring past the serve; it changes nothing in
play.

---

## 4. The arrival flourish, on the ring-wipe engine

Card 1136 has landed the engine (`src/erachange.js`). When a point moves the machine up, the new
era spreads from the spot where the ball left the field (`state.missAt`) as a growing circle:
inside it the new era draws, outside it the old, both drawing the same live state, over 1.5 seconds
inside the serve pause the rules stretch to `rules.eraChangePause` (1.8 s) on an era-change point.
The name card comes up once the ring passes the centre. **Each era may give its look a `flourish`
function**, called every frame of the ring that brings that era in, over the ring's edge:

```js
flourish(ctx, p, origin, fromEra, toEra, info)
//  p        eased progress, 0 to 1
//  origin   { x, y }: where the ball left the field, in canvas units
//  info     { radius, t, duration, ... }: info.radius is the ring's radius this frame, written R(p) below
```

**The header comment of `src/erachange.js` is the contract** and wins over this section if they
ever disagree. The storyboards below are keyed on `p` and `R(p)` and survive a rename.

**Every storyboard is three beats**, on the same clock:

| Beat | p | about | What it is for |
| --- | --- | --- | --- |
| 1, ignition | 0 to 0.25 | 0.38 s | Something happens **at the origin**: the new machine announces itself. The boot sting starts here. |
| 2, the edge | 0.25 to 0.8 | 0.82 s | The **ring's edge** wears the new machine's defining effect as it crosses the field. |
| 3, arrival | 0.8 to 1 | 0.3 s | The new frame **settles**, with one signature gesture. The name card is already up. |

Flourish rules: nothing a flourish draws may extend more than 60 pixels outside the ring
(`R(p) + 60`), except full-frame washes whose opacity is 0.35 or less. A flourish never moves a
camera past its measured motion extremes (section 12). It never draws where the ball will be once
it launches, because the pause ends with `p = 1`.

---

## 5. Readability rules

These are law for every era card and every flourish card. A look that breaks one is a regression
even when every test passes.

- **R1: the ball is the brightest thing on screen.** Its core is `#ffffff`, or the palette's
  lightest entry, and **no other fill on the table reaches its core's luminance** at an opacity
  above 0.5. Sparks, glows, flares and bloom stay below it: their peak colours are named in each
  chapter, and none is pure white. The ball is drawn **after** every post pass (step 7), so no
  grade, fog, grain or vignette dims it.
- **R2: the ball is the sharpest thing on screen.** No blur, low resolution, dither, depth of field
  or motion blur ever applies to the ball's core disc. Motion blur and trails are separate shapes
  drawn **behind** it, and it never enters an offscreen buffer.
- **R3: the table never tilts past the angle where a shot can be misjudged.** Measured by
  `tools/table3d-cameras.js`, and required of **every** pose a camera takes: at rest, at each end
  of any drift or wobble, and at a flourish's extreme. Four conditions:
  1. the table's four corners stay on screen: near corners at `x` 8 or more (and 792 or less), the
     near edge at `y` 592 or less, the far edge at `y` 64 or more (inside the letterbox for the
     PlayStation 2: 60 and 540);
  2. the far edge is at least **0.70** as wide on screen as the near edge;
  3. a field unit of depth at the far edge is at least **0.55** as tall on screen as one at the near
     edge;
  4. a paddle (84 units) against the far wall is at least **44 pixels** tall.

  Steeper than that, the far third of the table compresses until a ball's height against the far
  paddle cannot be told apart by a few units, which is the whole game. Section 12 gives each
  camera's steepest passing tilt.
- **R4: the paddles never blur.** No filter, depth of field, motion blur or smoothing upscale ever
  applies to a paddle. The PlayStation's chunky buffer and the Nintendo 64's soft textures are the
  table's, not the paddles'. Each paddle wears its earned colour (`api.paddleInk`) on its near
  face at full saturation, **after** any grade.
- **R5: true footprints.** A paddle's and the ball's footprint on the table is exactly the
  rectangle the rules collide with, and height only extrudes upward. The ball always has its
  contact shadow at the true footprint. Any other shadow (the Xbox's moving light) is lighter
  (0.45 opacity or less) than the contact shadow, so the eye reads the real position.
- **R6: nothing stands up in front of play.** The near rail is flat. Paddle boxes are 28 units tall
  or less. No scenery is drawn between the camera and the near edge.
- **R7: the camera holds still where aim happens.** Screen shake is 6 pixels or less and 0.25
  seconds or less. It fires only on a point (the ball is hidden in the serve pause) or at 3 pixels
  or less on a hit, never continuously. Camera drift is slower than one cycle in 12 seconds.
- **R8: the HUD stays off the table.** Score, gamertags' text panels, toasts and blades live in the
  band above the far edge (screen `y` from 0 to the far edge's `y` minus 6) or in a letterbox bar.
  During play nothing but world-space shapes (step 5) is drawn inside the table's outline.
- **R9: the attract rally is the stock dimmed frame** (rule 1.6), so the title reads over it.
- **R10: frame budget.** No per-pixel loops. At most three full-frame offscreen passes a frame.
  Tiles, textures and noise are built once. The playtest's real-time loop check still passes at
  `?era=N`.

---

## 6. Era 5: 1994 Sony PlayStation

*The first 3D most people owned, and it wobbled.* CD-ROM, hardware with no perspective-correct
texture mapping, no sub-pixel precision and no z-buffer, typically running at 320 x 240.
**Exaggerate the flaws, lovingly.** Card 1145.

**Name card:** `1994 · SONY PLAYSTATION` with
`card: { flash: '#ffffff', wipe: ['#e03a3e', '#f3c300', '#00a99d', '#2e6db4'], box: '#1a1a1f', border: '#8a8f9c', inner: null, year: '#f3c300', name: '#ffffff', label: '#8a8f9c' }`

**Palette**

| Role | Hex | Role | Hex |
| --- | --- | --- | --- |
| void (behind everything) | `#07070c` | table base | `#2b3a55` |
| table texture light | `#3c4f78` | table texture dark | `#24324f` |
| rail | `#8a8f9c` | rail shadow | `#4a4e59` |
| accent red | `#e03a3e` | accent yellow | `#f3c300` |
| accent teal | `#00a99d` | accent blue | `#2e6db4` |
| ball core | `#ffffff` | ball facets | `#dcdcdc`, `#b4b4b4` |
| HUD ink | `#e8e8e8` | HUD shadow | `#000000` |

The four accents evoke the controller's button colours; they are approximations from memory, not
sampled. Paddles wear `api.paddleInk` (like: 1).

**Camera:** `{ tilt: 28, height: 1150, fov: 30, screenY: 306, snap: 2.5 }`, wobbling every
frame: `height: 1150 + 6 * Math.sin(state.time * 1.3)`, `panX: 1.5 * Math.sin(state.time * 2.1)`.

**Defining characteristics**

1. **320 x 240 chunkiness.** Steps 1 to 4 (backdrop, table, paddles) draw into
   `T.offscreen('ps1', 320, 240)` with `ctx.setTransform(0.4, 0, 0, 0.4, 0, 0)`, so field units
   still address it. The buffer is then copied up with
   `ctx.imageSmoothingEnabled = false; ctx.drawImage(buf.canvas, 0, 0, 800, 600)`. Each chunk is
   2.5 pixels, hard-edged. **The ball never goes in the buffer** (R2), and the score is drawn into
   it deliberately. *Null offscreen:* draw steps 1 to 4 straight onto `ctx`.
2. **Affine texture swim (no perspective correction).** A 64 x 64 texture tile is built once: an
   8 x 8 checker of the two texture colours, plus one diagonal scuff line in `#1a2236`. The table
   is cut into **2 x 2 quads, 8 triangles** (big triangles make big kinks). For each triangle,
   `ctx.save()`, `T.path` the triangle and `ctx.clip()`, then map the tile's triangle onto the
   screen triangle with one affine `ctx.transform(a, b, c, d, e, f)` and `drawImage(tile)`, then
   `restore()`. For texture points `(u0, v0) (u1, v1) (u2, v2)` and screen points
   `(x0, y0) (x1, y1) (x2, y2)`:
   ```
   du1 = u1-u0, dv1 = v1-v0, du2 = u2-u0, dv2 = v2-v0, det = du1*dv2 - du2*dv1
   a = ((x1-x0)*dv2 - (x2-x0)*dv1) / det     c = ((x2-x0)*du1 - (x1-x0)*du2) / det
   b = ((y1-y0)*dv2 - (y2-y0)*dv1) / det     d = ((y2-y0)*du1 - (y1-y0)*du2) / det
   e = x0 - a*u0 - c*v0                      f = y0 - b*u0 - d*v0
   ```
   Because each triangle is affine, the checker lines **kink along every diagonal** and slide as
   the camera wobbles. That is the swim. Texture coordinates span 4 tile repeats across the table.
   *Null offscreen or no pattern:* flat `T.quad` in the table base colour.
3. **Vertex snapping, so edges wobble.** `cam.snap = 2.5` rounds every projected vertex to the
   chunk grid, and the camera's per-frame wobble above makes edges pop between chunks constantly,
   even on a still rally. Paddle boxes get it too: that is jitter, not blur, so R4 allows it.
4. **Flat and Gouraud shading, and a faceted ball.** Paddles are `T.box(..., 0, 22,
   { shade: 'flat', light: { top: 0.3, near: 0, side: -0.4 } })`: each face one colour. The rails
   are Gouraud, `shade: 'gradient'`, rail colour to rail shadow along each face. **The ball is a
   low-poly gem, not a sphere**: an octagon of screen radius `r` from `T.ballScreen`, cut into 8
   triangles from its centre, the two upper-left facets `#ffffff`, the next two `#dcdcdc`, and the
   rest `#b4b4b4`, with the contact shadow under it. It is drawn full resolution, last (R1, R2).
5. **Ordered dithering on gradients.** The backdrop is a vertical ramp from void to table base,
   drawn as **6 flat bands**. Across each seam a strip 4 buffer pixels tall is filled with
   `T.ditherTile(bandAbove, bandBelow, 8, 1)`, and a 2-pixel strip either side of that with levels
   4 and 12. A pool of light on the table (an ellipse around the centre) gets the same treatment in
   3 bands. The seams read as the stippled gradients of the era. *Null tile:* bands with no
   stipple.
6. **Seam sparkle.** Triangles are filled separately, with no overlap, so a snapped edge
   occasionally leaves a hairline of void showing between two table triangles. Keep it; do not
   paper over it with a base fill under the texture.

**HUD.** The score, in the block font at cell 6, is drawn **into the 320 x 240 buffer** (so it is
chunky) in HUD ink, with a one-buffer-pixel black drop shadow, centred 110 units either side of
the middle, at `y` 22.

**Voice** (clean CD-era samples, plucky; one room reverb):

```js
voice: {
  paddle: [ { wave: 'triangle', freq: 659, dur: 0.18, gain: 0.28, attack: 0.002 },
            { wave: 'sine', freq: 1318, dur: 0.09, gain: 0.10 },
            { wave: 'noise', dur: 0.015, gain: 0.12, filter: { type: 'highpass', freq: 3000 } } ],
  wall:   [ { wave: 'triangle', freq: 440, dur: 0.12, gain: 0.22, attack: 0.002 },
            { wave: 'noise', dur: 0.01, gain: 0.08, filter: { type: 'highpass', freq: 4000 } } ],
  score:  [ { wave: 'triangle', freq: 330, at: 0.00, dur: 0.30, gain: 0.16 },
            { wave: 'triangle', freq: 392, at: 0.07, dur: 0.30, gain: 0.16 },
            { wave: 'triangle', freq: 494, at: 0.14, dur: 0.30, gain: 0.16 },
            { wave: 'triangle', freq: 659, at: 0.21, dur: 0.40, gain: 0.16 },
            { wave: 'sine', freq: 165, at: 0.00, dur: 0.50, gain: 0.20 } ],
  boot:   [ // the shimmering swell, then the deep logo tone
            { wave: 'sine', freq: 1047, at: 0.00, attack: 0.4, dur: 1.2, gain: 0.06 },
            { wave: 'sine', freq: 1319, at: 0.05, attack: 0.4, dur: 1.2, gain: 0.06 },
            { wave: 'sine', freq: 1568, at: 0.10, attack: 0.4, dur: 1.2, gain: 0.06 },
            { wave: 'sine', freq: 2093, at: 0.15, attack: 0.4, dur: 1.2, gain: 0.05 },
            { wave: 'sawtooth', freq: 262, attack: 0.6, dur: 1.4, gain: 0.07,
              unison: { voices: 3, spread: 12 }, filter: { type: 'lowpass', freq: 400, to: 2400 } },
            { wave: 'sine', freq: 65, at: 0.9, dur: 1.6, gain: 0.45, attack: 0.003 },
            { wave: 'sine', freq: 130, at: 0.9, dur: 1.0, gain: 0.20, attack: 0.003 },
            { wave: 'triangle', freq: 196, at: 0.9, dur: 0.6, gain: 0.08 } ],
  effects: { reverb: { seconds: 1.2, decay: 2.5, mix: 0.25 } }
}
```

**Arrival flourish** (from the Super Nintendo):

1. *Ignition (p 0 to 0.25).* The Mode 7 world **shatters into polygons** at the origin: 12
   flat-shaded triangles (a seeded LCG gives each a size of 18 to 40 pixels, a direction and a
   spin) fly out from the origin to 1.6 times `R(p)`. They are filled in the four accents, and
   every vertex snaps to the 2.5-pixel grid.
2. *The edge (p 0.25 to 0.8).* The ring's edge is **a wobbling 16-gon, not a circle**: vertices at
   `R(p) + 6 * sin(i * 2.3 + state.time * 40)`, snapped to 2.5 pixels, stroked 5 pixels in accent
   red, with a 3-pixel accent yellow stroke just inside. A 10-pixel band inside the edge is filled
   with `T.ditherTile('#07070c', '#2b3a55', 8, 2.5)`.
3. *Arrival (p 0.8 to 1).* The table **pops in like a model loading**: the camera's height eases
   from 1190 back to 1150 with one overshoot (ease-out-back; 1190 is a measured pose, section 12),
   under a full-frame white wash of 0.3 opacity fading to 0.

**Era notes for readability.** The faceted ball's brightest facet is pure white, and nothing else
on screen is. The wobble amplitudes above are measured poses (section 12), so do not raise them.

---

## 7. Era 6: 1996 Nintendo 64

*Smooth, round, soft and foggy, in toybox colours.* Hardware bilinear filtering smeared every
texture, fog hid the short draw distance, and cartridges forced tiny, muffled samples. Card 1146.

**Name card:** `1996 · NINTENDO 64` with
`card: { flash: '#ffffff', wipe: ['#b9d4ec', '#3cb93c', '#1f5fd6'], box: '#1f5fd6', border: '#ffc72c', inner: null, year: '#ffc72c', name: '#ffffff', label: '#bfe3ff' }`

**Palette**

| Role | Hex | Role | Hex |
| --- | --- | --- | --- |
| sky top | `#3a8ee6` | sky horizon | `#bfe3ff` |
| fog | `#b9d4ec` | cloud | `#ffffff` |
| hills near | `#2e9e3e` | hills far | `#5cbf6a` |
| table grass | `#3cb93c` | table grass light | `#56c96b` |
| table grass dark | `#1f7d35` | rail red | `#e4232b` |
| rail red dark | `#9e1219` | toy yellow | `#ffc72c` |
| toy blue | `#1f5fd6` | toy green | `#15a74a` |
| HUD fill | `#ffd23c` | HUD outline | `#1f3fbf` |
| ball core | `#ffffff` | ball rim | `#ffe9a8` |

**Camera:** `{ tilt: 26, height: 900, fov: 39.5, screenY: 301 }`: the closest eye of the six, for
the strongest perspective. The flourish overshoot reaches tilt 28, a measured pose.

**Defining characteristics**

1. **Bilinear-blurred textures.** The texture is a tiny 16 x 16 tile (4 x 4 checker cells of grass
   and grass light). The whole table surface draws into `T.offscreen('n64', 400, 300)` at half
   scale (`setTransform(0.5, 0, 0, 0.5, 0, 0)`), textured through **8 x 6 quads** (fine
   subdivision, so it is nearly perspective-correct: the opposite of the PlayStation), with
   `imageSmoothingEnabled = true`. It is copied up with smoothing **on**: a soft, smeared table.
   Paddles and ball are drawn on the main canvas afterwards, crisp (R4). *Null offscreen:* flat
   quads in table grass.
2. **Heavy distance fog.** `fog = { start: 0.25, end: 1.15, power: 1.2, max: 0.92, colour: '#b9d4ec' }`.
   `T.fogBand(ctx, cam, fog)` goes over the table at step 3. The rails and hills take
   `T.fogColour` at their depth, and scenery behind the far wall is drawn **fully fogged** from
   `d = 1.15`, so the world simply ends in a pale wall. Paddles take fog too, **capped at 0.35**, so
   the far paddle is paler but always legible.
3. **Smooth, rounded low-poly.** Paddles are boxes 24 tall with `shade: 'gradient'`, plus rounded
   ends: a projected half-ellipse cap on the top face at each end, in `T.shade(ink, 0.35)`. The
   rails are half-cylinders: a box whose near face takes a 3-stop vertical gradient, rail red dark
   to rail red to rail red dark. **The ball is a smooth sphere**: a radial gradient from a hot spot
   at the upper-left third, `#ffffff` to `#ffe9a8` to `#f0b020` at the rim. That is the opposite of
   the PlayStation's gem.
4. **Saturated cartoon world.** Behind the far wall: a sky gradient (sky top to sky horizon), 3
   rolling hill arcs (big ellipses, far hills first, fogged), and 2 clouds, each 3 overlapping white
   circles drifting at 4 units a second. Every material comes from the palette; no greys except the
   fog.
5. **Rumble as screen shake.** The file keeps its own memory: `total = score.left + score.right`
   and `state.rally`. When the total rises, `shakeAt = state.time, amp = 6, len = 0.25`. When the
   rally rises and `Pong.ballSpeed(state) > 600`, `amp = 3, len = 0.12`. The whole frame (steps 1
   to 7) draws inside `ctx.translate(a * Math.sin(t * 83), a * Math.cos(t * 71))`, with
   `a = amp * (1 - age / len) ** 2`. The HUD does not shake. Limits: R7.
6. **Muffled, sample-based sound.** A `bus` lowpass at 3200 Hz over everything (below).

**HUD.** The score in the block font at cell 12, **outlined toy-style**: draw it 8 times in HUD
outline at offsets of plus or minus 3 pixels (x, y and the diagonals), then once in HUD fill, at
`y` 20, 110 units either side of the middle.

**Voice** (low sample rate, rounded, springy; everything through the muffling bus):

```js
voice: {
  paddle: [ { wave: 'square', freq: 392, dur: 0.12, gain: 0.18, filter: { type: 'lowpass', freq: 1400, q: 4, to: 500 } },
            { wave: 'sine', freq: 98, slideTo: 70, dur: 0.10, gain: 0.30 } ],
  wall:   [ { wave: 'triangle', freq: 587, slideTo: 880, dur: 0.09, gain: 0.20 } ],
  score:  [ { wave: 'square', freq: 784, dur: 0.08, gain: 0.12, filter: { type: 'lowpass', freq: 2500 } },
            { wave: 'square', freq: 1047, at: 0.08, dur: 0.40, gain: 0.12, filter: { type: 'lowpass', freq: 2500 } },
            { wave: 'sine', freq: 1047, at: 0.08, dur: 0.50, gain: 0.12 } ],
  boot:   [ // the cartridge snap, then a bright chorus chord
            { wave: 'noise', dur: 0.02, gain: 0.25, filter: { type: 'bandpass', freq: 1800, q: 3 } },
            { wave: 'sawtooth', freq: 523, at: 0.12, attack: 0.01, dur: 0.9, gain: 0.06, unison: { voices: 3, spread: 15 }, filter: { type: 'lowpass', freq: 2800 } },
            { wave: 'sawtooth', freq: 659, at: 0.12, attack: 0.01, dur: 0.9, gain: 0.06, unison: { voices: 3, spread: 15 }, filter: { type: 'lowpass', freq: 2800 } },
            { wave: 'sawtooth', freq: 784, at: 0.12, attack: 0.01, dur: 0.9, gain: 0.06, unison: { voices: 3, spread: 15 }, filter: { type: 'lowpass', freq: 2800 } },
            { wave: 'sine', freq: 131, at: 0.12, dur: 0.9, gain: 0.25 } ],
  effects: { bus: { type: 'lowpass', freq: 3200, q: 0.7 }, reverb: { seconds: 1.0, decay: 3, mix: 0.2 } }
}
```

**Arrival flourish** (from the PlayStation):

1. *Ignition (p 0 to 0.25).* **The world fades up out of fog**: a radial gradient centred on the
   origin, fog colour at 0.9 opacity in the middle to 0 at `R(p)`, whose opacity falls to 0 by
   `p = 0.25`. The polygons stop wobbling because the new camera has no snap.
2. *The edge (p 0.25 to 0.8).* The edge is a **soft fat band**: a 40-pixel radial-gradient annulus
   (transparent, then `#ffffff` at 0.5, then fog at 0.8, then transparent). Four smooth shaded
   balls in toy red, yellow, green and blue ride the edge at angles `p * 4 * Math.PI + i * Math.PI / 2`,
   each 10 pixels in radius with its own radial highlight.
3. *Arrival (p 0.8 to 1).* **The rumble**: 6-pixel shake for 0.2 s (R7), while the tilt springs
   26 to 28 and back with one bounce.

**History note.** The Nintendo 64 had **no console boot screen and no boot sound**: games started
straight away, and the logo intros were each game's own. The sting above is invented: a cartridge
click and a bright chord, marked as such. The Rumble Pak arrived in 1997 (from memory).

---

## 8. Era 7: 1999 Sega Dreamcast

*Crisp, loud and graphic, like a comic cover.* 640 x 480 VGA output, a built-in modem, and the
cel-shaded, graffiti look its games made famous. Card 1147.

**Name card:** `1999 · SEGA DREAMCAST` with
`card: { flash: '#ffffff', wipe: ['#ee5a24', '#ffffff', '#111111'], box: '#ffffff', border: '#111111', inner: null, year: '#ee5a24', name: '#111111', label: '#1e73d8' }`

**Palette** (poster colours; **no gradients in this era**, only flat fills)

| Role | Hex | Role | Hex |
| --- | --- | --- | --- |
| ink | `#111111` | paper white | `#ffffff` |
| swirl orange | `#ee5a24` | poster blue | `#1e73d8` |
| poster yellow | `#ffd400` | poster magenta | `#ff2e88` |
| poster cyan | `#00c8f0` | sky bands (top to bottom) | `#ffd400`, `#ff8a3d`, `#ff2e88` |
| skyline | `#5b2a86` | table teal | `#2ec4b6` |
| table shadow band | `#1f9e93` | table light band | `#8ff0e6` |
| ball core | `#ffffff` | ball shade band | `#d8f4ff` |

**Camera:** `{ tilt: 22, height: 1500, fov: 23.5, screenY: 314, outline: { width: 3, colour: '#111111' } }`:
the flattest, longest lens of the six, so it reads like a poster.

**Defining characteristics**

1. **Crisp 640 x 480.** No low-resolution buffer and no smoothing: everything draws straight onto
   the main canvas. One-pixel lines sit on half-pixel coordinates, `Math.round(v) + 0.5`. Next to
   the Nintendo 64's smear the jump in sharpness should be the first thing a player notices.
2. **Cel shading with thick ink outlines.** Outline mode is on for every shape (`cam.outline`
   above; ball `width: 2`). Paddles are `T.box(..., 0, 24, { shade: 'banded', bands: 2, light: { top: 0.3, near: 0, side: -0.35 } })`.
   Each face is a lit band and a shadow band with a hard edge 40% down the face. The ball is two
   bands: a white circle, then, clipped to it, a circle of the same radius offset by `(+0.35r, +0.35r)`
   in the ball shade band, then the ink outline. The contact shadow is a flat `#111111` ellipse at
   0.35 opacity, hard-edged.
3. **Poster colours in flat bands.** The sky is 3 flat bands. The table is 3 flat depth bands
   (`y` 0 to 200 table light band, 200 to 400 table teal, 400 to 600 table shadow band), each a
   `T.quad`. Behind the far wall stands a flat skyline of 9 seeded rectangles 40 to 120 units tall
   in skyline purple, with ink outlines.
4. **A graffiti-style score.** Block-font digits at cell 13, each drawn inside
   `ctx.transform(1, 0, -0.25, 1, 0, 0)` (a skew) and `rotate(-6 degrees)` about the number's centre.
   Order: the extrusion (the glyph 4 times at offsets `(+2, +2)` to `(+8, +8)` in magenta); a
   6-pixel ink outline (each cell's rectangle stroked at 6, in ink); the fill in poster yellow; and
   2 drips per number (seeded cells get a `3 x (8 to 18)` yellow rectangle hanging from their
   bottom edge, ink-outlined). Placed at `y` 14, 120 units either side of the middle.
5. **Comic speed lines and impact bursts.** When `Pong.ballSpeed(state) > 400`: 5 ink lines behind
   the ball, starting at its edge and running back along `-velocity`, with lengths
   `(30 to 70) * speed / 720` pixels, perpendicular offsets -8, -4, 0, 4 and 8 pixels, and line
   widths 3, 2, 3, 2, 1, round caps. They are **never ahead of the ball**. On a hit (rally rose): an
   8-point starburst at the contact point (radii 18 and 34 alternating) in poster yellow with an
   ink outline, living 0.15 s and fading, drawn at step 5 so the ball covers it.
6. **The swirl and the modem** belong to the arrival flourish and the boot sting.

**Voice** (punchy synth-funk: slap bass, claps, stabs, and a short echo):

```js
voice: {
  paddle: [ { wave: 'sawtooth', freq: 110, slideTo: 82, dur: 0.14, gain: 0.30, filter: { type: 'lowpass', freq: 2200, q: 8, to: 300 } },
            { wave: 'noise', dur: 0.06, gain: 0.18, filter: { type: 'bandpass', freq: 1500, q: 1.2 } } ],
  wall:   [ { wave: 'square', freq: 880, dur: 0.05, gain: 0.10, filter: { type: 'lowpass', freq: 3000 } },
            { wave: 'noise', dur: 0.03, gain: 0.12, filter: { type: 'highpass', freq: 6000 } } ],
  score:  [ { wave: 'sawtooth', freq: 311, dur: 0.16, gain: 0.06, unison: { voices: 3, spread: 10 }, filter: { type: 'lowpass', freq: 3500 } },
            { wave: 'sawtooth', freq: 392, dur: 0.16, gain: 0.06, unison: { voices: 3, spread: 10 }, filter: { type: 'lowpass', freq: 3500 } },
            { wave: 'sawtooth', freq: 466, dur: 0.16, gain: 0.06, unison: { voices: 3, spread: 10 }, filter: { type: 'lowpass', freq: 3500 } },
            { wave: 'sawtooth', freq: 587, dur: 0.16, gain: 0.06, unison: { voices: 3, spread: 10 }, filter: { type: 'lowpass', freq: 3500 } },
            { wave: 'noise', at: 0.12, dur: 0.08, gain: 0.20, filter: { type: 'bandpass', freq: 1800, q: 1 } },
            { wave: 'sawtooth', freq: 311, at: 0.24, dur: 0.16, gain: 0.06, unison: { voices: 3, spread: 10 }, filter: { type: 'lowpass', freq: 3500 } },
            { wave: 'sawtooth', freq: 466, at: 0.24, dur: 0.16, gain: 0.06, unison: { voices: 3, spread: 10 }, filter: { type: 'lowpass', freq: 3500 } },
            { wave: 'sawtooth', freq: 78, dur: 0.10, gain: 0.25 },
            { wave: 'sawtooth', freq: 78, at: 0.24, dur: 0.10, gain: 0.25 } ],
  boot:   [ // the modem answering and screeching, then the startup chime, drops and drum hits
            { wave: 'sine', freq: 2100, dur: 0.5, gain: 0.06 },
            { wave: 'noise', at: 0.5, dur: 0.45, gain: 0.06, filter: { type: 'bandpass', freq: 1800, q: 2 } },
            { wave: 'square', freq: 1200, at: 0.55, dur: 0.3, gain: 0.03 },
            { wave: 'square', freq: 2400, at: 0.6, dur: 0.3, gain: 0.03 },
            { wave: 'sine', freq: 1568, at: 1.0, attack: 0.35, dur: 0.45, gain: 0.12 },
            { wave: 'sine', freq: 1760, slideTo: 2640, at: 1.35, dur: 0.06, gain: 0.10 },
            { wave: 'sine', freq: 1760, slideTo: 2640, at: 1.45, dur: 0.06, gain: 0.10 },
            { wave: 'sine', freq: 1760, slideTo: 2640, at: 1.55, dur: 0.06, gain: 0.10 },
            { wave: 'sine', freq: 110, slideTo: 55, at: 1.75, dur: 0.25, gain: 0.35 },
            { wave: 'sine', freq: 110, slideTo: 55, at: 1.95, dur: 0.25, gain: 0.35 } ],
  effects: { echo: { time: 0.12, feedback: 0.25, mix: 0.2 } }
}
```

The chime part only follows the **shape** of the real startup: a slow-attack swell, bouncing drops,
two synth drum hits. It is not its notes.

**Arrival flourish** (from the Nintendo 64):

1. *Ignition (p 0 to 0.25).* **A white page and a bouncing dot.** Inside the ring a paper-white
   disc (0.9 opacity); a swirl-orange dot 14 pixels across drops onto the origin and bounces twice:
   height `40 * |cos(p / 0.25 * 2 * Math.PI)| * (1 - p / 0.25)` pixels.
2. *The edge (p 0.25 to 0.8).* **The swirl.** A 3-arm spiral on the ring's edge: for each arm
   `i = 0..2`, 24 points with `theta` from 0 to 2 pi, at radius `R(p) - 50 + 50 * theta / (2 * Math.PI)`
   and angle `theta + i * 2 * Math.PI / 3 + p * 6 * Math.PI`, stroked 14 pixels in swirl orange over
   a 20-pixel ink stroke, clipped to the annulus `R(p) - 60` to `R(p) + 10`.
3. *Arrival (p 0.8 to 1).* **Comic panel snap.** A 10-pixel ink frame is drawn round the whole
   canvas (`strokeRect(5, 5, 790, 590)`, fading after `p = 0.9`), with 16 radial action lines from
   the origin, 80 pixels long, in ink.

**History notes.** The swirl is orange-red on white in North America and Japan and blue on PAL
consoles, and the startup sound was composed by Ryuichi Sakamoto (both web-checked). The console
shipped with a built-in modem (from memory).

---

## 9. Era 8: 2000 PlayStation 2

*Moody, cinematic, particle-heavy: the machine that wanted to be a film.* Card 1148.

**Name card:** `2000 · PLAYSTATION 2` with
`card: { flash: '#9fc4ff', wipe: ['#000000', '#141c33', '#2d3e50'], box: '#0b1020', border: '#2d3e50', inner: '#3a4a66', year: '#ffb347', name: '#c9d6e8', label: '#6f84a3' }`

**Palette**

| Role | Hex | Role | Hex |
| --- | --- | --- | --- |
| letterbox | `#000000` | deep navy | `#0b1020` |
| midnight | `#141c33` | slate | `#2d3e50` |
| table slab | `#1c2536` | table sheen | `#3a4a66` |
| amber light | `#ffb347` | ember | `#ff7a1a` |
| spark peak | `#ffd890` | flare blue | `#9fc4ff` |
| dust | `#d8d0c0` | HUD | `#c9d6e8` |
| ball core | `#ffffff` | ball glow | `#ffb347` |

**Camera:** `{ tilt: 30, height: 1250, fov: 29, screenY: 281 }`, drifting slowly:
`tilt: 30 + 1.5 * sin(2 * Math.PI * t / 17)`, `panX: 10 * sin(2 * Math.PI * t / 23)`,
`height: 1250 + 40 * sin(2 * Math.PI * t / 29)`. All four extremes are measured poses inside the
letterbox (section 12).

**Defining characteristics**

1. **Cinematic letterbox.** Black bars of **52 pixels** top and bottom (`fillRect(0, 0, 800, 52)`
   and `fillRect(0, 548, 800, 52)`), drawn after the ball, over everything. The camera is fitted so
   the table stays inside `y` 60 to 540 in every drift pose (R3, R8). The score lives **in the top
   bar** as a subtitle: block font at cell 5 in HUD ink at 0.85 opacity, `y` 16.
2. **Spark particles off paddle hits.** On a hit (rally rose), spawn 24 sparks at `T.ballScreen`'s
   point. Their velocities come from the file's own LCG seeded with `state.rally`, so they are
   deterministic: 120 to 420 pixels a second in a 140-degree fan away from the paddle, with gravity
   900 px/s² and a life of 0.45 s. Each is a 2-pixel line from its position back along its velocity
   times 0.02 s, colour going from spark peak to ember over its life, opacity at most 0.7, drawn
   with `globalCompositeOperation = 'lighter'` at step 5. Spark peak is not white (R1).
3. **An alpha-glow ball trail.** Keep the last 10 `T.ballScreen` points (one per frame). At step 5
   draw each as a circle of radius `r * 1.4 * (1 - i / 10)` in ball glow at opacity
   `0.25 * (1 - i / 10)`, `'lighter'`, plus a halo: a radial gradient of radius `3r` round the
   current position, ball glow at 0.35 to 0. The core is drawn crisp on top at step 7.
4. **Slow camera drift** (the camera above). Nothing in play waits for it, and it never exceeds
   the measured extremes.
5. **Lens flare.** The light source is the world point `(120, -400, 600)`, projected with the
   drifting camera, so the flare slides as the camera moves. At step 6 (`'lighter'`): the source as
   a flare-blue radial gradient of radius 90 at 0.35, plus 5 ghosts on the line from the source
   through the screen centre, at `t` of 0.3, 0.55, 0.8, 1.2 and 1.5, with radii 18, 10, 26, 8 and
   40. The ghosts are hexagons, alternating flare blue and amber, at opacity 0.08 to 0.14 (R1).
6. **Dust motes and a glossy slab.** 40 motes in screen space (seeded positions) drift at
   `(+6, 3 * sin(t + i))` pixels a second, wrapping at the edges, sized 1 to 2.5 pixels, dust
   colour at an opacity flickering from 0.15 to 0.4. The table is a dark glossy slab with a sheen
   (a linear gradient from the far-left corner to the near-right, table sheen at 0.6 to 0) and
   **reflections**: each paddle drawn a second time with `z` negated (`T.box(..., 0, -24, ...)`)
   at 0.18 opacity, before the real paddles.

**Voice** (orchestral pads, taiko and a big hit, in a large hall):

```js
voice: {
  paddle: [ { wave: 'sine', freq: 80, slideTo: 50, dur: 0.30, gain: 0.45 },
            { wave: 'noise', dur: 0.08, gain: 0.15, filter: { type: 'lowpass', freq: 900 } },
            { wave: 'triangle', freq: 392, dur: 0.25, gain: 0.10 } ],
  wall:   [ { wave: 'sine', freq: 523, attack: 0.02, dur: 0.35, gain: 0.08 },
            { wave: 'sine', freq: 784, attack: 0.02, dur: 0.30, gain: 0.05 } ],
  score:  [ { wave: 'sine', freq: 55, slideTo: 35, dur: 1.0, gain: 0.50 },
            { wave: 'noise', dur: 0.5, gain: 0.25, filter: { type: 'lowpass', freq: 600, to: 120 } },
            { wave: 'sawtooth', freq: 131, attack: 0.03, dur: 1.2, gain: 0.05, unison: { voices: 5, spread: 18 }, filter: { type: 'lowpass', freq: 900, to: 2400 } },
            { wave: 'sawtooth', freq: 196, attack: 0.03, dur: 1.2, gain: 0.05, unison: { voices: 5, spread: 18 }, filter: { type: 'lowpass', freq: 900, to: 2400 } },
            { wave: 'sawtooth', freq: 262, attack: 0.03, dur: 1.2, gain: 0.05, unison: { voices: 5, spread: 18 }, filter: { type: 'lowpass', freq: 900, to: 2400 } },
            { wave: 'sawtooth', freq: 523, attack: 0.4, dur: 1.6, gain: 0.03, unison: { voices: 5, spread: 25 }, filter: { type: 'lowpass', freq: 1800 } },
            { wave: 'sawtooth', freq: 659, attack: 0.4, dur: 1.6, gain: 0.03, unison: { voices: 5, spread: 25 }, filter: { type: 'lowpass', freq: 1800 } } ],
  boot:   [ // the tower hum: a low swelling drone and crystal twinkles
            { wave: 'sawtooth', freq: 55, attack: 1.0, dur: 2.6, gain: 0.08, unison: { voices: 5, spread: 20 }, filter: { type: 'lowpass', freq: 200, to: 800 } },
            { wave: 'sine', freq: 110, attack: 1.2, dur: 2.6, gain: 0.10 },
            { wave: 'sine', freq: 1760, at: 1.2, attack: 0.3, dur: 1.0, gain: 0.03 },
            { wave: 'sine', freq: 2217, at: 1.4, attack: 0.3, dur: 1.0, gain: 0.03 },
            { wave: 'sine', freq: 2637, at: 1.6, attack: 0.3, dur: 1.0, gain: 0.03 } ],
  effects: { reverb: { seconds: 2.8, decay: 3, mix: 0.35 } }
}
```

**Arrival flourish** (from the Dreamcast):

1. *Ignition (p 0 to 0.25).* **The bars slam in and the colour drains.** The letterbox bars ease
   from 0 to 70 pixels. Inside the ring, a `'saturation'` composite fill of `#808080` at opacity
   rising 0 to 0.8 strips the Dreamcast's poster colours.
2. *The edge (p 0.25 to 0.8).* **The boot towers.** 18 translucent pillars stand on the ring's
   circumference, 10 pixels wide and 40 to 140 pixels tall (seeded), each rising over 0.15 of `p`,
   staggered by its angle, filled with a flare-blue gradient at 0.5 fading to 0 upward, `'lighter'`.
   Dust motes spill outward from the edge.
3. *Arrival (p 0.8 to 1).* **The flare sweeps into place**: the flare source slides from the
   origin to its resting world point, the ghosts stretching along, and the bars settle from 70 to
   52.

---

## 10. Era 9: 2001 Xbox

*Hard, shiny, metal and green.* The first console with programmable pixel shaders, and it showed
them off with bump maps, specular highlights and real-time shadows. Card 1149.

**Name card:** `2001 · XBOX` with
`card: { flash: '#b6ff3a', wipe: ['#050605', '#7cd320', '#050605'], box: '#050605', border: '#7cd320', inner: null, year: '#9dff3a', name: '#d7f5c0', label: '#5b635d' }`

**Palette**

| Role | Hex | Role | Hex |
| --- | --- | --- | --- |
| black | `#050605` | gunmetal | `#2a2f2b` |
| steel | `#5b635d` | steel light | `#aeb8b0` |
| plate face | `#3a413c` | plate emboss dark | `#141814` |
| plate emboss light | `#8a948c` | specular | `#e8ffe0` |
| green | `#7cd320` | green dark | `#1d4d0f` |
| green glow | `#b6ff3a` | shield full | `#9dff3a` |
| shield alarm | `#ff3b2f` | tag plate | `#1a1f1b` |
| tag text | `#d7f5c0` | ball core | `#ffffff` |

**Camera:** `{ tilt: 27, height: 1000, fov: 35, screenY: 303 }`.

**Defining characteristics**

1. **Bump-mapped metal with strong specular.** A 64 x 64 diamond-plate tile, built once: gunmetal
   ground with 8 lozenges, each drawn 3 times (emboss dark offset `+1, +1`, emboss light offset
   `-1, -1`, then plate face), plus a second **highlight-only** tile holding just the light offsets.
   The table is 12 depth strips; for each, `T.path` the strip, `clip()`, `setTransform` to the
   strip's projected scale, and fill with the plate pattern. Then at step 3 comes the **specular
   pool** under the moving light: a radial gradient of radius `160 * scale` from specular at 0.35
   to 0, `'lighter'`, and the highlight-only tile again, clipped to that pool, at 0.6. The emboss
   lights up where the light is and goes dull where it is not: that is the bump map. Paddles are
   `shade: 'gradient'` steel with a 2-pixel specular stripe on the top face whose position along
   the paddle follows the light's `y`. *Null tile:* flat gunmetal quads and the pool alone.
2. **Hard dynamic shadows from a moving light.** The light orbits:
   `L = (400 + 300 * cos(2 * Math.PI * t / 9), 300 + 180 * sin(2 * Math.PI * t / 9), 520)`. The
   shadow of a point `P` falls on the table at `L + (P - L) * (L.z / (L.z - P.z))`. For each paddle,
   fill the hull of its footprint and its four projected top corners in `#000000` at **0.45**; the
   ball's shadow is its centre at `z = r` cast the same way, as an ellipse. The shadows are
   hard-edged, with no gradient. The contact shadow still sits under the ball at its true footprint
   (R5).
3. **Green on black, glowing.** Everything is black or steel except the green: the rails' top faces
   are green with a 2-pixel green-glow line, `'lighter'`; the paddles' outer edges are stroked
   1.5 pixels in green with `shadowBlur: 8` and `shadowColor` green (the only `shadowBlur` in the
   era: 2 paddles). The far backdrop is black with a faint green horizon line.
4. **Gamertags over the paddles.** Each paddle carries a floating nameplate at the projection of
   `(paddle centre x, paddle centre y, 60)`: a 104 x 22 rounded rectangle in tag plate at 0.85,
   with a 1-pixel green border, text in the block font at cell 2 in tag text. The left tag reads
   `PONG SLAYER` and the right `CPU 2001`. Nameplates are world-space and drawn at step 5, so the
   ball is always drawn over them (R1, R8).
5. **A Halo-style shield bar as the score.** Two segmented bars in the HUD band, top left and top
   right: 10 skewed segments each (`transform(1, 0, -0.3, 1, 0, 0)`), 16 x 12 pixels with a
   3-pixel gap. Filled segments are shield full with a lighter top half, empty ones green dark at
   0.7, and every segment is outlined in green. `score % 10` segments are filled, and the total
   stands beside the bar in the block font at cell 5. When a side concedes, its bar flashes shield
   alarm for 0.3 s, then **recharges**, segments refilling left to right over 0.5 s, timed from the file's own record of when the
   point landed (rule 1.4).
6. **Sub-heavy metallic hits** (below).

**Voice:**

```js
voice: {
  paddle: [ { wave: 'sine', freq: 180, dur: 0.25, gain: 0.25, fm: { ratio: 1.41, index: 3 } },
            { wave: 'sine', freq: 45, slideTo: 35, dur: 0.20, gain: 0.45 },
            { wave: 'noise', dur: 0.03, gain: 0.15, filter: { type: 'bandpass', freq: 3500, q: 3 } } ],
  wall:   [ { wave: 'sine', freq: 620, dur: 0.12, gain: 0.12, fm: { ratio: 2.76, index: 1.8 } },
            { wave: 'sine', freq: 60, dur: 0.08, gain: 0.25 } ],
  score:  [ { wave: 'sawtooth', freq: 220, slideTo: 110, dur: 0.35, gain: 0.08, filter: { type: 'lowpass', freq: 1200 } },
            { wave: 'square', freq: 880, at: 0.00, dur: 0.06, gain: 0.05 },
            { wave: 'square', freq: 880, at: 0.12, dur: 0.06, gain: 0.05 },
            { wave: 'square', freq: 880, at: 0.24, dur: 0.06, gain: 0.05 },
            { wave: 'sine', freq: 40, dur: 0.6, gain: 0.50 },
            { wave: 'sine', freq: 300, slideTo: 1200, at: 0.5, dur: 0.5, gain: 0.06 } ],
  boot:   [ // the sphere thrum: a pulsing sub, a rising whoosh, a power-up chime
            { wave: 'sine', freq: 45, dur: 2.4, gain: 0.50, lfo: { freq: 6, depth: 0.6 } },
            { wave: 'sawtooth', freq: 90, attack: 0.8, dur: 2.4, gain: 0.08, unison: { voices: 3, spread: 8 }, filter: { type: 'lowpass', freq: 150, to: 900 } },
            { wave: 'noise', attack: 1.2, dur: 1.6, gain: 0.08, filter: { type: 'bandpass', freq: 400, q: 1.5, to: 3000 } },
            { wave: 'sine', freq: 1320, at: 1.8, dur: 0.6, gain: 0.06 },
            { wave: 'sine', freq: 1980, at: 1.8, dur: 0.6, gain: 0.06 } ],
  effects: { shape: 0.3, reverb: { seconds: 1.4, decay: 2, mix: 0.3 } }
}
```

(`effects.shape` is a WaveShaper on the era's bus, the same curve as the note field.)

**Arrival flourish** (from the PlayStation 2):

1. *Ignition (p 0 to 0.25).* **The green orb.** At the origin a sphere grows to 90 pixels: a radial
   gradient `#e8ffb0`, green, green dark, then transparent, `'lighter'`. The PlayStation 2's
   letterbox bars retract as it grows.
2. *The edge (p 0.25 to 0.8).* **Ooze and metal.** 10 bezier tendrils run from the orb to evenly
   spaced points on the ring's edge, stroked in green from 6 pixels down to 1, with `shadowBlur`
   12. The edge itself is a hard metallic band: an 8-pixel stroke with a steel to steel-light
   gradient, then a 2-pixel green-glow line inside it.
3. *Arrival (p 0.8 to 1).* **The light snaps on.** The orbiting light sweeps from the origin to its
   orbit start, so every hard shadow swings across the table in 0.2 s, under a green full-frame
   pulse at opacity `0.12 * |sin(p * 6 * Math.PI)|`.

**History note.** Gamertags arrived with Xbox Live in November 2002, a year after launch, and are
used here as the era's shorthand (from memory).

---

## 11. Era 10: 2005 Xbox 360, the top of the ladder

*HD, and every post-process effect at once.* Bloom, the brown-and-grey grade, grain, motion blur,
depth of field, the Blades dashboard and achievements. **The era the whole climb is named for:
the loudest chapter.** Card 1150.

**Name card:** `2005 · XBOX 360` with
`card: { flash: '#fff8e7', wipe: ['#5dc21e', '#d9dcd6', '#3b342b'], box: '#1b1b1b', border: '#5dc21e', inner: null, year: '#5dc21e', name: '#ffffff', label: '#a8a296' }`

**Palette**

| Role | Hex | Role | Hex |
| --- | --- | --- | --- |
| umber | `#3b342b` | mud | `#5a5145` |
| concrete | `#7d776c` | ash | `#a8a296` |
| grade tint | `#c9b89a` | bloom white | `#fff8e7` |
| HDR sun | `#ffd9a0` | blade green | `#5dc21e` |
| blade green dark | `#2f6b12` | blade silver | `#d9dcd6` |
| toast | `#1b1b1b` | toast text | `#ffffff` |
| vignette | `#000000` | grain mid | `#808080` |
| ball core | `#ffffff` | ball glow | `#fff8e7` |

**Camera:** `{ tilt: 32, height: 1600, fov: 20.5, screenY: 312 }`: a long lens, which is also what
makes the depth of field believable.

**Defining characteristics**

1. **HD crispness.** Fine detail everywhere the earlier eras had chunks: the table is a concrete
   slab with a fine 2-pixel grating tile (a 16 x 16 tile of 1-pixel concrete and mud lines), rails
   with 1-pixel bevel highlights on half-pixel coordinates, and hairline HUD rules. The HUD text
   uses `fillText` with `'600 20px "Segoe UI", "Helvetica Neue", Arial, sans-serif'`: the one era
   allowed a system font, because HD text was the point. The block font is the fallback when
   `measureText` reports zero width.
2. **Bloom and HDR glow.** Emissive things (the rail light strips, the HDR sun behind the far wall,
   the paddles' rim lights and the ball's glow halo) are also drawn into
   `T.offscreen('bloom', 200, 150)` at quarter scale. After the scene (step 6), that buffer is added
   back twice with `'lighter'`: once scaled up with smoothing at 0.55 opacity, and once from an
   eighth-scale copy (`T.offscreen('bloom2', 100, 75)`) at 0.35. That is a wide, soft, multi-scale
   glow. The ball's **halo** blooms; its core does not (R2). *Null offscreen:* the halo drawn
   directly at 0.35.
3. **The brown-and-grey grade, vignette and film grain.** After bloom, before the ball: a
   `'saturation'` fill of `#6e6a60` at 0.55 (drains colour), a `'multiply'` fill of grade tint at
   0.35 (the brown), and a vignette (a radial gradient centred `(400, 300)`, clear at radius 250 to
   `rgba(0,0,0,0.65)` at 520, over the full frame). The grain: 3 noise tiles of 128 x 128, built
   once, each 1400 random 1 to 2 pixel rectangles in black and white on grain mid. Every frame uses
   tile `Math.floor(state.time * 24) % 3` at a seeded random offset, filled over the frame with
   `'overlay'` at 0.12. The paddles' earned inks are restored **after** the grade with a
   1.5-pixel rim stroke at full saturation (R4).
4. **Motion blur on the ball, depth of field on the far end.** *Motion blur:* behind the ball
   (step 5), a capsule from the position 1/30 s back to now, as wide as the ball, filled with a
   linear gradient along the motion from transparent to ball glow at 0.5, plus 3 ghost discs at 8,
   16 and 24 ms back at 0.3, 0.2 and 0.1. The core stays crisp on top (R2); paddles never get it
   (R4). *Depth of field:* scenery behind the far wall is drawn into `T.offscreen('dof', 267, 200)`
   at a third of the scale and copied up with smoothing (soft); the table's far strip (`d` from 0.85
   to 1) is drawn a second time from a half-scale copy, clipped to that strip, at 0.6. Paddles and
   the ball are drawn after, sharp.
5. **The Blades HUD.** Four blade tabs across the HUD band's right half, each a tall parallelogram
   36 pixels wide with a 10-degree slanted leading edge. The first is blade green with the left
   score, the second blade silver with the right score (both in the HD font, toast text on green,
   toast on silver), and the other two dark. A 1-pixel blade-green-dark hairline runs under the
   whole band.
6. **"Achievement Unlocked".** Entering the era, and on every point: a toast slides down into the
   HUD band, top centre, 340 x 52 at `y` 8 (R8). Timeline: in over 0.25 s, holding 2.0 s, out over
   0.25 s; a new point replaces the one showing. It is a toast-coloured rounded rectangle at 0.92, a
   40-pixel circular badge on the left (a blade-green radial gradient with a white ring), then two
   lines: `ACHIEVEMENT UNLOCKED` at 12 px in blade silver, and below it `50G - WELCOME TO HD` (on
   entering) or `10G - POINT SCORED` (on a point) at 16 px in toast text. The blip is the score
   voice.

**Voice** (big, modern, clean; a toast blip on every point):

```js
voice: {
  paddle: [ { wave: 'sine', freq: 120, slideTo: 60, dur: 0.18, gain: 0.45 },
            { wave: 'noise', dur: 0.05, gain: 0.20, filter: { type: 'bandpass', freq: 2500, q: 0.8 } },
            { wave: 'triangle', freq: 1760, dur: 0.04, gain: 0.05 } ],
  wall:   [ { wave: 'noise', dur: 0.04, gain: 0.15, filter: { type: 'highpass', freq: 2000 } },
            { wave: 'sine', freq: 900, dur: 0.05, gain: 0.06 } ],
  score:  [ // the achievement blip: a soft click and two bright rising tones
            { wave: 'noise', dur: 0.01, gain: 0.10, filter: { type: 'highpass', freq: 5000 } },
            { wave: 'sine', freq: 1175, attack: 0.003, dur: 0.07, gain: 0.20 },
            { wave: 'sine', freq: 1568, at: 0.07, dur: 0.18, gain: 0.18 } ],
  boot:   [ // the whoosh, the swelling chord, the chime, the blip
            { wave: 'noise', attack: 1.1, dur: 1.4, gain: 0.12, filter: { type: 'bandpass', freq: 300, q: 1.5, to: 5000 } },
            { wave: 'sawtooth', freq: 220, attack: 0.9, dur: 1.8, gain: 0.04, unison: { voices: 5, spread: 20 }, filter: { type: 'lowpass', freq: 600, to: 4000 } },
            { wave: 'sawtooth', freq: 330, attack: 0.9, dur: 1.8, gain: 0.04, unison: { voices: 5, spread: 20 }, filter: { type: 'lowpass', freq: 600, to: 4000 } },
            { wave: 'sawtooth', freq: 440, attack: 0.9, dur: 1.8, gain: 0.04, unison: { voices: 5, spread: 20 }, filter: { type: 'lowpass', freq: 600, to: 4000 } },
            { wave: 'sine', freq: 55, at: 1.15, dur: 0.8, gain: 0.35 },
            { wave: 'sine', freq: 1760, at: 1.2, dur: 0.9, gain: 0.10 },
            { wave: 'sine', freq: 2637, at: 1.25, dur: 0.7, gain: 0.05 },
            { wave: 'sine', freq: 1175, at: 2.0, attack: 0.003, dur: 0.07, gain: 0.18 },
            { wave: 'sine', freq: 1568, at: 2.07, dur: 0.18, gain: 0.16 } ],
  effects: { reverb: { seconds: 2.5, decay: 2.5, mix: 0.4 } }
}
```

The blip and the boot follow the shape of the originals (two quick bright tones; a whoosh into a
chime), from memory. They are not transcriptions.

**Arrival flourish** (from the Xbox):

1. *Ignition (p 0 to 0.25).* **HDR white-out.** At the origin, a radial burst
   of bloom white out to 260 pixels, `'lighter'`, plus a full-frame `'screen'` wash of bloom white
   at `0.35 * (1 - p / 0.25)`: the eye adapting.
2. *The edge (p 0.25 to 0.8).* **Green light ribbons.** 3 ribbons orbit the ring's edge, each a
   40-point stroke over an arc of 1.2 radians starting at `p * 5 * Math.PI + i * 2.1`, at radius
   `R(p) + 8 * sin(6 * theta + state.time * 9)`, 3 pixels wide, in blade green, drawn into the bloom
   buffer too. Inside the ring the grade fades up from nothing to full (grade opacity eases with
   `p`), so the Xbox's green drains into brown as the edge passes.
3. *Arrival (p 0.8 to 1).* **The blades slide in and the toast pops.** The 4 blade tabs sweep in
   from `x` 800 to their places, 0.06 of `p` apart, and the `50G - WELCOME TO HD` toast drops in.
   The boot sting's blip lands with it.

---

## 12. Camera measurements

`node tools/table3d-cameras.js` measures every camera above against rule R3, at rest and at every
motion extreme each chapter names. `test/eras-bible.test.js` fails if any pose stops passing. The
run at the time of writing:

| Era | Camera | Near edge on screen | Far edge on screen | Far/near width | Far/near depth | Paddle at far / near wall | Worst motion pose, depth | Steepest passing tilt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5 PlayStation | tilt 28, height 1150, fov 30, screenY 306 | x 14.5 to 785.5, y 561.3 | x 89.7, y 100.5 | 0.805 | 0.648 | 53.4 px / 77.5 px | 0.646 | 35.5 deg |
| 6 Nintendo 64 | tilt 26, height 900, fov 39.5, screenY 301 | x 15.8 to 784.2, y 560.0 | x 105.0, y 102.1 | 0.768 | 0.590 | 50.9 px / 80.1 px | 0.573 (tilt 28) | 31.5 deg |
| 7 Dreamcast | tilt 22, height 1500, fov 23.5, screenY 314 | x 16.8 to 783.2, y 580.5 | x 66.6, y 82.1 | 0.870 | 0.757 | 61.8 px / 78.5 px | none moves | 37 deg |
| 8 PlayStation 2 | tilt 30, height 1250, fov 29, screenY 281 | x 41.2 to 758.8, y 514.0 | x 108.8, y 91.9 | 0.812 | 0.659 | 49.3 px / 70.5 px | 0.642 (drift) | 34.5 deg |
| 9 Xbox | tilt 27, height 1000, fov 35, screenY 303 | x 14.1 to 785.9, y 560.9 | x 97.6, y 100.9 | 0.784 | 0.614 | 52.0 px / 79.1 px | none moves | 33.5 deg |
| 10 Xbox 360 | tilt 32, height 1600, fov 20.5, screenY 312 | x 15.9 to 784.1, y 556.3 | x 75.6, y 105.7 | 0.845 | 0.713 | 54.5 px / 72.8 px | none moves | 39.5 deg |

The steepest passing tilt holds each camera's height, fov and screenY fixed; a steeper look needs
the fov and screenY re-fitted (`node tools/table3d-cameras.js --fit`). The PlayStation 2 is
narrower on screen than the rest because its table must also clear the letterbox bars (60 to 540).
The flat check prints `(0,0) at (0.000, 0.000), (800,600) at (800.000, 600.000)`: tilt 0 with
height equal to focal is today's 2D frame.

---

## 13. Sources, and what is from memory

Web-checked on 2026-09-10:

- The PlayStation's launch dates, 3 December 1994 in Japan and 9 September 1995 in North America:
  [Wikipedia, PlayStation (console)](https://en.wikipedia.org/wiki/PlayStation_(console)) and
  [Britannica](https://www.britannica.com/topic/PlayStation).
- The Dreamcast startup (Ryuichi Sakamoto's sound; the orange-red swirl on white, blue on PAL
  consoles): [Audiovisual Identity Database, Dreamcast startup screens](https://www.avid.wiki/Dreamcast/Startup_Screens)
  and [Hideki Naganuma on X](https://twitter.com/Hideki_Naganuma/status/670265442125025280).

**From memory, unverified:** every other launch year in section 0 (they match the ladder already in
the rules); the hardware traits named in each chapter's opening line; the Nintendo 64 having no boot
screen or sound; the Rumble Pak's 1997 arrival; the PlayStation 2 tower boot; the Xbox orb boot;
gamertags arriving with Xbox Live in 2002; the 360's Blades dashboard and achievement sound. **All
palettes and every synthesis recipe are designed here to evoke their machine**: none is sampled or
transcribed from the hardware.
