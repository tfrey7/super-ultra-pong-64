/*
 * The cabinet (item 1207): power-on, the attract screen, the coin moment, and
 * the one call a finished match makes to come back to INSERT COIN. The rules
 * half is plain state; the drawing half runs on the recording canvas from
 * tools/eralooks.js, so none of this needs a browser.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadRenderer, recorder } = require('../tools/eralooks.js');

const { Pong, R } = loadRenderer(path.join(__dirname, '..'));
globalThis.Pong = Pong;
const PongAttract = require('../src/attract.js');
const PongSound = require('../src/sound.js');

const fixed = () => 0.5;
const run = (g, seconds) => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) Pong.step(g, 1 / 60, { pointerY: null, up: false, down: false }); };

test('?title=off and any ?era=N open straight into play; a bare page and ?title=on keep the cabinet', () => {
  assert.strictEqual(PongAttract.straightIn(''), false);
  assert.strictEqual(PongAttract.straightIn('?title=off'), true);
  assert.strictEqual(PongAttract.straightIn('?era=3'), true);
  assert.strictEqual(PongAttract.straightIn('?era=0'), true);
  assert.strictEqual(PongAttract.straightIn('?era=3&title=on'), false, 'the playtest keeps its title checks');
  assert.strictEqual(PongAttract.straightIn('?title=offish'), false);
});

test('startGame with a hold keeps the first serve waiting that long, and without one nothing changed', () => {
  const plain = Pong.createGame({ rng: fixed });
  Pong.startGame(plain);
  assert.strictEqual(plain.serveDelay, plain.rules.serveDelay);

  const g = Pong.createGame({ rng: fixed });
  assert.strictEqual(Pong.startGame(g, 2.1), true);
  assert.ok(g.serveDelay >= 2.1);
  const x0 = g.ball.x;
  run(g, 2.0);
  assert.strictEqual(g.ball.x, x0, 'the ball waits at the centre through CREDIT 1 and PLAYER 1 READY');
  run(g, 0.3);
  assert.notStrictEqual(g.ball.x, x0, 'then it serves');
  assert.strictEqual(g.era, 0, 'at the 1972 machine');
});

test('backToTitle is the one call a finished match makes: the field stops and the next coin is a fresh game', () => {
  const g = Pong.createGame({ rng: fixed, phase: 'playing' });
  g.score.left = 7; g.score.right = 11;
  assert.strictEqual(Pong.backToTitle(g), true);
  assert.strictEqual(g.phase, 'title');
  assert.strictEqual(Pong.backToTitle(g), false, 'already there');
  const ball = { x: g.ball.x, y: g.ball.y };
  run(g, 1);
  assert.deepStrictEqual({ x: g.ball.x, y: g.ball.y }, ball, 'nothing moves on the attract screen');
  assert.strictEqual(Pong.startGame(g), true);
  assert.deepStrictEqual(g.score, { left: 0, right: 0 });
});

test('the cabinet runs warming -> attract -> credit -> ready -> play, and a second coin does nothing', () => {
  const g = Pong.createGame({ rng: fixed });
  const cab = PongAttract.create();
  const heard = [];
  const sound = { play: (ev) => { heard.push(ev); return true; } };
  assert.strictEqual(cab.stage(g), 'warming');
  run(g, PongAttract.WARM + 0.1);
  assert.strictEqual(cab.stage(g), 'attract');

  assert.strictEqual(cab.coin(g, sound), true);
  assert.strictEqual(g.phase, 'playing', 'the game is under way at once, so a click still starts it');
  assert.strictEqual(cab.credits, 1);
  assert.deepStrictEqual(heard, [{ type: 'coin', era: 0 }], 'the clunk, in the arcade voice');
  run(g, 0.3);
  assert.strictEqual(cab.stage(g), 'credit');
  run(g, 1.0);
  assert.strictEqual(cab.stage(g), 'ready');
  run(g, PongAttract.COIN_HOLD - 1.3 + 0.1);
  assert.strictEqual(cab.stage(g), 'play');

  assert.strictEqual(cab.coin(g, sound), false, 'a fistful of keys cannot restart a rally');
  assert.strictEqual(cab.credits, 1);
  assert.strictEqual(heard.length, 1);

  Pong.backToTitle(g);
  assert.strictEqual(cab.stage(g), 'attract', 'back to INSERT COIN, and the tube does not warm up again');
});

test('a coin while the tube is still warming skips straight to the credit', () => {
  const g = Pong.createGame({ rng: fixed });
  const cab = PongAttract.create();
  run(g, 0.4);
  assert.strictEqual(cab.coin(g, null), true);
  assert.strictEqual(cab.warm, true);
  assert.strictEqual(cab.stage(g), 'credit');
});

test('the coin is a row of the 1972 voice: a clunk under 120 Hz and a hum that outlasts the clunk', () => {
  const coin = PongSound.voicesFor(0, 'coin');
  assert.ok(coin.length >= 3);
  assert.ok(coin.some((v) => v.freq < 120 && v.dur <= 0.3), 'the clunk');
  const hum = coin.filter((v) => v.freq <= 60 && v.dur >= 1);
  assert.strictEqual(hum.length, 1, 'the 60-cycle hum');
  assert.ok(coin.every((v) => v.gain > 0 && v.gain <= 0.4));
  assert.ok(coin.every((v) => (v.at || 0) + v.dur <= PongAttract.COIN_HOLD), 'over before the first serve');
});

test('the cabinet draws without writing the state: the tube, the attract screen and the coin overlay', () => {
  const g = Pong.createGame({ rng: fixed });
  const cab = PongAttract.create();
  let painted = 0;
  const paint = () => { painted += 1; };
  const draw = (fn) => { const rec = recorder(); fn(rec.ctx); return rec.calls; };

  const before = JSON.stringify(g);
  const dot = draw((ctx) => cab.drawTitle(ctx, g, paint));
  assert.strictEqual(painted, 0, 'no picture behind a warming dot');
  assert.strictEqual(JSON.stringify(g), before, 'drawing reads the state and never writes it');

  run(g, 1.0);
  draw((ctx) => cab.drawTitle(ctx, g, paint));
  assert.strictEqual(painted, 1, 'the picture opening shows the rally');

  run(g, PongAttract.WARM);
  while (!R.promptLit(g)) run(g, 0.05);
  const lit = draw((ctx) => cab.drawTitle(ctx, g, paint));
  while (R.promptLit(g)) run(g, 0.05);
  const unlit = draw((ctx) => cab.drawTitle(ctx, g, paint));
  assert.ok(lit.length > unlit.length + 20, 'INSERT COIN blinks');
  assert.ok(lit.length > dot.length + 100, 'PONG and the rest are lettered in blocks');

  cab.coin(g, null);
  run(g, 0.3);
  const credit = draw((ctx) => cab.drawOver(ctx, g));
  assert.ok(credit.length > 30, 'CREDIT 1 over the field');
  run(g, PongAttract.COIN_HOLD);
  assert.deepStrictEqual(draw((ctx) => cab.drawOver(ctx, g)), [], 'nothing over real play');
});
