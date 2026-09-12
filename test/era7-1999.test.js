'use strict';
/*
 * Era 7's field in strict 1999 (item 1293, Tim's ruling on that card): the
 * reference is not Jet Set Radio's ink but 1999's own launch showcases,
 * Soulcalibur and Sonic Adventure -- a smooth, bright, VGA-sharp picture at
 * 640 x 480 with no haze, a polished stage and a fighter's ring on it -- and
 * the contact effects (the impact burst and the speed lines) go back UNDER the
 * ball, where they were before the 3D layer composited it.
 *
 * All of that is the 3D field. Without WebGL this era paints exactly the cel
 * table it always did, and the last test here is the one that pins it.
 *
 * Headless: the 3D layer is a stand-in (PongField3D is looked up on the global
 * object by src/table3d.js, so a test can put its own there), and the frame is
 * drawn onto a context that logs every fill and stroke in order.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const { Pong, R } = eralooks.loadRenderer(path.join(__dirname, '..'));
const look = R.eraLook(7);
const INK = '#111111';
const WHITE = '#ffffff';

// ----------------------------------------------------------- the stand-ins
/** A colour slot that remembers what was last set on it, as three.js's Color does. */
function slot() {
  return { value: null, set(c) { this.value = c; return this; } };
}

/** A material of the kind PongField3D.rebuild() makes for 'phong'. */
function mat() {
  return { color: slot(), emissive: slot(), specular: slot(), shininess: 30, opacity: 1,
    transparent: true, flatShading: true, needsUpdate: false };
}

function fakeParts() {
  return {
    group: { children: [], add(m) { this.children.push(m); } },
    surfaceMat: mat(), netMat: mat(), lineMat: mat(), railMat: mat(), tapeMat: mat(), postMat: mat(),
    ballMat: mat(),
    bats: { left: { mat: mat() }, right: { mat: mat() } },
    ball: { visible: true }, shadow: { visible: true }
  };
}

/** Just enough of three.js for the ring: a torus, a phong material and a mesh. */
const THREE = {
  MeshPhongMaterial: function (o) { return Object.assign(mat(), { given: o }); },
  MeshBasicMaterial: function (o) { return Object.assign(mat(), { given: o }); },
  TorusGeometry: function (r, tube, seg, sides) { this.kind = 'torus'; this.args = [r, tube, seg, sides]; },
  Mesh: function (geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.rotation = { x: 0, y: 0, z: 0 };
    this.scale = { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    this.name = '';
  }
};

/**
 * A stand-in 3D layer. `draw` answers true, as a real one does when it
 * rendered, and keeps what it was handed so the render knobs can be read off
 * it. The ball's opacity at the moment of the render is recorded too: that is
 * the whole point of hiding it.
 */
function fakeLayer(parts) {
  const seen = [];
  return {
    parts,
    seen,
    internals() { return { THREE, renderer: {}, scene: {}, camera: {}, parts }; },
    draw(ctx, cam, state, opts) {
      seen.push({ opts, ballOpacity: parts.ballMat.opacity });
      return true;
    }
  };
}

/** Run `fn` with a stand-in 3D layer in place of the page's, always putting the old one back. */
function withLayer(layer, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'PongField3D');
  const old = globalThis.PongField3D;
  globalThis.PongField3D = layer;
  try { return fn(); } finally {
    if (had) globalThis.PongField3D = old; else delete globalThis.PongField3D;
  }
}

// ------------------------------------------------------------- the context
function logCtx() {
  const ops = [];
  const ctx = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, globalAlpha: 1, lineCap: 'butt', lineJoin: 'miter',
    imageSmoothingEnabled: true,
    beginPath() { ops.push({ op: 'begin' }); },
    moveTo(x, y) { ops.push({ op: 'move', x, y }); },
    lineTo(x, y) { ops.push({ op: 'line', x, y }); },
    arc(x, y, r) { ops.push({ op: 'arc', x, y, r }); },
    stroke() { ops.push({ op: 'stroke', style: this.strokeStyle, width: this.lineWidth, cap: this.lineCap, alpha: this.globalAlpha }); },
    fill() { ops.push({ op: 'fill', style: this.fillStyle, alpha: this.globalAlpha }); },
    fillRect(x, y, w, h) { ops.push({ op: 'fillRect', style: this.fillStyle, x, y, w, h }); },
    strokeRect(x, y, w, h) { ops.push({ op: 'strokeRect', style: this.strokeStyle, width: this.lineWidth, x, y, w, h }); },
    transform() {}, rotate() {}, clip() {}, closePath() {}, save() {}, restore() {}, translate() {}, scale() {},
    createLinearGradient() { return { stops: [], addColorStop(o, c) { this.stops.push([o, c]); } }; }
  };
  return { ctx, ops };
}

