'use strict';
/*
 * The shared 3D table (src/table3d.js, docs/ERAS.md section 2): the camera and
 * projection maths, the polygon helpers' faces, outline and shading, fog, the
 * dither tile -- and era 5, the plain table that stands on it. Headless: no
 * browser, drawing onto recording contexts.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const T = require('../src/table3d.js');
const cameras = require('../tools/table3d-cameras.js');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
const ERA5 = T.camera({ tilt: 28, height: 1150, fov: 30, screenY: 306 });

const close = (got, want, msg) => assert.ok(Math.abs(got - want) < 1e-6, `${msg}: ${got} vs ${want}`);

/** A context that logs path, stroke and fill calls in order, with the style in force. */
function logCtx() {
  const ops = [];
  const ctx = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, globalAlpha: 1,
    beginPath() { ops.push({ op: 'begin' }); },
    moveTo(x, y) { ops.push({ op: 'move', x, y }); },
    lineTo(x, y) { ops.push({ op: 'line', x, y }); },
    closePath() {},
    arc(x, y, r) { ops.push({ op: 'arc', x, y, r }); },
    save() {}, restore() {}, translate() {}, scale() {},
    stroke() { ops.push({ op: 'stroke', style: this.strokeStyle, width: this.lineWidth }); },
    fill() { ops.push({ op: 'fill', style: this.fillStyle }); },
    fillRect() {},
    createLinearGradient(...args) { return { args, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } }; }
  };
  return { ctx, ops };
}

function rally(era) {
  const g = Pong.createGame({ rng: () => 0.1, phase: 'playing', era });
  g.serveDelay = 0;
  g.ball.x = 530; g.ball.y = 140; g.ball.vx = 380; g.ball.vy = -120;
  g.left.y = 380; g.right.y = 60;
  return g;
}

// ------------------------------------------------------------------ camera
test('tilt 0 with height equal to focal is today\'s flat frame, to the unit', () => {
  const cam = T.camera({ tilt: 0, fov: 60, height: 300 / Math.tan(30 * Math.PI / 180) });
  for (const [x, y] of [[0, 0], [800, 600], [123, 456], [400, 300]]) {
    const p = T.project(cam, x, y, 0);
    close(p.x, x, `x of (${x}, ${y})`);
    close(p.y, y, `y of (${x}, ${y})`);
  }
});

test('the camera carries the derived fields the bible names', () => {
  const t = 28 * Math.PI / 180;
  close(ERA5.sin, Math.sin(t), 'sin');
  close(ERA5.cos, Math.cos(t), 'cos');
  close(ERA5.back, 1150 * Math.tan(t), 'back');
  close(ERA5.distance, 1150 / Math.cos(t), 'distance');
  close(ERA5.focal, 300 / Math.tan(15 * Math.PI / 180), 'focal');
  assert.deepStrictEqual(ERA5.view, { w: 800, h: 600 });
  assert.strictEqual(T.camera({ tilt: 10, height: 900, fov: 30 }).screenY, 300, 'screenY defaults to 300');
  assert.strictEqual(ERA5.panX, 0);
  assert.strictEqual(ERA5.snap, 0);
  assert.strictEqual(ERA5.outline, null);
});

test('a point on the near edge lands lower and wider on screen than the same point on the far edge', () => {
  for (const e of cameras.ERAS) {
    const cam = T.camera(e);
    for (const x of [0, 150, 320, 480, 650, 800]) {
      const near = T.project(cam, x, 600, 0);
      const far = T.project(cam, x, 0, 0);
      assert.ok(near.y > far.y, `era ${e.era} x ${x}: near y ${near.y} is below far y ${far.y}`);
      assert.ok(Math.abs(near.x - 400) > Math.abs(far.x - 400), `era ${e.era} x ${x}: near is wider`);
      assert.ok(near.scale > far.scale && near.depth < far.depth, `era ${e.era}: nearer is bigger`);
    }
    const nearW = T.project(cam, 800, 600).x - T.project(cam, 0, 600).x;
    const farW = T.project(cam, 800, 0).x - T.project(cam, 0, 0).x;
    assert.ok(nearW > farW, `era ${e.era}: the near edge is wider than the far edge`);
  }
});

