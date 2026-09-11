'use strict';
/*
 * Headless tests for the pure rules. Node's own runner, no dependencies:
 *
 *   node --test
 *
 * Everything here drives src/game.js directly -- there is no canvas and no DOM
 * in the module under test, which is the whole reason this file can exist.
 */
const test = require('node:test');
const assert = require('node:assert');
const Pong = require('../src/game.js');

/**
 * A game with the randomness pinned, so every run is the same run -- and past
 * the title screen, because every test below is about play. The title phase
 * has its own section at the foot of this file.
 */
function newGame(rngValue) {
  const v = rngValue === undefined ? 0.5 : rngValue;
  return Pong.createGame({ rng: () => v, phase: 'playing' });
}

/** Skip past the serve pause without moving anything else. */
function endServeDelay(g) {
  g.serveDelay = 0;
}

/** Put the ball somewhere with a chosen velocity. */
function placeBall(g, x, y, vx, vy) {
  g.ball.x = x;
  g.ball.y = y;
  g.ball.vx = vx;
  g.ball.vy = vy;
}

/** Centre a paddle on a y coordinate. */
function centrePaddle(p, y) {
  p.y = y - p.h / 2;
}

const speedOf = (g) => Math.hypot(g.ball.vx, g.ball.vy);

// --------------------------------------------------------------- fresh state
test('a new game starts level, with the ball waiting in the centre', () => {
  const g = newGame();
  assert.strictEqual(g.score.left, 0);
  assert.strictEqual(g.score.right, 0);
  assert.strictEqual(g.ball.x, (g.width - g.ball.size) / 2);
  assert.strictEqual(g.ball.y, (g.height - g.ball.size) / 2);
  assert.ok(g.serveDelay > 0, 'the serve should pause before it launches');
  assert.strictEqual(g.era, 0, 'era zero is the 1972 machine');
});

test('the ball holds still during the serve pause, then moves', () => {
  const g = newGame();
  const startX = g.ball.x;
  Pong.step(g, 0.016, {});
  assert.strictEqual(g.ball.x, startX, 'still waiting');
  // Burn off the pause.
  for (let i = 0; i < 100 && g.serveDelay > 0; i++) Pong.step(g, 0.016, {});
  Pong.step(g, 0.016, {});
  assert.notStrictEqual(g.ball.x, startX, 'it should be under way now');
});

test('the opening serve is never a flat horizontal shot', () => {
  for (const r of [0, 0.25, 0.5, 0.75, 1]) {
    const g = Pong.createGame({ rng: () => r, phase: 'playing' });
    assert.ok(Math.abs(g.ball.vx) > 0, 'the ball must travel sideways');
    const angle = Math.abs(Math.atan2(g.ball.vy, Math.abs(g.ball.vx)));
    assert.ok(angle <= g.rules.maxBounceAngle, 'and not steeper than the limit');
  }
});

// ---------------------------------------------------------- paddle collision
test('the ball bounces off the player paddle and comes back', () => {
  const g = newGame();
  endServeDelay(g);
  const p = g.left;
  centrePaddle(p, g.height / 2);
  placeBall(g, p.x + p.w + 2, g.height / 2 - g.ball.size / 2, -300, 0);

  Pong.step(g, 0.05, {});

  assert.ok(g.ball.vx > 0, 'it should be heading back to the right');
  assert.strictEqual(g.score.left, 0, 'nobody scored');
  assert.strictEqual(g.score.right, 0);
  assert.strictEqual(g.rally, 1, 'that was one rally hit');
});

test('the ball bounces off the computer paddle too', () => {
  const g = newGame();
  endServeDelay(g);
  const p = g.right;
  centrePaddle(p, g.height / 2);
  placeBall(g, p.x - g.ball.size - 2, g.height / 2 - g.ball.size / 2, 300, 0);

  Pong.step(g, 0.05, {});

  assert.ok(g.ball.vx < 0, 'it should be heading back to the left');
  assert.strictEqual(g.score.left, 0);
  assert.strictEqual(g.score.right, 0);
});

