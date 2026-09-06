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

/** A game with the randomness pinned, so every run is the same run. */
function newGame(rngValue) {
  const v = rngValue === undefined ? 0.5 : rngValue;
  return Pong.createGame({ rng: () => v });
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
    const g = Pong.createGame({ rng: () => r });
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
  const g = Pong.createGame({ rng: () => 0.9 });
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
