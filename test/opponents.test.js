// The computer opponent grows up with the machine (item 1209): one profile per
// era, how each one moves, the taunts from the Xbox up, and the beatability band.
const test = require('node:test');
const assert = require('node:assert');
const Pong = require('../src/game.js');
const Opp = require('../src/opponents.js');
require('../src/render.js');
const R = globalThis.PongRender;

const GLYPHS = Object.assign({}, R.DIGITS, R.LETTERS);
const spellable = (text) => text.split('').every((ch) => ch in GLYPHS);

function playing(era, rng) {
  const g = Pong.createGame({ rng: rng || (() => 0.5), phase: 'playing', era });
  g.serveDelay = 0;
  return g;
}

function placeBall(g, x, y, vx, vy) {
  g.ball.x = x; g.ball.y = y; g.ball.vx = vx; g.ball.vy = vy;
}

test('there is one opponent for every rung of the ladder, each with a name, a reaction, a speed and an aim', () => {
  assert.strictEqual(Opp.PROFILES.length, Pong.ERAS.length);
  Opp.PROFILES.forEach((p, i) => {
    assert.strictEqual(p.era, i);
    assert.ok(p.name && spellable(p.name), `era ${i}'s name "${p.name}" is spelt in the block font`);
    assert.ok(p.reaction >= 0 && p.speed > 0 && p.aim > 0, `era ${i} has a reaction, a speed and an aim`);
  });
  assert.strictEqual(Opp.profileFor(0).name, 'COMPUTER');
  assert.strictEqual(Opp.profileFor(1).name, 'CPU');
  assert.strictEqual(Opp.profileFor(99).era, Pong.TOP_ERA, 'past the top is the top');
});

test('the opponent grows up: only 1972 steps, the Super Nintendo is the first to anticipate, the Xbox 360 the sharpest', () => {
  const P = Opp.PROFILES;
  assert.ok(P[0].tick > 0, 'the 1972 machine moves in steps');
  assert.ok(P.slice(1).every((p) => !p.tick), 'nothing after 1972 steps');
  assert.ok(P[1].reaction > P[2].reaction, 'the Atari tracks late, later than the NES');
  assert.ok(P.slice(0, 4).every((p) => !p.anticipate), 'nobody before the Super Nintendo reads ahead');
  assert.ok(P[4].anticipate > 0, 'the Super Nintendo reads where the ball is going');
  for (let i = 5; i <= 10; i++) {
    assert.ok(P[i].anticipate >= P[i - 1].anticipate, `era ${i} reads ahead at least as well as era ${i - 1}`);
    assert.ok(P[i].reaction <= P[i - 1].reaction, `era ${i} reacts at least as fast as era ${i - 1}`);
    assert.ok(P[i].speed >= P[i - 1].speed, `era ${i} is at least as fast as era ${i - 1}`);
  }
  assert.strictEqual(P[10].anticipate, 1);
  assert.ok(P[10].speed > P[0].speed && P[10].reaction < P[1].reaction);
});

test('the 1972 COMPUTER moves in jumps, not a glide', () => {
  const g = playing(0);
  placeBall(g, 300, 60, 300, 0);
  const moves = [];
  let last = g.right.y;
  for (let i = 0; i < 90; i++) {
    Pong.step(g, 1 / 60, {});
    moves.push(g.right.y - last);
    last = g.right.y;
  }
  const moving = moves.filter((d) => d !== 0);
  assert.ok(moving.length > 2, 'it did move');
  assert.ok(moving.length < moves.length / 4, `it moved on ${moving.length} of ${moves.length} frames`);
  const oneFrame = Opp.profileFor(0).speed / 60;
  assert.ok(Math.max(...moving.map(Math.abs)) > oneFrame * 4, 'each move is a jump several frames long');
});

test('the Atari CPU sees the ball late: it stands still until its reaction has passed', () => {
  const g = playing(1);
  placeBall(g, 300, 60, 300, 0);
  const start = g.right.y;
  const wait = Opp.profileFor(1).reaction;
  let t = 0;
  while (t + 1 / 60 < wait - 1e-9) { Pong.step(g, 1 / 60, {}); t += 1 / 60; }
  assert.strictEqual(g.right.y, start, 'not a flicker before it reacts');
  for (let i = 0; i < 20; i++) Pong.step(g, 1 / 60, {});
  assert.ok(g.right.y < start, 'then it goes for the high ball');
});

