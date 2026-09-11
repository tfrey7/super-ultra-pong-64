// Era 4's two hover pilots (item 1227): the rig block and the sheets it names.
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
  assert.strictEqual(left.sheet, 'era4-players-left');
  assert.strictEqual(right.sheet, 'era4-players-right');
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
