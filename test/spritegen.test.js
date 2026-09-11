'use strict';
/*
 * tools/spritegen.mjs, the EarthBound-style sprite generator (item 1272): the
 * grid file is the artifact, so the committed sheet must be exactly what its
 * grid builds, and the checker must catch what a 2D machine could not draw.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const GRID = path.join(ROOT, 'assets', 'spritegen', 'era3-barbarian.json');
const load = () => import('../tools/spritegen.mjs');
const snapper = () => import('../tools/palette-snap.mjs');

test('the barbarian grid passes the checker: 12 frames, Genesis colours, one palette', async () => {
  const S = await load();
  const doc = S.load(GRID);
  const res = S.lint(doc);
  assert.deepStrictEqual(res.faults, []);
  assert.strictEqual(res.nums.frames, 12);
  assert.ok(res.nums.colours <= 15, `${res.nums.colours} colours`);
});

test('the committed sheet is exactly what the grid builds, at native resolution', async () => {
  const S = await load();
  const P = await snapper();
  const img = S.buildSheet(S.load(GRID));
  assert.strictEqual(img.width, 60);
  assert.strictEqual(img.height, 150);
  const lv = new Set(P.levels(3));
  for (let i = 0; i < img.rgba.length; i += 4) {
    if (!img.rgba[i + 3]) continue;
    for (let c = 0; c < 3; c++) assert.ok(lv.has(img.rgba[i + c]), `channel ${img.rgba[i + c]} is off the Genesis grid`);
  }
  const committed = P.decode(fs.readFileSync(GRID.replace(/\.json$/, '.png')));
  assert.ok(Buffer.compare(committed.rgba, img.rgba) === 0, 'assets/spritegen/era3-barbarian.png is stale: node tools/spritegen.mjs build assets/spritegen/era3-barbarian.json');
});

test('the checker names an off-grid colour, too many colours and feet off the floor', async () => {
  const S = await load();
  const doc = S.blank({ id: 't', era: 3, frame: { w: 4, h: 4 }, prompt: '' });
  doc.palette = { k: '#000000', a: '#123456' };
  doc.frames.idle0 = ['.kk.', '.aa.', '.kk.', '.kk.'];
  doc.frames.up0 = { from: 'idle0', dy: -2 };
  const res = S.lint(doc);
  assert.ok(res.faults.some((f) => /off the Sega Genesis/.test(f)), res.faults.join('\n'));
  assert.ok(res.faults.some((f) => /lowest row must agree/.test(f)), res.faults.join('\n'));
  const many = S.blank({ id: 'm', era: 3, frame: { w: 16, h: 1 }, prompt: '' });
  many.palette = {};
  const row = [];
  for (let i = 0; i < 16; i++) { const k = 'abcdefghijmnopqr'[i]; many.palette[k] = '#' + ['00', '24', '49', '6d'][i % 4] + ['00', '24', '49', '6d'][i >> 2] + '00'; row.push(k); }
  many.frames.idle0 = [row.join('')];
  assert.ok(S.lint(many).faults.some((f) => /16 colours used/.test(f)));
});

test('relations: a shift, a mirror and a patch that keeps what is under "_"', async () => {
  const S = await load();
  const doc = S.blank({ id: 'r', era: 3, frame: { w: 3, h: 2 }, prompt: '' });
  doc.palette = { k: '#000000', a: '#ffffff' };
  doc.frames.idle0 = ['ka.', '...'];
  doc.frames.idle1 = { from: 'idle0', dy: 1, mirror: true, patch: { 0: '_a_' } };
  const f = S.resolve(doc);
  assert.deepStrictEqual(f.idle1.map((r) => r.join('')), ['.a.', '.ak']);
});

test('the grid file is written one row per line, and reads back the same', async () => {
  const S = await load();
  const doc = S.load(GRID);
  const text = S.stringify(doc);
  assert.deepStrictEqual(JSON.parse(text), doc);
  assert.ok(text.includes('\n      "....kk..........kk..",\n'));
});
