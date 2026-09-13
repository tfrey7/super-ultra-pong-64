// Era 10's two players (item 1258): the Xbox 360 rung's soldiers, built by
// tools/blender/era10-players.py to the contract in tools/blender/README.md.
// This pins what the page depends on -- two real glTF figures with the six
// clips, inside the machine's triangle budget, each carrying the ink material
// the game repaints in its paddle's colour, and named by the era's own block,
// one per side, so the rung's two ends are two different characters.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../src/characters.js');

const MODELS = path.join(__dirname, '..', 'assets', 'models');
const CLIPS = ['idle', 'move_up', 'move_down', 'swing', 'celebrate', 'lose'];
const PAIR = { left: 'era10-vanguard', right: 'era10-ranger' };
const BUDGET = 1300;            // the Xbox 360's, as the card sets it: about 1200 a figure

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
  for (const mesh of j.meshes) for (const p of mesh.primitives) tris += j.accessors[p.indices].count / 3;
  return tris;
}

test('era 10 names its own two figures, one a side, and no sprite stand-in', () => {
  for (const side of ['left', 'right']) {
    const cfg = C.configFor(10, side);
    assert.strictEqual(cfg.figure, PAIR[side], side + ' wears its own figure');
    assert.strictEqual(cfg.model, cfg.figure, side + ': the canvas fallback wears the same name');
    assert.strictEqual(cfg.sheet, null, side + ' names no sprite sheet any more');
  }
  assert.notStrictEqual(PAIR.left, PAIR.right, 'the two ends are two characters');
});

for (const side of ['left', 'right']) {
  const name = PAIR[side];
  test(`${name}.glb is a rigged glTF with the six clips, inside the 360's budget`, () => {
    const buf = fs.readFileSync(path.join(MODELS, name + '.glb'));
    const j = glbJson(buf);
    assert.strictEqual(j.asset.version, '2.0');
    assert.deepStrictEqual(j.animations.map((a) => a.name), CLIPS);
    assert.strictEqual(j.skins.length, 1, 'one skeleton');
    assert.strictEqual(j.nodes.filter((n) => n.skin !== undefined && n.mesh !== undefined).length, 1, 'one skinned mesh');
    assert.ok(j.materials.some((m) => m.name === 'ink'), 'an ink material the game repaints');
    const tris = triangles(j);
    assert.ok(tris > 500 && tris <= BUDGET, name + ' is ' + tris + ' triangles, the budget is ' + BUDGET);
    const pong = j.scenes[j.scene || 0].extras.pong;
    assert.strictEqual(pong.format, 'pong-figure-1');
    assert.strictEqual(pong.name, name);
    assert.deepStrictEqual(pong.clips, CLIPS);
    // the idle paddle hand in file axes (x forward, y up, z toward the near edge)
    assert.ok(pong.hand[0] > 0 && pong.hand[1] > 20 && pong.hand[1] < pong.height && pong.hand[2] > 0, JSON.stringify(pong));
    assert.ok(pong.height > 80 && pong.height < 120, name + ' stands ' + pong.height + ' table units tall');
    for (const a of j.animations) {
      const times = j.accessors[a.samplers[0].input];
      assert.ok(times.max[0] > 0 && times.max[0] < 3, `${a.name} runs ${times.max[0]} s`);
    }
  });

  test(`${name}.glb.js is the same bytes as ${name}.glb`, () => {
    const box = { globalThis: {} };
    box.globalThis = box;
    vm.runInNewContext(fs.readFileSync(path.join(MODELS, name + '.glb.js'), 'utf8'), box);
    assert.ok(Buffer.from(box.PongFigureFiles[name], 'base64').equals(fs.readFileSync(path.join(MODELS, name + '.glb'))));
  });

  test(`${name}.json is the canvas fallback's copy of the same soldier`, () => {
    const m = JSON.parse(fs.readFileSync(path.join(MODELS, name + '.json'), 'utf8'));
    assert.strictEqual(m.format, 'pong-model-1');
    assert.strictEqual(m.name, name);
    assert.ok(m.slots.includes('ink'), 'the slot the game repaints');
    assert.strictEqual(m.slots.length, m.palette.length);
    assert.strictEqual(m.colors.length, m.tris.length / 3);
    assert.ok(m.colors.length <= BUDGET, name + ' fallback is ' + m.colors.length + ' triangles');
    const n = m.beats.idle.length;
    for (const beat of ['idle', 'up', 'down', 'swing', 'miss', 'win'])
      assert.strictEqual(m.beats[beat].length, n, beat + ' has the same vertices as idle, so the game can blend them');
  });
}

test("the two soldiers do not look alike: different builds, different gear, different colours", () => {
  const [l, r] = ['left', 'right'].map((s) => JSON.parse(fs.readFileSync(path.join(MODELS, PAIR[s] + '.json'), 'utf8')));
  assert.notStrictEqual(l.height, r.height, 'one stands taller than the other');
  assert.notStrictEqual(l.colors.length, r.colors.length, 'they are not the same mesh');
  assert.deepStrictEqual(l.palette.filter((c, i) => c === r.palette[i]), ['#c0c0c0'],
    'only the ink they share, and the game repaints that anyway');
});