test('project is the bible\'s one formula: it agrees with tools/table3d-cameras.js in every era pose', () => {
  for (const e of cameras.ERAS) {
    for (const pose of cameras.poses(e)) {
      const a = cameras.camera(pose);
      const b = T.camera(pose);
      for (const [x, y, z] of [[0, 0, 0], [800, 600, 0], [37, 412, 24], [400, 300, 90]]) {
        const pa = cameras.project(a, x, y, z);
        const pb = T.project(b, x, y, z);
        for (const k of ['x', 'y', 'scale', 'depth']) close(pb[k], pa[k], `era ${e.era} ${k} at (${x},${y},${z})`);
      }
    }
  }
});

test('snap rounds every projected vertex to the grid', () => {
  const cam = T.camera({ tilt: 28, height: 1150, fov: 30, screenY: 306, snap: 2.5 });
  for (const [x, y] of [[13, 77], [401, 299], [777, 590]]) {
    const p = T.project(cam, x, y, 0);
    close(p.x / 2.5, Math.round(p.x / 2.5), 'x on the grid');
    close(p.y / 2.5, Math.round(p.y / 2.5), 'y on the grid');
  }
});

// -------------------------------------------------------------------- ball
test('the ball\'s screen position is a pure function of state: same state, same answer, nothing written', () => {
  const g = rally(5);
  const before = JSON.stringify(g);
  const a = T.ballScreen(ERA5, g);
  const b = T.ballScreen(ERA5, JSON.parse(before));
  assert.deepStrictEqual(a, b, 'a copy of the state lands on the same pixel');
  assert.strictEqual(JSON.stringify(g), before, 'reading it wrote nothing');

  const moved = JSON.parse(before);
  moved.time += 3; moved.left.y = 0; moved.right.y = 500; moved.score.left = 9;
  assert.deepStrictEqual(T.ballScreen(ERA5, moved), a, 'only the ball decides where the ball is');
  moved.ball.y += 50;
  assert.ok(T.ballScreen(ERA5, moved).y > a.y, 'a ball further down the field is lower on screen');

  const drawn = T.ball(logCtx().ctx, ERA5, g.ball, { fill: '#ffffff' });
  assert.deepStrictEqual(drawn, a, 'T.ball draws where T.ballScreen says');
});

test('the ball stands on its true footprint and rolls on the surface', () => {
  const g = rally(5);
  const s = T.ballScreen(ERA5, g);
  const cx = g.ball.x + g.ball.size / 2;
  const cy = g.ball.y + g.ball.size / 2;
  const foot = T.project(ERA5, cx, cy, 0);
  const centre = T.project(ERA5, cx, cy, g.ball.size * 0.6);
  close(s.footX, foot.x, 'foot x');
  close(s.footY, foot.y, 'foot y');
  close(s.x, centre.x, 'centre x');
  close(s.y, centre.y, 'centre y is one radius up');
  close(s.r, g.ball.size * 0.6 * centre.scale, 'screen radius');
  assert.ok(s.y < s.footY, 'the ball sits above its shadow');

  const { ctx, ops } = logCtx();
  T.ball(ctx, ERA5, g.ball, { fill: '#ffffff' });
  const fills = ops.filter((o) => o.op === 'fill');
  assert.strictEqual(fills.length, 2, 'the contact shadow, then the ball');
  assert.strictEqual(fills[0].style, 'rgba(0,0,0,0.55)');
  assert.strictEqual(fills[1].style, '#ffffff');
});

