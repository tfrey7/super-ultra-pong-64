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

test('the Genesis block wears the two spritegen sheets, in item 1226\'s frame and hand, at item 1300\'s scale', () => {
  const left = C.configFor(3, 'left');
  const right = C.configFor(3, 'right');
  assert.strictEqual(left.sheet, 'era3-barbarian');
  assert.strictEqual(right.sheet, 'era3-knight');
  assert.deepStrictEqual(left.frame, { w: 20, h: 25 });
  assert.deepStrictEqual(left.hand, { x: 20, y: 13 });
  assert.strictEqual(left.scale, 1.6);
});

/*
 * Item 1300: both figures whole on screen. At item 1226's scale (3.2) each
 * figure was 64 units wide with its fist at the paddle's outer face, 32 units
 * from the wall, so half of it hung off the screen. This draws the box of the
 * opaque pixels of every frame of every beat, for both sides, with the paddle
 * at the top wall, in the middle and at the bottom wall, through the rig's own
 * anchorOf and frameBox, and holds it inside the 800 x 600 playfield.
 */
const Pong = require('../src/game.js');
const EPS = 1e-9;

/** The opaque pixels of one frame of a sheet: { x0, y0, x1, y1 }, x1/y1 exclusive. */
function opaqueBox(img, fx, fy, fw, fh) {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      if (img.rgba[((fy + y) * img.width + fx + x) * 4 + 3] === 0) continue;
      b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x + 1);
      b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y + 1);
    }
  }
  return b;
}

/** Where that frame's opaque pixels land on the field, drawn for one side. */
function drawnBox(state, side, cfg, px) {
  const a = C.anchorOf(state, side, cfg, null, null);
  const box = C.frameBox(a, cfg);
  const lo = box.x + px.x0 * a.scale, hi = box.x + px.x1 * a.scale;
  const [x0, x1] = a.mirror > 0 ? [a.x + lo, a.x + hi] : [a.x - hi, a.x - lo];
  return { x0, x1, y0: a.y + box.y + px.y0 * a.scale, y1: a.y + box.y + px.y1 * a.scale };
}

test('era 3: every beat of both figures lies inside the playfield, the paddle at the top, the middle and the bottom', async () => {
  const P = await snapper();
  const g = Pong.createGame({ era: 3, phase: 'playing' });
  const W = g.width, H = g.height;
  let checked = 0;
  for (const side of ['left', 'right']) {
    const cfg = C.configFor(3, side);
    const img = P.decode(fs.readFileSync(path.join(ROOT, 'assets', 'pixellab', cfg.sheet + '.png')));
    for (const y of [0, (H - g[side].h) / 2, H - g[side].h]) {
      const state = Object.assign({}, g, { [side]: Object.assign({}, g[side], { y }) });
      C.BEATS.forEach((beat, row) => {
        for (let i = 0; i < cfg.frames[beat]; i++) {
          const px = opaqueBox(img, i * cfg.frame.w, row * cfg.frame.h, cfg.frame.w, cfg.frame.h);
          assert.ok(px.x1 > px.x0, `${cfg.sheet} ${beat}${i} has no pixels`);
          const d = drawnBox(state, side, cfg, px);
          const where = `${side} ${beat}${i}, paddle y ${y}: x ${d.x0.toFixed(1)}..${d.x1.toFixed(1)}, y ${d.y0.toFixed(1)}..${d.y1.toFixed(1)}`;
          assert.ok(d.x0 >= -EPS && d.x1 <= W + EPS, `off the side of the screen -- ${where}`);
          assert.ok(d.y0 >= -EPS && d.y1 <= H + EPS, `off the top or bottom -- ${where}`);
          checked++;
        }
      });
    }
  }
  assert.strictEqual(checked, 2 * 3 * 12);
});

test('era 3: each fist is still on its bat -- the grip at the paddle\'s outer face, level with its middle, and the holding frames have a fist there', async () => {
  const P = await snapper();
  const g = Pong.createGame({ era: 3, phase: 'playing' });
  for (const side of ['left', 'right']) {
    const cfg = C.configFor(3, side);
    const p = g[side];
    const a = C.anchorOf(g, side, cfg, null, null);
    // item 1267's handle comes off the outer face's middle: the left paddle's x, the right's x + w
    assert.strictEqual(a.x, side === 'left' ? p.x : p.x + p.w, `${side} grip x`);
    assert.strictEqual(a.y, p.y + p.h / 2, `${side} grip y`);
    const img = P.decode(fs.readFileSync(path.join(ROOT, 'assets', 'pixellab', cfg.sheet + '.png')));
    const alpha = (row, i, x, y) => img.rgba[((row * cfg.frame.h + y) * img.width + i * cfg.frame.w + x) * 4 + 3];
    for (const beat of ['idle', 'up', 'down']) {
      const row = C.BEATS.indexOf(beat);
      for (let i = 0; i < cfg.frames[beat]; i++) {
        const hx = cfg.hand.x - 1;
        assert.ok(alpha(row, i, hx, cfg.hand.y - 1) > 0 || alpha(row, i, hx, cfg.hand.y) > 0,
          `${cfg.sheet} ${beat}${i}: no fist at the hand point`);
      }
    }
  }
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
