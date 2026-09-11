'use strict';
/*
 * Era 5's arrival (item 1151, docs/ERAS.md chapter 6): the Super Nintendo picture
 * shatters into jittering, swimming polygons that tilt up out of the point, the
 * ring's edge is a wobbling snapped 16-gon, and the table pops in with one camera
 * overshoot under a white wash. The drawing of the old picture needs a real
 * canvas, so the headless suite pins the pure parts and walks one whole arrival
 * through the engine on a recording canvas.
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
const T = R.table3d;
const look = R.eraLook(5);
const A = look.arrival;
const N = A.ARRIVAL;

/** A game one point from era 5; the point goes out of the player's side at height y. */
function intoEra5(y) {
  const g = Pong.createGame({ rng: () => 0.3, phase: 'playing', era: 4 });
  g.serveDelay = 0;
  g.ball.x = 1;
  g.ball.y = y;
  g.ball.vx = -400;
  g.ball.vy = 0;
  g.left.y = y > g.height / 2 ? 0 : g.height - g.left.h;
  Pong.step(g, 0.05, {});
  assert.strictEqual(g.era, 5);
  return g;
}

/** The engine's recording canvas, with fills and strokes logged too. */
function spyRecorder() {
  const rec = eralooks.recorder();
  const ctx = rec.ctx;
  ctx.fill = function () { rec.calls.push(['fill', this.fillStyle, this.globalAlpha]); };
  ctx.stroke = function () { rec.calls.push(['stroke', this.strokeStyle, this.lineWidth]); };
  return rec;
}

const onGrid = (v) => Math.abs(v / N.snap - Math.round(v / N.snap)) < 1e-9;

test('era 5 registers its own arrival flourish, and a rung borrowing its look does not replay it', () => {
  assert.strictEqual(typeof look.flourish, 'function');
  const g = intoEra5(300);
  for (const toEra of [4, 6, 7]) {
    const rec = spyRecorder();
    look.flourish(rec.ctx, 0.1, { x: 0, y: 300 }, toEra - 1, toEra, { radius: 90, t: 0.2, duration: 1.5, width: 800, height: 600, state: g, dim: null });
    assert.strictEqual(rec.calls.length, 0, `nothing drawn arriving at era ${toEra}`);
  }
});

test('ignition: 12 seeded shards, every vertex jittered onto the 2.5-pixel grid, never past R + 60', () => {
  for (const origin of [{ x: 0, y: 40 }, { x: 800, y: 300 }, { x: 0, y: 590 }]) {
    const shards = A.shardsFor(origin);
    assert.strictEqual(shards.length, 12);
    assert.deepStrictEqual(A.shardsFor(origin), shards, 'the same point gives the same shards');
    for (const sh of shards) assert.ok(sh.size >= 18 && sh.size <= 40, `size ${sh.size}`);
    assert.deepStrictEqual([...new Set(shards.map((s) => s.accent))].sort(), [...look.palette.accents].sort());
    for (let k = 1; k < 25; k++) {
      const p = k / 100;
      const radius = R.ERA_CHANGE.ringRadius(p, origin, 800, 600);
      shards.forEach((sh, i) => {
        const pose = A.shardPose(sh, origin, p, radius, p, i);
        for (const q of pose.dst) {
          assert.ok(onGrid(q.x) && onGrid(q.y), `snapped (${q.x}, ${q.y})`);
          const out = Math.hypot(q.x - origin.x, q.y - origin.y);
          assert.ok(out <= radius + 60 + N.snap, `inside R + 60 at p ${p}: ${out.toFixed(1)} vs ${radius.toFixed(1)}`);
        }
      });
    }
  }
});

test('the shards jitter from frame to frame, tilt up and recede as they fly, and are gone when the edge beat starts', () => {
  const origin = { x: 0, y: 300 };
  const sh = A.shardsFor(origin)[3];
  const area = (t) => Math.abs((t[1].x - t[0].x) * (t[2].y - t[0].y) - (t[2].x - t[0].x) * (t[1].y - t[0].y)) / 2;
  const a = A.shardPose(sh, origin, 0.2, 200, 0.40, 3);
  const b = A.shardPose(sh, origin, 0.2, 200, 0.45, 3);
  assert.notDeepStrictEqual(a.dst, b.dst, 'the same moment jitters a frame later');
  const early = A.shardPose(sh, origin, 0.03, 200, 0.1, 3);
  const late = A.shardPose(sh, origin, 0.2, 200, 0.1, 3);
  assert.ok(area(late.dst) < 0.6 * area(late.src), `foreshortened and receded (${area(late.dst).toFixed(0)} vs ${area(late.src).toFixed(0)})`);
  assert.ok(area(early.dst) > area(late.dst), 'flatter to the eye the further it has flown');
  assert.strictEqual(A.shardPose(sh, origin, 0.25, 300, 1, 3).alpha, 0);
});

test('the edge is a wobbling 16-gon on the chunk grid, hugging the ring', () => {
  const origin = { x: 800, y: 120 };
  const e1 = A.edgePolygon(origin, 400, 1.00, 0);
  const e2 = A.edgePolygon(origin, 400, 1.05, 0);
  assert.strictEqual(e1.length, 16);
  assert.notDeepStrictEqual(e1, e2, 'it wobbles');
  for (const q of e1) {
    assert.ok(onGrid(q.x) && onGrid(q.y));
    const r = Math.hypot(q.x - origin.x, q.y - origin.y);
    assert.ok(Math.abs(r - 400) <= 6 + 2 * N.snap, `radius ${r.toFixed(1)}`);
  }
});

