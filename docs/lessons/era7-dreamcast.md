# Era 7, the 1999 Dreamcast (item 1293)

What a later one-era game should start from, for this rung.

Before and after, the same serve:
[era7-before.png](../shots/item-1293/era7-before.png) and
[era7-after.png](../shots/item-1293/era7-after.png). The readings beside them
are taken by [era7-readings.py](../shots/item-1293/era7-readings.py), which
needs nothing installed.

## Which 1999 this is

The card was written for *Jet Set Radio* — cel shading and ink outlines — and
Tim answered its decision with **strict 1999: Soulcalibur and Sonic Adventure**
instead. A 2000 game was one rung early, and 1999's own launch showcases are
smooth, bright and VGA-sharp, not inked. The card's GOAL paragraph still
describes the cel look; the `RULING` line under it is the later word.

**It is the FIELD that changed, and only the field.** The rooftop, the sky
bands, the skyline, the blimp, the graffiti score, the tags, the cans, the
splat, the arrival flourish and the voice are all as they were, and so is the
whole era without WebGL: `?gl=off` and `node --test` paint exactly the cel
table they painted before this card. That is the card's own rule, and it is
also what made a 30-minute job possible — the canvas era and the 3D field are
two different pictures of the same rung.

## The four numbers

`render: { resolution: 0.8, filter: true, fog: null, lighting: 'phong' }`.

- **0.8** of the 800 x 600 picture the field lands in is **640 x 480** — VGA,
  exactly what the machine put out.
- **`filter: true`** is the whole argument in one flag: 1999's showcases were
  smooth, so the 640 x 480 picture is scaled up smoothed, not blocky.
- **`fog: null`**: era 6's haze does not carry forward. A bright stage has
  no distance to hide.
- **`lighting: 'phong'`** buys the specular highlight those two games are
  remembered for. It is also the load-bearing knob for tidying up after this
  era: see below.

## What an era can and cannot hold in the shared scene

The scene is one, shared by eras 5 to 10, so an era's `fieldSetup(I, state)`
is writing on parts every other era will draw with. Three things are worth
knowing before the next era tries this:

- **`.color` is not yours.** `PongField3D.pose()` writes the slab's, the
  lines', the rails', the bats' and the ball's colour from the era's table
  style on **every frame**, after `fieldSetup` has run. What survives is
  `emissive`, `specular`, `shininess` and `flatShading` — so era 7's stage
  colour is carried as an emissive lift over the layer's own fill, which is
  also why it reads evenly lit rather than shadowed.
- **`parts.ball.visible` is not yours either**, for the same reason: `pose()`
  sets it from the serve delay every frame. The era hides the layer's ball by
  setting **`parts.ballMat.opacity = 0`**, and — this is the part that matters
  — hands it straight back the moment `T.field` returns, so no other era can
  ever meet it hidden. "Restore it when another era draws" cannot be
  implemented by the era that hid it: it is not running then.
- **Cleaning up after yourself is the lighting knob.** Changing `lighting`
  makes the layer rebuild every material and empty its group, which disposes
  of anything an era added. Era 7 is the only era asking for `'phong'`, so
  moving off era 7 rebuilds and its ring and its lift go with it. **If a second
  era ever chooses the same lighting model, that cleanup stops happening** and
  both eras will need a real teardown hook. `fieldSetup` notices a rebuild by
  the material objects being new ones, and dresses them again.

## What the change is worth, measured

Same frame, the field band only (the table, under the sky and above the near
lip):

| | distinct colours | mean brightness | brightest pixel |
| --- | --- | --- | --- |
| before (cel) | 7,500 | 72.4 | 249, 238, 233 — **not** the ball |
| after (1999) | 17,855 | 97.7 | 254, 254, 254 — **the ball itself** |

The colour count is the reading that separates the two looks: flat poster
fills against real smooth shading. Nothing reaches a pure 255 because the
display's tube overlay tints the whole page, so R1 is read as "the brightest
pixel in the frame lands on the ball", which it now does and did not before.

## The ring

A 1999 fighter's stage is known by its edge, so the table wears one: a painted
boundary line lying on the top, inside its edges, one circle stretched across
800 x 600. Two things were wrong on the first pass and both are worth
inheriting: a lift as bright as the fill makes a **neon hoop that owns the
frame**, and the same white specular the slab wears **washes the near bat out
to pale**, which costs R4 (each paddle's near face wears its earned colour).
Lit rather than glowing, and a grey gleam on the bats, fixed both.

## LESSONS

The reference changed the *field* and nothing else: era 7 stopped being a
poster and became a lit stage — 640 x 480 smoothed rather than blocky, no
haze, polished surfaces, a painted ring — while every canvas thing the era
draws round it stayed exactly as it was, which is how a whole-look change fits
in one small card. Its build-up in Tim's ladder is: **added** the contact
effects back over the ball (no earlier era draws an effect at the contact),
**changed** cel shading for smooth, bright, VGA-sharp shading.
