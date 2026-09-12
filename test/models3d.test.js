'use strict';
/*
 * Polygon players on the 3D table (src/models3d.js, item 1248): the loader
 * reads what tools/blender/player-proof.py exports and refuses what it should,
 * the sort is far to near, the keyframe blend runs over each beat's time, all
 * six shading modes draw, and eras 5 to 10 draw both players as models at
 * their paddles through src/characters.js.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Pong = require('../src/game.js');
require('../src/render.js');
const T = require('../src/table3d.js');
const M = require('../src/models3d.js');
const C = require('../src/characters.js');

const ROOT = path.join(__dirname, '..');
const R = require('../tools/eralooks.js').loadRenderer(ROOT).R;
const MODELS = path.join(ROOT, 'assets', 'models');

function recorder() {
  const calls = [];
  return new Proxy({ calls }, {
    get(t, k) { if (k in t) return t[k]; return (...args) => { calls.push([k, args]); }; },
    set(t, k, v) { if (k === 'fillStyle' || k === 'strokeStyle' || k === 'globalCompositeOperation') calls.push(['set:' + k, [v]]); t[k] = v; return true; }
  });
}

function playing(era) {
  let n = 0;
  const g = Pong.createGame({ era, phase: 'playing', rng: () => ((n++ * 0.37) % 1) });
  g.serveDelay = 0;
  return g;
}

/** A one-tetrahedron model, wound as the caller says. */
function tetra(inside) {
  const tris = inside ? [0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2] : [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3];
  const idle = [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10];
  return { format: 'pong-model-1', name: 'tetra', palette: ['#808080', '#ff0000'], slots: ['skin', 'ink'],
    tris, colors: [0, 1, 0, 1], hand: [0, 0, 0], height: 10,
    beats: { idle, up: idle.map((v, i) => (i === 11 ? 20 : v)) } };
}

// ------------------------------------------------------------------ loader
test('the three proof models load, each with its six beats and a budget that climbs', () => {
  const counts = {};
  for (const d of ['lo', 'mid', 'hi']) {
    const m = M.loadFile(path.join(MODELS, 'player-proof-' + d + '.json'));
    assert.strictEqual(m.name, 'player-proof-' + d);
    for (const b of M.BEATS) assert.strictEqual(m.beats[b].length, m.count * 3, d + ' ' + b);
    assert.strictEqual(m.colors.length, m.triangles);
    assert.ok(M.signedVolume(m, m.beats.idle) > 0, d + ' is wound outward');
    assert.ok(m.hand[2] > 20 && m.hand[2] < 50, d + ' hand at paddle height');
    counts[d] = m.triangles;
  }
  assert.ok(counts.lo >= 150 && counts.lo <= 300, 'PlayStation budget: ' + counts.lo);
  assert.ok(counts.hi >= 900 && counts.hi <= 1300, 'Xbox 360 budget: ' + counts.hi);
  assert.ok(counts.lo < counts.mid && counts.mid < counts.hi);
});

test('the .js beside each .json carries the same data, for a page opened off disk', () => {
  for (const d of ['lo', 'mid', 'hi']) {
    const name = 'player-proof-' + d;
    const json = JSON.parse(fs.readFileSync(path.join(MODELS, name + '.json'), 'utf8'));
    const sandbox = {};
    new Function('globalThis', fs.readFileSync(path.join(MODELS, name + '.js'), 'utf8'))(sandbox);
    assert.deepStrictEqual(sandbox.PongModelFiles[name], json, name);
  }
});

test('the loader refuses a broken file with a sentence, and turns an inside-out mesh the right way', () => {
  assert.throws(() => M.parse({ format: 'obj' }), /pong-model-1/);
  assert.throws(() => M.parse(Object.assign(tetra(), { tris: [0, 1] })), /whole triangles/);
  assert.throws(() => M.parse(Object.assign(tetra(), { colors: [0] })), /one palette slot/);
  assert.throws(() => M.parse(Object.assign(tetra(), { tris: [0, 1, 9, 0, 1, 2, 0, 1, 2, 0, 1, 2] })), /vertex 9/);
  const bad = tetra();
  bad.beats.up = [0, 0, 0];
  assert.throws(() => M.parse(bad), /beat up/);
  assert.ok(M.signedVolume(M.parse(tetra(false)), tetra().beats.idle) > 0);
  assert.ok(M.signedVolume(M.parse(tetra(true)), tetra().beats.idle) > 0, 'inside-out rewound');
  // A beat the file leaves out is its idle.
  const m = M.parse(tetra());
  assert.deepStrictEqual(Array.from(m.beats.win), Array.from(m.beats.idle));
});