/** A frame mid-rally: the ball fast enough for speed lines, a hit just made. */
function rally() {
  const g = Pong.createGame({ rng: () => 0.1, phase: 'playing', era: 7 });
  g.serveDelay = 0;
  g.time = 20;
  g.score.left = 4;
  g.score.right = 3;
  g.rally = 6;
  g.ball.x = 430; g.ball.y = 260; g.ball.vx = 520; g.ball.vy = -210;
  g.left.y = 380; g.right.y = 60;
  return g;
}

function drawFrame(g) {
  const log = logCtx();
  R.draw(log.ctx, g, {});
  return log.ops;
}

const T = R.table3d;
const CAM = T.camera(look.camera);
const SHEEN = look.STAGE.sheen.colour;
const indexOfFill = (ops, style) => ops.findIndex((o) => o.op === 'fill' && o.style === style);

/**
 * Where the ball was painted: its shade band is the one fill of that colour in
 * a frame, and it goes on immediately after the white core.
 */
const ballAt = (ops) => indexOfFill(ops, look.PALETTE.ballShade);

/**
 * Where the speed lines were painted, found by their own geometry rather than
 * by their colour -- every stroke in this era is ink, so a colour match picks
 * up the score's outline too. The era hands out the lines it would draw.
 */
function speedAt(ops, g) {
  const want = look.speedLines(T, CAM, g);
  assert.ok(want.length > 0, 'this frame has speed lines');
  const at = want.map((w) => {
    const i = ops.findIndex((o) => o.op === 'move' && Math.abs(o.x - w.x0) < 0.01 && Math.abs(o.y - w.y0) < 0.01);
    if (i < 0) return -1;
    let j = i;
    while (j < ops.length && ops[j].op !== 'stroke') j++;
    return j;
  });
  assert.ok(at.every((i) => i >= 0), 'every speed line found in the log');
  return Math.max.apply(null, at);
}

// --------------------------------------------------------------- the knobs
test('the field is drawn at 640 x 480, smoothed, with no haze and a polished lighting model', () => {
  assert.deepStrictEqual(look.render, { resolution: 0.8, filter: true, fog: null, lighting: 'phong' });
  // 0.8 of the 800 x 600 picture the field lands in is exactly 640 x 480.
  assert.deepStrictEqual([800 * look.render.resolution, 600 * look.render.resolution], [640, 480]);
  // Smooth, not blocky, and lit rather than banded: the two things the ruling turned round.
  assert.strictEqual(look.render.filter, true);
  assert.strictEqual(look.render.fog, null);
});

test('the era hands its render knobs to the 3D layer every frame', () => {
  const layer = fakeLayer(fakeParts());
  withLayer(layer, () => drawFrame(rally()));
  assert.strictEqual(layer.seen.length, 1);
  assert.deepStrictEqual(layer.seen[0].opts.render, look.render);
});

// ---------------------------------------------------------- the field setup
test('fieldSetup dresses the four shared parts and lays the ring down once', () => {
  const parts = fakeParts();
  const I = fakeLayer(parts).internals();
  const S = look.STAGE;

  assert.strictEqual(look.fieldSetup(I, rally()), 'fresh');
  assert.strictEqual(parts.surfaceMat.emissive.value, S.slab.lift);
  assert.strictEqual(parts.netMat.emissive.value, S.net.lift);
  assert.strictEqual(parts.bats.left.mat.emissive.value, S.bat.lift);
  assert.strictEqual(parts.bats.right.mat.emissive.value, S.bat.lift);
  assert.strictEqual(parts.ballMat.emissive.value, S.ball.lift);
  // Polished and smooth, which is the whole of the change from the cel look.
  assert.strictEqual(parts.surfaceMat.specular.value, S.slab.specular);
  assert.strictEqual(parts.surfaceMat.shininess, S.slab.shininess);
  assert.strictEqual(parts.surfaceMat.flatShading, false);

  const ring = parts.group.children.filter((m) => m.name === 'era7-ring');
  assert.strictEqual(ring.length, 1, 'one ring on the table top');
  assert.strictEqual(ring[0].geometry.kind, 'torus');
  assert.strictEqual(ring[0].rotation.x, -Math.PI / 2, 'lying flat, not standing up');
  assert.ok(ring[0].scale.x > 1.3 && ring[0].scale.x < 1.4, 'a circle stretched across 800 x 600');

  // Called again on the same parts it adds nothing and re-dresses nothing.
  assert.strictEqual(look.fieldSetup(I, rally()), 'kept');
  assert.strictEqual(look.fieldSetup(I, rally()), 'kept');
  assert.strictEqual(parts.group.children.filter((m) => m.name === 'era7-ring').length, 1);
});

