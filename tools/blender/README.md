# Blender figures: the contract

The players of the 3D eras (5 to 10) are made in Blender, by a script, and saved as **standard
glTF files with their moves in them**. The real 3D layer (`src/field3d.js`, item 1273) loads
those files directly, stands one figure behind each paddle, plays the move that matches what
that paddle is doing, and lights and shades the figures with the table (item 1274). Blender is
a tool on the author's machine and never a dependency of the game: the exported files are
checked in, and the page needs nothing but them.

This page is the contract the six era figure cards (items 1253 to 1258) build to. The worked
example that meets it is `figure-gltf.py`, which re-makes item 1248's proof figure this way.

## Where Blender is

On Tim's machine, Blender **5.1.2** is installed at

```
G:\Program Files\Blender Foundation\Blender 5.1\blender.exe
```

Found through the registry's uninstall entries (`HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*`,
DisplayName `Blender`, InstallLocation `G:\Program Files\Blender Foundation\Blender 5.1\`); it is
**not on PATH**, so `where.exe blender` finds nothing. Its user settings live under
`%APPDATA%\Blender Foundation\Blender\5.1`, and the scripts here ignore them (`--factory-startup`).

## How a script is run

Headless only. Never open the Blender window, and never drive Tim's open Blender through the
Blender MCP tools (`mcp__blender__*`): that window is his own.

```powershell
$b = "G:\Program Files\Blender Foundation\Blender 5.1\blender.exe"
& $b --background --factory-startup --python tools/blender/figure-gltf.py -- assets/models/player-proof-lo.glb --detail lo
```

Everything after `--` belongs to the script. Run from the repo root. A run takes about a second and
prints one line naming the file, its vertex, triangle and clip counts, its size and the Blender
version. The only add-on used is the **glTF exporter that ships inside Blender**
(`io_scene_gltf2`, on under `--factory-startup`); nothing else is installed.

## 1. The script's shape

One script per figure, `tools/blender/<figure>.py`, taking `-- <out.glb> [--detail lo|mid|hi]`. It:

1. starts from an empty scene (`bpy.ops.wm.read_factory_settings(use_empty=True)`), so the
   output never depends on what Blender remembers;
2. builds **one mesh** and **one armature** (the rig), and binds every vertex of the mesh to the
   rig's bones through vertex groups named after them and an Armature modifier;
3. gives the mesh its materials, one per palette slot, **one of them named `ink`**;
4. keys **one action per clip** (section 3), each pushed onto its own NLA track named after the clip;
5. writes the scene's `pong` custom property (section 2), which the exporter carries as glTF extras;
6. exports with `bpy.ops.export_scene.gltf(export_format='GLB', export_yup=True,
   export_extras=True, export_animations=True, export_animation_mode='NLA_TRACKS',
   export_skins=True, export_force_sampling=True, export_frame_step=2)`;
7. writes `<out>.js` beside the `.glb` (section 4) and prints its one line.

`figure-gltf.py` does all seven in about 250 lines. Copy it, replace the body and the poses, and
keep the rest.

## 2. The file format

**Binary glTF 2.0** (`.glb`), one file per figure and detail level:

- **One skinned mesh**, one skeleton. The layer clones the whole scene once per player
  (`THREE.SkeletonUtils.clone`), so the two ends of the table each have their own pose.
- **Materials** are plain glTF PBR (base colour, roughness), lit by the table's own light. The
  material named **`ink`** is repainted by the game each frame in its paddle's colour, so the shirt
  always matches the paddle and the score. Textures are allowed, embedded in the `.glb`.
- **The scene's extras**, `extras.pong`:

  ```
  { "format": "pong-figure-1", "name": "<file name>", "by": "<script and flags>",
    "blender": "5.1.2", "ink": "ink", "clips": [the six names],
    "hand":   [x, y, z]     the paddle hand at idle, in the file's axes
    "height": h }           the figure's height, in table units
  ```

## 3. The clips

Six clips, each a glTF animation, and these names exactly:

| clip | what it is | the game's beat | how the layer plays it |
| --- | --- | --- | --- |
| `idle` | standing ready, breathing | `idle` | looped on the game clock |
| `move_up` | stepping toward the far edge | `up` | looped while the paddle moves up |
| `move_down` | stepping toward the near edge | `down` | looped while the paddle moves down |
| `swing` | the stroke through the ball | `swing` | once from the contact, **0.3 s** long (`SWING_S`) |
| `celebrate` | won the point | `win` | once from the point, then holds its last frame |
| `lose` | lost the point | `miss` | once from the point, then holds its last frame |

The beat is src/characters.js's (`beatOf`): the same beats the 2D sprites and the polygon figures
run. The layer sets each clip's time from the game clock, never from wall time, so a frame drawn
twice (a ring wipe, the playtest's offscreen comparison) shows the same pose, and a change of clip
cross-fades over 0.12 s. A one-shot clip should start and end near `idle`, except `celebrate` and
`lose`, which hold where they end for as long as the beat lasts (1.2 s). A loop's first and last
keys must match.

## 4. Scale, axes and where the files go

- **Axes in Blender**: +X is forward (the figure faces +X, toward the ball); **-Y is the table's
  near edge**, the camera's side, which is Blender's own Front view; +Z is up. The origin is the
  floor under the figure. With `export_yup` the file then reads x forward, y up, z toward the near
  edge, which are the 3D layer's own world axes, so the layer applies no turn.
- **Scale**: one Blender unit is **one table unit** (the table is 800 by 600). The proof figure
  stands about 90 tall. The era's block in `src/characters.js` multiplies it by `modelScale` (1.8
  today) for the steep cameras. The right-hand player is the same file mirrored in x.
- **Where it stands**: the layer puts the idle `hand` on the paddle's outer face, 2.5 units out,
  half way down the paddle, with the feet on the table's floor level, the way the polygon figures
  stood. Its bat is drawn as tall as that hand (`slabZ`). Item 1266 moves the camera and the table.
  When it does, placement changes in the layer, not in the files.
- **Files**: `assets/models/<name>.glb`, and beside it `assets/models/<name>.glb.js`, the same bytes
  as base64 in one line: `(globalThis.PongFigureFiles = ...)["<name>"] = "<base64>";`. A page
  opened off disk cannot `fetch` a file, and a `<script>` tag is how every other asset reaches it.
  The layer adds that script tag itself the first time an era asks for the name. Nothing goes in
  `index.html`.
- **Naming it for an era**: the era's block in `src/characters.js` names the figure as `figure:
  '<name>'`, or one a side as `figures: { left, right }` -- the only key (item 1336; a block never
  writes `model` or `models`). The layer loads `<name>.glb.js`. A name with no
  glTF file keeps drawing item 1248's polygon figure of that name, the fallback. A figure card that
  wants a fallback too also writes `<name>.json` in the old format below.
- **Budgets**: the proof figure is 244, 548 and 1128 triangles (`--detail lo`, `mid`, `hi`) at
  about 105 to 120 KB a file, most of it the six clips sampled at 15 a second.

## The scripts

| script | what it makes |
| --- | --- |
| `figure-gltf.py` | the proof figure as a glTF figure: the rig (a root and one bone per body part, 17 in all), the six clips, at three budgets -- `assets/models/player-proof-{lo,mid,hi}.glb` and `.glb.js` |
| `player-proof.py` | the same figure in the fallback's format below, `assets/models/player-proof-{lo,mid,hi}.json` and `.js`; `figure-gltf.py` borrows its skeleton and body parts, so the two stay the same person |

Re-make all of them:

```powershell
$b = "G:\Program Files\Blender Foundation\Blender 5.1\blender.exe"
foreach ($d in 'lo','mid','hi') {
  & $b --background --factory-startup --python tools/blender/figure-gltf.py -- "assets/models/player-proof-$d.glb" --detail $d
  & $b --background --factory-startup --python tools/blender/player-proof.py -- "assets/models/player-proof-$d.json" --detail $d
}
```

`node --test test/figures.test.js` checks the contract: each `.glb` is glTF 2.0 with one skinned
mesh, the six clips by name, an `ink` material and the `pong` extras, and its `.glb.js` holds the
same bytes.

## The fallback's format (`pong-model-1`)

When the page has no WebGL (or `?gl=off`, or `?figures=off`, or before a figure's file has loaded),
`src/models3d.js` draws the players with canvas 2D from item 1248's compact JSON. It is the
fallback's format only. A new figure is made as glTF first.

```
{ "format": "pong-model-1", "name", "by", "blender",
  "palette": ["#rrggbb", ...], "slots": ["skin", "ink", "pants", "shoes", "hair", "glove"],
  "tris":   [a, b, c, ...]            three vertex indices a triangle
  "colors": [slot, ...]               one palette index a triangle
  "hand":   [x, y, z]                 the paddle hand at idle
  "height": h,
  "beats":  { "idle": [x, y, z, ...], "up", "down", "swing", "miss", "win" } }
```

Its model space is x forward, y across the table (+y toward the near edge), z up, in table units.
Every beat lists the same vertices in the same order, so the game blends two beats by mixing their
arrays. Beside each `<name>.json` is `<name>.js`, the same data as `PongModelFiles["<name>"]`.
