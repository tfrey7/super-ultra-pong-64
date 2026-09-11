'use strict';
/*
 * Era 6 as 1996's flagship game that happens to be Pong (item 1230, docs/ART.md
 * Era 6): the penguin and the frog at the paddles, the toy park's flagpoles and
 * butterflies, the round power meters and the point's stars. Headless.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');
const T = require('../src/table3d.js');

const ROOT = path.join(__dirname, '..');
const ART = path.join(ROOT, 'assets', 'pixellab');
const { Pong, R } = eralooks.loadRenderer(ROOT);
const C = require('../src/characters.js');
const EMBED = require('../src/textures3d.js');

const look = R.eraLook(6);
const D = look.dressing;

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// ------------------------------------------------------------ the players
test('the penguin holds the player\'s paddle and the frog the computer\'s, drawn smoothed and fogged like the paddles', () => {
  const left = C.configFor(6, 'left'), right = C.configFor(6, 'right');
  assert.strictEqual(left.sheet, 'era6-penguin');
  assert.strictEqual(right.sheet, 'era6-frog');
  assert.deepStrictEqual(left.frame, { w: 32, h: 44 });
  assert.strictEqual(left.smooth, true, 'the N64 smoothed every texel');
  assert.strictEqual(left.fogCap, 0.35, 'fogged no more than the era fogs its paddles');
  assert.strictEqual(left.anchor.dz, 24, 'the hand at the paddle box\'s top');
  assert.strictEqual(left.is3d, true);
  for (const b of C.BEATS) assert.ok(left.frames[b] > 0, 'the sheet has ' + b);
});

test('each sheet is the rig\'s six rows at the block\'s frame size, embedded as a data: URI, with its manifest entry', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8'));
  const cfg = C.configFor(6, 'left');
  const cols = Math.max(...C.BEATS.map((b) => cfg.frames[b]));
  for (const name of D.SHEETS) {
    const file = path.join(ART, 'tex3d-' + name + '.png');
    assert.deepStrictEqual(pngSize(file), { w: cols * cfg.frame.w, h: C.BEATS.length * cfg.frame.h }, name);
    assert.ok(EMBED.TILES[name] && EMBED.TILES[name].startsWith('data:image/png;base64,'), name + ' is embedded');
    const entry = manifest.images.find((e) => e.file === 'tex3d-' + name + '.png');
    assert.ok(entry && entry.derivedFrom && entry.cost.generations === 0, name + ' is derived, and costs nothing');
    for (const src of entry.derivedFrom) {
      const from = manifest.images.find((e) => e.name === src);
      assert.ok(from && from.cost.generations === 1 && fs.existsSync(path.join(ART, from.file)), src + ' is a real generation');
    }
  }
});

test('era 6 spent at most 12 pixellab generations', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8'));
  const spent = manifest.images.filter((e) => /^(tex3d-)?era6-/.test(e.name))
    .reduce((n, e) => n + ((e.cost && e.cost.generations) || 0), 0);
  assert.ok(spent > 0 && spent <= 12, 'spent ' + spent);
});

test('no part of a figure reaches past its paddle\'s inner face: the hand is on the outer edge', () => {
  const cfg = C.configFor(6, 'left');
  const reach = (cfg.frame.w - cfg.hand.x) * cfg.scale;   // table units past the outer edge, toward the ball
  assert.ok(reach <= 14, 'reaches ' + reach + ' units, the paddle is 14 wide');
});

// ------------------------------------------------------------ the park
test('the flagpoles stand just beyond the end rails, where the bible puts them', () => {
  assert.deepStrictEqual(D.POLES.map((p) => [p.x, p.y]), [[-40, 150], [840, 150]]);
  assert.strictEqual(D.POLE.height, 90);
  assert.deepStrictEqual(D.POLE.pennant, { w: 30, h: 20 });
  assert.strictEqual(D.POLE.swing, 6);
  assert.strictEqual(D.POLE.rate, 1.5);
  const cam = T.camera(look.camera);
  for (const p of D.POLES) {
    const top = T.project(cam, p.x, p.y, D.POLE.height);
    assert.ok(top.x > 0 && top.x < 800 && top.y > 0, 'pole at ' + p.x + ' is on screen');
  }
});

test('three butterflies circle a 60-unit loop every 8 seconds, 4 units wide', () => {
  assert.strictEqual(D.BUTTERFLIES.at.length, 3);
  assert.strictEqual(D.BUTTERFLIES.loop * 2, 60);
  assert.strictEqual(D.BUTTERFLIES.period, 8);
  assert.strictEqual(D.BUTTERFLIES.wing, 4);
});

// ------------------------------------------------------------ the HUD
test('the power meter lights one of its 8 slices per rally hit, and stays in the HUD band (R8)', () => {
  assert.deepStrictEqual([0, 1, 3, 8, 12].map(D.meterLit), [0, 1, 3, 8, 8]);
  assert.strictEqual(D.METER.slices, 8);
  assert.strictEqual(D.METER.r, 14);
  const farY = T.project(T.camera(look.camera), 400, 0, 0).y;
  const bottom = 20 + 2.5 * 12 + D.METER.r + D.METER.outline;
  assert.ok(bottom < farY - 6, 'meter bottom ' + bottom + ' above the far edge ' + farY + ' less 6');
});

// ------------------------------------------------------------ the point
test('a point pops the stars from the scorer\'s paddle for 0.6 s: the side the ball did not go out past', () => {
  const g = Pong.createGame({ rng: () => 0.1, phase: 'playing', era: 6 });
  g.time = 20; g.eraChangedAt = 19.8; g.missAt = { x: 0, y: 300 };
  assert.deepStrictEqual(D.starsAt(g), { side: 'right', age: g.time - 19.8 });
  g.missAt = { x: 800, y: 300 };
  assert.strictEqual(D.starsAt(g).side, 'left');
  g.time = 20.3;
  assert.ok(D.starsAt(g), 'still flying half a second after the point');
  g.time = 19.8 + D.STARS.life + 0.01;
  assert.strictEqual(D.starsAt(g), null);
  assert.strictEqual(D.STARS.n, 5);
});
