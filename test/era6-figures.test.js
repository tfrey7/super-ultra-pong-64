// Era 6's two players as real built figures (item 1254): the penguin on the
// player's end and the frog on the computer's, made by tools/blender/era6-players.py
// to tools/blender/README.md's contract and named by era 6's block in
// src/characters.js. This pins what a page depends on -- the file is a rigged
// glTF with the six clips and an ink material the game repaints, it is inside
// the Nintendo 64's triangle budget, its .glb.js is the same bytes, and no part
// of either figure reaches past its paddle into the ball's half. Headless.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../src/characters.js');

const MODELS = path.join(__dirname, '..', 'assets', 'models');
const CLIPS = ['idle', 'move_up', 'move_down', 'swing', 'celebrate', 'lose'];
const PAIR = { left: 'era6-penguin', right: 'era6-frog' };
// docs/ART.md's Reference games table, era 6: about 350 triangles each. The N64
// drew about 100,000 polygons a second, and two players are a small part of a
// frame that also holds the table, the park and the ball.
const BUDGET = { least: 250, most: 420 };

/** A .glb's JSON chunk, after checking the header and both chunk headers. */
function glbJson(buf) {
  assert.strictEqual(buf.toString('ascii', 0, 4), 'glTF', 'magic');
  assert.strictEqual(buf.readUInt32LE(4), 2, 'glTF version 2');
  assert.strictEqual(buf.readUInt32LE(8), buf.length, 'the header states the file length');
  const n = buf.readUInt32LE(12);
  assert.strictEqual(buf.toString('ascii', 16, 20), 'JSON');
  return JSON.parse(buf.toString('utf8', 20, 20 + n));
}

function triangles(j) {
  let tris = 0;
  for (const mesh of j.meshes) {
    for (const prim of mesh.primitives) {
      assert.ok(prim.indices !== undefined, 'indexed triangles');
      tris += j.accessors[prim.indices].count / 3;
    }
  }
  return tris;
}

test('era 6 names its own two figures, one a side, and no sprite stand-in', () => {
  const left = C.configFor(6, 'left'), right = C.configFor(6, 'right');
  assert.strictEqual(left.figure, PAIR.left, 'the penguin holds the player\'s paddle');
  assert.strictEqual(right.figure, PAIR.right, 'the frog holds the computer\'s');
  assert.strictEqual(left.sheet, null, 'the sprite stand-ins have left this era');
  assert.strictEqual(right.sheet, null);
  assert.strictEqual(left.model, null, 'and no polygon model, the proof figure least of all');
  assert.strictEqual(left.is3d, true);
  assert.notStrictEqual(left.figure, right.figure, 'two silhouettes, not one mirrored');
});

for (const side of ['left', 'right']) {
  const name = PAIR[side];
  test(`${name}.glb is a rigged glTF with the six clips, an ink material and the pong extras`, () => {
    const j = glbJson(fs.readFileSync(path.join(MODELS, name + '.glb')));
    assert.strictEqual(j.asset.version, '2.0');
    assert.deepStrictEqual(j.animations.map((a) => a.name), CLIPS);
    assert.strictEqual(j.skins.length, 1, 'one skeleton');
    const skinned = j.nodes.filter((n) => n.skin !== undefined && n.mesh !== undefined);
    assert.strictEqual(skinned.length, 1, 'one skinned mesh');
    assert.ok(j.materials.some((m) => m.name === 'ink'), 'an ink material the game repaints in the paddle\'s colour');
    const pong = j.scenes[j.scene || 0].extras.pong;
    assert.strictEqual(pong.format, 'pong-figure-1');
    assert.strictEqual(pong.name, name);
    assert.deepStrictEqual(pong.clips, CLIPS);
    assert.ok(/era6-players\.py/.test(pong.by), 'made by this era\'s own script: ' + pong.by);
    assert.ok(pong.hand[0] > 0 && pong.hand[1] > 20 && pong.hand[1] < pong.height && pong.hand[2] > 0,
      'the idle paddle hand is in front, at waist height, on the near side: ' + JSON.stringify(pong.hand));
    assert.ok(pong.height > 80 && pong.height < 100, 'a whole standing character, about 90 table units: ' + pong.height);
    for (const a of j.animations) {
      const times = j.accessors[a.samplers[0].input];
      assert.ok(times.max[0] > 0 && times.max[0] < 3, `${a.name} runs ${times.max[0]} s`);
    }
  });

  test(`${name} is modelled to the Nintendo 64's budget, about 350 triangles`, () => {
    const tris = triangles(glbJson(fs.readFileSync(path.join(MODELS, name + '.glb'))));
    assert.ok(tris >= BUDGET.least && tris <= BUDGET.most, name + ' is ' + tris + ' triangles');
  });

  test(`${name} stands behind its paddle: nothing reaches past the hand into the ball's half`, () => {
    const j = glbJson(fs.readFileSync(path.join(MODELS, name + '.glb')));
    const prim = j.meshes[0].primitives[0];
    const box = j.accessors[prim.attributes.POSITION];
    const pong = j.scenes[j.scene || 0].extras.pong;
    const scale = C.configFor(6, side).modelScale;
    // file axes: x forward. The layer puts the hand on the paddle's outer face,
    // so whatever is in front of the hand is what pokes toward the ball.
    const reach = (box.max[0] - pong.hand[0]) * scale;
    assert.ok(reach <= 14, name + ' reaches ' + reach.toFixed(1) + ' units past the hand, the paddle is 14 wide');
  });

  test(`${name}.glb.js is the same bytes as ${name}.glb, as PongFigureFiles["${name}"]`, () => {
    const box = { globalThis: {} };
    box.globalThis = box;
    vm.runInNewContext(fs.readFileSync(path.join(MODELS, name + '.glb.js'), 'utf8'), box);
    const b64 = box.PongFigureFiles[name];
    assert.strictEqual(typeof b64, 'string');
    assert.ok(Buffer.from(b64, 'base64').equals(fs.readFileSync(path.join(MODELS, name + '.glb'))));
  });
}
