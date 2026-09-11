'use strict';
/*
 * The match and its finale (item 1211): eleven points, one per era, the
 * eleventh ending it on the Xbox 360; MATCH POINT before it; then the finale
 * (src/match.js) -- the announcement, the rewind down the ladder, the thanks --
 * and back to the attract screen. Headless: the rules alone, and the finale
 * drawn on the recording canvas from tools/eralooks.js.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
require('../src/erachange.js');
const M = require('../src/match.js');
const Feel = require('../src/feel.js');

const FRAME = 1 / 60;

function playing(opts) {
  return Pong.createGame(Object.assign({ rng: () => 0.3, phase: 'playing' }, opts || {}));
}

/** One point: 'right' is the computer's (a miss past the player), 'left' the player's. */
function point(g, side) {
  g.serveDelay = 0;
  g.ball.vy = 0;
  g.ball.y = g.height / 2;
  if (side === 'left') {
    g.ball.x = g.width - 2; g.ball.vx = 400;
    g.right.y = 0;
  } else {
    g.ball.x = 1; g.ball.vx = -400;
    g.left.y = g.height - g.left.h;
  }
  Pong.step(g, 0.05, {});
}

/** Run the finale's clock on, the way the loop does: rules, then the finale. */
function run(g, seconds) {
  for (let t = 0; t < seconds; t += FRAME) {
    Pong.step(g, FRAME, {});
    M.step(g);
  }
}

test('a match is eleven points, one per era', () => {
  assert.strictEqual(Pong.RULES.matchPoints, 11);
  assert.strictEqual(Pong.RULES.matchPoints, Pong.ERAS.length);
});

test('the tenth point lands on the Xbox 360, and the eleventh, scored there, ends the match', () => {
  const g = playing();
  for (let i = 0; i < 10; i++) point(g, i % 2 ? 'left' : 'right');
  assert.strictEqual(g.era, Pong.TOP_ERA);
  assert.strictEqual(g.phase, 'playing');
  assert.ok(Pong.isMatchPoint(g), 'ten points in, the next is match point');
  point(g, 'left');
  assert.strictEqual(g.phase, 'over');
  assert.strictEqual(g.era, Pong.TOP_ERA, 'the last point is scored on the 360');
  assert.deepStrictEqual(g.score, { left: 6, right: 5 });
  assert.strictEqual(g.winner, 'left', 'the higher score wins');
  assert.strictEqual(g.overAt, g.time);
  assert.ok(!Pong.isMatchPoint(g), 'nothing is match point once it is over');
});

test('the computer can take it too', () => {
  const g = playing();
  for (let i = 0; i < 11; i++) point(g, i < 7 ? 'right' : 'left');
  assert.strictEqual(g.phase, 'over');
  assert.strictEqual(g.winner, 'right');
});

test('a finished match moves nothing: no ball, no paddles, no more points', () => {
  const g = playing();
  for (let i = 0; i < 11; i++) point(g, 'right');
  const ball = Object.assign({}, g.ball), ly = g.left.y;
  const t = g.time;
  for (let i = 0; i < 60; i++) Pong.step(g, FRAME, { up: true });
  assert.deepStrictEqual(g.ball, ball);
  assert.strictEqual(g.left.y, ly);
  assert.strictEqual(g.score.right, 11);
  assert.ok(g.time > t, 'the clock keeps running for the finale');
});

test('match point is ten points in, whatever era the page was opened at', () => {
  const g = playing({ era: 4 });
  assert.ok(!Pong.isMatchPoint(g));
  g.score.left = 3; g.score.right = 7;
  assert.ok(Pong.isMatchPoint(g));
  assert.ok(Feel.isMatchPoint(g), 'the feel layer asks the rules, so its slow motion plays on it');
});

test('the attract rally has no match to finish', () => {
  const g = playing({ rules: { matchPoints: 0 } });
  for (let i = 0; i < 14; i++) point(g, 'right');
  assert.strictEqual(g.phase, 'playing');
  assert.ok(!Pong.isMatchPoint(g));
});

test('a new coin after a finished match is a fresh match', () => {
  const g = playing();
  for (let i = 0; i < 11; i++) point(g, 'right');
  Pong.backToTitle(g);
  assert.ok(Pong.startGame(g));
  assert.strictEqual(g.phase, 'playing');
  assert.strictEqual(g.winner, null);
  assert.deepStrictEqual(g.score, { left: 0, right: 0 });
  assert.strictEqual(g.era, 0);
});