test('where it hits the paddle decides the angle', () => {
  function bounceAt(offsetFromCentre) {
    const g = newGame();
    endServeDelay(g);
    const p = g.left;
    centrePaddle(p, g.height / 2);
    const y = g.height / 2 + offsetFromCentre - g.ball.size / 2;
    placeBall(g, p.x + p.w + 2, y, -300, 0);
    Pong.step(g, 0.05, {});
    return g.ball.vy;
  }

  const middle = bounceAt(0);
  const low = bounceAt(30);     // below centre: downward on screen
  const high = bounceAt(-30);   // above centre: upward

  assert.ok(Math.abs(middle) < 1e-6, 'dead centre goes straight back');
  assert.ok(low > 50, 'a hit below centre sends it downward');
  assert.ok(high < -50, 'a hit above centre sends it upward');
  assert.ok(Math.abs(bounceAt(38)) > Math.abs(bounceAt(12)),
    'nearer the tip is a steeper shot');
});

test('the ball speeds up with every paddle hit, up to a cap', () => {
  const g = newGame();
  endServeDelay(g);
  const p = g.left;
  centrePaddle(p, g.height / 2);
  placeBall(g, p.x + p.w + 2, g.height / 2 - g.ball.size / 2, -300, 0);
  const before = speedOf(g);
  Pong.step(g, 0.05, {});
  const after = speedOf(g);
  assert.ok(after > before, 'faster than it arrived');
  assert.ok(Math.abs(after - (before + g.rules.ballSpeedStep)) < 1e-6);

  // Hammer it well past the cap and it should sit exactly on the cap.
  for (let i = 0; i < 60; i++) {
    placeBall(g, p.x + p.w + 2, g.height / 2 - g.ball.size / 2,
      -speedOf(g), 0);
    Pong.step(g, 0.05, {});
  }
  assert.ok(speedOf(g) <= g.rules.ballMaxSpeed + 1e-6, 'never past the cap');
});

test('a fast ball cannot tunnel through a paddle in one long frame', () => {
  const g = newGame();
  endServeDelay(g);
  const p = g.left;
  centrePaddle(p, g.height / 2);
  // Well to the right of the paddle, moving left fast enough to clear it
  // entirely inside a single 50 ms frame if the step did not substep.
  placeBall(g, p.x + p.w + 26, g.height / 2 - g.ball.size / 2, -1400, 0);
  Pong.step(g, 0.05, {});
  assert.strictEqual(g.score.right, 0, 'it must not have gone straight through');
  assert.ok(g.ball.vx > 0, 'it bounced');
});

test('the paddle only catches the ball on its way in, not on its way out', () => {
  const g = newGame();
  endServeDelay(g);
  const p = g.left;
  centrePaddle(p, g.height / 2);
  // Sitting inside the paddle but already travelling away from it.
  placeBall(g, p.x + 2, g.height / 2 - g.ball.size / 2, 300, 0);
  Pong.step(g, 0.016, {});
  assert.ok(g.ball.vx > 0, 'it keeps going, no double bounce');
  assert.strictEqual(g.rally, 0);
});

// ------------------------------------------------------------- wall collision
test('the ball bounces off the top wall', () => {
  const g = newGame();
  endServeDelay(g);
  placeBall(g, g.width / 2, 2, 200, -300);
  Pong.step(g, 0.05, {});
  assert.ok(g.ball.vy > 0, 'now heading down');
  assert.ok(g.ball.y >= 0, 'and back inside the field');
});

test('the ball bounces off the bottom wall', () => {
  const g = newGame();
  endServeDelay(g);
  placeBall(g, g.width / 2, g.height - g.ball.size - 2, 200, 300);
  Pong.step(g, 0.05, {});
  assert.ok(g.ball.vy < 0, 'now heading up');
  assert.ok(g.ball.y + g.ball.size <= g.height, 'and back inside the field');
});

test('the ball stays inside the field over a long rally', () => {
  const g = newGame();
  endServeDelay(g);
  for (let i = 0; i < 4000; i++) {
    Pong.step(g, 1 / 60, { pointerY: g.ball.y + g.ball.size / 2 });
    assert.ok(g.ball.y >= -1e-6, 'never above the top wall');
    assert.ok(g.ball.y + g.ball.size <= g.height + 1e-6, 'never below the floor');
  }
});

