'use strict';
/*
 * Era 4's arrival (item 1140): the field tilts into Mode 7 and back, and the
 * name card spins in over it. The drawing needs a real canvas to copy, so the
 * headless suite covers the pure parts -- the pose over time, the strips'
 * perspective transforms, where the card lands -- and checks that without a
 * canvas the flourish leaves the plain ring and the engine's card untouched.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
require('../src/erachange.js');
const PongSound = require('../src/sound.js');

const FRAME = 1 / 60;
const look = R.eraLook(4);
const A = look.arrival;

/** A game one point from era 4; the point goes out of the player's side at height y. */
function intoEra4(y) {
  const g = Pong.createGame({ rng: () => 0.3, phase: 'playing', era: 3 });
  g.serveDelay = 0;
  g.ball.x = 1;
  g.ball.y = y;
  g.ball.vx = -400;
  g.ball.vy = 0;
  g.left.y = y > g.height / 2 ? 0 : g.height - g.left.h;
  Pong.step(g, 0.05, {});
  assert.strictEqual(g.era, 4);
  return g;
}

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('era 4 registers its own arrival flourish', () => {
  assert.strictEqual(typeof look.flourish, 'function');
  assert.ok(A && typeof A.tiltPose === 'function' && typeof A.tiltStrips === 'function');
});

test('the field starts flat, tips back, recedes and turns once, and lies flat again before the ring ends', () => {
  assert.ok(A.tiltPose(0, 1).flat, 'flat at the point');
  const mid = A.tiltPose(0.42, 1);
  assert.ok(!mid.flat);
  assert.ok(mid.phi > 0.9 * A.M7.phiMax, `tipped well back at mid-ring (${mid.phi.toFixed(2)} rad)`);
  assert.ok(mid.k > 2.5, `receded toward the horizon (k ${mid.k.toFixed(2)})`);
  let prev = -1;
  for (let i = 0; i <= 100; i++) {
    const th = A.tiltPose(i / 100, 1).theta;
    assert.ok(th >= prev, 'the turn never runs backwards');
    prev = th;
  }
  assert.ok(near(A.tiltPose(1, 1).theta, 2 * Math.PI), 'exactly one whole turn');
  assert.ok(near(A.tiltPose(1, -1).theta, -2 * Math.PI), 'the other way from the other side');
  assert.ok(A.M7.settle < 1);
  for (const u of [A.M7.settle, 0.95, 1]) assert.ok(A.tiltPose(u, 1).flat, `flat again at ${u}`);
});

test('a flat pose is drawn as the picture itself: every strip is the identity, top to bottom', () => {
  const strips = A.tiltStrips(A.tiltPose(0, 1), 800, 600, 24);
  assert.strictEqual(strips.length, 24);
  assert.ok(near(strips[0].y0, 0) && near(strips[23].y1, 600));
  for (const s of strips) {
    const [a, b, c, d, e, f] = s.m;
    for (const [got, want] of [[a, 1], [b, 0], [c, 0], [d, 1], [e, 0], [f, 0]]) {
      assert.ok(near(got, want, 1e-6), `identity (got ${s.m.map((x) => x.toFixed(4))})`);
    }
  }
});

test('tipped back, the field is a trapezoid of strips: contiguous, narrowing toward the horizon', () => {
  const pose = { phi: 1.0, k: 2, theta: 0, lift: 60, flat: false };
  const strips = A.tiltStrips(pose, 800, 600, 60);
  assert.strictEqual(strips.length, 60);
  for (let i = 1; i < strips.length; i++) {
    assert.ok(near(strips[i].y0, strips[i - 1].y1, 1e-6), 'no gaps between strips');
    assert.ok(strips[i].scale > strips[i - 1].scale, 'each strip nearer the viewer is wider');
    assert.ok(strips[i].depth < strips[i - 1].depth, 'and shows a nearer part of the field');
  }
  const top = strips[0], bottom = strips[strips.length - 1];
  assert.ok(bottom.scale > 1.2 * top.scale, `far edge narrower (${top.scale.toFixed(2)} vs ${bottom.scale.toFixed(2)})`);
  assert.ok(bottom.y1 - top.y0 < 600, 'receded: the field takes less than the screen');
  // Each strip's transform puts the field row it shows at the strip's middle.
  for (const s of [top, strips[30], bottom]) {
    const rowY = 300 - s.depth;                       // theta 0: depth d is the row d above centre
    const [, b, , d, , f] = s.m;
    const y = b * 400 + d * rowY + f;
    assert.ok(near(y, (s.y0 + s.y1) / 2, 1e-6), `row ${rowY.toFixed(1)} lands mid-strip`);
  }
});

