'use strict';
/*
 * Era 8's CHANGE of the reference ladder (item 1295, docs/ART.md "Reference
 * games", era 8): the film presentation of the field it inherits from era 7,
 * done the PlayStation 2 way. The machine had no pixel shaders, so a glossy
 * floor was a SECOND COPY of the geometry mirrored through the floor's plane,
 * drawn under a see-through floor -- Metal Gear Solid 2's tanker deck.
 *
 * Three things are pinned here, none of which needs a browser:
 *   1. the render knobs, and that they really put the field at 512 across;
 *   2. mirrorTransforms(), a pure function: where every copy stands, from the
 *      state alone, at three ball and paddle states;
 *   3. fieldSetup(), driven against a stand-in for the 3D layer's internals --
 *      it adds the copies once, moves them every frame, puts the layer's ball
 *      back after era 7 hid it, and does nothing at all when there is no layer.
 * And the interlace: which lines dim, and that one pattern fill does it.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
require('../src/erachange.js');
const D = require('../src/display.js');

const look = () => R.eraLook(8);

/** A state in play, with the paddles and the ball put where a test wants them. */
function stateAt(over) {
  const g = Pong.createGame({ rng: () => 0.1, phase: 'playing', era: 8 });
  g.time = 3;
  g.serveDelay = 0;
  g.left.y = 260;
  g.right.y = 300;
  return Object.assign(g, over || {});
}

// --------------------------------------------------------------- the knobs

test('era 8 renders the film way: phong, filtered, and the field 512 pixels across', () => {
  const r = look().render;
  assert.deepStrictEqual(r, { resolution: 1, filter: true, lighting: 'phong' },
    'the knobs src/field3d.js reads every frame');
  // The card asked for 512 wide and wrote resolution 0.64 for it. The knob is a
  // multiplier on the picture's OWN pixel scale, and era 8's picture is already
  // the display's native 512 x 448 canvas -- so 1 renders 512 across and 0.64
  // would render 328. The number differs; what it produces is what was asked.
  const row = D.row(8);
  assert.deepStrictEqual([row.w, row.h], [512, 448], 'the PS2 display row');
  const pixelScale = row.w / 800;                        // what the era's context is scaled by
  assert.strictEqual(Math.round(800 * pixelScale * r.resolution), 512,
    'the GL canvas comes out 512 wide');
  assert.strictEqual(Math.round(600 * (row.h / 600) * r.resolution), 448);
  assert.strictEqual(look().MIRROR.slab, 0.82, 'the slab is see-through at 0.82, the copies read at 0.18');
});

// ------------------------------------------------------- the mirrored copies

const SIZES = { slab: 14, bat: { z: 22, handle: 26, handleR: 4 }, ballRadius: 0.6,
  net: { x: 400, z: 24, w: 1.5, y0: -20, y1: 620, tape: 2.5 } };

test('every mirrored copy hangs below the table, at three ball and paddle states', () => {
  const mirror = look().mirrorTransforms;
  const states = [
    stateAt({ ball: { x: 400, y: 300, vx: 300, vy: 0, size: 14 } }),
    stateAt({ ball: { x: 120, y: 90, vx: -300, vy: -120, size: 14 } }),
    stateAt({ ball: { x: 700, y: 520, vx: 400, vy: 200, size: 14 } })
  ];
  states[1].left.y = 40;
  states[2].right.y = 430;
  for (const g of states) {
    const tr = mirror(g, null, SIZES);
    for (const key of ['left', 'right']) {
      const b = tr[key].blade;
      assert.strictEqual(b.position[0], g[key].x + g[key].w / 2 - 400, `${key} bat across the table`);
      assert.strictEqual(b.position[2], g[key].y + g[key].h / 2 - 300, `${key} bat down the table`);
      assert.ok(b.position[1] < 0, `${key} bat's copy hangs under the table`);
      assert.strictEqual(b.position[1], -SIZES.bat.z / 2);
      assert.strictEqual(b.scale[1], -SIZES.bat.z, `${key} blade is flipped, not just moved`);
      assert.ok(tr[key].handle.position[1] < 0, `${key} handle's copy is under the table too`);
    }
    // The ball's copy sits its own radius below, right under the ball.
    const rad = g.ball.size * SIZES.ballRadius;
    assert.deepStrictEqual(tr.ball.position, [g.ball.x + g.ball.size / 2 - 400, -rad, g.ball.y + g.ball.size / 2 - 300]);
    assert.deepStrictEqual(tr.ball.scale, [rad, -rad, rad]);
    assert.strictEqual(tr.ball.visible, true, 'the ball is in play');
    // The net and its tape are one pair, mirrored about the same plane.
    assert.ok(tr.net.position[1] < 0 && tr.tape.position[1] < tr.net.position[1],
      'the tape is the deepest thing in the mirror, as it is the highest on the net');
    assert.strictEqual(tr.net.scale[1], -(SIZES.net.z - SIZES.net.tape));
  }
  // Two different states give two different pictures: the copies FOLLOW play.
  const a = mirror(states[0], null, SIZES), b = mirror(states[2], null, SIZES);
  assert.notDeepStrictEqual(a.ball.position, b.ball.position);
  assert.notDeepStrictEqual(a.right.blade.position, b.right.blade.position);
});