test('get() finds a model a page script has put on PongModelFiles, and refuses odd names', () => {
  globalThis.PongModelFiles = { 'test-tetra': tetra() };
  try {
    assert.strictEqual(M.get('../etc'), null);
    const m = M.get('test-tetra');
    assert.ok(m && m.triangles === 4);
    assert.strictEqual(M.get('test-tetra'), m, 'parsed once');
  } finally { delete globalThis.PongModelFiles; }
});

// ------------------------------------------------------------------- blend
test('keyframes: a swing goes out and back over its beat, a miss eases in and holds, moving follows speed', () => {
  assert.deepStrictEqual(M.keyframes('swing', 0, 0, 0), { from: 'idle', to: 'swing', t: 0 });
  assert.ok(Math.abs(M.keyframes('swing', M.SWING_S / 2, 0, 0).t - 1) < 1e-9, 'full swing half way');
  assert.ok(M.keyframes('swing', M.SWING_S, 0, 0).t < 1e-9, 'back at idle when the beat ends');
  assert.ok(M.keyframes('miss', 0.05, 0, 0).t < 1);
  assert.strictEqual(M.keyframes('miss', 1, 0, 0).t, 1);
  assert.strictEqual(M.keyframes('win', 1, 0, 0).to, 'win');
  const slow = M.keyframes('up', 0, -80, 0), fast = M.keyframes('up', 0, -600, 0);
  assert.ok(slow.t < fast.t && fast.t === 1);
  const idle = M.keyframes('idle', 0, 0, 1.3);
  assert.ok(idle.t > 0 && idle.t <= 0.1, 'idle only breathes');
});

test('blend mixes two beats vertex by vertex and reuses the array it is handed', () => {
  const m = M.parse(tetra());
  const half = M.blend(m, 'idle', 'up', 0.5);
  assert.strictEqual(half[11], 15);
  assert.strictEqual(half[3], 10);
  const again = M.blend(m, 'idle', 'up', 1, half);
  assert.strictEqual(again, half);
  assert.strictEqual(again[11], 20);
  assert.strictEqual(M.blend(m, 'idle', 'up', 7)[11], 20, 'clamped');
});

// -------------------------------------------------------------------- sort
test('the sort is far to near, and equal depths keep their order', () => {
  const items = [{ depth: 5, id: 'a' }, { depth: 9, id: 'b' }, { depth: 5, id: 'c' }, { depth: 1, id: 'd' }];
  assert.deepStrictEqual(M.sortItems(items).map((i) => i.id), ['b', 'a', 'c', 'd']);
});

test('a scene sorts figures, slabs and the ball together; the ball joins only where it overlaps', () => {
  const m = M.loadFile(path.join(MODELS, 'player-proof-lo.json'));
  const cam = T.camera(R.eraLook(5).camera);
  const g = playing(5);
  const fig = { model: m, pose: m.beats.idle, mirror: 1, scale: 1.8, ink: '#ff8000', group: 0,
    anchor: { x: g.left.x - 2.5, y: g.left.y + g.left.h / 2, z: m.hand[2] * 1.8 } };
  fig.world = M.place(m, fig.pose, fig.anchor, 1, 1.8);
  const slabs = [{ rect: { x: g.left.x, y: g.left.y, w: g.left.w, h: g.left.h }, ink: '#ff8000', group: 0 }];
  const hand = T.project(cam, fig.anchor.x, fig.anchor.y, fig.anchor.z);
  const near = { x: hand.x, y: hand.y, r: 4, depth: hand.depth - 1000 };
  const items = M.buildScene({ figures: [fig], slabs, ball: near }, cam, T, 'flat', { slabZ: 67 });
  for (let i = 1; i < items.length; i++) assert.ok(items[i - 1].depth >= items[i].depth, 'far to near at ' + i);
  assert.ok(items.some((i) => i.kind === 'slab'), 'the slab is in the list');
  assert.strictEqual(items[items.length - 1].kind, 'ball', 'a ball nearer than everything is drawn last');
  assert.ok(items.filter((i) => i.kind === 'tri').length < m.triangles, 'back faces dropped');
  const away = M.buildScene({ figures: [fig], slabs, ball: { x: -5000, y: -5000, r: 4, depth: 0 } }, cam, T, 'flat', {});
  assert.ok(!away.some((i) => i.kind === 'ball'), 'a ball nowhere near is left to the era');
  // The placed hand is the anchor, and the feet stand on the floor.
  let lowest = Infinity;
  for (let i = 2; i < fig.world.length; i += 3) lowest = Math.min(lowest, fig.world[i]);
  assert.ok(Math.abs(lowest) < 1, 'feet on the table: ' + lowest);
});

