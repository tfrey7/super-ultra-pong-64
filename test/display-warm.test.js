'use strict';
// The display's overlay warm-up (item 1239): every row's screen overlay drawn
// once at page load, on a layer copied onto the page and then cleared away, so
// no tube is drawn for the first time in the middle of an era change.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
eralooks.loadRenderer(ROOT);
require('../src/erachange.js');
const D = require('../src/display.js');
require('../src/display-crt.js');
require('../src/display-tv.js');

function fakeDocument(made) {
  return { createElement: () => {
    const c = { width: 0, height: 0, draws: [] };
    const x = { canvas: c, save() {}, restore() {}, setTransform() {}, clearRect() {},
      drawImage(src) { c.draws.push(src); } };
    c.getContext = () => x;
    made.push(c); return c; } };
}

function fakePage(calls) {
  return { canvas: { width: 1600, height: 1200 },
    save() {}, restore() {}, setTransform() {},
    clearRect(...a) { calls.push(['clearRect', ...a]); },
    drawImage(src, ...a) { calls.push(['drawImage', src, ...a]); } };
}

test('every row with a screen is drawn once on a layer, the layer copied once, the page cleared', () => {
  const made = [];
  globalThis.document = fakeDocument(made);
  const saved = Object.assign({}, D.OVERLAYS);
  const seen = [];
  for (const kind of Object.keys(D.OVERLAYS)) {
    if (kind === 'none') continue;
    D.OVERLAYS[kind] = (ctx, rect, row, info) => seen.push({ ctx, rect, row, info, kind });
  }
  try {
    D.begin(4, 800, 600);
    const calls = [];
    const page = fakePage(calls);
    assert.strictEqual(D.warmOverlays(page), true);
    const withScreens = D.ROWS.filter((r) => r.overlay && r.overlay !== 'none');
    assert.strictEqual(withScreens.length, 11, 'every rung from the arcade to the 360 has a screen');
    assert.deepStrictEqual(seen.map((s) => s.row), withScreens, 'each row once, with its own settings (strength and all)');
    assert.deepStrictEqual(seen.map((s) => s.kind), withScreens.map((r) => r.overlay));
    const layer = seen[0].ctx.canvas;
    assert.ok(seen.every((s) => s.ctx.canvas === layer), 'all on one layer, never on the page');
    assert.deepStrictEqual([layer.width, layer.height], [1600, 1200], 'the page\'s size, so each tube\'s shade is built at the size it is used');
    assert.ok(seen.every((s) => s.info.native === D.canvas() && s.info.era === -1), 'over the native picture, as no real era');
    assert.deepStrictEqual(calls.map((c) => c[0]), ['drawImage', 'clearRect'], 'the layer copied once, then the page cleared');
    assert.strictEqual(calls[0][1], layer);
    assert.deepStrictEqual(calls[1].slice(1), [0, 0, 1600, 1200]);
  } finally {
    Object.assign(D.OVERLAYS, saved);
    delete globalThis.document;
  }
});

test('a warm-up never stops the page: one throwing overlay leaves the others warmed and the page cleared', () => {
  const made = [];
  globalThis.document = fakeDocument(made);
  const saved = Object.assign({}, D.OVERLAYS);
  let warmed = 0;
  for (const kind of Object.keys(D.OVERLAYS)) if (kind !== 'none') D.OVERLAYS[kind] = () => { warmed++; };
  D.OVERLAYS['crt-mono'] = () => { throw new Error('boom'); };
  try {
    D.begin(4, 800, 600);
    const calls = [];
    assert.doesNotThrow(() => D.warmOverlays(fakePage(calls)));
    assert.strictEqual(warmed, 10, 'the arcade\'s tube threw; the other ten screens still drew');
    assert.deepStrictEqual(calls.map((c) => c[0]), ['drawImage', 'clearRect']);
  } finally {
    Object.assign(D.OVERLAYS, saved);
    delete globalThis.document;
  }
});

test('no document, no warm-up; and the page loop warms once, before its first present', () => {
  const calls = [];
  assert.strictEqual(D.warmOverlays(fakePage(calls)), false);
  assert.strictEqual(calls.length, 0);
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const warm = main.indexOf('display.warmOverlays(ctx)');
  const present = main.indexOf('display.present(ctx');
  assert.ok(warm > 0 && warm < present, 'main.js warms the overlays before it presents');
  assert.ok(/if \(!overlaysWarmed\) \{ overlaysWarmed = true;/.test(main), 'and only once');
});