// ------------------------------------------------------------------- boxes
test('a paddle is a box on its exact collision rectangle, showing the faces the eye can see', () => {
  const g = rally(5);
  const cases = [
    [g.left, 'right face', g.left.x + g.left.w],
    [g.right, 'left face', g.right.x],
    [{ x: 380, y: 200, w: 40, h: 40 }, 'no side face', null]
  ];
  for (const [rect, what, sideX] of cases) {
    const { ctx, ops } = logCtx();
    const out = T.box(ctx, ERA5, rect, 0, 22, { ink: '#e03a3e' });
    assert.strictEqual(ops.filter((o) => o.op === 'fill').length, sideX === null ? 2 : 3, what);
    const want = (x, y, z) => T.project(ERA5, x, y, z);
    assert.deepStrictEqual(out.near[0], want(rect.x, rect.y + rect.h, 0), 'the near face stands on the near edge of the footprint');
    assert.deepStrictEqual(out.top[0], want(rect.x, rect.y, 22), 'the top is at z1 over the footprint');
    if (sideX === null) assert.strictEqual(out.side, null, what);
    else assert.deepStrictEqual(out.side[0], want(sideX, rect.y, 0), what);
  }
});

test('flat shading lights each face through T.shade; the near face keeps the ink at full saturation', () => {
  const { ctx, ops } = logCtx();
  T.box(ctx, ERA5, { x: 24, y: 200, w: 12, h: 84 }, 0, 22, { ink: '#e03a3e', light: { top: 0.3, near: 0, side: -0.4 } });
  assert.deepStrictEqual(ops.filter((o) => o.op === 'fill').map((o) => o.style),
    [T.shade('#e03a3e', -0.4), '#e03a3e', T.shade('#e03a3e', 0.3)], 'side, near, top');
});

test('banded shading is hard-edged bands, lit to dark, top to bottom', () => {
  const { ctx, ops } = logCtx();
  T.quad(ctx, ERA5, [[100, 100, 0], [200, 100, 0], [200, 200, 0], [100, 200, 0]], { ink: '#2ec4b6', shade: 'banded', bands: 2 });
  const g = ops.find((o) => o.op === 'fill').style;
  assert.deepStrictEqual(g.stops.map((s) => s[0]), [0, 0.4, 0.4, 1], 'two bands, a hard edge 40% down');
  assert.strictEqual(g.stops[0][1], g.stops[1][1]);
  assert.notStrictEqual(g.stops[1][1], g.stops[2][1]);
});

test('outline mode strokes before it fills, at twice the width times the scale, and false switches it off', () => {
  const cam = T.camera({ tilt: 22, height: 1500, fov: 23.5, screenY: 314, outline: { width: 3, colour: '#111111' } });
  const pts = [[100, 100, 0], [200, 100, 0], [200, 200, 0], [100, 200, 0]];
  let { ctx, ops } = logCtx();
  T.quad(ctx, cam, pts, { ink: '#ffd400' });
  const paints = ops.filter((o) => o.op === 'stroke' || o.op === 'fill');
  assert.deepStrictEqual(paints.map((o) => o.op), ['stroke', 'fill']);
  close(paints[0].width, 2 * 3 * T.project(cam, 100, 100, 0).scale, 'line width');
  assert.strictEqual(paints[0].style, '#111111');
  ({ ctx, ops } = logCtx());
  T.quad(ctx, cam, pts, { ink: '#ffd400', outline: false });
  assert.deepStrictEqual(ops.filter((o) => o.op === 'stroke'), []);
});

// ---------------------------------------------------------- fog and tiles
test('fog is measured along the table: 0 at the near edge, rising to max at the far edge', () => {
  const fog = { start: 0.25, end: 1.15, power: 1.2, max: 0.92, colour: '#b9d4ec' };
  assert.strictEqual(T.fogAmount(600, fog), 0);
  assert.strictEqual(T.fogAmount(600 - 0.25 * 600, fog), 0, 'nothing before fog.start');
  assert.ok(T.fogAmount(0, fog) > T.fogAmount(300, fog), 'thicker further away');
  close(T.fogAmount(-90, fog), 0.92, 'max past fog.end');
  assert.strictEqual(T.fogColour('#000000', 600, fog), '#000000');
  assert.strictEqual(T.fogColour('#000000', -90, fog), T.mix('#000000', '#b9d4ec', 0.92));
  assert.strictEqual(T.mix('#000000', '#ffffff', 0.5), '#808080');
  assert.strictEqual(T.rgba('#ff8000', 0.5), 'rgba(255,128,0,0.500)');
});