test('the right-hand figure is the left one mirrored in x, and still faces its camera', () => {
  const m = M.loadFile(path.join(MODELS, 'player-proof-lo.json'));
  const a = { x: 700, y: 300, z: m.hand[2] };
  const L = M.place(m, m.beats.idle, a, 1, 1), Rr = M.place(m, m.beats.idle, a, -1, 1);
  for (let i = 0; i < L.length; i += 3) {
    assert.ok(Math.abs((L[i] - a.x) + (Rr[i] - a.x)) < 1e-3);
    assert.strictEqual(L[i + 1], Rr[i + 1]);
  }
  const cam = T.camera(R.eraLook(5).camera);
  const count = (mirror, world) => M.figureItems({ model: m, world, mirror, group: 0 }, cam, T, 'flat', {}, []).length;
  const l = count(1, L), r = count(-1, Rr);
  assert.ok(l > m.triangles * 0.3 && r > m.triangles * 0.3, 'both show their front: ' + l + ', ' + r);
});

// ------------------------------------------------------------------ shading
test('each of the six shading modes draws, and each has its own mark', () => {
  const m = M.loadFile(path.join(MODELS, 'player-proof-mid.json'));
  const g = playing(6);
  const marks = {};
  for (const mode of M.MODES) {
    const cam = T.camera(R.eraLook(mode === 'cel' ? 7 : 6).camera);
    const ctx = recorder();
    const figs = [{ model: m, pose: m.beats.idle, mirror: 1, scale: 1.8, ink: '#3060ff', group: 0,
      rect: { x: g.left.x, y: g.left.y, w: g.left.w, h: g.left.h },
      anchor: { x: g.left.x - 2.5, y: g.left.y + g.left.h / 2, z: m.hand[2] * 1.8 } }];
    const n = M.drawScene(ctx, T, cam, figs, { mode, fog: mode === 'gouraud' ? R.eraLook(6).fog : null,
      outline: cam.outline || { width: 3, colour: '#111111' }, slabZ: 67 });
    assert.ok(n > 100, mode + ' drew ' + n + ' items');
    const fills = ctx.calls.filter(([k]) => k === 'fill').length;
    const strokes = ctx.calls.filter(([k]) => k === 'stroke').length;
    const lighter = ctx.calls.some(([k, a]) => k === 'set:globalCompositeOperation' && a[0] === 'lighter');
    const arcs = ctx.calls.filter(([k]) => k === 'arc').length;
    const colours = new Set(ctx.calls.filter(([k]) => k === 'set:fillStyle').map(([, a]) => String(a[0])));
    marks[mode] = { fills, strokes, lighter, arcs, colours: colours.size };
    assert.ok(fills >= n, mode + ': a fill an item');
  }
  assert.strictEqual(marks.flat.strokes, 0, 'PlayStation: hard-edged, no strokes');
  assert.ok(marks.gouraud.strokes > 100, 'N64: soft edges, every triangle stroked in its own colour');
  assert.ok(marks.cel.strokes > 100, 'Dreamcast: the ink outline pass');
  assert.ok(marks.cel.colours < marks.specular.colours, 'Dreamcast: two bands, fewer tones than the PS2');
  assert.ok(marks.vertex.arcs >= 1, 'Xbox: the hard shadow blob');
  assert.ok(marks.hd.lighter, 'Xbox 360: the highlights glow with lighter');
  assert.ok(!marks.specular.lighter && !marks.flat.lighter);
});

