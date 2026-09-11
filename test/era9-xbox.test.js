'use strict';
/*
 * Era 9, the 2001 Xbox (docs/ERAS.md chapter 10): the look reads the state and
 * never writes it, the moving light casts hard shadows lighter than the
 * contact shadow, the white ball is the last fill on the table, the shield bar
 * counts the score and flashes then recharges on a conceded point, the attract
 * rally keeps the stock frame, and the voice is the bible's. Headless: no
 * browser, drawing onto recording contexts.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const { Pong, R } = eralooks.loadRenderer(path.join(__dirname, '..'));
const PongSound = require('../src/sound.js');
const X = R.eraLook(9).xbox;

function rally(time) {
  const g = Pong.createGame({ rng: () => 0.1, phase: 'playing', era: 9 });
  g.serveDelay = 0;
  g.ball.x = 530; g.ball.y = 140; g.ball.vx = 380; g.ball.vy = -120;
  g.left.y = 380; g.right.y = 60;
  g.score.left = 3; g.score.right = 11;
  g.time = time;
  return g;
}

/** The recorder, also logging every fill and stroke with the style in force. */
function logged() {
  const rec = eralooks.recorder();
  const ops = [];
  rec.ctx.fill = function () {
    ops.push({ op: 'fill', style: this.fillStyle, alpha: this.globalAlpha, comp: this.globalCompositeOperation });
  };
  rec.ctx.stroke = function () {
    ops.push({ op: 'stroke', style: this.strokeStyle, blur: this.shadowBlur || 0 });
  };
  return { ctx: rec.ctx, calls: rec.calls, ops };
}

test('era 9 is the Xbox: its own look, the bible\'s camera and name card, no longer a placeholder', () => {
  const look = R.eraLook(9);
  assert.strictEqual(look.era, 9);
  assert.strictEqual(look.name, '2001 Xbox');
  assert.ok(!look.placeholder);
  assert.notStrictEqual(look.draw, R.eraLook(5).draw);
  assert.deepStrictEqual(look.camera, { tilt: 27, height: 1000, fov: 35, screenY: 303 });
  assert.strictEqual(look.card.border, '#7cd320');
  assert.strictEqual(look.card.dots, null);
  assert.strictEqual(look.paddleInk, R.eraLook(1).paddleInk, 'wears the colours era 1 picked');
});

test('it reads the state without writing it, and the white ball is the last fill on the table', () => {
  const g = rally(100);
  const before = JSON.stringify(g);
  const { ctx, ops } = logged();
  R.draw(ctx, g);
  assert.strictEqual(JSON.stringify(g), before);
  const fills = ops.filter((o) => o.op === 'fill');
  assert.strictEqual(fills[fills.length - 1].style, '#ffffff');
});

test('the light orbits the table every 9 seconds, 160 units up (low, so the shadows read)', () => {
  const at = (t) => X.lightAt(t);
  assert.deepStrictEqual(at(0), { x: 700, y: 300, z: 160 });
  const q = at(2.25);
  assert.ok(Math.abs(q.x - 400) < 1e-9 && Math.abs(q.y - 480) < 1e-9);
  const lap = at(9);
  assert.ok(Math.abs(lap.x - 700) < 1e-9 && Math.abs(lap.y - 300) < 1e-9);
});

test('a paddle\'s hard shadow covers its true footprint and falls away from the light, and moves with it', () => {
  const rect = { x: 250, y: 250, w: 12, h: 84 };   // between the light's two extremes, x 100 and 700
  const inside = (poly, x, y) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const L = X.lightAt(0);                         // the light is to the right: the shadow falls left
  const shadow = X.paddleShadow(L, rect);
  const xs = shadow.map((p) => p[0]);
  assert.ok(Math.min(...xs) < rect.x - 5, 'the shadow reaches out past the paddle, away from the light');
  assert.ok(inside(shadow, rect.x + 6, rect.y + 42), 'the footprint is under its own shadow');
  const later = X.paddleShadow(X.lightAt(4.5), rect);   // the light has gone round to the left
  assert.ok(Math.max(...later.map((p) => p[0])) > rect.x + rect.w + 1, 'half a lap later it falls the other way');
  // The ball's centre at z = r is cast along the same line.
  const cast = X.castPoint({ x: 400, y: 300, z: 520 }, 500, 300, 260);
  assert.deepStrictEqual(cast, [600, 300, 0]);
});

