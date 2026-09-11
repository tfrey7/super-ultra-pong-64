# Blender scripts

The 3D eras' player models (eras 5 to 10) are built here by Blender scripts and exported as small
JSON files under `assets/models/`, which `src/models3d.js` draws on the table with the game's own
canvas 2D (item 1248). Blender is a tool on the author's machine, never a dependency of the game:
the exported files are checked in, and the page needs nothing but them.

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

Headless only -- never open the Blender window, and depend on no add-on:

```powershell
& "G:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --factory-startup `
    --python tools/blender/player-proof.py -- assets/models/player-proof-lo.json --detail lo
```

Everything after `--` belongs to the script. Run from the repo root. Each run takes about two
seconds and prints one line naming the file, its vertex and triangle counts and the Blender
version. A script writes `<name>.json` and, beside it, `<name>.js`: the same data as a one-line
plain script (`PongModelFiles["<name>"] = {...}`), because a page opened off disk cannot `fetch` a
JSON file, and a `<script>` tag is how every other asset reaches it (GitHub Pages serves both the
same way).

## The scripts

| script | what it makes |
| --- | --- |
| `player-proof.py` | the proof figure: one player out of Blender's own primitives (cones, UV spheres, cubes), six poses -- idle, up, down, swing, miss, win -- at three budgets: `--detail lo` 244 triangles (PlayStation, N64), `mid` 548 (Dreamcast, PS2), `hi` 1128 (Xbox, Xbox 360) |

Re-make all three:

```powershell
$b = "G:\Program Files\Blender Foundation\Blender 5.1\blender.exe"
foreach ($d in 'lo','mid','hi') { & $b --background --factory-startup --python tools/blender/player-proof.py -- "assets/models/player-proof-$d.json" --detail $d }
```

## The model format (`pong-model-1`)

```
{ "format": "pong-model-1", "name", "by", "blender",
  "palette": ["#rrggbb", ...], "slots": ["skin", "ink", "pants", "shoes", "hair", "glove"],
  "tris":   [a, b, c, ...]            three vertex indices a triangle
  "colors": [slot, ...]               one palette index a triangle
  "hand":   [x, y, z]                 the paddle hand at idle
  "height": h,
  "beats":  { "idle": [x, y, z, ...], "up", "down", "swing", "miss", "win" } }
```

Model space is the table's: x forward (the figure faces +x, toward the ball), y across the table
(+y toward the near edge), z up, in table units, the origin on the floor under the figure. Every
beat lists the same vertices in the same order, so the game blends two beats by mixing their
arrays. The slot named `ink` is repainted in the paddle's own colour by the game, so the shirt
always matches the paddle and the score. A new era's model card writes its own script beside this
one in the same format and names its file in that era's block in `src/characters.js`
(`model: '<name>'`).
