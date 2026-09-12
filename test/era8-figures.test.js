// Era 8's two operatives as glTF figures (item 1256). The contract is
// tools/blender/README.md's, checked here for THIS era's two files: a real
// binary glTF with one rigged mesh, the six named clips, an ink material the
// game repaints in the paddle's colour, the pong extras, and the .glb.js of the
// very same bytes. Also that the two are a PAIR -- different silhouettes and
// different gear, not one figure twice (Tim: "can't reuse that primitive
// character like that") -- that they sit inside the PlayStation 2's triangle
// budget, and that era 8's block names them and no longer names a sprite sheet.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../src/characters.js');

const MODELS = path.join(__dirname, '..', 'assets', 'models');
const CLIPS = ['idle', 'move_up', 'move_down', 'swing', 'celebrate', 'lose'];
const SIDES = { left: 'era8-operative-left', right: 'era8-operative-right' };
// The Graphics Synthesizer's budget for one player: about 800 triangles.
const BUDGET = 900;

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

/** How many triangles a glTF's one mesh holds, from its index accessors. */
function triangles(j) {
  let n = 0;
  for (const mesh of j.meshes) {
    for (const prim of mesh.primitives) {
      assert.ok(prim.mode === undefined || prim.mode === 4, 'triangles, not strips');
      n += j.accessors[prim.indices].count / 3;
    }
  }
  return n;
}

for (const side of Object.keys(SIDES)) {
  const name = SIDES[side];

  test(`${name}.glb is a rigged glTF with the six clips and the pong extras`, () => {
    const j = glbJson(fs.readFileSync(path.join(MODELS, name + '.glb')));
    assert.strictEqual(j.asset.version, '2.0');
    assert.deepStrictEqual(j.animations.map((a) => a.name), CLIPS);
    assert.strictEqual(j.skins.length, 1, 'one skeleton');
    const skinned = j.nodes.filter((n) => n.skin !== undefined && n.mesh !== undefined);
    assert.strictEqual(skinned.length, 1, 'one skinned mesh');
    assert.ok(j.materials.some((m) => m.name === 'ink'), 'an ink material the game repaints');
    assert.ok(j.materials.some((m) => m.name === 'visor'), 'the operative wears a visor');
    const pong = j.scenes[j.scene || 0].extras.pong;
    assert.strictEqual(pong.format, 'pong-figure-1');
    assert.strictEqual(pong.name, name);
    assert.deepStrictEqual(pong.clips, CLIPS);
    assert.strictEqual(pong.ink, 'ink');
    assert.ok(/era8-players\.py/.test(pong.by), 'built by this era\'s own script');
    // the idle paddle hand, in file axes (x forward, y up, z toward the near edge):
    // in front of the figure, at hip height, on the near side -- the bat held low and ready
    assert.strictEqual(pong.hand.length, 3);
    assert.ok(pong.hand[0] > 0 && pong.hand[2] > 0, JSON.stringify(pong.hand));
    assert.ok(pong.hand[1] > 0.4 * pong.height && pong.hand[1] < 0.65 * pong.height, 'the hand at hip height');
    // the realism ladder's player: 250 table units tall, standing behind its end
    assert.ok(pong.height > 235 && pong.height < 265, `${pong.height} table units tall`);
    for (const a of j.animations) {
      const times = j.accessors[a.samplers[0].input];
      assert.ok(times.max[0] > 0 && times.max[0] < 3, `${a.name} runs ${times.max[0]} s`);
    }
  });

  test(`${name} is inside the PlayStation 2's triangle budget`, () => {
    const n = triangles(glbJson(fs.readFileSync(path.join(MODELS, name + '.glb'))));
    assert.ok(n > 500 && n <= BUDGET, `${n} triangles`);
  });

  test(`${name}.glb.js is the same bytes as ${name}.glb, as PongFigureFiles["${name}"]`, () => {
    const box = { globalThis: {} };
    box.globalThis = box;
    vm.runInNewContext(fs.readFileSync(path.join(MODELS, name + '.glb.js'), 'utf8'), box);
    const b64 = box.PongFigureFiles[name];
    assert.strictEqual(typeof b64, 'string');
    assert.ok(Buffer.from(b64, 'base64').equals(fs.readFileSync(path.join(MODELS, name + '.glb'))));
  });

  test(`${name} has a no-WebGL fallback of the same operative`, () => {
    const m = JSON.parse(fs.readFileSync(path.join(MODELS, name + '.json'), 'utf8'));
    assert.strictEqual(m.format, 'pong-model-1');
    assert.strictEqual(m.name, name);
    assert.strictEqual(m.slots[1], 'ink', 'the ink slot is the one the game repaints');
    assert.deepStrictEqual(Object.keys(m.beats).sort(), ['down', 'idle', 'miss', 'swing', 'up', 'win']);
    const n = m.beats.idle.length;
    for (const beat of Object.keys(m.beats)) {
      assert.strictEqual(m.beats[beat].length, n, `${beat} has the same vertices as idle`);
    }
    assert.strictEqual(m.colors.length, m.tris.length / 3);
    assert.ok(m.height > 235 && m.height < 265);
    const box = { globalThis: {} };
    box.globalThis = box;
    vm.runInNewContext(fs.readFileSync(path.join(MODELS, name + '.js'), 'utf8'), box);
    // the .js is loaded in its own realm, so its arrays are that realm's: compare the values
    assert.deepStrictEqual(Array.from(box.PongModelFiles[name].tris), m.tris);
  });
}

test('the two operatives are a pair, not one figure twice', () => {
  const j = {};
  const m = {};
  for (const side of Object.keys(SIDES)) {
    j[side] = glbJson(fs.readFileSync(path.join(MODELS, SIDES[side] + '.glb')));
    m[side] = JSON.parse(fs.readFileSync(path.join(MODELS, SIDES[side] + '.json'), 'utf8'));
  }
  // different gear, so different silhouettes: the midnight operative's comms
  // pack and collar against the slate one's thigh pouches
  assert.notStrictEqual(triangles(j.left), triangles(j.right), 'two different bodies');
  assert.notDeepStrictEqual(m.left.palette, m.right.palette, 'two different palettes');
  // the visor is each operative's brightest colour, and they are not the same one
  const visor = (p) => p.palette[p.slots.indexOf('visor')];
  assert.notStrictEqual(visor(m.left), visor(m.right));
  assert.strictEqual(visor(m.left), '#ffb020', 'amber on the left (docs/ART.md era 8)');
  assert.strictEqual(visor(m.right), '#5aa8ff', 'flare blue on the right');
  const suit = (p) => p.palette[p.slots.indexOf('suit')];
  assert.strictEqual(suit(m.left), '#141a2c', 'midnight');
  assert.strictEqual(suit(m.right), '#3c4654', 'slate');
});

test('era 8 names its own operatives and no sprite stand-in', () => {
  const own = C.ERAS[8];
  assert.deepStrictEqual(own.models, SIDES);
  assert.ok(!own.sheet && !own.sheets, 'the stand-in sheets have left this era');
  assert.strictEqual(own.modelScale, 1, 'the files are already 250 table units tall');
  assert.strictEqual(own.shading, 'specular', "the era's own render settings, kept");
  for (const side of ['left', 'right']) {
    const cfg = C.configFor(8, side);
    assert.strictEqual(cfg.model, SIDES[side], `the ${side} player wears its own operative`);
    assert.strictEqual(cfg.sheet, null);
    assert.ok(cfg.is3d);
    assert.deepStrictEqual(cfg.clip, { y0: 52, y1: 548 }, 'still clipped inside the letterbox');
  }
});
