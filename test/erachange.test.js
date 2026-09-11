'use strict';
/*
 * The era change as a moment (src/erachange.js): a ring that spreads the new
 * era across the field from where the ball went out, with the old era drawn
 * outside it, the name card once it has passed the centre, and an optional
 * per-era flourish hook -- all inside the serve pause the rules stretch for it.
 * Headless: drawn on the recording canvas from tools/eralooks.js, with no
 * browser, so the composite goes straight onto that context.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
require('../src/erachange.js');

const FRAME = 1 / 60;
const W = R.ERA_CHANGE;

/** Score one point for the computer: the ball leaves the player's side at height y. */
function concede(g, y) {
  g.serveDelay = 0;
  g.ball.x = 1;
  g.ball.y = y === undefined ? g.height / 2 : y;
  g.ball.vx = -400;
  g.ball.vy = 0;
  g.left.y = g.ball.y > g.height / 2 ? 0 : g.height - g.left.h;
  Pong.step(g, 0.05, {});
}

/** Run the game on for `seconds` in 60fps frames. */
function advance(g, seconds) {
  for (let t = 0; t < seconds - 1e-9; t += FRAME) Pong.step(g, FRAME, {});
}

function playing(opts) {
  return Pong.createGame(Object.assign({ rng: () => 0.3, phase: 'playing' }, opts || {}));
}

function drawCalls(g, opts) {
  const rec = eralooks.recorder();
  R.drawEraFrame(rec.ctx, g, opts);
  return rec.calls;
}

/** Which era numbers the renderer was asked to draw during one frame. */
function erasDrawn(g, opts) {
  const seen = [];
  const draw = R.draw;
  R.draw = (ctx, s, o) => { seen.push(s.era); return draw(ctx, s, o); };
  try { drawCalls(g, opts); } finally { R.draw = draw; }
  return seen;
}

// ------------------------------------------------------------ pure timing

test('the wipe\'s timing is a pure function: 0 at the point, 1 at 1.5 s, clamped either side', () => {
  assert.strictEqual(W.wipe, 1.5);
  assert.strictEqual(W.wipeProgress(0), 0);
  assert.strictEqual(W.wipeProgress(-0.2), 0);
  assert.strictEqual(W.wipeProgress(0.75), 0.5);
  assert.strictEqual(W.wipeProgress(1.5), 1);
  assert.strictEqual(W.wipeProgress(9), 1);
  assert.strictEqual(W.wipeProgress(1, 2), 0.5, 'any duration');
  assert.strictEqual(W.easeWipe(0), 0);
  assert.strictEqual(W.easeWipe(0.5), 0.5);
  assert.strictEqual(W.easeWipe(1), 1);
  let prev = -1;
  for (let i = 0; i <= 100; i++) {
    const e = W.easeWipe(i / 100);
    assert.ok(e >= prev, `the easing never runs backwards (at ${i / 100})`);
    prev = e;
  }
  assert.ok(W.easeWipe(0.1) < 0.1 && W.easeWipe(0.9) > 0.9, 'slow off the mark, settling at the end');
});

test('the ring\'s radius is a pure function: nothing at the point, past the far corner at the end', () => {
  const left = { x: 0, y: 150 };
  assert.strictEqual(W.ringRadius(0, left, 800, 600), 0);
  const full = W.ringRadius(1, left, 800, 600);
  for (const [cx, cy] of [[0, 0], [800, 0], [0, 600], [800, 600]]) {
    assert.ok(Math.hypot(cx - left.x, cy - left.y) < full, `covers the corner ${cx},${cy}`);
  }
  assert.strictEqual(full, Math.hypot(800, 450) + W.edgePad, 'the far corner, plus the edge pad');
  assert.strictEqual(W.ringRadius(0.5, left, 800, 600), full / 2);
  assert.strictEqual(W.ringRadius(3, left, 800, 600), full, 'clamped');
  const right = { x: 800, y: 600 };
  assert.strictEqual(W.ringRadius(1, right, 800, 600), Math.hypot(800, 600) + W.edgePad);
});

test('the wipe fits inside the stretched serve pause, with a beat to spare', () => {
  assert.ok(W.wipe < Pong.RULES.eraChangePause, `${W.wipe} s inside ${Pong.RULES.eraChangePause} s`);
  assert.ok(W.wipe > Pong.RULES.serveDelay, 'and would not have fitted the plain pause');
});