test('the dither tile follows BAYER4, is built once from 16 rectangles, and is null with no document', () => {
  assert.deepStrictEqual([...T.BAYER4].sort((a, b) => a - b), [...Array(16).keys()]);
  assert.strictEqual(T.ditherTile('#000000', '#ffffff', 8, 1), null, 'headless');
  assert.strictEqual(T.offscreen('k', 320, 240), null, 'headless');

  const made = [];
  globalThis.document = {
    createElement() {
      const rects = [];
      const c = { width: 0, height: 0, rects,
        getContext: () => ({ fillStyle: '', fillRect(x, y, w, h) { rects.push([this.fillStyle, x, y, w, h]); },
          createPattern: (canvas) => ({ pattern: canvas }) }) };
      made.push(c);
      return c;
    }
  };
  try {
    const p = T.ditherTile('#07070c', '#2b3a55', 8, 2.5);
    assert.strictEqual(made.length, 1);
    assert.strictEqual(made[0].width, 10, '4 cells of 2.5 px');
    assert.strictEqual(made[0].rects.length, 16);
    assert.strictEqual(made[0].rects.filter((r) => r[0] === '#2b3a55').length, 8, 'level 8 is the 50% checker');
    assert.strictEqual(T.ditherTile('#07070c', '#2b3a55', 8, 2.5), p, 'cached');
    assert.strictEqual(made.length, 1);
    const buf = T.offscreen('ps1', 320, 240);
    assert.strictEqual(T.offscreen('ps1', 320, 240), buf, 'an offscreen is reused');
    assert.strictEqual(buf.canvas.width, 320);
  } finally {
    delete globalThis.document;
  }
});

// ------------------------------------------------------------ era 5 and up
test('every era\'s draw is handed the table as api.table3d', () => {
  assert.strictEqual(R.table3d, T);
});

test('era 5 draws the plain table in perspective and reads the state without writing it', () => {
  const look = R.eraLook(5);
  assert.strictEqual(look.era, 5);
  assert.deepStrictEqual(look.camera, { tilt: 28, height: 1150, fov: 30, screenY: 306 });
  assert.strictEqual(look.paddleInk, R.eraLook(1).paddleInk, 'wears the colours era 1 picked');
  const g = rally(5);
  const before = JSON.stringify(g);
  const { ctx, ops } = logCtx();
  ctx.ellipse = () => { throw new Error('no ellipse needed'); };
  R.draw(ctx, g);
  assert.strictEqual(JSON.stringify(g), before);
  const fills = ops.filter((o) => o.op === 'fill');
  assert.strictEqual(fills[fills.length - 1].style, '#ffffff', 'the white ball is the last fill on the table');
  // The far paddle (right, y 60) is drawn before the near one (left, y 380).
  const inks = fills.map((o) => o.style);
  const right = R.paddleInk(g, 'right'), left = R.paddleInk(g, 'left');
  assert.ok(inks.indexOf(right) < inks.indexOf(left), 'far paddle first');
});

test('behind the title era 5 keeps the stock dimmed frame', () => {
  const g = rally(5);
  const got = eralooks.recorder();
  R.draw(got.ctx, g, { ink: '#3a3a3a' });
  const want = eralooks.recorder();
  R.drawBase(want.ctx, g, { ink: '#3a3a3a' });
  assert.deepStrictEqual(got.calls, want.calls);
});

test('every 3D rung still waiting on its card draws era 5\'s table, and every 3D rung wears its own name card', () => {
  const cards = new Set();
  for (let era = 6; era <= Pong.TOP_ERA; era++) {
    const look = R.eraLook(era);
    assert.strictEqual(look.era, era);
    cards.add(JSON.stringify(look.card));
    // Read from the look itself (item 1186): an era card that has landed brings its own
    // draw (and its own test file); only the rungs still waiting are pinned to era 5's table.
    if (look.placeholder) assert.strictEqual(look.draw, R.eraLook(5).draw, `era ${era} placeholder`);
    else assert.notStrictEqual(look.draw, R.eraLook(5).draw, `era ${era} is built and draws its own frame`);
  }
  cards.add(JSON.stringify(R.eraLook(5).card));
  assert.strictEqual(cards.size, Pong.TOP_ERA - 4, 'a different name card on every 3D rung');
});
