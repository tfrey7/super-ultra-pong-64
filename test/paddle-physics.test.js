'use strict';
/*
 * Paddle physics (item 1208): where the ball meets the paddle picks one of
 * eight return angles, a moving paddle puts spin on the ball that bends its
 * flight, and a fast paddle smashes it. Pure rules, no canvas:
 *
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert');
const Pong = require('../src/game.js');

function newGame(rules) {
  const g = Pong.createGame({ rng: () => 0.5, phase: 'playing', rules });
  g.serveDelay = 0;
  return g;
}
const speedOf = (g) => Math.hypot(g.ball.vx, g.ball.vy);

/**
 * One hit off the player's paddle, centred on `at`, the ball meeting it
 * `offset` units below its centre, with the paddle moving `paddleSpeed` units
 * a second as it strikes (it was that much higher, or lower, a frame ago).
 * Returns the game just after the hit and the events of that frame.
 */
function hit(opts) {
  const o = Object.assign({ at: 300, offset: 0, paddleSpeed: 0, ballSpeed: 400 }, opts);
  const g = newGame(o.rules);
  const p = g.left;
  const dt = 1 / 60;
  p.y = o.at - o.paddleSpeed * dt - p.h / 2;
  g.ball.x = p.x + p.w + 2;
  g.ball.y = o.at + o.offset - g.ball.size / 2;
  g.ball.vx = -o.ballSpeed;
  g.ball.vy = 0;
  Pong.step(g, dt, { pointerY: o.at });
  return { g, events: g.events.slice() };
}

/** Fly on with the hand held still for `secs`; the path the ball's centre takes. */
function fly(g, secs) {
  const hand = g.left.y + g.left.h / 2;
  const path = [];
  let walls = 0;
  for (let t = 0; t < secs; t += 1 / 60) {
    Pong.step(g, 1 / 60, { pointerY: hand });
    walls += g.events.filter((e) => e.type === 'wall').length;
    path.push({ x: g.ball.x + g.ball.size / 2, y: g.ball.y + g.ball.size / 2 });
  }
  return { path, walls };
}

// ------------------------------------------------------------ eight segments
test('the paddle face is eight segments, flat off the middle two and steeper out to the tips', () => {
  const g = newGame();
  const half = g.left.h / 2;
  const angles = [];
  for (let i = 0; i < 8; i++) {
    // The middle of segment i, top of the paddle first.
    const offset = -half + (i + 0.5) * (g.left.h / 8);
    const { g: after } = hit({ offset });
    angles.push(Math.atan2(after.ball.vy, after.ball.vx));
  }
  assert.strictEqual(new Set(angles.map((a) => a.toFixed(6))).size, 7,
    'seven distinct returns: the middle two share the flat one');
  assert.ok(Math.abs(angles[3]) < 1e-9 && Math.abs(angles[4]) < 1e-9, 'the middle two go straight back');
  for (let i = 0; i < 7; i++) assert.ok(angles[i + 1] >= angles[i], 'steeper segment by segment, top up, bottom down');
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(angles[i] + angles[7 - i]) < 1e-9, 'the two halves mirror');
  assert.ok(Math.abs(Math.abs(angles[0]) - g.rules.maxBounceAngle) < 1e-9, 'the tips are the steepest');
});

test('within one segment the angle does not change: it is a step, not a slope', () => {
  const a = hit({ offset: 12 }).g.ball.vy;
  const b = hit({ offset: 18 }).g.ball.vy;
  assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  assert.strictEqual(Pong.segmentOf(Pong.RULES, 0.3).index, Pong.segmentOf(Pong.RULES, 0.45).index);
});

// ---------------------------------------------------------------------- spin
test('a still paddle puts no spin on: the ball flies dead straight', () => {
  const { g } = hit({ offset: 20 });
  assert.strictEqual(g.ball.spin, 0);
  const vy = g.ball.vy;
  const { walls } = fly(g, 0.5);
  assert.strictEqual(walls, 0);
  assert.ok(Math.abs(g.ball.vy - vy) < 1e-9, 'the flight never turned');
});

test('a paddle moving down as it strikes bends the flight downward -- a real bend, not a nudge', () => {
  const { g } = hit({ paddleSpeed: 300 });
  assert.ok(g.ball.spin > 0.8, `spin ${g.ball.spin}`);
  // Flat off the middle segment, bent only by the rest of the frame it was hit in.
  assert.ok(Math.abs(g.ball.vy) < 12, `it left the flat middle segment flat (vy ${g.ball.vy})`);
  const { path, walls } = fly(g, 0.7);
  assert.strictEqual(walls, 0, 'no wall helped it');
  const drop = path[path.length - 1].y - 300;
  assert.ok(drop > 60, `a straight ball would still be on 300; this one has dropped ${drop.toFixed(1)} units`);
  const heading = Math.atan2(g.ball.vy, g.ball.vx) * 180 / Math.PI;
  assert.ok(heading > 25, `it is now heading ${heading.toFixed(1)} degrees downward`);
});

test('a paddle moving up bends it upward, the mirror image', () => {
  const down = hit({ paddleSpeed: 300 }).g;
  const up = hit({ paddleSpeed: -300 }).g;
  assert.ok(Math.abs(up.ball.spin + down.ball.spin) < 1e-9);
  fly(down, 0.5);
  fly(up, 0.5);
  assert.ok(Math.abs((up.ball.y - 300) + (down.ball.y - 300) + up.ball.size) < 1e-6);
});