test('where the ball will arrive is read through the wall bounces', () => {
  const g = playing(4);
  placeBall(g, 400, 100, 300, -300);
  const predicted = Opp.predictY(g);
  // Fly the ball alone to the paddle's face and compare.
  const b = { x: 400, y: 100, vx: 300, vy: -300 };
  while (b.x + g.ball.size < g.right.x) {
    b.x += b.vx / 1000; b.y += b.vy / 1000;
    if (b.y < 0) { b.y = -b.y; b.vy = Math.abs(b.vy); }
    if (b.y + g.ball.size > g.height) { b.y = 2 * (g.height - g.ball.size) - b.y; b.vy = -Math.abs(b.vy); }
  }
  assert.ok(Math.abs(predicted - (b.y + g.ball.size / 2)) < 2, `predicted ${predicted.toFixed(1)}, flew to ${(b.y + 6).toFixed(1)}`);
});

test('the Super Nintendo goes where the ball is going; the Genesis chases where it is', () => {
  const run = (era) => {
    const g = playing(era);          // rng 0.5: no aim error at all
    g.right.y = 20;                  // parked high
    placeBall(g, 380, 60, 320, -260); // heading up into the top wall, then down
    const target = Opp.predictY(g);
    for (let i = 0; i < 36; i++) Pong.step(g, 1 / 60, {});
    return { off: Math.abs(g.right.y + g.right.h / 2 - target), target };
  };
  const genesis = run(3);
  const snes = run(4);
  const xbox360 = run(10);
  assert.ok(snes.off < genesis.off, `SNES ${snes.off.toFixed(0)} from the arrival, Genesis ${genesis.off.toFixed(0)}`);
  assert.ok(xbox360.off <= snes.off, 'and the Xbox 360 reads it best of all');
});

