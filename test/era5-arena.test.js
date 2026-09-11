'use strict';
/*
 * Era 5's arena and fight HUD (item 1228, docs/ART.md era 5): a low city behind
 * the far rail whose windows switch one at a time, two searchlights sweeping
 * +-25 degrees every 5 s that lock onto the table at match point, and Tekken's
 * health bars -- a tenth drained per point with a red chunk shrinking over
 * 0.4 s, POINT for 0.8 s, FINAL ROUND at match point -- all above the far edge.
 * The pure parts are pinned here; one frame is drawn on the recording canvas.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
const T = R.table3d;
const look = R.eraLook(5);
const A = look.arena;

function game(over) {
  const g = Pong.createGame(Object.assign({ rng: () => 0.3, phase: 'playing', era: 5 }, over || {}));
  g.serveDelay = 0;
  return g;
}

test('the skyline is ten seeded boxes behind the far wall, spanning the frame', () => {
  assert.strictEqual(A.BOXES.length, 10);
  for (const b of A.BOXES) {
    assert.ok(b.w >= A.SKYLINE.wMin && b.w <= A.SKYLINE.wMax, 'width ' + b.w);
    assert.ok(b.h >= A.SKYLINE.hMin && b.h <= A.SKYLINE.hMax, 'height ' + b.h);
    assert.ok(b.y <= A.SKYLINE.yNear && b.y >= A.SKYLINE.yFar, 'behind the far wall: y ' + b.y);
  }
  const cam = look.cameraAt(T, { time: 0 }, look.camera);
  const xs = A.BOXES.map((b) => T.project(cam, b.x, b.y, 0).x);
  assert.ok(Math.min(...xs) < 0 && Math.max(...xs) > 600, 'the city reaches both sides of the frame');
  // Every roof is on screen, between the top of the frame and the far edge.
  const far = T.project(cam, 400, 0, 0).y;
  for (const b of A.BOXES) {
    const roof = T.project(cam, b.x + b.w / 2, b.y, b.h).y;
    assert.ok(roof > 0 && roof < far, 'roof at screen y ' + roof.toFixed(1));
  }
});

test('24 windows, and exactly one switches every 0.7 s', () => {
  assert.strictEqual(A.WINDOWS.length, 24);
  for (let s = 0; s < 60; s++) {
    const a = A.WINDOWS.map((w, i) => A.windowLit(i, s * 0.7 + 0.1));
    const b = A.WINDOWS.map((w, i) => A.windowLit(i, (s + 1) * 0.7 + 0.1));
    const flipped = a.filter((v, i) => v !== b[i]).length;
    assert.strictEqual(flipped, 1, 'switch ' + s + ' flipped ' + flipped);
  }
  for (const w of A.WINDOWS) {
    const b = A.BOXES[w.box];
    assert.ok(w.z + A.SKYLINE.winH <= b.h, 'a window stays under its roof');
  }
});

test('the searchlights sweep +-25 degrees on a 5 s period, in opposition', () => {
  let lo = Infinity, hi = -Infinity;
  for (let t = 0; t < 5; t += 0.01) {
    const a = A.beamAngle(0, t);
    lo = Math.min(lo, a); hi = Math.max(hi, a);
    assert.ok(Math.abs(A.beamAngle(0, t) + A.beamAngle(1, t)) < 1e-9, 'the two beams mirror each other');
  }
  assert.ok(Math.abs(hi - 25) < 0.01 && Math.abs(lo + 25) < 0.01);
  assert.ok(Math.abs(A.beamAngle(0, 1.3) - A.beamAngle(0, 6.3)) < 1e-9, 'period 5 s');
  const tri = A.beamTriangle({ x: 100, y: 100 }, 0, 320, 40);
  assert.ok(Math.abs(tri[1].y - (100 - 320)) < 1e-9, 'straight up at 0 degrees');
  assert.ok(Math.abs(Math.abs(tri[1].x - tri[2].x) - 40) < 1e-9, '40 wide at the far end');
});

test('at match point both beams end on the table\'s centre line', () => {
  const cam = look.cameraAt(T, { time: 0 }, look.camera);
  for (let i = 0; i < 2; i++) {
    const tri = A.lockedBeam(T, cam, i);
    const tg = A.SEARCH.targets[i];
    assert.strictEqual(tg[0], 400);
    const end = T.project(cam, tg[0], tg[1], 0);
    const mid = { x: (tri[1].x + tri[2].x) / 2, y: (tri[1].y + tri[2].y) / 2 };
    assert.ok(Math.hypot(mid.x - end.x, mid.y - end.y) < 1e-6, 'beam ' + i + ' ends on the centre line');
  }
});

test('each bar drains a tenth per point the other side has taken, never below empty', () => {
  const g = game();
  g.score.left = 3; g.score.right = 2;
  assert.deepStrictEqual(A.barFractions(g), { left: 0.8, right: 0.7 });
  g.score.right = 14;
  assert.strictEqual(A.barFractions(g).left, 0);
});

test('a point: the red chunk shrinks on the conceding bar over 0.4 s, POINT shows for 0.8 s', () => {
  const g = game();
  g.time = 10;
  A.pointMoment(g);                               // first sight at 0-0: no point
  assert.strictEqual(A.hudCall(g, A.pointMoment(g)), null);
  g.score.right = 1; g.missAt = { x: 0, y: 300 };  // the player let one through
  g.time = 10.1;
  const m = A.pointMoment(g);
  assert.strictEqual(m.side, 'left');
  assert.strictEqual(m.at, 10.1);
  assert.ok(Math.abs(A.chunkOf(g, m, 'left') - 0.1) < 1e-9, 'a whole tenth at the moment itself');
  assert.strictEqual(A.chunkOf(g, m, 'right'), 0, 'only the conceding bar');
  g.time = 10.3;
  assert.ok(Math.abs(A.chunkOf(g, A.pointMoment(g), 'left') - 0.05) < 1e-9, 'half gone at 0.2 s');
  assert.deepStrictEqual(A.hudCall(g, A.pointMoment(g)).lines, ['POINT']);
  g.time = 10.55;
  assert.strictEqual(A.chunkOf(g, A.pointMoment(g), 'left'), 0);
  g.time = 10.95;
  assert.strictEqual(A.hudCall(g, A.pointMoment(g)), null, 'POINT is gone after 0.8 s');
});

test('the point that brought the machine to era 5 is called on arrival', () => {
  const g = Pong.createGame({ rng: () => 0.3, phase: 'playing', era: 4 });
  g.serveDelay = 0;
  g.ball.x = 1; g.ball.y = 300; g.ball.vx = -400; g.ball.vy = 0;
  g.left.y = 0;
  Pong.step(g, 0.05, {});
  assert.strictEqual(g.era, 5);
  const m = A.pointMoment(g);
  assert.strictEqual(m.at, g.eraChangedAt);
  assert.strictEqual(m.side, 'left');
  assert.deepStrictEqual(A.hudCall(g, m).lines, ['POINT']);
});

test('FINAL ROUND is held while it is match point', () => {
  const g = game();
  g.rules.matchPoints = 11;
  g.score.left = 5; g.score.right = 5;
  g.time = 3;
  A.pointMoment(g);
  g.time = 5;
  assert.ok(Pong.isMatchPoint(g));
  const saved = globalThis.Pong;
  globalThis.Pong = Pong;                           // the page's global, which the era file asks
  try {
    assert.deepStrictEqual(A.hudCall(g, A.pointMoment(g)).lines, ['FINAL', 'ROUND']);
  } finally { globalThis.Pong = saved; }
});

test('the whole HUD sits above the far edge less 6 (R8), at every wobble', () => {
  const k = 1 / look.buffer.scale;                 // field units per buffer pixel
  const bottom = Math.max(
    A.BARS.top + A.BARS.h + 1,
    A.LABELS.top + 5 * A.LABELS.cell + 1,
    A.CALL.lineTwo + 5 * A.CALL.cell + 1
  ) * k;
  for (let t = 0; t < 10; t += 0.05) {
    const cam = look.cameraAt(T, { time: t }, look.camera);
    const far = Math.min(T.project(cam, 0, 0, 0).y, T.project(cam, 800, 0, 0).y);
    assert.ok(bottom < far - 6, 'HUD bottom ' + bottom + ' against far edge ' + far + ' at t ' + t);
  }
});

test('a frame with the arena, the HUD and a fresh point draws, headless', () => {
  const g = game();
  g.time = 4;
  R.draw(eralooks.recorder().ctx, g);              // seen at 0-0 first
  g.score.left = 2; g.score.right = 3; g.missAt = { x: 800, y: 300 };
  g.time = 4.1;
  const rec = eralooks.recorder();
  R.draw(rec.ctx, g);
  const inks = new Set(rec.calls.map((c) => c[0]));
  assert.ok(inks.has(A.BARS.back), 'the bars\' ground is drawn');
  assert.ok(inks.has('#f3c300'), 'the bars\' yellow is drawn');
  assert.ok(inks.has('#e03a3e'), 'the red damage chunk is drawn');
});