// -------------------------------------------------------------------- scoring
test('the computer scores when the ball leaves the player side', () => {
  const g = newGame();
  endServeDelay(g);
  placeBall(g, 1, g.height / 2, -400, 0);
  centrePaddle(g.left, 60);                 // player is nowhere near it
  Pong.step(g, 0.05, {});
  assert.strictEqual(g.score.right, 1);
  assert.strictEqual(g.score.left, 0);
});

test('the player scores when the ball leaves the computer side', () => {
  const g = newGame();
  endServeDelay(g);
  placeBall(g, g.width - 2, g.height / 2, 400, 0);
  centrePaddle(g.right, 60);
  Pong.step(g, 0.05, {});
  assert.strictEqual(g.score.left, 1);
  assert.strictEqual(g.score.right, 0);
});

test('a point does not score twice for one ball', () => {
  const g = newGame();
  endServeDelay(g);
  placeBall(g, 1, g.height / 2, -900, 0);
  Pong.step(g, 0.05, {});
  assert.strictEqual(g.score.right, 1, 'exactly one point from one ball');
});

// ---------------------------------------------------------------- serve reset
test('a missed ball restarts the next serve from the centre', () => {
  const g = newGame();
  endServeDelay(g);
  placeBall(g, 1, 40, -400, 250);
  Pong.step(g, 0.05, {});

  assert.strictEqual(g.ball.x, (g.width - g.ball.size) / 2, 'centred across');
  assert.strictEqual(g.ball.y, (g.height - g.ball.size) / 2, 'centred down');
  assert.ok(g.serveDelay > 0, 'and it pauses before launching');
  assert.strictEqual(g.rally, 0, 'the rally count resets');
});

test('the next serve is aimed at whoever just conceded', () => {
  const g = newGame();
  endServeDelay(g);
  placeBall(g, 1, g.height / 2, -400, 0);       // player concedes
  Pong.step(g, 0.05, {});
  assert.ok(g.ball.vx > 0, 'served towards the computer');

  endServeDelay(g);
  placeBall(g, g.width - 2, g.height / 2, 400, 0);   // computer concedes
  Pong.step(g, 0.05, {});
  assert.ok(g.ball.vx < 0, 'served towards the player');
});

test('the serve resets to the opening speed, not the rally speed', () => {
  const g = newGame();
  endServeDelay(g);
  const p = g.left;
  centrePaddle(p, g.height / 2);
  for (let i = 0; i < 5; i++) {
    placeBall(g, p.x + p.w + 2, g.height / 2 - g.ball.size / 2, -speedOf(g), 0);
    Pong.step(g, 0.05, {});
  }
  assert.ok(speedOf(g) > g.rules.ballStartSpeed, 'the rally sped it up');

  placeBall(g, 1, g.height / 2, -400, 0);
  Pong.step(g, 0.05, {});
  assert.ok(Math.abs(speedOf(g) - g.rules.ballStartSpeed) < 1e-6,
    'the new serve is back to the opening speed');
});

// ------------------------------------------------------------- player control
test('the mouse places the player paddle directly', () => {
  const g = newGame();
  Pong.step(g, 0.016, { pointerY: 200 });
  assert.ok(Math.abs((g.left.y + g.left.h / 2) - 200) < 1e-6);
});

test('the keys move the player paddle up and down', () => {
  const g = newGame();
  const start = g.left.y;
  Pong.step(g, 0.1, { up: true });
  assert.ok(g.left.y < start, 'up moves it up');
  const mid = g.left.y;
  Pong.step(g, 0.1, { down: true });
  assert.ok(g.left.y > mid, 'down moves it down');
});

test('the player paddle cannot leave the field, by mouse or by key', () => {
  const g = newGame();
  Pong.step(g, 0.016, { pointerY: -500 });
  assert.strictEqual(g.left.y, 0);
  Pong.step(g, 0.016, { pointerY: 5000 });
  assert.strictEqual(g.left.y, g.height - g.left.h);

  for (let i = 0; i < 200; i++) Pong.step(g, 0.05, { up: true });
  assert.strictEqual(g.left.y, 0);
  for (let i = 0; i < 200; i++) Pong.step(g, 0.05, { down: true });
  assert.strictEqual(g.left.y, g.height - g.left.h);
});

test('holding both keys at once cancels out', () => {
  const g = newGame();
  const start = g.left.y;
  Pong.step(g, 0.1, { up: true, down: true });
  assert.strictEqual(g.left.y, start);
});

