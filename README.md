# Super Ultra Pong 64: Remastered

A Pong that **evolves while you play it**. You start at the 1972 arcade machine —
black screen, two white bars, a square ball, a dashed line down the middle — and
as the session goes on the game grows up through the eras around it: colour,
sound, sprites, physics, whatever each later era brings. Evoland, but for Pong.

Right now the repo holds **era zero only**: the original machine, you against the
computer. Nothing evolves yet. That is deliberate — era zero is the thing every
later era has to grow out of, so it was built first and built honestly.

## Play it

Open **`index.html`** in a browser. That is the whole install: no `npm install`,
no build step, no dev server. Double-clicking the file off disk works, because
everything is a plain script and there is nothing to compile.

- **Your paddle is on the left.** Move the mouse over the field to place it, or
  use the **arrow keys** / **W** and **S**. Whichever you touched last is the one
  in charge, so you can swap mid-rally.
- The **computer plays the right paddle**. It is beatable on purpose: it only
  chases the ball once the ball is heading its way, it aims slightly off centre,
  and it cannot move as fast as a really steep shot travels. Aim for the corners.
- **Where the ball hits your paddle decides the angle.** Dead centre sends it
  straight back; the tips send it steep. Every hit makes the ball a little faster.
- A point scores when the ball leaves either side, and the next serve starts from
  the centre after a short pause. The score is drawn across the top.

No sound yet.

## Run the tests

```bash
node --test
```

Node's own test runner, no dependencies, nothing to install (Node 18 or newer).
The suite is headless and covers the pure rules only — paddle bounces and their
angles, wall bounces, scoring on each side, the serve reset, and the fact that
the same second of play produces the same result whether it arrives as one long
frame or sixty short ones.

## How it is laid out

The point of the layout is that later eras are additions, not rewrites.

| File | What it is |
| --- | --- |
| `src/game.js` | **The rules.** Pure state plus one `step(state, dt, intent)`. No canvas, no DOM, no timers, no input devices — which is why the tests can run headless. |
| `src/render.js` | **The look.** Draws a state onto a canvas. Reads the state; never changes it. |
| `src/input.js` | **The hands.** Turns mouse and keyboard into a plain intent object (`pointerY`, `up`, `down`). Knows nothing about the rules. |
| `src/main.js` | The loop that ties the three together and hands `step` the real elapsed time. |
| `test/game.test.js` | The headless suite over `src/game.js`. |

`step` takes a **delta time in seconds** and never assumes 60fps; long frames are
cut into substeps so a fast ball cannot pass through a paddle. Randomness goes
through `state.rng`, so a test can pin it down.

Adding an era should mean adding fields to the state and rules to `step`, plus a
branch in the renderer — not touching the other two modules.
