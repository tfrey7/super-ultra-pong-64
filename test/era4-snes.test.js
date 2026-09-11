'use strict';
/*
 * Era 4, the 1991 Super Nintendo: a Mode 7 floor under a gradient sky, shaded
 * sprites with soft shadows, and a translucent score panel -- and not one rule
 * different from any other era.
 *
 * The era's look draws with paths, gradients and transforms, which the
 * rectangle-only recorder in tools/eralooks.js cannot follow, so this file
 * brings a canvas that records every call it is handed.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);

/**
 * A 2D context that remembers what was filled and in what: every fill()
 * with its subpaths (as point lists), every fillRect, in one ordered list,
 * each carrying the fillStyle and globalAlpha in force at that moment.
 */
function canvas() {
  const ops = [];
  const st = { fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, lineWidth: 1 };
  const stack = [];
  let subpaths = [];
  const gradient = (kind, args) => ({ kind, args, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } });
  const methods = {
    save() { stack.push(Object.assign({}, st)); },
    restore() { Object.assign(st, stack.pop()); },
    beginPath() { subpaths = []; },
    moveTo(x, y) { subpaths.push([[x, y]]); },
    lineTo(x, y) { if (!subpaths.length) subpaths.push([]); subpaths[subpaths.length - 1].push([x, y]); },
    quadraticCurveTo(cx, cy, x, y) { methods.lineTo(x, y); },
    arc(x, y, r) { subpaths.push([[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]]); },
    closePath() {},
    translate() {}, scale() {}, rotate() {}, setTransform() {},
    // Since the ladder climbs past 4, the every-frame play test below reaches the
    // 3D eras, which use the rest of the bible's toolkit (docs/ERAS.md rule 1.8).
    transform() {}, resetTransform() {}, clip() {}, arcTo() {}, bezierCurveTo() {}, ellipse() {},
    rect() {}, strokeRect() {}, drawImage() {}, setLineDash() {}, createPattern() { return null; },
    stroke() { ops.push({ op: 'stroke', style: st.strokeStyle, alpha: st.globalAlpha }); },
    fill() { ops.push({ op: 'fill', style: st.fillStyle, alpha: st.globalAlpha, subpaths: subpaths.map((p) => p.slice()) }); },
    fillRect(x, y, w, h) { ops.push({ op: 'fillRect', style: st.fillStyle, alpha: st.globalAlpha, rect: [x, y, w, h] }); },
    createLinearGradient(...a) { return gradient('linear', a); },
    createRadialGradient(...a) { return gradient('radial', a); }
  };
  const ctx = new Proxy(st, {
    get(t, k) {
      if (k in methods) return methods[k];
      if (k in t) return t[k];
      throw new Error(`the era 4 look used ctx.${String(k)}, which this recorder does not know`);
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  return { ctx, ops };
}

/** A rally in progress at era 4: both paddles placed, the ball in flight. */
function rally(overrides) {
  const g = Pong.createGame({ rng: () => 0.1, phase: 'playing', era: 4 });
  g.serveDelay = 0;
  g.score.left = 3;
  g.score.right = 11;
  g.ball.x = 412.5;
  g.ball.y = 340;
  g.ball.vx = 420;
  g.ball.vy = -180;
  g.left.y = 280;
  g.right.y = 410;
  g.time = 12.25;
  return Object.assign(g, overrides || {});
}

function frame(state, opts) {
  const c = canvas();
  R.draw(c.ctx, state, opts);
  return c.ops;
}

const isShadow = (o) => o.op === 'fill' && o.style.kind === 'radial' &&
  o.style.stops[o.style.stops.length - 1][1] === 'rgba(0, 0, 0, 0)';
const isBallSprite = (o) => o.op === 'fill' && o.style.kind === 'radial' && o.style.stops[0][1] === '#ffffff';
const isPaddleSprite = (ink) => (o) => o.op === 'fill' && o.style.kind === 'linear' &&
  o.style.stops.some((s) => s[1] === ink);
const alphaOf = (css) => { const m = /^rgba\((?:[^,]+,){3}\s*([\d.]+)\)$/.exec(css); return m ? Number(m[1]) : 1; };

test('era 4 is the Super Nintendo, built rather than a placeholder, wearing the colours era 1 picked', () => {
  const look = R.eraLook(4);
  assert.match(look.name, /Super Nintendo/);
  assert.ok(!look.placeholder, 'no longer a placeholder');
  assert.strictEqual(typeof look.draw, 'function', 'it draws its own frame');
  const g = rally();
  assert.strictEqual(g.colour, true);
  assert.strictEqual(R.paddleInk(g, 'left'), R.eraLook(1).paddleInk(g, 'left'));
  assert.strictEqual(R.paddleInk(g, 'right'), R.eraLook(1).paddleInk(g, 'right'));
});

test('drawing era 4 reads the state and never writes it', () => {
  const g = rally();
  const before = JSON.stringify(g);
  frame(g);
  frame(Object.assign(g, { serveDelay: 0.4 }));
  g.serveDelay = 0;
  assert.strictEqual(JSON.stringify(g), before);
});

test('a gradient sky over the horizon, and below it a Mode 7 floor that narrows toward it', () => {
  const horizon = R.eraLook(4).horizon;
  const ops = frame(rally());
  const sky = ops.find((o) => o.op === 'fillRect' && o.style.kind === 'linear');
  assert.ok(sky, 'the sky is a gradient');
  assert.deepStrictEqual(sky.rect, [0, 0, 800, horizon], 'across the top, down to the horizon');
  assert.ok(sky.style.stops.length >= 3, 'with more than two colours in it');

  const floor = ops.find((o) => o.op === 'fill' && o.subpaths.length > 100);
  assert.ok(floor, 'the floor is a checkerboard of many tiles');
  assert.ok(ops.indexOf(sky) < ops.indexOf(floor), 'the floor is drawn after the sky');
  for (const q of floor.subpaths) {
    assert.strictEqual(q.length, 4, 'every tile is a four-cornered trapezoid');
    const [n0, n1, f1, f0] = q;
    assert.ok(q.every(([, y]) => y > horizon), 'all of it below the horizon');
    assert.ok(n0[1] === n1[1] && f0[1] === f1[1] && f0[1] < n0[1], 'near edge below far edge');
    assert.ok(Math.abs(f1[0] - f0[0]) < Math.abs(n1[0] - n0[0]), 'the far edge is narrower: perspective');
  }
  // Rows crowd toward the horizon: the nearest row is far taller than the farthest.
  const heights = floor.subpaths.map((q) => q[0][1] - q[3][1]);
  assert.ok(Math.max(...heights) > 8 * Math.min(...heights), 'rows shrink with depth');
});

test('the floor slides with game time, and the same moment always draws the same frame', () => {
  const floorAt = (time) => frame(rally({ time })).find((o) => o.op === 'fill' && o.subpaths.length > 100).subpaths;
  assert.deepStrictEqual(floorAt(3.5), floorAt(3.5));
  assert.notDeepStrictEqual(floorAt(3.5), floorAt(3.8));
});

test('soft shadows lie under both paddles and the ball, drawn before the sprites above them', () => {
  const g = rally();
  const ops = frame(g);
  const shadows = ops.filter(isShadow);
  assert.strictEqual(shadows.length, 3, 'one each for two paddles and the ball');
  const floor = ops.findIndex((o) => o.op === 'fill' && o.subpaths.length > 100);
  const sprites = [isPaddleSprite(R.paddleInk(g, 'left')), isPaddleSprite(R.paddleInk(g, 'right')), isBallSprite]
    .map((is) => ops.findIndex(is));
  assert.ok(sprites.every((i) => i >= 0), 'both paddles and the ball are shaded sprites');
  const lastShadow = ops.lastIndexOf(shadows[shadows.length - 1]);
  assert.ok(ops.indexOf(shadows[0]) > floor, 'shadows lie on the floor');
  assert.ok(lastShadow < Math.min(...sprites), 'and under every sprite');
});

test('while the serve waits the ball and its shadow are both hidden', () => {
  const ops = frame(rally({ serveDelay: 0.5 }));
  assert.strictEqual(ops.filter(isShadow).length, 2, 'only the paddles cast shadows');
  assert.strictEqual(ops.filter(isBallSprite).length, 0, 'no ball');
});

test('the score sits on a translucent panel, each number in its paddle ink', () => {
  const g = rally();
  const ops = frame(g);
  const panel = ops.find((o) => {
    if (o.op !== 'fill' || typeof o.style !== 'string') return false;
    const a = alphaOf(o.style) * o.alpha;
    if (!(a > 0.2 && a < 0.8)) return false;
    const pts = o.subpaths.flat();
    const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
    return Math.min(...xs) < 290 - 48 && Math.max(...xs) > 510 + 48 && Math.min(...ys) < 40 && Math.max(...ys) > 110;
  });
  assert.ok(panel, 'a see-through panel spans both scores');
  const at = ops.indexOf(panel);
  for (const [side, onLeft] of [['left', true], ['right', false]]) {
    const ink = R.paddleInk(g, side);
    const digits = ops.slice(at).filter((o) => o.op === 'fillRect' && o.style === ink &&
      (onLeft ? o.rect[0] < 400 : o.rect[0] > 400));
    assert.ok(digits.length > 10, `the ${side} score is drawn over the panel in its paddle's ink`);
  }
});

test('behind the title (a dimmed frame) era 4 keeps the stock frame, so the title stays legible', () => {
  const g = rally();
  const got = eralooks.recorder();
  R.draw(got.ctx, g, { ink: '#3a3a3a' });
  const want = eralooks.recorder();
  R.drawBase(want.ctx, g, { ink: '#3a3a3a' });
  assert.deepStrictEqual(got.calls, want.calls);
});

test('era 4 plays exactly like era 1: drawing it every frame changes nothing about the game', () => {
  const seeded = () => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
  const play = (era, drawEachFrame) => {
    // eraChangePause 0: era 1 climbs the ladder and era 4 cannot, and the longer
    // pause after an era change is a rule about the ladder, not the look.
    const g = Pong.createGame({ rng: seeded(), phase: 'playing', era, rules: { eraChangePause: 0, cpuProfiles: false } });
    const trail = [];
    for (let i = 0; i < 2400; i++) {
      const pointerY = i < 1200 ? 300 + 220 * Math.sin(i / 35) : 20;
      Pong.step(g, 1 / 60, { pointerY, up: false, down: false });
      if (drawEachFrame) R.draw(canvas().ctx, g);
      trail.push([g.ball.x, g.ball.y, g.ball.vx, g.ball.vy, g.left.y, g.right.y, g.score.left, g.score.right, g.serveDelay]);
    }
    return trail;
  };
  const one = play(1, false);
  const four = play(4, true);
  assert.deepStrictEqual(four, one);
  const [, , , , , , left, right] = one[one.length - 1];
  assert.ok(left + right >= 2, `the run crossed serves (score ${left}-${right})`);
});