test('the mirror is z to -z: a copy is its original with every height negated', () => {
  const mirror = look().mirrorTransforms;
  const g = stateAt({ ball: { x: 300, y: 200, vx: 200, vy: 50, size: 14 } });
  const tr = mirror(g, null, SIZES);
  // The originals, as src/field3d.js stands them: blade from the table up to
  // its height, centred at h/2; the ball a radius above the table.
  assert.strictEqual(tr.left.blade.position[1], -(SIZES.bat.z / 2), 'blade centre mirrored');
  assert.strictEqual(tr.ball.position[1], -(g.ball.size * SIZES.ballRadius), 'ball centre mirrored');
  // A taller blade (the figures hold their own bats) mirrors just as far down.
  const tall = mirror(g, { left: 40, right: 52 }, SIZES);
  assert.strictEqual(tall.left.blade.position[1], -20);
  assert.strictEqual(tall.right.blade.position[1], -26);
  assert.strictEqual(tall.left.blade.scale[1], -40);
});

test('in the serve pause the ball has no reflection, because there is no ball', () => {
  const mirror = look().mirrorTransforms;
  const g = stateAt({ serveDelay: 1.2, ball: { x: 400, y: 300, vx: 0, vy: 0, size: 14 } });
  assert.strictEqual(mirror(g, null, SIZES).ball.visible, false);
});

// -------------------------------------- the scene work, against a stand-in layer

/** The few classes src/eras/era8-ps2.js asks THREE for, and nothing else. */
function fakeThree() {
  const triple = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
  class Obj {
    constructor(name) {
      this.name = name || '';
      this.userData = {};
      this.children = [];
      this.visible = true;
      this.position = triple();
      this.scale = triple();
      this.rotation = triple();
    }
    add(child) { this.children.push(child); }
    traverse(fn) { fn(this); this.children.forEach((c) => c.traverse(fn)); }
  }
  class Mesh extends Obj {
    constructor(geo, mat) { super(); this.geometry = geo; this.material = mat; }
  }
  const mat = (flag) => function (o) { return Object.assign({ opacity: 1, transparent: false }, o, { [flag]: true }); };
  return {
    Group: Obj,
    Mesh: function (g, m) { return new Mesh(g, m); },
    MeshBasicMaterial: function (o) { return Object.assign({ isMeshBasicMaterial: true }, o, { color: colour(o && o.color) }); },
    MeshPhongMaterial: function (o) { return Object.assign({ isMeshPhongMaterial: true, opacity: 1, transparent: false }, o); },
    BoxGeometry: function () { return { kind: 'box' }; },
    SphereGeometry: function () { return { kind: 'sphere' }; },
    CylinderGeometry: function () { return { kind: 'cylinder' }; },
    PlaneGeometry: function () { return { kind: 'plane' }; },
    _Obj: Obj, _unused: mat
  };
}

function colour(hex) {
  return { hex: hex || '#ffffff', clone() { return colour(this.hex); }, copy(o) { this.hex = o.hex; return this; } };
}

function toon(hex) {
  return { isMeshToonMaterial: true, color: colour(hex), opacity: 1, transparent: false, depthWrite: true };
}