test('a new set of parts -- another era drew, or the knobs rebuilt them -- is dressed again', () => {
  const first = fakeParts();
  look.fieldSetup(fakeLayer(first).internals(), rally());
  const second = fakeParts();                       // what a rebuild hands back
  assert.strictEqual(look.fieldSetup(fakeLayer(second).internals(), rally()), 'fresh');
  assert.strictEqual(second.surfaceMat.emissive.value, look.STAGE.slab.lift);
  assert.strictEqual(second.group.children.filter((m) => m.name === 'era7-ring').length, 1);
});

test('fieldSetup does nothing at all when there is no 3D layer', () => {
  assert.strictEqual(look.fieldSetup(null, rally()), null);
  assert.strictEqual(look.fieldSetup(undefined, rally()), null);
  assert.strictEqual(look.fieldSetup({}, rally()), null);
});

// ------------------------------------------------- the ball over its effects
test('the layer draws no ball of its own while era 7 draws, and gets it straight back', () => {
  const parts = fakeParts();
  const layer = fakeLayer(parts);
  withLayer(layer, () => drawFrame(rally()));
  assert.strictEqual(layer.seen[0].ballOpacity, 0, 'hidden for the length of the render');
  assert.strictEqual(parts.ballMat.opacity, 1, 'and shown again the moment it is over -- no other era meets it hidden');
  assert.strictEqual(parts.ball.visible, true, 'the layer owns visible; the era never writes it');
});

/** The frame just after a bat met the ball: the burst needs the hit before it to have been seen. */
function afterAHit(g) {
  drawFrame(Object.assign({}, g, { rally: g.rally - 1, time: g.time - 0.02 }));
  return g;
}

test('over the 3D field the ball is drawn AFTER the speed lines and the impact burst', () => {
  const g = afterAHit(rally());
  const ops = withLayer(fakeLayer(fakeParts()), () => drawFrame(g));
  const lines = speedAt(ops, g);
  const ball = ballAt(ops);
  assert.ok(ball > lines, `the ball (${ball}) comes after the speed lines (${lines})`);
  const between = ops.slice(lines, ball);
  assert.ok(between.some((o) => o.op === 'fill' && o.style === look.PALETTE.yellow),
    'the impact burst is painted between the lines and the ball, so the ball covers it');
  // The white core goes on first, then its shade: the ball is white at its brightest (R1).
  const core = ops.slice(0, ball).map((o, i) => ({ o, i })).filter((e) => e.o.op === 'fill' && e.o.style === WHITE).pop();
  assert.ok(core && ball - core.i < 6, 'the white core is the fill just before the shade');
  // Its third tone, the one that makes it read round rather than flicked.
  assert.ok(indexOfFill(ops, SHEEN) > ball, 'the deep shade sits on top');
});

test('without a 3D layer the era draws exactly what it always drew', () => {
  const g = rally();
  const ops = drawFrame(g);
  assert.ok(ballAt(ops) > speedAt(ops, g), 'the canvas ball was always last on the table');
  assert.strictEqual(indexOfFill(ops, SHEEN), -1, 'no third tone: the cel ball keeps its two bands');
  assert.strictEqual(ops.filter((o) => o.op === 'fill' && o.style === look.PALETTE.ballShade).length, 1);
});

test('the 3D ball and the canvas ball land on the same pixel', () => {
  const g = rally();
  const withGl = withLayer(fakeLayer(fakeParts()), () => drawFrame(g));
  const without = drawFrame(g);
  const ballArc = (ops) => {
    for (let i = ballAt(ops); i >= 0; i--) if (ops[i].op === 'arc') return { x: ops[i].x, y: ops[i].y, r: ops[i].r };
    return null;
  };
  assert.deepStrictEqual(ballArc(withGl), ballArc(without));
});
