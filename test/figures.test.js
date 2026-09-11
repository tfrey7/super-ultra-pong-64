// Blender figures as standard glTF files (item 1274). tools/blender/README.md
// is the contract the six era figure cards build to; this pins the parts of
// it a page depends on: the file is a real binary glTF with one rigged mesh
// and the six named clips, it carries the idle paddle hand as an extra, its
// .glb.js is the very same bytes, and the 3D layer maps the game's beats onto
// those clips and plays them on the game clock.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const F = require('../src/field3d.js');

const MODELS = path.join(__dirname, '..', 'assets', 'models');
const CLIPS = ['idle', 'move_up', 'move_down', 'swing', 'celebrate', 'lose'];
const PROOF = ['player-proof-lo', 'player-proof-mid', 'player-proof-hi'];

/** A .glb's JSON chunk, after checking the header and both chunk headers. */
function glbJson(buf) {
  assert.strictEqual(buf.toString('ascii', 0, 4), 'glTF', 'magic');
  assert.strictEqual(buf.readUInt32LE(4), 2, 'glTF version 2');
  assert.strictEqual(buf.readUInt32LE(8), buf.length, 'the header states the file length');
  const n = buf.readUInt32LE(12);
  assert.strictEqual(buf.toString('ascii', 16, 20), 'JSON');
  const json = JSON.parse(buf.toString('utf8', 20, 20 + n));
  assert.strictEqual(buf.toString('ascii', 24 + n, 28 + n).replace(/\0/g, ''), 'BIN');
  return json;
}

for (const name of PROOF) {
  test(`${name}.glb is a rigged glTF with the six clips and the pong extras`, () => {
    const buf = fs.readFileSync(path.join(MODELS, name + '.glb'));
    const j = glbJson(buf);
    assert.strictEqual(j.asset.version, '2.0');
    assert.deepStrictEqual(j.animations.map((a) => a.name), CLIPS);
    assert.strictEqual(j.skins.length, 1, 'one skeleton');
    const skinned = j.nodes.filter((n) => n.skin !== undefined && n.mesh !== undefined);
    assert.strictEqual(skinned.length, 1, 'one skinned mesh');
    assert.ok(j.materials.some((m) => m.name === 'ink'), 'an ink material the game repaints');
    const pong = j.scenes[j.scene || 0].extras.pong;
    assert.strictEqual(pong.format, 'pong-figure-1');
    assert.strictEqual(pong.name, name);
    assert.deepStrictEqual(pong.clips, CLIPS);
    assert.strictEqual(pong.hand.length, 3);
    // the idle paddle hand in file axes (x forward, y up, z near): in front, at waist height, on the near side
    assert.ok(pong.hand[0] > 0 && pong.hand[1] > 20 && pong.hand[1] < pong.height && pong.hand[2] > 0, JSON.stringify(pong));
    assert.ok(pong.height > 80 && pong.height < 100, 'table units, the proof figure about 90 tall');
    for (const a of j.animations) {
      const times = j.accessors[a.samplers[0].input];
      assert.ok(times.max[0] > 0 && times.max[0] < 3, `${a.name} runs ${times.max[0]} s`);
    }
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

test('every beat of src/characters.js plays its own clip', () => {
  assert.deepStrictEqual(F.CLIPS, CLIPS);
  assert.deepStrictEqual(['idle', 'up', 'down', 'swing', 'win', 'miss'].map(F.clipFor), CLIPS);
  assert.strictEqual(F.clipFor('nonsense'), 'idle');
});

test('a loop runs on the game clock and a one-shot from its beat, holding at the end', () => {
  assert.ok(Math.abs(F.clipTime('idle', 2, 5.5, 0) - 1.5) < 1e-9);
  assert.ok(Math.abs(F.clipTime('move_up', 0.4, 1.0, 0) - 0.2) < 1e-9);
  assert.strictEqual(F.clipTime('swing', 0.3, 99, 0.1), 0.1);
  assert.ok(F.clipTime('celebrate', 0.85, 99, 5) < 0.85, 'held just short of the end, never wrapped to 0');
  assert.ok(F.clipTime('lose', 0.85, 99, 5) > 0.84);
  assert.strictEqual(F.clipTime('swing', 0.3, 0, -1), 0);
  assert.strictEqual(F.clipTime('idle', 0, 3, 0), 0);
});

test('under node there is no WebGL, so no figures are stood and the polygon figures draw', () => {
  assert.strictEqual(F.takeFigures(), false);
  assert.strictEqual(F.draw({}, { tilt: 0, fov: 30 }, { era: 5 }, {}), false);
  assert.strictEqual(F.takeFigures(), false);
});