/** A stand-in for PongField3D.internals(): era 7's scene, toon materials and hidden ball. */
function fakeLayer() {
  const THREE = fakeThree();
  const scene = new THREE._Obj('scene');
  const group = new THREE._Obj('field');
  scene.add(group);
  const bat = (side) => ({
    blade: Object.assign(new THREE._Obj('bat-' + side), { scale: { x: 1, y: 30, z: 1, set() {} } }),
    handle: new THREE._Obj('handle-' + side),
    mat: toon(side === 'left' ? '#ffb347' : '#9fc4ff')
  });
  const parts = {
    group: group,
    slab: Object.assign(new THREE._Obj('slab'), { material: { transparent: false, opacity: 1, needsUpdate: false } }),
    ball: Object.assign(new THREE._Obj('ball'), { visible: false, material: { visible: false, opacity: 0 } }),
    bats: { left: bat('left'), right: bat('right') },
    surfaceMat: toon('#1c2536'), railMat: toon('#2d3e50'), netMat: toon('#e8e8e8'), ballMat: toon('#ffffff')
  };
  group.add(parts.slab);
  group.add(parts.ball);
  return { THREE, scene, camera: {}, renderer: {}, parts };
}

const mirrorMeshes = (scene) => {
  const out = [];
  scene.traverse((o) => { if (o.name === 'era8-mirror') out.push(o); });
  return out;
};

test('with no 3D layer at all, the scene work does nothing and says so', () => {
  assert.strictEqual(look().fieldSetup(null, stateAt()), false, 'internals() answered null');
  assert.strictEqual(look().fieldSetup({}, stateAt()), false, 'half an answer is no answer');
  assert.strictEqual(look().fieldSetup(fakeLayer(), null), false, 'no state, no mirror');
});

test('the copies are added once, then moved -- a second frame adds nothing', () => {
  const I = fakeLayer();
  assert.strictEqual(look().fieldSetup(I, stateAt()), true);
  assert.strictEqual(mirrorMeshes(I.scene).length, 1, 'one mirror group in the scene');
  const group = mirrorMeshes(I.scene)[0];
  const names = group.children.map((c) => c.name).sort();
  assert.deepStrictEqual(names, [
    'era8-mirror-backing', 'era8-mirror-ball', 'era8-mirror-bat-left', 'era8-mirror-bat-right',
    'era8-mirror-handle-left', 'era8-mirror-handle-right', 'era8-mirror-net', 'era8-mirror-tape'
  ], 'both bats, both handles, the net, its tape, the ball and the backing sheet');
  assert.ok(group.children.every((c) => c.userData.era === 8), 'every copy is tagged era 8');

  const ball = group.children.find((c) => c.name === 'era8-mirror-ball');
  const first = [ball.position.x, ball.position.z];
  look().fieldSetup(I, stateAt({ ball: { x: 650, y: 470, vx: 300, vy: 90, size: 14 } }));
  assert.strictEqual(mirrorMeshes(I.scene).length, 1, 'still one group after a second frame');
  assert.strictEqual(group.children.length, 8, 'and still eight copies');
  assert.notDeepStrictEqual([ball.position.x, ball.position.z], first, 'the ball\'s copy followed the ball');
  assert.ok(ball.position.y < 0, 'and stayed under the table');
});

test('era 8\'s frames take the toon inks off and put the layer\'s ball back', () => {
  const I = fakeLayer();
  assert.ok(I.parts.surfaceMat.isMeshToonMaterial, 'era 7 left toon materials behind');
  assert.strictEqual(I.parts.ball.visible, false, 'and era 7 hid the layer\'s ball');
  look().fieldSetup(I, stateAt());
  assert.ok(I.parts.surfaceMat.isMeshPhongMaterial, 'the slab is smooth-shaded now');
  assert.ok(I.parts.railMat.isMeshPhongMaterial && I.parts.netMat.isMeshPhongMaterial);
  assert.ok(I.parts.bats.left.mat.isMeshPhongMaterial && I.parts.bats.right.mat.isMeshPhongMaterial);
  assert.strictEqual(I.parts.ball.visible, true, 'the ball is back');
  assert.strictEqual(I.parts.ball.material.visible, true);
  assert.strictEqual(I.parts.ball.material.opacity, 1);
  // In the serve pause there is no ball to show.
  look().fieldSetup(I, stateAt({ serveDelay: 1 }));
  assert.strictEqual(I.parts.ball.visible, false);
});