// ------------------------------------------------------------ the moment

test('nothing shows on a machine no point has moved, whatever era it opened at', () => {
  assert.strictEqual(R.eraChangeMoment(playing()), null, 'a fresh game');
  const opened = playing({ era: 3 });
  assert.strictEqual(R.eraChangeMoment(opened), null, 'a page opened at ?era=3');
  const titled = Pong.createGame({ rng: () => 0.3, era: 2 });
  Pong.startGame(titled);
  assert.strictEqual(R.eraChangeMoment(titled), null, 'a session started at era 2');
  assert.deepStrictEqual(erasDrawn(titled), [2], 'just the one frame, in its own era');
});

test('the ring spreads from where the ball went out, and grows every frame', () => {
  const g = playing();
  concede(g, 140);
  assert.strictEqual(g.era, 1);
  const m = R.eraChangeMoment(g);
  assert.ok(m && m.wiping, 'the ring is on');
  assert.deepStrictEqual(m.origin, { x: 0, y: 140 + g.ball.size / 2 }, 'from the miss');
  assert.strictEqual(m.from, 0);
  assert.strictEqual(m.text, '1977 · ATARI 2600');
  let r = m.radius;
  for (let i = 0; i < 80; i++) {
    Pong.step(g, FRAME, {});
    const n = R.eraChangeMoment(g);
    if (!n.wiping) break;
    assert.ok(n.radius >= r, 'the ring never shrinks');
    r = n.radius;
  }
});

test('while the ring grows both eras draw the same live state; after it, only the new one', () => {
  const g = playing({ era: 1 });
  concede(g);
  assert.strictEqual(g.era, 2);
  advance(g, 0.5);
  assert.deepStrictEqual(erasDrawn(g), [1, 2], 'old era outside the ring, new era inside');
  advance(g, 1.1);
  const m = R.eraChangeMoment(g);
  assert.ok(m && !m.wiping, 'the ring has covered the field but the pause is still on');
  assert.deepStrictEqual(erasDrawn(g), [2], 'the whole field is the new era');
});

test('the name card comes up in the new era\'s own ink once the ring passes the centre', () => {
  for (const era of [2, 3, 4]) {
    const g = playing({ era: era - 1 });
    concede(g);
    assert.strictEqual(g.era, era);
    const style = R.eraCardStyle(era);
    let m = R.eraChangeMoment(g);
    assert.ok(!m.cardUp, 'no card at the instant of the point');
    while (m && !m.cardUp) { Pong.step(g, FRAME, {}); m = R.eraChangeMoment(g); }
    assert.ok(m && m.wiping, `era ${era}: the card comes up while the ring is still growing`);
    const centre = Math.hypot(g.width / 2 - m.origin.x, g.height / 2 - m.origin.y);
    assert.ok(m.radius >= centre, 'and only once it has reached the centre');
    const inks = new Set(drawCalls(g).map((c) => c[0]));
    assert.ok(inks.has(style.box), `era ${era} fills its card with ${style.box}`);
    assert.ok(inks.has(style.year), `era ${era} writes its year in ${style.year}`);
  }
  // The Atari card writes the year and the name in the two paddles' colours.
  const atari = playing();
  concede(atari);
  advance(atari, 1.2);
  const inks = new Set(drawCalls(atari).map((c) => c[0]));
  assert.ok(inks.has(R.paddleInk(atari, 'left')) && inks.has(R.paddleInk(atari, 'right')));
});

test('every rung past the first has its own card: the year and machine from Pong.ERAS', () => {
  for (const e of Pong.ERAS.slice(1)) {
    assert.strictEqual(R.eraCardText(e.era), `${e.year} · ${e.machine.toUpperCase()}`);
  }
  assert.strictEqual(R.eraCardText(2), '1985 · NES');
  const boxes = new Set([1, 2, 3, 4].map((e) => JSON.stringify(R.eraCardStyle(e))));
  assert.strictEqual(boxes.size, 4, 'no two rungs share a card style');
});

