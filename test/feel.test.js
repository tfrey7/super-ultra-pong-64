// The game-feel layer (src/feel.js): the per-era intensity table, which effect
// switches on where, the hit-stop's length and its freeze, match-point slow
// motion, and the rally counter -- all headless, on the real rules.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Pong = require('../src/game.js');
const Feel = require('../src/feel.js');

const FRAME = 1 / 60;

/** A game in play at an era, the serve pause over, with a pinned rng. */
function playing(era) {
  const g = Pong.createGame({ era, phase: 'playing', rng: () => 0.5 });
  g.serveDelay = 0;
  Feel.reset(g);
  return g;
}

/** The ball just short of the player's paddle face, heading into its middle. */
function aboutToHitLeft(g, speed) {
  const p = g.left;
  g.ball.x = p.x + p.w + 1;
  g.ball.y = p.y + p.h / 2 - g.ball.size / 2;
  g.ball.vx = -speed;
  g.ball.vy = 0;
}

const hold = { pointerY: 300 };   // the hand, parked on the paddle's middle

test('the intensity table runs from 0 at the 1972 arcade to 1 at the Xbox 360, climbing every era', () => {
  assert.strictEqual(Feel.INTENSITY.length, Pong.ERAS.length);
  assert.strictEqual(Feel.intensity(0), 0);
  assert.strictEqual(Feel.intensity(Pong.TOP_ERA), 1);
  for (let e = 1; e <= Pong.TOP_ERA; e++) {
    assert.ok(Feel.intensity(e) > Feel.intensity(e - 1), `era ${e} feels more than era ${e - 1}`);
  }
  assert.strictEqual(Feel.intensity(-3), 0);
  assert.strictEqual(Feel.intensity(99), 1);
});

test('the arcade machine is the honest one: nothing at all', () => {
  const fx = Feel.effects(0);
  for (const name of Feel.EFFECTS) assert.strictEqual(fx[name], false, name);
});

test('each era adds what the ladder promises: Atari a flash, NES a squash, Genesis shake, SNES slow motion', () => {
  const on = (era) => Feel.EFFECTS.filter((n) => Feel.effects(era)[n]);
  assert.deepStrictEqual(on(1), ['flash']);
  assert.deepStrictEqual(on(2), ['flash', 'squash']);
  assert.deepStrictEqual(on(3), ['flash', 'squash', 'shake']);
  assert.deepStrictEqual(on(4), ['flash', 'squash', 'shake', 'slowmo']);
  // The 3D eras pile it on: hit-stop, the trail and the rally counter.
  assert.ok(on(5).includes('hitstop') && on(5).includes('trail'));
  assert.ok(on(6).includes('counter'));
  assert.deepStrictEqual(on(10), Feel.EFFECTS);
});

test('an effect switches on at its own threshold and stays on above it, unless the era draws it itself', () => {
  for (const name of Feel.EFFECTS) {
    for (let e = 0; e <= Pong.TOP_ERA; e++) {
      const owned = (Feel.OWNED[e] || []).includes(name);
      const expect = Feel.intensity(e) >= Feel.THRESHOLD[name] - 1e-9 && Feel.intensity(e) > 0 && !owned;
      assert.strictEqual(Feel.effects(e)[name], expect, `${name} on era ${e}`);
    }
  }
});

test('effects an era file already owns are left to it: the N64 rumble, the PS2 and Dreamcast trails', () => {
  assert.strictEqual(Feel.effects(6).shake, false);
  assert.strictEqual(Feel.effects(8).trail, false);
  assert.strictEqual(Feel.effects(7).trail, false);
  assert.strictEqual(Feel.effects(9).shake, true);
});

test('hit-stop is two frames on a soft hit and four on the hardest, never outside that', () => {
  assert.strictEqual(Feel.hitStopFrames(0), 2);
  assert.strictEqual(Feel.hitStopFrames(1), 4);
  assert.strictEqual(Feel.hitStopFrames(-5), 2);
  assert.strictEqual(Feel.hitStopFrames(7), 4);
  let last = 0;
  for (let h = 0; h <= 1.0001; h += 0.05) {
    const f = Feel.hitStopFrames(h);
    assert.ok(f >= last && f >= 2 && f <= 4);
    last = f;
  }
  assert.ok(Math.abs(Feel.hitStopSeconds(1) - 4 / 60) < 1e-12);
});