test('the slab turns see-through over the copies on era 8\'s frames, and solid again on anyone else\'s', () => {
  const I = fakeLayer();
  look().fieldSetup(I, stateAt());
  I.scene.onBeforeRender();                       // the layer renders era 8's frame
  assert.strictEqual(I.parts.slab.material.transparent, true);
  assert.strictEqual(I.parts.slab.material.opacity, look().MIRROR.slab);
  assert.strictEqual(mirrorMeshes(I.scene)[0].visible, true, 'the copies are drawn');
  I.scene.onBeforeRender();                       // a frame nobody armed: another era's
  assert.strictEqual(I.parts.slab.material.transparent, false, 'the table is solid again');
  assert.strictEqual(I.parts.slab.material.opacity, 1);
  assert.strictEqual(mirrorMeshes(I.scene)[0].visible, false, 'and the copies are gone');
});

// ------------------------------------------------------------- the interlace

test('the interlace dims every other line and swaps which ones sixty times a second', () => {
  const plan = look().interlacePlan;
  assert.strictEqual(look().INTERLACE.alpha, 0.06, 'six percent darker');
  assert.strictEqual(plan(0).parity, 0);
  assert.strictEqual(plan(1 / 60 + 1e-4).parity, 1, 'the other field, one sixtieth of a second later');
  assert.strictEqual(plan(2 / 60 + 1e-4).parity, 0);
  assert.strictEqual(plan(0).alpha, 0.06);
  let flips = 0;
  for (let i = 1; i <= 60; i++) if (plan(i / 60 + 1e-4).parity !== plan((i - 1) / 60 + 1e-4).parity) flips++;
  assert.strictEqual(flips, 60, 'sixty swaps in a second');
  assert.strictEqual(plan(-5).parity, 0, 'before the clock starts, no flicker of its own');
});

test('with no canvas to build a stripe tile on, the interlace simply does not draw', () => {
  const ctx = { getTransform: () => ({ a: 1, d: 1, e: 0, f: 0 }), createPattern: () => ({}),
    save() {}, restore() {}, setTransform() {}, fillRect() { throw new Error('drew anyway'); } };
  assert.strictEqual(look().interlace(ctx, stateAt()), false);
});

test('the interlace is one pattern fill over the picture, never a walk over pixels', () => {
  const calls = { patterns: 0, fills: [], tiles: [] };
  const fakeCanvas = () => {
    const c = { width: 0, height: 0, rects: [] };
    c.getContext = () => ({ set fillStyle(v) { c.ink = v; }, get fillStyle() { return c.ink; },
      fillRect: (x, y, w, h) => c.rects.push([x, y, w, h]) });
    calls.tiles.push(c);
    return c;
  };
  const hadDoc = Object.prototype.hasOwnProperty.call(globalThis, 'document');
  const before = globalThis.document;
  globalThis.document = { createElement: (tag) => (tag === 'canvas' ? fakeCanvas() : {}) };
  try {
    const ctx = {
      globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null,
      getTransform: () => ({ a: 0.64, b: 0, c: 0, d: 0.7466, e: 0, f: 0 }),
      createPattern: () => { calls.patterns++; return { pattern: calls.patterns }; },
      save() {}, restore() {}, setTransform() {},
      fillRect: (x, y, w, h) => calls.fills.push([x, y, Math.round(w), Math.round(h)])
    };
    assert.strictEqual(look().interlace(ctx, stateAt({ time: 0 })), true, 'it drew');
    assert.strictEqual(calls.fills.length, 1, 'ONE fill covers the whole composite');
    assert.deepStrictEqual(calls.fills[0], [0, 0, 512, 448], 'over the native picture, in device pixels');
    assert.strictEqual(calls.tiles.length, 2, 'two stripe tiles, one per parity, built once');
    for (const t of calls.tiles) {
      assert.deepStrictEqual([t.width, t.height], [1, 2], 'a tile is one pixel by two');
      assert.deepStrictEqual(t.rects, [[0, t.rects[0][1], 1, 1]], 'one of the two lines is inked');
      assert.strictEqual(t.ink, 'rgba(0,0,0,0.06)');
    }
    assert.deepStrictEqual(calls.tiles.map((t) => t.rects[0][1]), [1, 0], 'the two tiles ink opposite lines');
    look().interlace(ctx, stateAt({ time: 0.5 }));
    assert.strictEqual(calls.tiles.length, 2, 'the tiles are built once, not per frame');
  } finally {
    if (hadDoc) globalThis.document = before;
    else delete globalThis.document;
  }
});