test('light(): the PS2 has a highlight, the cel look only two bands, the Xbox sheen is on metal only', () => {
  const up = [0, 0, 1], view = [0, 0.5, 0.866];
  assert.ok(M.light('specular', up, view).spec > 0);
  const bands = new Set();
  for (let a = 0; a < Math.PI; a += 0.05) bands.add(M.light('cel', [Math.cos(a), 0, Math.sin(a)], view).lum);
  assert.strictEqual(bands.size, 2);
  // Facing the highlight head on, metal shines harder than cloth.
  const h = [M.KEY[0] + view[0], M.KEY[1] + view[1], M.KEY[2] + view[2]];
  const l = Math.hypot(h[0], h[1], h[2]);
  const mirror = h.map((v) => v / l);
  assert.ok(M.light('vertex', mirror, view, true).spec > M.light('vertex', mirror, view, false).spec);
  assert.ok(M.light('hd', [0, -1, 0], view).rim > 0, 'the 360 rim light at a grazing face');
});

test('fillFor: fog pulls a colour toward the fog, and the PlayStation dithers between two levels', () => {
  const lit = { lum: 0.8, spec: 0, rim: 0 };
  const clear = M.fillFor('gouraud', [200, 40, 40], lit, null, T);
  const fogged = M.fillFor('gouraud', [200, 40, 40], lit, { colour: [185, 212, 236], amount: 0.6 }, T);
  assert.notStrictEqual(clear, fogged);
  assert.ok(parseInt(fogged.slice(5, 7), 16) > parseInt(clear.slice(5, 7), 16), 'bluer under the N64 fog');
  const seen = [];
  const fakeT = { ditherTile: (a, b, level) => { seen.push([a, b, level]); return 'pattern'; } };
  const x = 0.4 + 0.75 * 2.5 / 5;                // exactly between levels 2 and 3
  assert.strictEqual(M.fillFor('flat', [200, 200, 200], { lum: x, spec: 0, rim: 0 }, null, fakeT), 'pattern');
  assert.strictEqual(seen.length, 1);
  assert.notStrictEqual(seen[0][0], seen[0][1]);
});

// --------------------------------------------------------- through the rig
test('eras 5 to 10 name a shading of their own and never the proof figure; eras 1 to 4 keep their sprites', () => {
  const modes = new Set();
  for (let e = 1; e <= 10; e++) {
    const c = C.configFor(e);
    if (e < 5) { assert.ok(!c.model, 'era ' + e + ' stays a sprite'); continue; }
    // Item 1283: no era wears the PROOF figure -- an era whose own model card has
    // landed (1253 on) names its own files, one a side, and any other names none.
    for (const side of ['left', 'right']) {
      const s = C.configFor(e, side);
      const own = s.figure || s.model;
      assert.ok(!/^player-proof/.test(own || ''), 'era ' + e + ' ' + side + ' does not reuse the proof figure: ' + own);
    }
    assert.ok(M.MODES.includes(c.shading), 'era ' + e + ' shading ' + c.shading);
    modes.add(c.shading);
  }
  assert.strictEqual(modes.size, 6, 'one mode an era');
});

test('item 1283: each 3D era wears its own pair, twelve different figures across the six', () => {
  const names = new Set();
  for (let e = 5; e <= 10; e++) {
    // An era's pair is its own models once its model card has landed (item 1253
    // on), and its stand-in sheets until then; either way the two sides differ.
    const of = (side) => { const c = C.configFor(e, side); return c.figure || c.model || c.sheet; };
    const l = of('left'), r = of('right');
    assert.ok(l && r && l !== r, 'era ' + e + ' has two different figures: ' + l + ' / ' + r);
    names.add(l); names.add(r);
  }
  assert.strictEqual(names.size, 12);
});

test('item 1283: with the proof models loaded but not asked for, every 3D era draws its stand-ins', () => {
  for (const d of ['lo', 'mid', 'hi']) M.loadFile(path.join(MODELS, 'player-proof-' + d + '.json'));
  for (let e = 5; e <= 10; e++) {
    const ctx = recorder();
    assert.strictEqual(C.drawPlayers(ctx, playing(e), null, R), true, 'era ' + e);
    assert.strictEqual(ctx.calls.filter(([k, a]) => k === 'scale' && a[0] === -1).length, 1, 'era ' + e + ': the sprite rig, one mirrored player');
    assert.ok(ctx.calls.filter(([k]) => k === 'fill').length < 200, 'era ' + e + ': no polygon figures');
  }
});

