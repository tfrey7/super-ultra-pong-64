'use strict';
// The CRT overlays (src/display-crt.js): eras 0 to 4 shown on the screen of
// their day, drawn over the scaled-up picture on the page canvas.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const D = require('../src/display.js');
const CRT = require('../src/display-crt.js');

// A recording stand-in for canvas 2D: every method records its name.
function recorder(canvas, log) {
  const grad = () => ({ addColorStop() {} });
  return new Proxy({ canvas, globalAlpha: 1, globalCompositeOperation: 'source-over' }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad();
      if (k === 'createPattern') return () => ({});
      return (...a) => { log.push([k, t.globalCompositeOperation, ...a.map((v) => (v && v.width !== undefined ? 'canvas' : v))]); };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

function withDocument(fn) {
  const made = [];
  globalThis.document = { createElement: () => {
    const c = { width: 0, height: 0 };
    const log = [];
    const x = recorder(c, log);
    c.getContext = () => x; c.log = log;
    made.push(c); return c; } };
  try { return fn(made); } finally { delete globalThis.document; }
}

test('eras 0 to 4 each point at a CRT kind that is registered', () => {
  const want = { 0: 'crt-mono', 1: 'crt-rf', 2: 'crt-composite', 3: 'crt-composite', 4: 'crt-svideo' };
  for (const [era, kind] of Object.entries(want)) {
    const r = D.row(+era);
    assert.strictEqual(r.overlay, kind, `era ${era}`);
    assert.strictEqual(typeof D.OVERLAYS[kind], 'function', `${kind} is registered`);
    assert.ok(r.strength > 0 && r.strength <= 1, `era ${era} strength`);
    assert.ok(r.lines >= r.h / 2 && r.lines <= 480, `era ${era} scanlines`);
  }
  for (let e = 5; e <= 10; e++) assert.ok(!/^crt-/.test(D.row(e).overlay), `era ${e} is not a CRT era`);
});

test('each screen has the traits of its day', () => {
  const K = CRT.KINDS;
  assert.strictEqual(K['crt-mono'].triad, 0, 'a black-and-white monitor has no colour mask');
  assert.strictEqual(K['crt-mono'].fringe, 0, 'and no colour to fringe');
  assert.ok(K['crt-mono'].scan >= K['crt-composite'].scan, 'the arcade\'s scanlines are the heaviest');
  assert.ok(K['crt-mono'].glow >= K['crt-rf'].glow && K['crt-mono'].glow > K['crt-svideo'].glow, 'and its glow the strongest');
  assert.strictEqual(K['crt-rf'].soft, 1, 'RF scanlines are soft');
  assert.ok(K['crt-rf'].roll > 0 && K['crt-rf'].fringe > 0, 'RF rolls and bleeds colour');
  assert.ok(K['crt-rf'].fringePx > K['crt-composite'].fringePx, 'RF bleeds wider than composite');
  assert.ok(K['crt-composite'].triad > 0 && K['crt-composite'].fringe > 0 && K['crt-composite'].corner > 0,
    'composite has triad grain, fringes and a curved tube');
  assert.strictEqual(K['crt-svideo'].fringe, 0, 'S-video separates colour, so no fringes');
  assert.ok(K['crt-svideo'].scan < K['crt-composite'].scan && K['crt-svideo'].glow < K['crt-composite'].glow,
    'and it is the cleanest of the five');
});

// The native-sized copy the fringes and glow are blended on, kept frame to
// frame in the module's work canvases; its log is emptied before each draw.
function drawOnPost(draw) {
  if (CRT.work.post) CRT.work.post.log.length = 0;
  draw();
  const post = CRT.work.post;
  assert.ok(post && post.log.some((e) => e[0] === 'drawImage' && e[1] === 'copy'), 'the copy starts from the native picture');
  return post;
}

test('an overlay pre-draws its tube once and stamps it with one multiply per frame', () => {
  withDocument((made) => {
    const native = { width: 256, height: 240 };
    const log = [];
    const page = recorder({ width: 1600, height: 1200 }, log);
    const rect = { x: 0, y: 0, w: 1600, h: 1200 };
    D.OVERLAYS['crt-composite'](page, rect, D.row(2), { era: 2, time: 1, native });
    const built = made.length;
    assert.ok(built >= 1, 'the shade canvas was built');
    log.length = 0;
    D.OVERLAYS['crt-composite'](page, rect, D.row(2), { era: 2, time: 2, native });
    assert.strictEqual(made.length, built, 'nothing new is made on the next frame');
    const draws = log.filter((c) => c[0] === 'drawImage');
    const multiplies = draws.filter((c) => c[1] === 'multiply');
    assert.strictEqual(multiplies.length, 1, 'one multiply of the pre-drawn tube');
    assert.ok(draws.length <= 2, `two page draws a frame at most, saw ${draws.length}`);
  });
});

test('fringes and glow blend on a native-sized copy, and the page gets plain draws (item 1240)', () => {
  withDocument(() => {
    const native = { width: 256, height: 240 };
    const log = [];
    const page = recorder({ width: 1600, height: 1200 }, log);
    const post = drawOnPost(() =>
      D.OVERLAYS['crt-composite'](page, { x: 0, y: 0, w: 1600, h: 1200 }, D.row(2), { era: 2, time: 1, native }));
    const draws = log.filter((c) => c[0] === 'drawImage');
    assert.strictEqual(draws.filter((c) => c[1] === 'lighter').length, 0, 'nothing is added over the page');
    assert.deepStrictEqual(draws.map((c) => c[1]), ['source-over', 'multiply'],
      'the finished copy, plainly, then the tube');
    assert.strictEqual(post.width + 'x' + post.height, '256x240', 'a copy the size of the native picture');
    const onPost = post.log.filter((c) => c[0] === 'drawImage');
    assert.strictEqual(onPost.filter((c) => c[1] === 'lighter').length, 3, 'two fringes and a glow, added on the copy');
  });
});

test('the Genesis keeps its fringes but has no glow, so it holds full frame rate (item 1201)', () => {
  withDocument(() => {
    const native = { width: 320, height: 224 };
    const log = [];
    const rect = { x: 0, y: 0, w: 800, h: 600 };
    assert.strictEqual(D.row(3).glow, 0, 'the Genesis row sets its own glow');
    assert.strictEqual(D.row(2).glow, undefined, 'the NES keeps its kind\'s glow');
    const post = drawOnPost(() =>
      D.OVERLAYS['crt-composite'](recorder({ width: 800, height: 600 }, log), rect, D.row(3), { era: 3, time: 1, native }));
    const draws = log.filter((c) => c[0] === 'drawImage');
    assert.strictEqual(draws.filter((c) => c[1] === 'multiply').length, 1, 'the tube');
    assert.strictEqual(post.log.filter((c) => c[0] === 'drawImage' && c[1] === 'lighter').length, 2, 'two fringes, no glow');
  });
});

test('every kind draws without error, and no overlay draws on a picture it was not given', () => {
  withDocument(() => {
    for (const kind of Object.keys(CRT.KINDS)) {
      const log = [];
      const page = recorder({ width: 800, height: 600 }, log);
      D.OVERLAYS[kind](page, { x: 0, y: 0, w: 800, h: 600 }, D.row(1), { era: 1, time: 3.3, native: { width: 160, height: 192 } });
      assert.ok(log.some((c) => c[0] === 'drawImage'), `${kind} drew`);
      const none = [];
      D.OVERLAYS[kind](recorder({ width: 800, height: 600 }, none), { x: 0, y: 0, w: 800, h: 600 }, D.row(1), { era: 1, time: 0, native: null });
      assert.strictEqual(none.length, 0, `${kind} with no native picture draws nothing`);
    }
  });
});

test('the overlays do no per-pixel work and never touch the era files', () => {
  const code = fs.readFileSync(path.join(ROOT, 'src', 'display-crt.js'), 'utf8');
  assert.ok(!/getImageData|putImageData|createImageData/.test(code), 'no pixel reads or writes');
  assert.ok(!/PongEras|src\/eras|registerEra/.test(code), 'no era file is reached into');
});