test('the cast shadows are hard black at 0.45, lighter than the 0.55 contact shadow, and the paddles glow green', () => {
  const { ctx, ops } = logged();
  R.draw(ctx, rally(101));
  const cast = ops.filter((o) => o.op === 'fill' && o.style === '#000000' && Math.abs(o.alpha - 0.45) < 1e-9);
  assert.strictEqual(cast.length, 3, 'two paddles and the ball');
  assert.ok(X.SHADOW_ALPHA < 0.55);
  assert.ok(ops.some((o) => o.op === 'fill' && o.style === 'rgba(0,0,0,0.55)'), 'the contact shadow is still there');
  const glowing = ops.filter((o) => o.op === 'stroke' && o.blur === 8);
  assert.strictEqual(glowing.length, 2, 'shadowBlur on the two paddles and nothing else');
  assert.ok(glowing.every((o) => o.style === '#7cd320'));
});

test('a gamertag floats over each paddle', () => {
  assert.deepStrictEqual(X.TAGS, { left: 'PONG SLAYER', right: 'CPU 2001' });
  const { ctx, calls } = logged();
  R.draw(ctx, rally(102));
  const text = calls.filter((c) => c[0] === '#d7f5c0');
  assert.ok(text.length > 40, `tag text is drawn in the block font (${text.length} cells)`);
  assert.ok(text.every((c) => c[3] === 2 && c[4] === 2), 'at cell 2');
});

test('the shield bar fills score % 10 segments, flashes alarm when its side concedes, then recharges', () => {
  const segs = (calls, colour) => calls.filter((c) => c[0] === colour && c[3] === 16 && c[4] === 12).length;
  const g = rally(200);                           // left 3, right 11: 3 and 1 segments
  let rec = logged();
  R.draw(rec.ctx, g);
  assert.strictEqual(segs(rec.calls, '#9dff3a'), 4);
  assert.strictEqual(segs(rec.calls, '#ff3b2f'), 0);

  const hit = rally(200.1);
  hit.score.right = 12;                           // the left side concedes
  rec = logged();
  R.draw(rec.ctx, hit);
  assert.deepStrictEqual(X.shieldView(hit, 'left').mode, 'alarm');
  assert.strictEqual(segs(rec.calls, '#ff3b2f'), 10, 'the whole left bar flashes alarm');
  assert.strictEqual(X.shieldView(hit, 'right').mode, 'steady');

  const charging = rally(200.1 + 0.3 + 0.1);
  charging.score.right = 12;
  const view = X.shieldView(charging, 'left');
  assert.strictEqual(view.mode, 'recharge');
  assert.strictEqual(view.front, 2, 'refilling left to right');
  assert.strictEqual(view.shown, 2);

  const settled = rally(200.1 + 0.9);
  settled.score.right = 12;
  rec = logged();
  R.draw(rec.ctx, settled);
  assert.strictEqual(X.shieldView(settled, 'left').mode, 'steady');
  assert.strictEqual(segs(rec.calls, '#9dff3a'), 3 + 2);
});

test('the serve pause hides the ball and its cast shadow', () => {
  const g = rally(300);
  g.serveDelay = 0.5;
  const { ctx, ops } = logged();
  R.draw(ctx, g);
  assert.ok(!ops.some((o) => o.op === 'fill' && o.style === '#ffffff'));
  assert.strictEqual(ops.filter((o) => o.op === 'fill' && o.style === '#000000' && Math.abs(o.alpha - 0.45) < 1e-9).length, 2);
});

test('behind the title era 9 keeps the stock dimmed frame', () => {
  const g = rally(400);
  const got = eralooks.recorder();
  R.draw(got.ctx, g, { ink: '#3a3a3a' });
  const want = eralooks.recorder();
  R.drawBase(want.ctx, g, { ink: '#3a3a3a' });
  assert.deepStrictEqual(got.calls, want.calls);
});

test('the voice is the bible\'s Xbox: sub-heavy FM metal hits, a low thrum, a shaper and a room', () => {
  const paddle = PongSound.voicesFor(9, 'paddle');
  assert.strictEqual(paddle, R.eraLook(9).voice.paddle, 'heard through the look\'s voice hook');
  assert.deepStrictEqual(paddle[0].fm, { ratio: 1.41, index: 3 });
  assert.ok(paddle.some((v) => v.freq === 45 && v.slideTo === 35), 'the sub under every hit');
  assert.ok(PongSound.voicesFor(9, 'wall')[0].fm, 'the wall rings metallic too');
  assert.ok(PongSound.voicesFor(9, 'score').some((v) => v.freq === 40 && v.dur === 0.6), 'the low thrum under a point');
  assert.strictEqual(R.eraLook(9).voice.boot[0].lfo.freq, 6, 'the pulsing sphere thrum');
  assert.deepStrictEqual(R.eraLook(9).voice.effects, { shape: 0.3, reverb: { seconds: 1.4, decay: 2, mix: 0.3 } });
});
