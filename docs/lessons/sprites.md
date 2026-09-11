# Sprites: drawing them the EarthBound way

Tim, 2026-09-11: *"some of these sprites are pretty jacked ... I feel like we were doing pretty
good with the earthbound sprite generation stuff, even though it was a bit slow. Here, we don't
need realtime generation so we can deal with slow if it's good quality."*

This page covers every 2D era (1 to 4). It describes `tools/spritegen.mjs` (item 1272), ported
from the EarthBound hack's character pipeline, and what the port taught. Proof, old beside new:
[contact.png](../shots/item-1272/contact.png).

## What the EarthBound pipeline actually is

It is **not** an image model. The EarthBound hack's sprites were drawn by a Claude run writing each
frame as a **text grid**: one character per pixel, one letter per palette entry, one grid row per
line of a JSON file. A renderer turns the grid into the sprite, a checker names the known faults,
and one contact picture is looked at before anything ships. Its standing method is the
`gen-character` skill (`C:/Users/Tim/.claude/skills/gen-character/SKILL.md`). Its tools are in
`earthbound-hack/docs/artgen/tokens/synth/`: `look.py` for the one picture, `lint.py` for the
preflight, `gate.py` and `budget.py` for the numbers, and `poke.py` for revising by region.

- **No model server is needed.** The model is the worker doing the drawing. The EarthBound repo
  also has an older diffusion path, a ComfyUI server on 127.0.0.1:8188 described in
  `docs/artgen/COMFY-NODES.md`. That path is not the one Tim meant, and nothing here uses it. The
  local model server on 8080 is not touched either.
- **Slow means model thinking, not tools.** EarthBound measured 85-95% of a sprite run as thinking
  and under 5% as tools. Its 8-slot, 16 x 24 sheets took 22-30 minutes each, with a gate on face
  legibility and detail.

## What carried over

| EarthBound | here |
| --- | --- |
| ebgrid-v1 JSON, one grid row per line, edited by row | pgrid-v1, the same layout, written by `stringify` |
| relations (`mirror`, `copy`) build 8 slots from fewer | `from` + `dx`/`dy` + `mirror` + `patch` rows (`_` keeps the pixel beneath) |
| two passes: masses, LOOK, then detail, LOOK | the same, and it is the part that matters |
| `look.py`: one PNG and one stdout line | `look`: every frame at 4x beside the reference, and one `LOOK` line |
| `lint.py` / `gate.py`: hard faults vs advisory numbers | `lint`: faults exit 1; the outline, detail and unique numbers are only prompts to go and look |
| the 1-row baseline rule | every standing frame's feet agree within one row (the win's hop is exempt) |
| likeness mode, starting from a vanilla sprite | `trace`: a reference PNG snapped to the era's colours and lettered |

## What was new for pong

- **The machine's rules are faults.** A colour off the Genesis's 3-bit grid, more than 15 colours in
  one sprite palette, more than one colour a line on the 2600, or more than three in an NES 8 x 8
  tile (a note, since a figure can stack palettes). pixellab never knew these rules. The checker's
  first run on today's Genesis barbarian found **46 colours** in a sheet whose machine held 15.
- **The rig's layout is the output.** `build` writes one row per beat (idle, up, down, swing, miss,
  win) and one column per frame. That is the order `src/characters.js` cuts, so a sheet drops in
  where a pixellab one was.
- **The hand is checked.** The paddle is drawn at the frame's `hand`, so a frame with nothing solid
  within 3 pixels of it gets a note.

## What did not carry over, and why

- **EarthBound's face and legibility gates** (`legible >= 3`, `face_detail`, the skin-pixel floor)
  were tuned on HAL's 16 x 24 townsfolk, which have palette-5/6 skin semantics. Pong's figures range
  from 6 to 32 pixels wide across four machines, so those thresholds would mean nothing here.
- **`match.py` and `compose.py`** begin from a library of 118 vanilla HAL sprite groups. Pong has
  no such library, so a sheet starts from a prompt (`new`) or from a reference (`trace`).
- **Tracing a pixellab sheet is a poor starting point for a figure.** The barbarian's trace came
  back with 46 colours and 11 different frames out of 12, and the character changed costume,
  helmet and shield from frame to frame. A trace is useful for a single prop or a pose reference.
  For a figure, draw one frame and derive the rest from it.

## Timing (item 1272, measured by the clock)

- **Drawing the barbarian, 12 frames of 20 x 25, two passes with a look after each: 3 min 44 s.**
  The drawing is 1 frame written in full, 11 derived from it with shifts and patched rows, and 10
  rows of detail in pass 2. That is a lower bar than EarthBound's gated 22-30 minute sheets: there
  is no face gate and there are fewer unique poses (9 of 12).
- **The tool: 17 ms to build the sheet.** Checking and looking take under a second.

## START HERE (the loop)

```
node tools/spritegen.mjs new assets/spritegen/<id>.json --era 3 --frame 20x25 --prompt "..."
#  pass 1: silhouette and colour masses in idle0, the other frames as relations
node tools/spritegen.mjs look assets/spritegen/<id>.json --ref assets/pixellab/<old>.png --scale 8
#  LOOK at the PNG. Then pass 2: face, seams, glints, studs. Then look again.
node tools/spritegen.mjs lint  assets/spritegen/<id>.json
node tools/spritegen.mjs build assets/spritegen/<id>.json
node tools/spritegen.mjs contact assets/spritegen/<id>.json --out docs/shots/<card>/contact.html --minutes <m>
```

- **Nothing ships unlooked.** The checker cannot see mud. Our eyes are the real gate, just as they
  were in EarthBound.
- **Give each frame's rows the whole width.** A patch row is the frame's full width, with `_` for
  "keep what is there". Most "fixes" that silently did nothing in EarthBound were short or
  misaligned rows.
- **Keep one palette letter for the outline (`k`)** and keep the figure chunky. EarthBound found
  thin bodies were the tell that a sprite was not HAL's.
- **The grid, not the PNG, is committed as the source.** `test/spritegen.test.js` fails when the
  committed sheet has drifted from its grid.
