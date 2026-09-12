# Item 1295: append the reference-ladder lessons section to era 8's page.
# Written with newline='' so the file's own LF endings are preserved exactly.
import io, os

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = os.path.join(HERE, '..', '..', 'lessons', 'era8-ps2.md')

SECTION = """
## LESSONS: mirrored geometry under a film shot (item 1295)

The reference-ladder pass (docs/ART.md, *Reference games*, era 8). The models are **Metal Gear
Solid 2**'s E3 2000 tanker demo -- letterboxed real-time cutscenes, rain at night, the Codec's
portraits -- and **Tekken Tag Tournament**, the 2000 launch title, in the manner of: not one
Konami or Namco character or mark is drawn. Tim's build-up rule gives each era one ADD and one
CHANGE from the era before it. Era 8 ADDS **weather** (rain, dust and sparks: no earlier rung has
weather at all) and CHANGES **how the inherited field is presented** -- the PlayStation 2 way.

Before and after, the same posed rally frame:
[before.png](../shots/item-1295/before.png) and [after.png](../shots/item-1295/after.png)
(`index.html?era=8`).

**What the reference changed**

- **A glossy floor in 2000 was a second copy of the world, not a shader.** The Graphics
  Synthesizer had no pixel shaders and no hardware bump mapping, so the tanker deck's reflections
  were the geometry drawn *again*, mirrored through the floor's plane, with the floor laid over it
  see-through. Era 8 does exactly that: copies of the 3D layer's two bats, the net, its tape and
  the ball, every height negated, under the slab turned transparent at 0.82 -- which makes the
  copies read at 0.18, measured at 18 on both bats where master reads 0. It cost nothing: 16.7 ms
  a frame, the same as before. **This is the technique to reach for whenever a surface should
  shine and the era predates shaders**, and it is cheap because the machine it imitates was cheap
  at exactly this.
- **The mirror has to be armed per frame, because the scene is shared.** Eras 5 to 10 pose ONE
  scene, so the copies and the see-through slab must belong to era 8's frames alone. `fieldSetup`
  arms a flag every frame era 8 draws, and the scene's own before-render hook hides the copies and
  makes the slab solid again on anybody else's frame. Without that, era 9 inherits a transparent
  table and a second set of bats hanging under it.
- **An opaque backing sheet goes under a see-through floor.** A translucent slab with nothing
  behind it shows the painted arena through the table, which no PS2 game ever did. A dark plane a
  quarter of a unit under the slab's underside stops that and hides anything deeper than the
  mirror wants to go.
- **The render knob is a multiplier, not a width.** `render.resolution` multiplies the picture's
  OWN pixel scale, and era 8's picture is already the display's native 512 x 448 -- so
  `resolution: 1` renders the field 512 across, and the 0.64 that looks like the right number for
  "512 of 800" would have rendered it 328. What the knobs really change here is `filter: true`
  (the GL picture scales smoothly rather than blockily) and `lighting: 'phong'` -- era 7's toon
  materials off, smooth specular ones on, which is the whole difference between a cel-shaded
  Dreamcast and a lit PlayStation 2.
- **Interlace is a stripe tile, never a pixel walk.** The PS2's 448 lines were two fields of 224
  drawn a frame apart, so every other line of the composite is 6% darker and which lines those
  are swaps sixty times a second. Two 1 x 2 canvases are built once and used as repeating
  patterns: ONE fill covers the whole picture. A per-pixel pass over 512 x 448 every frame would
  have cost more than everything else on this rung put together.
- **Probe a reflection from the near edge of what casts it.** A copy hangs straight down from its
  original, so on screen it sits just below the bat's foot -- but a probe aimed at the paddle's
  middle lands on the blade's own standing face and reads the bat, not its reflection. The
  measurement script walks down the screen from the near edge of the footprint and keeps the row
  most tinted by that bat's ink: `node docs/measure/item-1295/shoot.mjs --label after`.

**What a one-era game would copy**

1. `mirrorTransforms(state, heights, sizes)` in `src/eras/era8-ps2.js`: a pure function giving
   every copy's position and scale from the state alone, so the mirror is testable with no
   browser and no GPU.
2. The arm-per-frame pattern above, for any effect that must own a shared scene for its own
   frames only.
3. The stripe-tile interlace, which suits any machine that drew two fields to a frame.
"""


def main():
    with io.open(PAGE, 'r', encoding='utf-8', newline='') as f:
        doc = f.read()
    assert '\r' not in doc, 'the page is LF; refusing to write CRs into it'
    assert 'item 1295' not in doc, 'the section is already there'
    if not doc.endswith('\n'):
        doc += '\n'
    with io.open(PAGE, 'w', encoding='utf-8', newline='') as f:
        f.write(doc + SECTION)
    with io.open(PAGE, 'rb') as f:
        b = f.read()
    print('wrote', len(b), 'bytes, CR', b.count(b'\r'))


if __name__ == '__main__':
    main()
