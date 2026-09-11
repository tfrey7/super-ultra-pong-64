'use strict';
/*
 * Era 3's two players, drawn as text grids (item 1280): the Genesis block wears
 * the barbarian and the knight built from assets/spritegen/, each sheet the
 * game loads is exactly what its grid builds, the grids pass the Genesis
 * checker, and the six beats really move -- item 1272's proof figure had 9
 * distinct frames of 12 and poses that barely changed.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../src/characters.js');

const ROOT = path.join(__dirname, '..');
const IDS = ['era3-barbarian', 'era3-knight'];
const gridOf = (id) => path.join(ROOT, 'assets', 'spritegen', id + '.json');
const load = () => import('../tools/spritegen.mjs');
const snapper = () => import('../tools/palette-snap.mjs');

test('the Genesis block wears the two spritegen sheets, in item 1226\'s frame, hand and scale', () => {
  const left = C.configFor(3, 'left');
  const right = C.configFor(3, 'right');
  assert.strictEqual(left.sheet, 'era3-barbarian');
  assert.strictEqual(right.sheet, 'era3-knight');
  assert.deepStrictEqual(left.frame, { w: 20, h: 25 });
  assert.deepStrictEqual(left.hand, { x: 20, y: 13 });
  assert.strictEqual(left.scale, 3.2);
});

for (const id of IDS) {
  test(`${id}: the checker passes it -- 12 frames, all different, at most 15 Genesis colours`, async () => {
    const S = await load();
    const res = S.lint(S.load(gridOf(id)));
    assert.deepStrictEqual(res.faults, []);
    assert.strictEqual(res.nums.frames, 12);
    assert.strictEqual(res.nums.unique, 12, `${res.nums.unique} distinct frames of 12`);
    assert.ok(res.nums.colours <= 15, `${res.nums.colours} colours`);
  });

  test(`${id}: the sheet the game loads, and the one beside the grid, are exactly what the grid builds`, async () => {
    const S = await load();
    const P = await snapper();
    const img = S.buildSheet(S.load(gridOf(id)));
    assert.strictEqual(img.width, 60);
    assert.strictEqual(img.height, 150);
    for (const file of [`assets/spritegen/${id}.png`, `assets/pixellab/${id}.png`]) {
      const committed = P.decode(fs.readFileSync(path.join(ROOT, file)));
      assert.ok(Buffer.compare(committed.rgba, img.rgba) === 0,
        `${file} is stale: node tools/spritegen.mjs build assets/spritegen/${id}.json (--out ${file})`);
    }
  });

  test(`${id}: every beat moves -- each of its frames differs from idle0 by at least 20 pixels`, async () => {
    const S = await load();
    const frames = S.resolve(S.load(gridOf(id)));
    const base = frames.idle0;
    const diff = (g) => g.reduce((n, row, y) => n + row.filter((c, x) => c !== base[y][x]).length, 0);
    for (const [name, g] of Object.entries(frames)) {
      if (name === 'idle0') continue;
      assert.ok(diff(g) >= 20, `${name} differs from idle0 by only ${diff(g)} pixels`);
    }
  });
}