test('the camera is held back until beat 3, pops home with one small overshoot, and every pose passes R3', () => {
  assert.strictEqual(A.liftAt(0), 40);
  assert.strictEqual(A.liftAt(0.79), 40);
  assert.strictEqual(A.liftAt(1), 0);
  let lowest = Infinity;
  for (let k = 0; k <= 200; k++) lowest = Math.min(lowest, A.liftAt(0.8 + 0.2 * k / 200));
  assert.ok(lowest < 0 && lowest >= N.floor, `one overshoot past rest, floored (${lowest.toFixed(2)})`);
  const m = look.motion;
  for (const h of [1150 + 40 + m.height, 1150 + lowest - m.height]) {
    for (const panX of [-m.pan, m.pan]) {
      const cam = T.camera(Object.assign({}, look.camera, { height: h, panX }));
      const nl = T.project(cam, 0, 600, 0), nr = T.project(cam, 800, 600, 0);
      const fl = T.project(cam, 0, 0, 0), fr = T.project(cam, 800, 0, 0);
      assert.ok(nl.x >= 8 && nr.x <= 792, `near corners on screen at height ${h}`);
      assert.ok(nl.y <= 592 && fl.y >= 64, `near and far edges on screen at height ${h}`);
      assert.ok((fr.x - fl.x) / (nr.x - nl.x) >= 0.70, 'far edge at least 0.70 of the near');
      const far = T.project(cam, 400, 1, 0).y - T.project(cam, 400, 0, 0).y;
      const nearU = T.project(cam, 400, 600, 0).y - T.project(cam, 400, 599, 0).y;
      assert.ok(far / nearU >= 0.55, 'depth at the far edge at least 0.55 of the near');
      assert.ok(T.project(cam, 400, 84, 0).y - T.project(cam, 400, 0, 0).y >= 44, 'a far paddle at least 44 pixels');
    }
  }
});

test('through the engine: shards, then the red and yellow edge, then the wash, all inside the serve pause', () => {
  const g = intoEra5(420);
  const seen = { shards: 0, edge: 0, wash: 0, doneInPause: false };
  let m = R.eraChangeMoment(g);
  const before = JSON.stringify(g);
  const recBefore = spyRecorder();
  R.drawEraFrame(recBefore.ctx, g);
  assert.strictEqual(JSON.stringify(g), before, 'drawing the arrival never changes the state');
  while (m) {
    const rec = spyRecorder();
    R.drawEraFrame(rec.ctx, g);
    const accents = look.palette.accents;
    if (m.wiping && m.p < 0.25 && rec.calls.some((c) => c[0] === 'fill' && accents.includes(c[1]))) seen.shards++;
    if (m.wiping && m.p >= 0.25 && m.p < 0.8 &&
        rec.calls.some((c) => c[0] === 'stroke' && c[1] === accents[0] && c[2] === 5) &&
        rec.calls.some((c) => c[0] === 'stroke' && c[1] === accents[1] && c[2] === 3)) seen.edge++;
    if (m.wiping && m.p >= 0.8 && rec.calls.some((c) => c[0] === '#ffffff' && c[3] === 800 && c[4] === 600)) seen.wash++;
    assert.ok(g.serveDelay > 0, 'the ball is still held for the serve');
    if (!m.wiping) seen.doneInPause = true;
    Pong.step(g, FRAME, {});
    m = R.eraChangeMoment(g);
  }
  assert.ok(seen.shards > 5 && seen.edge > 20 && seen.wash > 5, JSON.stringify(seen));
  assert.ok(seen.doneInPause, 'the ring and its flourish finish while the serve is still held');
  assert.strictEqual(A.arrivalLift(g), 0, 'and the camera is home');
});

test('the lift goes on era 5 only while its own arrival plays', () => {
  const g = intoEra5(200);
  for (let i = 0; i < 12; i++) { R.drawEraFrame(eralooks.recorder().ctx, g); Pong.step(g, FRAME, {}); }
  assert.strictEqual(A.arrivalLift(g), 40, 'held back through the ring');
  const leaving = Object.assign({}, g, { era: 5, eraChangedAt: g.eraChangedAt + 5, time: g.time + 5 });
  assert.strictEqual(A.arrivalLift(leaving), 0, 'never on a later change');
  for (let i = 0; i < 120; i++) Pong.step(g, FRAME, {});
  assert.strictEqual(A.arrivalLift(g), 0, 'home once the ring is over');
});

test('the point that brings the PlayStation in sounds its boot chime: the shimmering swell, then the deep tone', () => {
  const boot = PongSound.voicesFor(5, 'boot');
  assert.ok(boot.filter((v) => v.wave === 'sine' && v.freq > 1000 && (v.at || 0) < 0.2).length >= 4, 'the swell');
  assert.ok(boot.some((v) => v.wave === 'sine' && v.freq < 70 && v.at >= 0.9), 'the deep logo tone');
});