// ---------------------------------------------------------------- the computer
test('the computer paddle chases the ball when it is coming over', () => {
  const g = newGame();
  endServeDelay(g);
  placeBall(g, g.width / 2, 80, 300, 0);
  centrePaddle(g.right, g.height / 2);
  const before = g.right.y;
  for (let i = 0; i < 20; i++) Pong.step(g, 1 / 60, {});
  assert.ok(g.right.y < before, 'it moved up towards a high ball');
});

test('the computer paddle drifts home when the ball is going away', () => {
  const g = newGame();
  endServeDelay(g);
  placeBall(g, g.width / 2, g.height / 2, -300, 0);
  centrePaddle(g.right, 80);
  for (let i = 0; i < 60; i++) Pong.step(g, 1 / 60, {});
  const centre = g.right.y + g.right.h / 2;
  assert.ok(centre > 80, 'it headed back towards the middle');
});

test('the computer paddle cannot leave the field either', () => {
  const g = newGame();
  endServeDelay(g);
  for (let i = 0; i < 600; i++) {
    Pong.step(g, 1 / 60, { pointerY: g.ball.y });
    assert.ok(g.right.y >= 0);
    assert.ok(g.right.y + g.right.h <= g.height);
  }
});

test('the computer is beatable: a corner shot gets past it', () => {
  // It aims a little off and moves slower than a steep shot, so a ball fired
  // at the far corner from close range should beat it.
  const g = Pong.createGame({ rng: () => 0.9, phase: 'playing' });
  endServeDelay(g);
  centrePaddle(g.right, g.height / 2);
  placeBall(g, g.right.x - 220, g.height / 2, 620, -600);
  for (let i = 0; i < 120 && g.score.left === 0; i++) Pong.step(g, 1 / 60, {});
  assert.strictEqual(g.score.left, 1, 'the corner shot should beat the CPU');
});

// -------------------------------------------------------------- delta timing
test('the same second of play runs the same at any frame rate', () => {
  function run(frames) {
    const g = newGame(0.3);
    const dt = 1 / frames;
    for (let i = 0; i < frames; i++) Pong.step(g, dt, {});
    return g;
  }
  const fast = run(240);
  const slow = run(60);
  // Positions land within a pixel or so: the ball has travelled the same
  // distance in the same second, not sixty times a fixed step.
  assert.ok(Math.abs(fast.ball.x - slow.ball.x) < 3,
    `x drifted: ${fast.ball.x} vs ${slow.ball.x}`);
  assert.ok(Math.abs(fast.ball.y - slow.ball.y) < 3,
    `y drifted: ${fast.ball.y} vs ${slow.ball.y}`);
});

test('a zero or negative frame time changes nothing', () => {
  const g = newGame();
  endServeDelay(g);
  placeBall(g, 100, 100, 300, 200);
  Pong.step(g, 0, {});
  Pong.step(g, -1, {});
  assert.strictEqual(g.ball.x, 100);
  assert.strictEqual(g.ball.y, 100);
});

test('a huge stalled frame is clamped instead of teleporting the ball', () => {
  const g = newGame();
  endServeDelay(g);
  placeBall(g, 100, 300, 300, 0);
  Pong.step(g, 12, {});   // the tab was in the background for 12 seconds
  assert.ok(g.ball.x < g.width, 'the ball is still on the field');
  assert.strictEqual(g.score.left, 0, 'and nobody was handed a point for it');
});

// -------------------------------------------------------- the title screen
test('a fresh game sits on the title screen', () => {
  const g = Pong.createGame({ rng: () => 0.5 });
  assert.strictEqual(g.phase, 'title');
});

test('the ball holds still for as long as the title lasts', () => {
  const g = Pong.createGame({ rng: () => 0.5 });
  const where = { x: g.ball.x, y: g.ball.y };
  // Ten seconds of frames, with a hand on the mouse the whole time.
  for (let i = 0; i < 600; i++) Pong.step(g, 1 / 60, { pointerY: 40 });
  assert.strictEqual(g.ball.x, where.x, 'the ball must not drift sideways');
  assert.strictEqual(g.ball.y, where.y, 'nor up or down');
  assert.strictEqual(g.phase, 'title', 'and nothing should have started it');
});

