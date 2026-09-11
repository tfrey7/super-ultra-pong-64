// The realism ladder's 3D table and camera (item 1266, docs/ART.md section 8):
// the table the 3D layer builds carries the ladder's numbers, and every 3D era's
// camera holds two 250-unit players whole behind the table ends while rule R3
// still passes in every pose -- so the arena gets more of the picture than it did.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const T = require('../src/table3d.js');
const F = require('../src/field3d.js');
const cameras = require('../tools/table3d-cameras.js');
const { loadRenderer } = require('../tools/eralooks.js');

const R = loadRenderer(path.join(__dirname, '..')).R;
const W = 800, H = 600;
const geo = F.tableGeometry();

test('the lines: 6-unit edge lines round all four edges and a 3-unit centre line along y 300, end to end', () => {
  assert.strictEqual(geo.lines.length, 5);
  const [far, near, left, right, centre] = geo.lines;
  assert.deepStrictEqual([far.x0, far.x1, far.y0, far.y1], [0, W, 0, 6]);
  assert.deepStrictEqual([near.x0, near.x1, near.y0, near.y1], [0, W, H - 6, H]);
  assert.deepStrictEqual([left.x0, left.x1, left.y0, left.y1], [0, 6, 0, H]);
  assert.deepStrictEqual([right.x0, right.x1, right.y0, right.y1], [W - 6, W, 0, H]);
  assert.deepStrictEqual([centre.x0, centre.x1, centre.y0, centre.y1], [0, W, 298.5, 301.5]);
  for (const l of geo.lines) assert.ok(l.z0 === 0 && l.z1 > 0 && l.z1 < 1, 'paint on the top, not a kerb');
});

test('the net: across x 400, 24 units tall, on a post at y -20 and one at y 620, see-through, lower than a bat', () => {
  const { body, tape, posts } = geo.net;
  for (const b of [body, tape]) {
    assert.ok(b.x0 < 400 && b.x1 > 400, 'straddles x 400');
    assert.deepStrictEqual([b.y0, b.y1], [-20, 620]);
  }
  assert.strictEqual(body.z0, 0);
  assert.strictEqual(tape.z1, 24);
  assert.strictEqual(body.z1, tape.z0, 'the tape sits on the body');
  assert.ok(tape.z1 < 28, 'below the bats\' 28 (R6)');
  assert.ok(F.SIZES.net.opacity <= 0.5, 'the body is a mesh at 0.5 opacity or less');
  assert.deepStrictEqual(posts.map((p) => (p.y0 + p.y1) / 2), [-20, 620]);
  for (const p of posts) assert.ok(p.x0 < 400 && p.x1 > 400 && p.z1 >= tape.z1, 'a post under each end of the tape');
});

test('the legs stand inside the top\'s footprint, down to a floor 110 units below the top', () => {
  assert.strictEqual(geo.floor, -110);
  assert.strictEqual(geo.legs.length, 4);
  for (const l of geo.legs) {
    assert.ok(l.x0 > 0 && l.x1 < W && l.y0 > 0 && l.y1 < H, 'inside the footprint: nothing between the camera and the near edge (R6)');
    assert.strictEqual(l.z0, -110, 'on the floor');
    assert.ok(l.z1 <= 0, 'under the top');
  }
});

test('every 3D era draws with its ladder camera, the one tools/table3d-cameras.js solved', () => {
  for (let era = 5; era <= 10; era++) {
    const spec = R.eraLook(era).camera;
    for (const k of ['tilt', 'height', 'fov', 'screenY']) assert.strictEqual(spec[k], cameras.LADDER[era][k], `era ${era} ${k}`);
  }
});

test('each ladder camera holds both players whole, with headroom, and passes R3, in every pose', () => {
  for (const e of cameras.ERAS) {
    for (const pose of cameras.poses(e)) {
      assert.ok(cameras.readable(cameras.measure(pose)), `era ${e.era} R3 at ${JSON.stringify(pose)}`);
      const p = cameras.players(pose);
      assert.ok(p.whole, `era ${e.era} players whole at ${JSON.stringify(pose)}: ${JSON.stringify(p)}`);
    }
    // the old camera could not hold them: this is what the move bought
    assert.strictEqual(cameras.players(cameras.BEFORE.find((b) => b.era === e.era)).whole, false, `era ${e.era} before`);
  }
});

test('the arena gets more of the picture under every ladder camera than it did', () => {
  for (const e of cameras.ERAS) {
    const before = cameras.arenaShare(cameras.BEFORE.find((b) => b.era === e.era));
    const after = cameras.arenaShare(e);
    assert.ok(after.share > before.share + 0.1, `era ${e.era}: ${before.share} -> ${after.share}`);
    assert.ok(after.rowsAboveFarEdge > before.rowsAboveFarEdge + 50, `era ${e.era}: rows above the far edge ${before.rowsAboveFarEdge} -> ${after.rowsAboveFarEdge}`);
  }
});

test('the 3D layer and the canvas projection agree on the ladder cameras, legs, net posts and players included', () => {
  const pts = [[0, 0, 0], [W, H, 0], [400, -20, 24], [400, 620, 24], [70, 550, -110], [-30, 300, -110], [830, 300, 140]];
  for (let era = 5; era <= 10; era++) {
    const cam = T.camera(R.eraLook(era).camera);
    const m = F.matrices(cam);
    for (const [x, y, z] of pts) {
      const want = T.project(cam, x, y, z), got = F.projectThrough(m, x, y, z);
      assert.ok(Math.abs(got.x - want.x) < 1e-6 && Math.abs(got.y - want.y) < 1e-6, `era ${era} point ${[x, y, z]}`);
    }
  }
});

test('the paddle stays readable: at the far wall at least 44 pixels, near the viewer at least 55', () => {
  for (const e of cameras.ERAS) {
    const m = cameras.measure(e);
    assert.ok(m.farPaddlePx >= 44, `era ${e.era} far ${m.farPaddlePx}`);
    assert.ok(m.nearPaddlePx >= 55, `era ${e.era} near ${m.nearPaddlePx}`);
  }
});