test('turned, each strip is the same perspective rotated about the field centre', () => {
  const flat = A.tiltStrips({ phi: 0.8, k: 1.8, theta: 0, lift: 0 }, 800, 600, 40);
  const turned = A.tiltStrips({ phi: 0.8, k: 1.8, theta: Math.PI / 2, lift: 0 }, 800, 600, 40);
  assert.ok(turned.length > 0);
  const s = turned[Math.floor(turned.length / 2)];
  const [a, b, c, d] = s.m;
  assert.ok(near(a, 0, 1e-9) && near(d, 0, 1e-9), 'a quarter turn swaps the axes');
  assert.ok(Math.abs(c) > 0 && Math.abs(b) > 0);
  assert.ok(flat.length > 0);
});

test('the card spins and zooms in, then lands flat and full size before the ring ends', () => {
  assert.ok(!A.cardPose(A.M7.cardFrom - 0.01, 1).shown, 'not before it starts');
  const mid = A.cardPose((A.M7.cardFrom + A.M7.cardTo) / 2, 1);
  assert.ok(mid.shown && !mid.landed);
  assert.ok(Math.abs(mid.angle) > 0.05, 'still turning half way');
  assert.ok(mid.scale > 0.12 && mid.alpha === 1);
  const landed = A.cardPose(A.M7.cardTo, 1);
  assert.deepStrictEqual(landed, { shown: true, landed: true, angle: 0, scale: 1, alpha: 1 });
  assert.ok(A.M7.cardTo < 1, 'lands while the ring is still growing, so the engine takes over seamlessly');
});

test('the card lands exactly where the engine draws its own', () => {
  const g = intoEra4(120);
  let m = R.eraChangeMoment(g);
  while (m && !m.cardUp) { Pong.step(g, FRAME, {}); m = R.eraChangeMoment(g); }
  const rec = eralooks.recorder();
  R.drawEraFrame(rec.ctx, g);
  const style = R.eraCardStyle(4);
  const frame = rec.calls.find((c) => c[0] === style.border);
  assert.ok(frame, 'the engine drew the card frame');
  const want = A.cardRect(800, 600, R.eraCardText(4));
  assert.deepStrictEqual(frame.slice(1), [want.x, want.y, want.w, want.h]);
});

test('with no canvas to copy, the flourish leaves the plain ring and the engine\'s card alone', () => {
  const g = intoEra4(420);
  let cardSeen = 0;
  for (let i = 0; i < 110; i++) {
    const m = R.eraChangeMoment(g);
    if (!m) break;
    const rec = eralooks.recorder();
    R.drawEraFrame(rec.ctx, g);
    if (m.cardUp) {
      assert.ok(rec.calls.some((c) => c[0] === R.eraCardStyle(4).box), 'the card is drawn');
      cardSeen += 1;
    }
    assert.ok(look.card === undefined || look.card === null, 'the card is never held back headless');
    Pong.step(g, FRAME, {});
  }
  assert.ok(cardSeen > 10);
});

test('a held-back card is always given back once the ring is over', () => {
  const g = intoEra4(300);
  for (let i = 0; i < 100; i++) Pong.step(g, FRAME, {});
  assert.ok(g.time - g.eraChangedAt >= R.ERA_CHANGE.wipe);
  look.card = A.heldCard;
  try {
    R.draw(eralooks.recorder().ctx, g);
    assert.ok(!look.card, 'cleared by the next frame of era 4');
  } finally {
    look.card = null;
  }
});

test('drawing the arrival never changes the state', () => {
  const g = intoEra4(200);
  for (let i = 0; i < 40; i++) Pong.step(g, FRAME, {});
  const before = JSON.stringify(g);
  R.drawEraFrame(eralooks.recorder().ctx, g);
  assert.strictEqual(JSON.stringify(g), before);
});

test('the point that brings the Super Nintendo in is an orchestral hit: brass, strings, timpani, sparkle', () => {
  const hit = PongSound.voicesFor(4, 'score');
  const saws = hit.filter((v) => v.wave === 'sawtooth' && v.freq > 200);
  assert.ok(saws.length >= 3, 'a brass chord of at least three sawtooth notes');
  assert.ok(hit.some((v) => v.wave === 'triangle' && v.dur >= 0.6), 'strings held over it');
  assert.ok(hit.some((v) => v.wave === 'sine' && v.freq < 120 && v.slideTo < v.freq), 'a timpani falling under it');
  assert.ok(hit.some((v) => v.freq > 1200), 'a sparkle on top');
  assert.ok(PongSound.echoFor(4), 'through the era 4 echo');
  const peak = hit.reduce((s, v) => s + v.gain, 0);
  assert.ok(peak <= 1, `the layers together stay under full scale (${peak.toFixed(2)})`);
});