test('no point can be scored while the title is up', () => {
  const g = Pong.createGame({ rng: () => 0.5 });
  // Park the ball off the end of the field, which in play is a point.
  placeBall(g, g.width + 200, g.height / 2, 500, 0);
  endServeDelay(g);
  for (let i = 0; i < 300; i++) Pong.step(g, 1 / 60, {});
  assert.strictEqual(g.score.left, 0);
  assert.strictEqual(g.score.right, 0);
});

test('the clock still runs on the title screen, so the prompt can blink', () => {
  const g = Pong.createGame({ rng: () => 0.5 });
  for (let i = 0; i < 60; i++) Pong.step(g, 1 / 60, {});
  assert.ok(g.time > 0.9 && g.time < 1.1, `a second should have passed, got ${g.time}`);
});

test('starting the game leaves the title state behind', () => {
  const g = Pong.createGame({ rng: () => 0.5 });
  assert.strictEqual(Pong.startGame(g), true, 'it should report that it started');
  assert.strictEqual(g.phase, 'playing');
  assert.ok(g.serveDelay > 0, 'and open with the usual serve pause');

  const startX = g.ball.x;
  for (let i = 0; i < 200; i++) Pong.step(g, 1 / 60, {});
  assert.notStrictEqual(g.ball.x, startX, 'now the ball is under way');
});

test('starting an already-running game changes nothing', () => {
  const g = Pong.createGame({ rng: () => 0.5 });
  Pong.startGame(g);
  g.score.left = 3;
  for (let i = 0; i < 120; i++) Pong.step(g, 1 / 60, {});
  const mid = { x: g.ball.x, y: g.ball.y, score: g.score.left };

  assert.strictEqual(Pong.startGame(g), false, 'a second press must be ignored');
  assert.strictEqual(g.ball.x, mid.x, 'the rally must not be re-served');
  assert.strictEqual(g.ball.y, mid.y);
  assert.strictEqual(g.score.left, mid.score, 'nor the score wiped');
});

test('the game a start hands you is a clean one', () => {
  const g = Pong.createGame({ rng: () => 0.5 });
  g.score.left = 7;
  g.score.right = 4;
  g.left.y = 0;
  Pong.startGame(g);
  assert.strictEqual(g.score.left, 0);
  assert.strictEqual(g.score.right, 0);
  assert.strictEqual(g.time, 0, 'the clock restarts with the game');
  assert.strictEqual(g.left.y, (g.height - g.left.h) / 2, 'paddles come home');
  assert.strictEqual(g.ball.x, (g.width - g.ball.size) / 2, 'and the ball centres');
});

// ----------------------------------------------------- the turn to colour
// Evolution step one: the machine boots black and white and turns colour the
// moment the first point of the session lands.

test('the machine boots in black and white', () => {
  const g = newGame();
  assert.strictEqual(g.colour, false);
});

test('the first point of the session turns the machine colour', () => {
  const g = newGame();
  endServeDelay(g);
  placeBall(g, 1, g.height / 2, -400, 0);
  centrePaddle(g.left, 60);
  assert.strictEqual(g.colour, false, 'still monochrome at match point zero');
  Pong.step(g, 0.05, {});
  assert.strictEqual(g.score.right, 1);
  assert.strictEqual(g.colour, true, 'and colour the instant the point lands');
});

test('the colours belong to the session, not to the point', () => {
  const g = Pong.createGame({ rng: Math.random, phase: 'playing' });
  const score = () => {
    endServeDelay(g);
    placeBall(g, 1, g.height / 2, -400, 0);
    centrePaddle(g.left, 60);
    Pong.step(g, 0.05, {});
  };
  score();
  const first = Object.assign({}, g.paddleColour);
  for (let i = 0; i < 6; i++) score();
  assert.strictEqual(g.score.right, 7);
  assert.deepStrictEqual(g.paddleColour, first,
    'the colours a session earns are its own for the rest of the run');
});