test('every era stays beatable: between 30 and 65 percent of tracking sessions score, and the top is the hardest', () => {
  // `node tools/beatability-sample.mjs --eras` in miniature: the same hand and
  // the same 300 seeds an era, so these are exactly the rates in
  // tools/beatability-eras.json, and the answer never flakes. (60 sessions an
  // era read 28 percent on the Xbox: too few to hold a band.)
  const seeded = (seed) => { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
  const TRIALS = 300;
  const rates = [];
  for (let era = 0; era <= Pong.TOP_ERA; era++) {
    let scored = 0;
    for (let i = 1; i <= TRIALS; i++) {
      const g = Pong.createGame({ rng: seeded(i * 2654435761), phase: 'playing', era });
      let hand = g.height / 2;
      let since = 0;
      for (let t = 0; t < 22; t += 1 / 60) {
        since += 1 / 60;
        if (since >= 0.045) { since = 0; hand = g.ball.y + g.ball.size / 2; }
        Pong.step(g, 1 / 60, { pointerY: hand });
        if (g.era !== era) g.era = era;
        if (g.score.left > 0) break;
      }
      if (g.score.left > 0) scored += 1;
    }
    rates.push(scored / TRIALS);
  }
  rates.forEach((r, era) => assert.ok(r >= 0.3 && r <= 0.65,
    `era ${era}: ${(r * 100).toFixed(0)}% of sessions scored (all: ${rates.map((x) => (x * 100).toFixed(0)).join(' ')})`));
  assert.ok(rates[Pong.TOP_ERA] < rates[0], 'the Xbox 360 is harder to beat than the 1972 machine');
});

test('from the Xbox up, the computer taunts on a point it wins, cleanly, and not before', () => {
  Opp.TAUNTS.forEach((t) => {
    assert.ok(spellable(t), `"${t}" is spelt in the block font`);
    assert.ok(t.length <= 11, `"${t}" fits the gamertag plate`);
  });
  const score = (era) => {
    const g = playing(era);
    Pong.step(g, 1 / 60, {});
    placeBall(g, -40, 300, -400, 0);  // out past the player: the computer's point
    Pong.step(g, 1 / 60, {});
    Pong.step(g, 1 / 60, {});          // it notices on its next move
    return g;
  };
  const xbox = score(10);
  assert.strictEqual(xbox.score.right, 1);
  assert.strictEqual(Opp.tauntFor(xbox), Opp.TAUNTS[0]);
  assert.strictEqual(Opp.tagText(xbox, 'right', 'CPU 2001'), Opp.TAUNTS[0]);
  assert.strictEqual(Opp.tagText(xbox, 'left', 'PONG SLAYER'), 'PONG SLAYER', 'it never speaks for you');
  assert.strictEqual(Opp.toastText(xbox, '10G - POINT SCORED'), '0G - ' + Opp.TAUNTS[0]);
  for (let i = 0; i < 60 * 4; i++) Pong.step(xbox, 1 / 60, {});
  assert.strictEqual(Opp.tauntFor(xbox), null, 'and then it goes quiet');

  const snes = score(4);
  assert.strictEqual(snes.era, 5);
  assert.strictEqual(Opp.tauntFor(snes), null, 'a PlayStation opponent says nothing');

  // Your point is an achievement; its point is not.
  const mine = playing(10);
  placeBall(mine, mine.width + 10, 300, 400, 0);
  Pong.step(mine, 1 / 60, {});
  assert.strictEqual(Opp.toastText(mine, '10G - POINT SCORED'), '10G - POINT SCORED');
});

test('the taunt uses no randomness: the rules draw the same sequence with or without it', () => {
  let calls = 0;
  const g = Pong.createGame({ rng: () => { calls += 1; return 0.5; }, phase: 'playing', era: 10 });
  const before = calls;
  g.serveDelay = 0;
  for (let i = 0; i < 5; i++) Pong.step(g, 1 / 60, {});
  assert.strictEqual(calls, before, 'moving and noticing draw nothing from state.rng');
});

test('the name is drawn in play, and never over the title or the dimmed demo rally', () => {
  const rec = () => {
    const calls = [];
    const ctx = { save() {}, restore() {}, transform() {}, fillRect(x, y, w, h) { calls.push([x, y, w, h]); } };
    return { ctx, calls };
  };
  for (let era = 0; era <= 4; era++) {
    const g = playing(era);
    const r = rec();
    Opp.drawName(r.ctx, g, R);
    assert.ok(r.calls.length > 20, `era ${era} letters its name in blocks (${r.calls.length} blocks)`);
    assert.ok(r.calls.every(([x, y]) => x > g.width / 2 && y < 140), `era ${era}'s name sits by the computer's score`);
  }
  const title = Pong.createGame({ era: 2 });
  const t = rec();
  Opp.drawName(t.ctx, title, R);
  assert.strictEqual(t.calls.length, 0, 'nothing over the title');
  const demo = rec();
  Opp.drawName(demo.ctx, playing(2), R, { ink: '#3a3a3a' });
  assert.strictEqual(demo.calls.length, 0, 'nothing over the dimmed demo rally');
});

test('a game made with other rules scales the opponent by them, and cpuProfiles false is the old chase', () => {
  const slow = Pong.createGame({ phase: 'playing', era: 5, rules: { cpuSpeed: 150 } });
  const fast = Pong.createGame({ phase: 'playing', era: 5 });
  [slow, fast].forEach((g) => { g.serveDelay = 0; g.right.y = 400; placeBall(g, 300, 40, 300, 0); });
  for (let i = 0; i < 30; i++) { Pong.step(slow, 1 / 60, {}); Pong.step(fast, 1 / 60, {}); }
  assert.ok(400 - slow.right.y < 400 - fast.right.y, 'half the cpuSpeed, a slower opponent');

  const old = Pong.createGame({ rng: () => 0.5, phase: 'playing', era: 10, rules: { cpuProfiles: false } });
  old.serveDelay = 0;
  placeBall(old, 300, 60, 300, 0);
  const y0 = old.right.y;
  Pong.step(old, 1 / 60, {});
  assert.ok(Math.abs((y0 - old.right.y) - Pong.RULES.cpuSpeed / 60) < 1e-6, 'the old chase moves at once, at cpuSpeed');
});
