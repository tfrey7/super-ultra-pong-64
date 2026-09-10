'use strict';
/*
 * The era change as a moment (src/erachange.js): a flash, a wipe and a name
 * card when a point moves the machine up a rung, all inside the serve pause
 * the game already has. Headless: drawn on the recording canvas from
 * tools/eralooks.js, with no browser.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
require('../src/erachange.js');

const FRAME = 1 / 60;

/** Score one point for the computer: the ball leaves the player's side. */
function concede(g) {
  g.serveDelay = 0;
  g.ball.x = 1;
  g.ball.y = g.height / 2;
  g.ball.vx = -400;
  g.ball.vy = 0;
  g.left.y = 0;
  Pong.step(g, 0.05, {});
}

/** Run the game on for `seconds` in 60fps frames (step caps one frame at 0.05 s). */
function advance(g, seconds) {
  for (let t = 0; t < seconds - 1e-9; t += FRAME) Pong.step(g, FRAME, {});
}

function playing(opts) {
  return Pong.createGame(Object.assign({ rng: () => 0.3, phase: 'playing' }, opts || {}));
}

function drawCalls(g) {
  const rec = eralooks.recorder();
  R.drawEraChange(rec.ctx, g);
  return rec.calls;
}

test('nothing shows on a machine no point has moved, whatever era it opened at', () => {
  assert.strictEqual(R.eraChangeMoment(playing()), null, 'a fresh game');
  const opened = playing({ era: 3 });
  assert.strictEqual(R.eraChangeMoment(opened), null, 'a page opened at ?era=3');
  const titled = Pong.createGame({ rng: () => 0.3, era: 2 });
  Pong.startGame(titled);
  assert.strictEqual(R.eraChangeMoment(titled), null, 'a session started at era 2');
  assert.deepStrictEqual(drawCalls(titled), [], 'and not one draw call');
});

test('a point that moves the machine up shows the change, named from the ladder', () => {
  const g = playing();
  concede(g);
  assert.strictEqual(g.era, 1);
  const m = R.eraChangeMoment(g);
  assert.ok(m, 'the moment is showing');
  assert.strictEqual(m.text, '1977 · ATARI 2600');
  // Straight after the point: the flash covers the whole field.
  const calls = drawCalls(g);
  assert.ok(calls.some(([ink, x, y, w, h]) => /^rgba\(/.test(ink) && x === 0 && y === 0 &&
    w === g.width && h === g.height), 'a full-field flash');
  // A beat later the card is up and the flash has gone.
  advance(g, 0.3);
  const later = drawCalls(g);
  assert.ok(R.eraChangeMoment(g));
  assert.ok(later.length > 40, `the card draws its lettering (${later.length} calls)`);
  assert.ok(!later.some(([ink]) => /^rgba\(/.test(ink)), 'no flash any more');
});

test('every rung past the first has its own card: the year and machine from Pong.ERAS', () => {
  for (const e of Pong.ERAS.slice(1)) {
    assert.strictEqual(R.eraCardText(e.era), `${e.year} · ${e.machine.toUpperCase()}`);
  }
  assert.strictEqual(R.eraCardText(2), '1985 · NES');
  const boxes = new Set([1, 2, 3, 4].map((e) => JSON.stringify(R.eraCardStyle(e))));
  assert.strictEqual(boxes.size, 4, 'no two rungs share a card style');
});

test('the card is drawn in the new era\'s own ink', () => {
  for (const era of [2, 3, 4]) {
    const g = playing({ era: era - 1 });
    concede(g);
    assert.strictEqual(g.era, era);
    advance(g, 0.4);
    const inks = new Set(drawCalls(g).map((c) => c[0]));
    const style = R.eraCardStyle(era);
    assert.ok(inks.has(style.box), `era ${era} fills its card with ${style.box}`);
    assert.ok(inks.has(style.year), `era ${era} writes its year in ${style.year}`);
  }
  // The Atari card writes the year and the name in the two paddles' colours.
  const atari = playing();
  concede(atari);
  advance(atari, 0.4);
  const inks = new Set(drawCalls(atari).map((c) => c[0]));
  assert.ok(inks.has(R.paddleInk(atari, 'left')) && inks.has(R.paddleInk(atari, 'right')));
});

test('the moment lasts the serve pause and is gone the frame the ball launches', () => {
  const g = playing();
  concede(g);
  assert.strictEqual(g.serveDelay, Pong.RULES.serveDelay, 'the rules pause, untouched');
  let shown = 0;
  let frames = 0;
  const x0 = g.ball.x;
  while (g.ball.x === x0 && frames < 600) {
    if (R.eraChangeMoment(g)) shown += FRAME;
    Pong.step(g, FRAME, {});
    frames += 1;
  }
  // The ball moved on the same frame it would have with no card at all.
  const plain = playing();
  concede(plain);
  let plainFrames = 0;
  while (plain.ball.x === x0 && plainFrames < 600) { Pong.step(plain, FRAME, {}); plainFrames += 1; }
  assert.strictEqual(frames, plainFrames, 'the serve launches on the same frame');
  assert.strictEqual(R.eraChangeMoment(g), null, 'nothing showing once the ball is moving');
  assert.ok(shown > 0.8 && shown <= Pong.RULES.serveDelay + FRAME,
    `on screen for about a second, within the pause (${shown.toFixed(3)} s)`);
});

test('at the top of the ladder a point moves nothing, so nothing shows', () => {
  const g = playing({ era: Pong.TOP_ERA });
  concede(g);
  assert.strictEqual(g.era, Pong.TOP_ERA);
  assert.strictEqual(R.eraChangeMoment(g), null);
});

test('drawing the moment never changes the state', () => {
  const g = playing();
  concede(g);
  advance(g, 0.2);
  const before = JSON.stringify(g);
  drawCalls(g);
  assert.strictEqual(JSON.stringify(g), before);
});

test('the title screen never shows a change', () => {
  const g = Pong.createGame({ rng: () => 0.3 });
  g.era = 2;
  g.serveDelay = 0.5;
  g.time = 0.1;
  assert.strictEqual(R.eraChangeMoment(g), null);
});