test('the two paddles never wear the same colour', () => {
  for (let i = 0; i < 300; i++) {
    const g = Pong.createGame({ rng: Math.random, phase: 'playing' });
    Pong.flipToColour(g);
    assert.notStrictEqual(g.paddleColour.left, g.paddleColour.right,
      'a session where both paddles came out the same colour');
    for (const side of ['left', 'right']) {
      const i2 = g.paddleColour[side];
      assert.ok(Number.isInteger(i2) && i2 >= 0 && i2 < g.rules.paletteSize,
        `${side} picked ${i2}, which is not a palette slot`);
    }
  }
});

test('a pinned rng still cannot give both paddles one colour', () => {
  const g = newGame(0.5);            // every draw comes out the same slot
  Pong.flipToColour(g);
  assert.notStrictEqual(g.paddleColour.left, g.paddleColour.right);
});

test('a new session starts over in black and white', () => {
  const g = Pong.createGame({ rng: Math.random });
  Pong.startGame(g);
  Pong.flipToColour(g);
  assert.strictEqual(g.colour, true);
  g.phase = 'title';
  Pong.startGame(g);
  assert.strictEqual(g.colour, false, 'a fresh session earns its own colours');
});

// ------------------------------------------------------- the palette itself
// The rules pick a slot; era 1's file (src/eras/era1-atari2600.js) is the only
// place that knows what a colour looks like. These two checks pin the join.
const path = require('node:path');
const fs = require('node:fs');
const eralooks = require('../tools/eralooks.js');
const ROOT = path.join(__dirname, '..');
/** The renderer and every era file, loaded in the order index.html loads them. */
const page = () => eralooks.loadRenderer(ROOT);

test('the renderer offers exactly the palette the rules pick from', () => {
  const { R } = page();
  const inks = R.eraLook(1).palette;
  assert.strictEqual(inks.length, Pong.RULES.paletteSize);
  for (const ink of inks) {
    assert.match(ink, /^#[0-9a-f]{6}$/, `${ink} is not a plain hex colour`);
    assert.ok(R.isLegible(ink), `${ink} would vanish into the black field`);
  }
});

test('the paddles are white until the machine turns colour', () => {
  const { R } = page();
  const g = newGame();
  assert.strictEqual(R.paddleInk(g, 'left'), '#ffffff');
  assert.strictEqual(R.paddleInk(g, 'right'), '#ffffff');
  Pong.advanceEra(g);
  const palette = R.eraLook(1).palette;
  assert.ok(palette.includes(R.paddleInk(g, 'left')));
  assert.ok(palette.includes(R.paddleInk(g, 'right')));
  assert.notStrictEqual(R.paddleInk(g, 'left'), R.paddleInk(g, 'right'));
});

// ------------------------------------------------------ the era look table
test('the page loads one era file per rung, in ladder order, between the renderer and the loop', () => {
  const { html, eraScripts, R } = page();
  assert.strictEqual(eraScripts.length, Pong.ERAS.length, 'one file per era');
  eraScripts.forEach((src, i) => {
    assert.match(src, new RegExp(`^src/eras/era${i}-[a-z0-9]+\\.js$`), `rung ${i} is ${src}`);
    assert.strictEqual(R.eraLook(i).era, i, `${src} registers era ${i}`);
  });
  const at = (s) => html.indexOf(`src="${s}"`);
  assert.ok(at('src/render.js') < at(eraScripts[0]), 'era files come after the renderer');
  assert.ok(at(eraScripts[eraScripts.length - 1]) < at('src/main.js'), 'and before the loop');
  assert.ok(at('src/game.js') < at('src/render.js'));
});

test('eras 0 and 1 draw exactly what the machine drew before the ladder', () => {
  const { Pong: P, R } = page();
  const want = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'eralooks-today.json'), 'utf8'));
  const got = eralooks.scenes(P, R);
  assert.deepStrictEqual(Object.keys(got), Object.keys(want.scenes));
  for (const name of Object.keys(want.scenes)) {
    assert.ok(want.scenes[name].length > 20, `${name} recorded a real frame`);
    assert.deepStrictEqual(got[name], want.scenes[name], `${name} changed`);
  }
});