test('spin keeps the speed, fades as it flies, and never turns the ball past the steepest angle', () => {
  const { g } = hit({ paddleSpeed: 420 });
  const speed = speedOf(g);
  const spin = g.ball.spin;
  fly(g, 1.0);
  assert.ok(Math.abs(speedOf(g) - speed) < 1e-6, 'a bend turns the ball, it does not push it');
  assert.ok(Math.abs(g.ball.spin) < Math.abs(spin), 'the spin has faded');
  const steep = Math.atan2(Math.abs(g.ball.vy), Math.abs(g.ball.vx));
  assert.ok(steep <= g.rules.maxFlightAngle + 1e-9);
});

test('a wall bounce mirrors the bend: bending into the wall, it bends away after', () => {
  const g = newGame();
  g.ball.x = 400; g.ball.y = g.height - g.ball.size - 1;
  g.ball.vx = 300; g.ball.vy = 200; g.ball.spin = 1;
  Pong.step(g, 1 / 60, {});
  assert.ok(g.ball.vy < 0 && g.ball.spin < 0, 'off the floor, now bending up');
});

test('the serve takes the spin and the burst away', () => {
  const { g } = hit({ paddleSpeed: 600 });
  assert.ok(g.ball.spin !== 0 && g.ball.burst > 0);
  g.ball.x = -50; g.ball.vx = -400;
  Pong.step(g, 1 / 60, {});
  assert.strictEqual(g.score.right, 1);
  assert.strictEqual(g.ball.spin, 0);
  assert.strictEqual(g.ball.burst, 0);
});

test('spin runs the same at any frame rate', () => {
  function run(fps) {
    const { g } = hit({ paddleSpeed: 300 });
    const hand = g.left.y + g.left.h / 2;
    for (let i = 0; i < fps * 0.8; i++) Pong.step(g, 1 / fps, { pointerY: hand });
    return g.ball;
  }
  const a = run(60), b = run(240);
  assert.ok(Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) < 3, `${a.x},${a.y} vs ${b.x},${b.y}`);
});

// --------------------------------------------------------------------- smash
test('a hit off a fast paddle is a smash: a burst of speed, flagged for the voice and the feel', () => {
  const plain = hit({ paddleSpeed: 200 });
  const smash = hit({ paddleSpeed: 600 });
  const r = Pong.RULES;
  const rally = 400 + r.ballSpeedStep;
  assert.ok(Math.abs(speedOf(plain.g) - rally) < 1e-6, 'a plain hit is the rally speed');
  assert.ok(Math.abs(speedOf(smash.g) - rally * (1 + r.smashBoost)) < 1e-6, 'a smash adds its burst');
  const ev = (e) => e.find((x) => x.type === 'paddle');
  assert.strictEqual(ev(plain.events).smash, false);
  assert.strictEqual(ev(smash.events).smash, true);
  assert.strictEqual(ev(smash.events).hitStop, r.smashHitStop);
  assert.ok(ev(smash.events).hitStop > ev(plain.events).hitStop, 'a longer hit-stop for a feel layer');
});

test('the keyboard at full speed can smash', () => {
  assert.ok(Pong.RULES.playerKeySpeed >= Pong.RULES.smashPaddleSpeed);
});

test('the burst lasts one flight: the next plain hit goes back to the rally speed plus a step', () => {
  const { g } = hit({ paddleSpeed: 600 });
  const rally = 400 + Pong.RULES.ballSpeedStep;
  const p = g.right;
  // Bring it back at the computer's still paddle.
  p.y = 300 - p.h / 2;
  g.right.aimError = 0;
  g.ball.x = p.x - g.ball.size - 1; g.ball.y = 300 - g.ball.size / 2;
  g.ball.vx = speedOf(g); g.ball.vy = 0; g.ball.spin = 0;
  const rules = Object.assign({}, g.rules, { cpuSpeed: 0 });
  g.rules = rules;
  Pong.step(g, 1 / 60, { pointerY: g.left.y + g.left.h / 2 });
  assert.ok(g.ball.vx < 0, 'returned');
  assert.ok(Math.abs(speedOf(g) - (rally + Pong.RULES.ballSpeedStep)) < 1e-6, `speed ${speedOf(g)}`);
});

test('the ball speeds up through a rally and never past the smash cap', () => {
  const { g } = hit({ paddleSpeed: 600, ballSpeed: 900 });
  assert.ok(speedOf(g) <= Pong.RULES.smashMaxSpeed + 1e-6);
});

// ------------------------------------------------------------- the spin read
test('spinBend tells the computer where the spin will carry the ball', () => {
  const { g } = hit({ paddleSpeed: 300 });
  const bend = Pong.spinBend(g, g.right.x);
  assert.ok(bend > 80, `bends ${bend.toFixed(1)} units down by the computer's paddle`);
  assert.strictEqual(Pong.spinBend(g, g.left.x - 100), 0, 'nothing for a column behind it');
  g.ball.spin = 0;
  assert.strictEqual(Pong.spinBend(g, g.right.x), 0);
});

test('the computer reads the spin as much as cpuSpinRead says', () => {
  function cpuMove(read) {
    const { g } = hit({ paddleSpeed: 300, rules: { cpuSpinRead: read } });
    g.right.aimError = 0;
    const before = g.right.y;
    Pong.step(g, 1 / 60, { pointerY: g.left.y + g.left.h / 2 });
    return g.right.y - before;
  }
  assert.ok(cpuMove(1) > cpuMove(0), 'reading the spin moves it toward where the ball will bend');
});