test('a freeze the rules suggest on the event (item 1208 paddle physics) is taken, held to two-to-four frames', () => {
  const f = (s) => Math.round(s * 60 * 1000) / 1000;
  assert.strictEqual(f(Feel.hitStopFor({ type: 'paddle', hitStop: 0.03 }, 0)), 2);    // a plain hit
  assert.strictEqual(f(Feel.hitStopFor({ type: 'paddle', hitStop: 0.11, smash: true }, 1)), 4);  // a smash
  assert.strictEqual(f(Feel.hitStopFor({ type: 'paddle', hitStop: 0.05 }, 0)), 3);
  assert.strictEqual(f(Feel.hitStopFor({ type: 'paddle' }, 1)), 4);                  // none suggested
});

/** Step frame by frame until the paddle hit; count the frames the ball then holds still. */
function frozenFramesAfterHit(era, speed) {
  const g = playing(era);
  aboutToHitLeft(g, speed);
  let hit = false;
  for (let i = 0; i < 30 && !hit; i++) {
    Feel.step(g, FRAME, hold);
    hit = g.events.some((e) => e.type === 'paddle');
  }
  assert.ok(hit, 'the ball reached the paddle');
  let frozen = 0;
  for (let i = 0; i < 12; i++) {
    const x = g.ball.x, t = g.time, py = g.left.y;
    Feel.step(g, FRAME, { pointerY: 100 });   // the hand moves: the paddle must hold too
    if (g.ball.x === x && g.time === t) {
      assert.strictEqual(g.left.y, py, 'the paddles hold during the freeze');
      assert.deepStrictEqual(g.events, [], 'a frozen frame repeats no event');
      frozen++;
    } else break;
  }
  return frozen;
}

test('a paddle hit on the PlayStation freezes ball and paddles for 2 frames, a hard one for 4', () => {
  assert.strictEqual(frozenFramesAfterHit(5, Pong.RULES.ballStartSpeed), 2);
  assert.strictEqual(frozenFramesAfterHit(5, Pong.RULES.ballMaxSpeed), 4);
});

test('eras below the threshold never freeze, and the arcade steps exactly like the plain rules', () => {
  assert.strictEqual(frozenFramesAfterHit(4, Pong.RULES.ballMaxSpeed), 0);
  const a = playing(0), b = playing(0);
  aboutToHitLeft(a, 500); aboutToHitLeft(b, 500);
  for (let i = 0; i < 240; i++) {
    Feel.step(a, FRAME, hold);
    Pong.step(b, FRAME, hold);
  }
  assert.deepStrictEqual([a.ball.x, a.ball.y, a.time, a.rally], [b.ball.x, b.ball.y, b.time, b.rally]);
});

test('no freeze inside the serve pause, where the ring wipe and an arrival play', () => {
  const g = playing(10);
  aboutToHitLeft(g, 600);
  for (let i = 0; i < 30 && !g.events.some((e) => e.type === 'paddle'); i++) Feel.step(g, FRAME, hold);
  g.serveDelay = 1.5;   // a point has just been scored: the ring is playing
  const t = g.time;
  Feel.step(g, FRAME, hold);
  assert.ok(g.time > t, 'the clock the ring reads keeps running');
});

test('the title screen passes straight through: the attract rally and the blink are untouched', () => {
  const g = Pong.createGame({ era: 10, rng: () => 0.5 });
  Feel.step(g, FRAME, hold);
  assert.strictEqual(g.phase, 'title');
  assert.ok(Math.abs(g.time - FRAME) < 1e-12);
});

/** Ten points in (10-0), so the next point is the eleventh: match point (item 1211). */
function matchPoint(era) {
  const g = playing(era);
  g.score.left = 10;
  return g;
}

test('match point: at ten points in, a ball the keeper cannot reach slows to a third', () => {
  const g = matchPoint(9);
  assert.ok(Feel.isMatchPoint(g));
  assert.ok(!Feel.isMatchPoint(playing(8)));
  g.left.y = 0;                               // the player stands at the top
  g.ball.x = 90; g.ball.y = 500; g.ball.vx = -400; g.ball.vy = 0;
  const x0 = g.ball.x;
  Feel.step(g, FRAME, { pointerY: 40 });
  assert.ok(Feel.moment(g).slow, 'slow motion is on');
  assert.ok(Math.abs((x0 - g.ball.x) - 400 * FRAME / 3) < 1e-6, 'the ball moved a third as far');
  // Far from the line, or a ball the keeper stands in front of: full speed.
  const h = matchPoint(9);
  h.ball.x = 600; h.ball.y = 300; h.ball.vx = -400; h.ball.vy = 0;
  Feel.step(h, FRAME, hold);
  assert.strictEqual(Feel.moment(h).slow, false);
});