test('eras 2 to 4 are placeholders that draw era 1 until their own cards land', () => {
  const { R } = page();
  const drawAt = (era) => {
    const g = Pong.createGame({ rng: () => 0.1, phase: 'playing' });
    Pong.advanceEra(g);                 // era 1, colours picked
    g.era = era;
    g.serveDelay = 0;
    const rec = eralooks.recorder();
    R.draw(rec.ctx, g);
    return rec.calls;
  };
  const one = drawAt(1);
  assert.notDeepStrictEqual(one, drawAt(0), 'era 1 is not era 0');
  for (const era of [2, 3, 4].filter((e) => R.eraLook(e).placeholder)) {
    assert.strictEqual(R.eraLook(era).placeholder, true, `era ${era} is still a placeholder`);
    assert.deepStrictEqual(drawAt(era), one, `era ${era} draws era 1's look`);
  }
});

test('every rung of the ladder has a look, and a missing rung falls back to the one below', () => {
  const { R } = page();
  for (const e of Pong.ERAS) {
    assert.strictEqual(typeof R.eraLook(e.era).paddleInk, 'function', `era ${e.era}`);
  }
  assert.strictEqual(R.eraLook(Pong.TOP_ERA + 3).era, Pong.TOP_ERA);
  assert.throws(() => R.registerEra({ name: 'no number' }));
});

// ---------------------------------------------------------- the era ladder
// Every point either side scores moves the machine up one era, capped at the
// top rung. Era 1 IS the turn to colour above.

/** Score one point for the computer, the quick way. */
function concede(g) {
  endServeDelay(g);
  placeBall(g, 1, g.height / 2, -400, 0);
  centrePaddle(g.left, 60);
  Pong.step(g, 0.05, {});
}

test('the ladder is named, in order, from the 1972 machine to the Super Nintendo', () => {
  assert.deepStrictEqual(Pong.ERAS.map((e) => [e.era, e.year, e.machine]), [
    [0, 1972, 'arcade Pong'],
    [1, 1977, 'Atari 2600'],
    [2, 1985, 'NES'],
    [3, 1989, 'Sega Genesis'],
    [4, 1991, 'Super Nintendo']
  ]);
  assert.strictEqual(Pong.TOP_ERA, 4);
});

test('a machine starts at era 0, and has never changed era', () => {
  const g = newGame();
  assert.strictEqual(g.era, 0);
  assert.strictEqual(g.eraChangedAt, 0);
});

test('a point by EITHER side moves the machine up exactly one era', () => {
  const g = newGame();
  concede(g);                                      // the computer scores
  assert.strictEqual(g.era, 1);
  assert.strictEqual(g.colour, true, 'era 1 is the turn to colour');

  endServeDelay(g);
  placeBall(g, g.width - 2, g.height / 2, 400, 0); // the player scores
  centrePaddle(g.right, 60);
  Pong.step(g, 0.05, {});
  assert.strictEqual(g.score.left, 1);
  assert.strictEqual(g.era, 2);
});

test('the era records the game time it last changed at', () => {
  const g = newGame();
  for (let i = 0; i < 30; i++) Pong.step(g, 1 / 60, {});
  const before = g.time;
  concede(g);
  assert.ok(g.eraChangedAt > before, 'stamped at the moment of the point');
  assert.strictEqual(g.eraChangedAt, g.time);
  const stamp = g.eraChangedAt;
  for (let i = 0; i < 30; i++) Pong.step(g, 1 / 60, {});
  assert.strictEqual(g.eraChangedAt, stamp, 'play without a point leaves it alone');
});

test('the ladder stops at the top: more points never pass the last era', () => {
  const g = newGame();
  for (let i = 0; i < Pong.TOP_ERA; i++) concede(g);
  assert.strictEqual(g.era, Pong.TOP_ERA);
  const stamp = g.eraChangedAt;
  for (let i = 0; i < 6; i++) concede(g);
  assert.strictEqual(g.score.right, Pong.TOP_ERA + 6);
  assert.strictEqual(g.era, Pong.TOP_ERA, 'capped');
  assert.strictEqual(g.eraChangedAt, stamp, 'a capped point is not an era change');
  assert.strictEqual(Pong.advanceEra(g), false);
});