test('the finale timeline: announce on the 360, a rung down every half second, then thanks', () => {
  const a = M.timeline(0, 10);
  assert.strictEqual(a.stage, 'announce');
  assert.strictEqual(a.era, 10);
  const r0 = M.timeline(M.ANNOUNCE_S + 0.01, 10);
  assert.deepStrictEqual([r0.stage, r0.from, r0.to, r0.era], ['rewind', 10, 9, 9]);
  const r = M.timeline(M.ANNOUNCE_S + 2.75, 10);
  assert.deepStrictEqual([r.stage, r.from, r.to], ['rewind', 5, 4]);
  assert.ok(Math.abs(r.raw - 0.5) < 1e-9, 'half way through its half second');
  const last = M.timeline(M.ANNOUNCE_S + 10 * M.STEP_S - 0.01, 10);
  assert.deepStrictEqual([last.from, last.to], [1, 0]);
  assert.strictEqual(M.timeline(M.ANNOUNCE_S + 10 * M.STEP_S + 0.01, 10).stage, 'thanks');
  assert.strictEqual(M.timeline(M.length(10) + 0.01, 10).stage, 'done');
  assert.strictEqual(M.STEP_S, 0.5);
});

test('the finale walks the game down the ladder, one rung at a time, then back to the attract screen', () => {
  const g = playing();
  for (let i = 0; i < 11; i++) point(g, 'right');
  const seen = [];
  for (let t = 0; t < M.length(10) + 0.5 && g.phase === 'over'; t += FRAME) {
    Pong.step(g, FRAME, {});
    M.step(g);
    if (seen[seen.length - 1] !== g.era) seen.push(g.era);
  }
  assert.deepStrictEqual(seen, [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  assert.strictEqual(g.phase, 'title', 'Pong.backToTitle: INSERT COIN again');
});

test('the finale counts the eras the match visited', () => {
  const g = playing();
  for (let i = 0; i < 11; i++) point(g, 'right');
  const f = M.finale(g);
  assert.strictEqual(f.visited, 11);
  assert.strictEqual(f.top, 10);
  run(g, M.ANNOUNCE_S + 1);
  assert.strictEqual(M.finale(g).top, 10, 'the top is remembered while the era walks down');
});

test('the rewind is the era ring run backwards: the newer era inside, shrinking into the centre', () => {
  const g = playing();
  for (let i = 0; i < 11; i++) point(g, 'right');
  run(g, M.ANNOUNCE_S + 0.1);
  const early = M.rewindRing(g, M.finale(g));
  run(g, 0.3);
  const later = M.rewindRing(g, M.finale(g));
  assert.strictEqual(early.era, 10, 'the 360 inside');
  assert.strictEqual(early.from, 9, 'the Xbox outside');
  assert.ok(later.radius < early.radius, 'the ring closes');
  assert.deepStrictEqual(early.origin, { x: g.width / 2, y: g.height / 2 });
});

test('drawing the finale: every stage draws, with no per-pixel work and no arrival flourish', () => {
  const g = playing();
  for (let i = 0; i < 11; i++) point(g, 'right');
  const stages = [];
  let flourishes = 0;
  const look = R.eraLook(10);
  const saved = look.flourish;
  look.flourish = function () { flourishes++; };
  try {
    for (let t = 0; t < M.length(10) && g.phase === 'over'; t += 0.25) {
      run(g, 0.25);
      if (g.phase !== 'over') break;
      const rec = eralooks.recorder();
      for (const k of ['getImageData', 'putImageData', 'createImageData']) {
        rec.ctx[k] = () => { throw new Error(`per-pixel work: ${k}`); };
      }
      assert.ok(M.drawField(rec.ctx, g, (c, s) => R.draw(c, s)));
      assert.ok(M.drawOver(rec.ctx, g));
      stages.push(M.finale(g).stage);
    }
  } finally {
    look.flourish = saved;
  }
  assert.ok(stages.includes('announce') && stages.includes('rewind') && stages.includes('thanks'), stages.join(','));
  assert.strictEqual(flourishes, 0, 'the arrivals are skipped on the way down');
});

test('in ordinary play the finale draws nothing and leaves the frame to the loop', () => {
  const g = playing();
  const rec = eralooks.recorder();
  assert.strictEqual(M.drawField(rec.ctx, g, () => { throw new Error('not asked'); }), false);
  assert.strictEqual(M.drawOver(rec.ctx, g), false);
  assert.strictEqual(M.step(g), null);
});

test('MATCH POINT is up while the eleventh point waits to be served', () => {
  const g = playing();
  for (let i = 0; i < 10; i++) point(g, 'right');
  assert.ok(g.serveDelay > 0);
  run(g, 1.6);                        // past the ring, the 360's plate is up
  assert.ok(M.overlays(g));
  const rec = eralooks.recorder();
  assert.ok(M.drawOver(rec.ctx, g));
  run(g, 1);                          // served: the plate goes
  assert.ok(g.serveDelay <= 0);
  assert.strictEqual(M.overlays(g), false);
});