test('slow motion lasts about 0.8 s on screen and ends when the ball crosses', () => {
  const g = matchPoint(9);
  g.left.y = 0;
  g.ball.x = 300; g.ball.y = 500; g.ball.vx = -400; g.ball.vy = 0;
  let slowFrames = 0;
  for (let i = 0; i < 400 && g.score.right === 0; i++) {
    Feel.step(g, FRAME, { pointerY: 40 });
    if (Feel.moment(g).slow) slowFrames++;
  }
  assert.strictEqual(g.score.right, 1, 'the ball went through');
  const onScreen = slowFrames * FRAME;
  assert.ok(onScreen > 0.6 && onScreen < 1.0, `${onScreen.toFixed(2)} s of slow motion`);
  assert.strictEqual(Feel.moment(g).slow, false);
  assert.ok(Feel.effects(3).slowmo === false && Feel.effects(4).slowmo === true);
});

test('the rally counter shows from the fifth hit on the N64 and up, with a callout at 5, 10, 15 and 20', () => {
  const g = playing(6);
  g.rally = 4;
  assert.strictEqual(Feel.moment(g).counter, 0);
  g.rally = 12;
  assert.strictEqual(Feel.moment(g).counter, 12);
  const low = playing(5);
  low.rally = 12;
  assert.strictEqual(Feel.moment(low).counter, 0, 'not yet on the PlayStation');
  assert.deepStrictEqual(Object.keys(Feel.CALLOUTS).map(Number), [5, 10, 15, 20]);
  // A real hit that makes the fifth: the callout arrives with it.
  const c = playing(6);
  c.rally = 4;
  aboutToHitLeft(c, 400);
  for (let i = 0; i < 30 && c.rally < 5; i++) Feel.step(c, FRAME, hold);
  assert.strictEqual(c.rally, 5);
  assert.strictEqual(Feel.moment(c).callout, Feel.CALLOUTS[5]);
});

test('drawing: the arcade draws its own frame and nothing more; the N64 adds the counter over it', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => calls.push([k, ...args])),
    set: (t, k, v) => { t[k] = v; return true; }
  });
  const drawn = [];
  const field = (c, s) => drawn.push(s);
  const g0 = playing(0);
  Feel.draw(ctx, g0, field);
  assert.deepStrictEqual([drawn.length, calls.length], [1, 0]);

  const texts = [];
  globalThis.PongRender = { drawText: (c, text) => texts.push(text) };
  try {
    const g = playing(6);
    g.rally = 12;
    Feel.draw(ctx, g, field);
    assert.strictEqual(drawn[1], g, 'the era draws the real state');
    assert.ok(texts.includes('RALLY 12'), texts.join(','));
  } finally {
    delete globalThis.PongRender;
  }
});

// --------------------------------------------- each era's lettering (item 1262)

/** A context that measures text and records every fillText with its font and ink. */
function lettering() {
  const texts = [];
  const target = {
    measureText: (s) => ({ width: String(s).length * 10 }),
    fillText(text, x, y) { texts.push({ text, x, y, font: target.font, ink: target.fillStyle, alpha: target.globalAlpha }); },
    globalAlpha: 1
  };
  const fills = [];
  target.fill = () => fills.push(target.fillStyle);
  const ctx = new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (t, k, v) => { t[k] = v; return true; }
  });
  return { ctx, texts, fills };
}

/** A game at an era whose rally has just reached ten on a real hit: RALLY 10 and GREAT. */
function greatRally(era) {
  const g = playing(era);
  g.rally = 9;
  aboutToHitLeft(g, 400);
  for (let i = 0; i < 40 && g.rally < 10; i++) Feel.step(g, FRAME, hold);
  assert.strictEqual(g.rally, 10);
  assert.strictEqual(Feel.moment(g).callout, 'GREAT');
  // Let the hit-stop pass so the frame is a plain one.
  for (let i = 0; i < 5; i++) Feel.step(g, FRAME, hold);
  return g;
}

const PINNED = {
  6: { family: 'Arial Black', ink: '#ffd23c', look: 'outline', what: 'toy-yellow in a blue outline, the N64 HUD' },
  7: { family: 'Verdana', ink: '#ffd400', look: 'skew', what: 'leaning graffiti with a magenta drop' },
  8: { family: 'Arial', ink: '#9ec9ff', look: 'glow', what: 'thin blue film type, the counter in the bottom bar' },
  9: { family: 'Arial', ink: '#b8ff3c', look: 'glow', what: 'green-glow sans in a framed panel' },
  10: { family: 'Segoe UI', ink: '#ffffff', look: 'glow', what: 'clean white sans, the callout an achievement toast' }
};