test('item 1283: an era block that names its own model file draws it, and only that era', () => {
  M.loadFile(path.join(MODELS, 'player-proof-mid.json'));
  const own = C.ERAS[7];
  own.model = 'player-proof-mid';
  try {
    assert.strictEqual(C.configFor(7, 'right').model, 'player-proof-mid');
    // its neighbour is untouched -- era 8 wears its own operatives (item 1256),
    // never the file era 7 was just handed
    assert.notStrictEqual(C.configFor(8).model, 'player-proof-mid', 'its neighbour is untouched');
    const ctx = recorder();
    C.drawPlayers(ctx, playing(7), null, R);
    assert.ok(ctx.calls.filter(([k]) => k === 'fill').length > 200, 'era 7 draws its named model');
  } finally { delete own.model; }
});

test('with the proof model asked for (the ?model= switch), every 3D era draws both players as models and writes no state', () => {
  for (const d of ['lo', 'mid', 'hi']) M.loadFile(path.join(MODELS, 'player-proof-' + d + '.json'));
  C.forcedModel = 'player-proof-hi';
  C.forcedFigure = 'player-proof-hi';
  try {
    for (let e = 1; e <= 10; e++) {
      const c = C.configFor(e, 'right');
      if (e < 5) { assert.ok(!c.model && !c.figure, 'era ' + e + ' stays a sprite'); continue; }
      assert.strictEqual(c.model, 'player-proof-hi', 'era ' + e + ' polygon opt-in');
      assert.strictEqual(c.figure, 'player-proof-hi', 'era ' + e + ' glTF opt-in, what item 1274\'s layer reads');
    }
  } finally { C.forcedFigure = null; }
  try {
  for (let e = 5; e <= 10; e++) {
    const g = playing(e);
    g.events = [{ type: 'paddle', side: 'left', era: e, time: g.time }];
    const before = JSON.stringify(g, (k, v) => (k === 'rng' ? undefined : v));
    const ctx = recorder();
    assert.strictEqual(C.drawPlayers(ctx, g, null, R), true, 'era ' + e);
    assert.strictEqual(JSON.stringify(g, (k, v) => (k === 'rng' ? undefined : v)), before, 'era ' + e + ' state untouched');
    assert.ok(!ctx.calls.some(([k]) => k === 'drawImage'), 'era ' + e + ': no sprite');
    assert.ok(ctx.calls.filter(([k]) => k === 'fill').length > 200, 'era ' + e + ': triangles for two figures');
  }
  } finally { C.forcedModel = null; }
  // Eras 1 to 4 are untouched: the sprite path, one mirrored player.
  const ctx = recorder();
  C.drawPlayers(ctx, playing(3), null, R);
  assert.strictEqual(ctx.calls.filter(([k, a]) => k === 'scale' && a[0] === -1).length, 1);
});

test('a swing moves the model: the frame after a contact differs from idle', () => {
  C.forcedModel = 'player-proof-mid';
  try {
  const g = playing(8);
  const draw = () => { const ctx = recorder(); C.drawPlayers(ctx, g, null, R); return ctx.calls.filter(([k]) => k === 'moveTo').map(([, a]) => a.join(',')).join(';'); };
  const idle = draw();
  g.time += 0.01;
  g.events = [{ type: 'paddle', side: 'left', era: 8, time: g.time }];
  const t0 = g.time;
  g.time = t0 + C.SWING_S / 2;
  g.events = [];
  assert.notStrictEqual(draw(), idle, 'mid-swing pose');
  } finally { C.forcedModel = null; }
});

test('index.html loads src/models3d.js once, before the rig, and no model code touches pixels', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const i = html.indexOf('src="src/models3d.js"'), j = html.indexOf('src="src/characters.js"');
  assert.ok(i > 0 && i < j, 'models3d before characters');
  assert.strictEqual(html.split('src/models3d.js').length, 2, 'one script tag');
  const src = fs.readFileSync(path.join(ROOT, 'src', 'models3d.js'), 'utf8');
  assert.ok(!/getImageData|putImageData|getContext\(\s*['"](webgl|experimental)/i.test(src), 'canvas 2D paths only');
});