test('a point records where the ball left the field: the edge it crossed and its height', () => {
  const g = newGame();
  assert.strictEqual(g.missAt, null, 'nothing before the first point');
  endServeDelay(g);
  placeBall(g, 1, 140, -400, 0);
  centrePaddle(g.left, 500);
  Pong.step(g, 0.05, {});
  assert.strictEqual(g.score.right, 1);
  assert.deepStrictEqual(g.missAt, { x: 0, y: 140 + g.ball.size / 2 }, 'out past the player');

  endServeDelay(g);
  placeBall(g, g.width - 2, 420, 400, 0);
  centrePaddle(g.right, 60);
  Pong.step(g, 0.05, {});
  assert.strictEqual(g.score.left, 1);
  assert.deepStrictEqual(g.missAt, { x: g.width, y: 420 + g.ball.size / 2 }, 'out past the computer');

  g.phase = 'title';
  Pong.startGame(g);
  assert.strictEqual(g.missAt, null, 'a new session forgets it');
});

test('an era-change point stretches the serve pause; a point at the top of the ladder does not', () => {
  const g = newGame();
  assert.ok(Pong.RULES.eraChangePause > Pong.RULES.serveDelay);
  concede(g);
  assert.strictEqual(g.era, 1);
  assert.strictEqual(g.serveDelay, Pong.RULES.eraChangePause, 'room for the era change');
  // The paddles still move while it waits.
  const y0 = g.left.y;
  Pong.step(g, 0.05, { pointerY: 100 });
  assert.notStrictEqual(g.left.y, y0, 'the player paddle follows the hand during the pause');

  const top = Pong.createGame({ rng: () => 0.5, phase: 'playing', era: Pong.TOP_ERA });
  concede(top);
  assert.strictEqual(top.era, Pong.TOP_ERA);
  assert.strictEqual(top.serveDelay, Pong.RULES.serveDelay, 'no era change, the plain pause');
});

test('a game can be opened at any era, clamped to the ladder', () => {
  const g = Pong.createGame({ rng: () => 0.5, phase: 'playing', era: 3 });
  assert.strictEqual(g.era, 3);
  assert.strictEqual(g.colour, true, 'past era 0 it already wears colours');
  assert.notStrictEqual(g.paddleColour.left, g.paddleColour.right);
  assert.strictEqual(Pong.createGame({ era: 99 }).era, Pong.TOP_ERA);
  assert.strictEqual(Pong.createGame({ era: -2 }).era, 0);
  assert.strictEqual(Pong.createGame({ era: 'banana' }).era, 0);
});

test('opening at era 0 draws the rng exactly as before, so the serve is unchanged', () => {
  let n = 0;
  Pong.createGame({ rng: () => { n++; return 0.5; } });
  assert.strictEqual(n, 2, 'one draw for the serve angle, one for the CPU aim');
});

test('a new session starts back at the era it was opened at', () => {
  const g = Pong.createGame({ rng: Math.random, era: 2 });
  Pong.startGame(g);
  concede(g);
  concede(g);
  assert.strictEqual(g.era, 4);
  g.phase = 'title';
  Pong.startGame(g);
  assert.strictEqual(g.era, 2);
  assert.strictEqual(g.eraChangedAt, 0);

  const plain = newGame();
  concede(plain);
  plain.phase = 'title';
  Pong.startGame(plain);
  assert.strictEqual(plain.era, 0, 'an ordinary session starts at the 1972 machine');
});

test('the page query picks the starting era, and nonsense is era 0', () => {
  assert.strictEqual(Pong.eraFromQuery('?era=3'), 3);
  assert.strictEqual(Pong.eraFromQuery('?x=1&era=1'), 1);
  assert.strictEqual(Pong.eraFromQuery('?era=9'), Pong.TOP_ERA);
  assert.strictEqual(Pong.eraFromQuery('?era=-1'), 0);
  assert.strictEqual(Pong.eraFromQuery('?era=nes'), 0);
  assert.strictEqual(Pong.eraFromQuery(''), 0);
  assert.strictEqual(Pong.eraFromQuery(undefined), 0);
});

// ------------------------------------------------------------------- purity
test('the rules module touches no browser globals', () => {
  const src = require('node:fs')
    .readFileSync(require('node:path').join(__dirname, '..', 'src', 'game.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')     // block comments
    .replace(/\/\/.*/g, ' ');              // line comments
  for (const banned of ['document', 'window.', 'canvas', 'requestAnimationFrame']) {
    assert.ok(!src.includes(banned),
      `src/game.js must stay pure, but it mentions "${banned}"`);
  }
});
