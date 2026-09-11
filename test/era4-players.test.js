// Era 4's two hover pilots (item 1227, redrawn as spritegen grids by item
// 1281): the rig block and the sheets it names.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const C = require('../src/characters.js');

function pngSize(name) {
  const buf = fs.readFileSync(path.join(ROOT, 'assets', 'pixellab', name + '.png'));
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test('era 4: two different pilots, each sheet 3 frames by the six beats at the block\'s frame size', () => {
  const left = C.configFor(4, 'left');
  const right = C.configFor(4, 'right');
  assert.strictEqual(left.sheet, 'era4-pilot-red');
  assert.strictEqual(right.sheet, 'era4-pilot-blue');
  for (const cfg of [left, right]) {
    const size = pngSize(cfg.sheet);
    assert.deepStrictEqual(size, { w: 3 * cfg.frame.w, h: C.BEATS.length * cfg.frame.h }, cfg.sheet);
    for (const beat of C.BEATS) assert.ok(cfg.frames[beat] >= 1 && cfg.frames[beat] <= 3, cfg.sheet + ' ' + beat);
  }
  assert.strictEqual(left.fps, 12, 'quick and bouncy, as the bible gives it');
  assert.strictEqual(left.frames.miss, 2, 'the conceding pad blinks: there, then gone');
});

test('era 4: the glove is on the frame\'s edge, so the pilot stands behind its paddle and never over play', () => {
  const cfg = C.configFor(4);
  assert.strictEqual(cfg.hand.x, cfg.frame.w, 'hand on the right-hand edge');
  const box = C.frameBox({ x: 32, y: 300, scale: cfg.scale, mirror: 1 }, cfg);
  assert.ok(Math.abs(box.x + box.w) < 1e-9, 'the frame ends at the paddle\'s outer face');
  assert.ok(box.w <= 40, 'at most a few units past the wall: ' + box.w);
  assert.ok(box.h >= 1.3 * 84, 'taller than the paddle by a head and more: ' + box.h);
});

test('era 4 (item 1281): each sheet is its spritegen grid, built, on the Super Nintendo\'s rules, and every beat moves', async () => {
  const S = await import('../tools/spritegen.mjs');
  const P = await import('../tools/palette-snap.mjs');
  for (const [side, id] of [['left', 'era4-pilot-red'], ['right', 'era4-pilot-blue']]) {
    const cfg = C.configFor(4, side);
    const doc = S.load(path.join(ROOT, 'assets', 'spritegen', id + '.json'));
    const res = S.lint(doc);
    assert.deepStrictEqual(res.faults, [], id);
    assert.ok(res.nums.colours <= 15, id + ': one OBJ palette');
    assert.deepStrictEqual(doc.frame, cfg.frame, id + ': the block cuts the grid\'s frame');
    assert.deepStrictEqual(doc.hand, cfg.hand, id + ': the block holds the grid\'s hand');
    assert.deepStrictEqual(doc.beats, cfg.frames, id + ': the block plays the grid\'s beats');
    const built = S.buildSheet(doc);
    for (const dir of ['pixellab', 'spritegen']) {
      const png = P.decode(fs.readFileSync(path.join(ROOT, 'assets', dir, id + '.png')));
      assert.ok(Buffer.compare(png.rgba, built.rgba) === 0, `assets/${dir}/${id}.png is stale: node assets/spritegen/era4-pilots-compose.mjs`);
    }
    // real movement: every beat but idle differs from idle0 by a good many pixels
    const f = S.resolve(doc);
    const diff = (a, b) => a.flat().filter((c, i) => c !== b.flat()[i]).length;
    for (const n of ['idle1', 'up0', 'down0', 'swing0', 'swing1', 'swing2', 'miss0', 'win0']) {
      assert.ok(diff(f[n], f.idle0) >= 20, `${id} ${n} moves ${diff(f[n], f.idle0)} pixels from idle0`);
    }
    assert.strictEqual(res.nums.unique, res.nums.frames, id + ': no frame repeats another');
  }
  // the two pilots are one drawing in two palettes
  const red = S.load(path.join(ROOT, 'assets', 'spritegen', 'era4-pilot-red.json'));
  const blue = S.load(path.join(ROOT, 'assets', 'spritegen', 'era4-pilot-blue.json'));
  assert.deepStrictEqual(blue.frames, red.frames);
});

test('the checker holds a Super Nintendo figure to its share of the 34 OBJ tiles a line', async () => {
  const S = await import('../tools/spritegen.mjs');
  const w = 8 * 13;
  const doc = S.blank({ id: 't', era: 4, frame: { w, h: 2 }, prompt: '' });
  doc.frames.idle0 = ['k'.repeat(w), 'k'.repeat(w)];
  assert.ok(S.lint(doc).faults.some((f) => /lights 13 OBJ tiles/.test(f)), 'a 13-tile line is a fault');
  doc.frame.w = 8 * 12;
  doc.frames = S.blank({ id: 't', era: 4, frame: { w: 96, h: 2 }, prompt: '' }).frames;
  doc.frames.idle0 = ['k'.repeat(96), 'k'.repeat(96)];
  assert.ok(!S.lint(doc).faults.some((f) => /OBJ tiles/.test(f)), 'twelve tiles a line is allowed');
});