test('every era with a rally counter letters it in its own interface style, and none falls back to 1972 blocks', () => {
  for (let e = 0; e <= Pong.TOP_ERA; e++) {
    const L = Feel.letteringFor(e);
    if (!Feel.effects(e).counter) {
      assert.strictEqual(L, Feel.BLOCK, `era ${e} has no counter, so no row`);
      continue;
    }
    const want = PINNED[e];
    assert.ok(want, `era ${e} has a counter and a pinned lettering`);
    assert.strictEqual(L.font, 'hd', `era ${e}: ${want.what}`);
    assert.ok(L.family.includes(want.family), `era ${e} family ${L.family}`);
    assert.strictEqual(L.ink, want.ink, `era ${e} ink`);
    assert.ok(L[want.look], `era ${e} carries its ${want.look}`);
    assert.ok(L.counter.size > 0 && L.callout.size > L.counter.size, `era ${e}: the callout is bigger than the counter`);
  }
  // The particulars each era's HUD asked for.
  assert.strictEqual(Feel.LETTERING[6].outline, '#1f3fbf', 'the N64 score outline');
  assert.strictEqual(Feel.LETTERING[7].shadow, '#ff2e88', 'the Dreamcast magenta extrusion');
  assert.ok(Feel.LETTERING[8].counterY > 540, 'the PS2 counter sits in the letterbox bottom bar');
  assert.strictEqual(Feel.LETTERING[9].counter.stroke, '#5cff2a', 'the Xbox panel framed in green');
  assert.ok(Feel.LETTERING[10].callout.kicker && Feel.LETTERING[10].callout.plate, 'the 360 callout is a toast');
});

test('drawing a rally of ten: each era sets RALLY 10 and GREAT in its own font and ink, not the block font', () => {
  for (const era of Object.keys(PINNED).map(Number)) {
    const blocks = [];
    globalThis.PongRender = { drawText: (c, text) => blocks.push(text) };
    try {
      const g = greatRally(era);
      const { ctx, texts } = lettering();
      Feel.draw(ctx, g, () => {});
      assert.deepStrictEqual(blocks, [], `era ${era} drew nothing in the block font`);
      const counter = texts.filter((t) => t.text === 'RALLY 10' && t.ink === PINNED[era].ink);
      const callout = texts.filter((t) => t.text === 'GREAT' && t.ink === PINNED[era].ink);
      assert.ok(counter.length >= 1, `era ${era} counter: ${JSON.stringify(texts)}`);
      assert.ok(callout.length === 1, `era ${era} callout`);
      for (const t of counter.concat(callout)) assert.ok(t.font.includes(PINNED[era].family), `era ${era} font ${t.font}`);
      assert.ok(callout[0].font.match(/(\d+)px/)[1] > counter[0].font.match(/(\d+)px/)[1] * 1, `era ${era} callout bigger`);
    } finally {
      delete globalThis.PongRender;
    }
  }
});

test('the Xbox 360 callout is an achievement toast: a dark plate, a green badge and the rally on a silver line above', () => {
  const g = greatRally(10);
  const { ctx, texts, fills } = lettering();
  Feel.draw(ctx, g, () => {});
  const kick = texts.find((t) => t.text === 'RALLY 10' && t.ink === '#d9dcd6');
  const big = texts.find((t) => t.text === 'GREAT');
  assert.ok(kick && big, JSON.stringify(texts));
  assert.ok(kick.y < big.y, 'the rally line sits above the callout');
  assert.ok(fills.includes('#1b1b1b'), 'the toast plate, in the era toast colour');
  assert.ok(fills.includes('#5dc21e'), 'the green badge');
});

test('the PS2 counter is a subtitle in the bottom letterbox bar; the others keep the bottom-middle place', () => {
  const at = (era) => {
    const g = playing(era);
    g.rally = 12;
    const { ctx, texts } = lettering();
    Feel.draw(ctx, g, () => {});
    return texts.filter((t) => t.text === 'RALLY 12').pop();
  };
  assert.ok(at(8).y > 540 && at(8).y < 600, `PS2 at ${at(8).y}`);
  for (const era of [6, 7, 9, 10]) assert.ok(Math.abs(at(era).y - 562) < 1, `era ${era} at ${at(era).y}`);
});

test('a squashed paddle is squashed for the draw only: the rules never see it', () => {
  const g = playing(10);
  aboutToHitLeft(g, 700);
  for (let i = 0; i < 30 && !g.events.some((e) => e.type === 'paddle'); i++) Feel.step(g, FRAME, hold);
  const before = { x: g.left.x, y: g.left.y, w: g.left.w, h: g.left.h };
  let seen = null;
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  Feel.draw(ctx, g, (c, s) => { seen = { w: s.left.w, h: s.left.h }; });
  assert.ok(seen.w < before.w && seen.h > before.h, 'drawn narrower and taller');
  assert.deepStrictEqual({ x: g.left.x, y: g.left.y, w: g.left.w, h: g.left.h }, before);
});