test('the moment lasts the stretched pause and is gone the frame the ball launches', () => {
  const g = playing();
  concede(g);
  assert.strictEqual(g.serveDelay, Pong.RULES.eraChangePause, 'the rules stretched the pause');
  let shown = 0;
  let wiping = 0;
  let frames = 0;
  const x0 = g.ball.x;
  while (g.ball.x === x0 && frames < 600) {
    const m = R.eraChangeMoment(g);
    if (m) shown += FRAME;
    if (m && m.wiping) wiping += FRAME;
    Pong.step(g, FRAME, {});
    frames += 1;
  }
  assert.strictEqual(R.eraChangeMoment(g), null, 'nothing showing once the ball is moving');
  assert.ok(Math.abs(wiping - W.wipe) < 2 * FRAME, `the ring took ${wiping.toFixed(3)} s`);
  assert.ok(shown > wiping && shown <= Pong.RULES.eraChangePause + FRAME,
    `on screen for ${shown.toFixed(3)} s, within the pause`);
});

test('the paddles stay in the player\'s hands while the ring plays', () => {
  const g = playing();
  concede(g);
  const ys = [];
  for (let i = 0; i < 60; i++) {
    Pong.step(g, FRAME, { pointerY: 100 + i * 5 });
    assert.ok(R.eraChangeMoment(g).wiping);
    ys.push(g.left.y);
  }
  assert.ok(ys[59] > ys[0] + 200, `the paddle followed the hand (${ys[0]} to ${ys[59]})`);
});

test('at the top of the ladder a point moves nothing, so nothing shows', () => {
  const g = playing({ era: Pong.TOP_ERA });
  concede(g);
  assert.strictEqual(g.era, Pong.TOP_ERA);
  assert.strictEqual(R.eraChangeMoment(g), null);
});

// ------------------------------------------------------------ the flourish hook

test('an era\'s flourish hook is called every frame of the ring with progress, origin and both eras', () => {
  const look = R.eraLook(3);
  const calls = [];
  look.flourish = function (ctx, p, origin, from, to, info) {
    calls.push({ ctx, p, origin, from, to, info });
    ctx.fillStyle = '#123456';
    ctx.fillRect(origin.x, origin.y, 1, 1);
  };
  try {
    const g = playing({ era: 2 });
    concede(g, 300);
    const inks = [];
    for (let i = 0; i < 120; i++) {
      Pong.step(g, FRAME, {});
      const m = R.eraChangeMoment(g);
      if (!m) break;
      const rec = eralooks.recorder();
      R.drawEraFrame(rec.ctx, g);
      inks.push(rec.calls.some((c) => c[0] === '#123456'));
      if (m.wiping) {
        const last = calls[calls.length - 1];
        assert.ok(last && last.ctx === rec.ctx, 'called on this frame, with the context');
        assert.strictEqual(last.p, m.p, 'the eased progress');
        assert.deepStrictEqual(last.origin, m.origin);
        assert.strictEqual(last.from, 2);
        assert.strictEqual(last.to, 3);
        assert.strictEqual(last.info.radius, m.radius);
      }
    }
    assert.ok(calls.length >= 80, `called on every frame of the ring (${calls.length})`);
    assert.ok(calls.every((c, i) => !i || c.p >= calls[i - 1].p), 'progress only rises');
    assert.ok(inks[0] && !inks[inks.length - 1], 'drawn during the ring, not once it has covered the field');
  } finally {
    delete look.flourish;
  }
  // The era being LEFT does not play its hook; no hook at all plays the plain ring.
  const g = playing({ era: 2 });
  concede(g);
  advance(g, 0.4);
  assert.ok(drawCalls(g).length > 0, 'the plain ring draws with no hook anywhere');
});

test('the attract rally behind the title plays the ring too, dimmed and without a card', () => {
  const rally = Pong.createGame({ rng: () => 0.3, phase: 'playing', rules: { serveDelay: 1.3 } });
  concede(rally);
  advance(rally, 1.0);
  const m = R.eraChangeMoment(rally);
  assert.ok(m && m.wiping && m.cardUp, 'a demo point is an era change like any other');
  assert.deepStrictEqual(erasDrawn(rally, { ink: '#3a3a3a', card: false }), [0, 1]);
  const withCard = drawCalls(rally, { ink: '#3a3a3a' }).length;
  const without = drawCalls(rally, { ink: '#3a3a3a', card: false }).length;
  assert.ok(without < withCard, 'card: false leaves the card off');
});

test('drawing the moment never changes the state', () => {
  const g = playing();
  concede(g);
  advance(g, 0.7);
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
