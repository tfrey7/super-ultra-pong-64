'use strict';
// The TV and HDTV overlays (src/display-tv.js): eras 5 to 10 seen on the
// screen of their day, drawn over the scaled-up picture.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
eralooks.loadRenderer(ROOT);
require('../src/erachange.js');
const D = require('../src/display.js');
const TV = require('../src/display-tv.js');

/** A stand-in document whose canvases record what is drawn on them. */
function fakeDocument(made) {
  return { createElement: () => {
    const c = { width: 0, height: 0, draws: [] };
    const x = { canvas: c, setTransform() {}, clearRect() {}, fillRect() { c.draws.push('fillRect'); },
      createPattern: () => ({}),
      drawImage(src) { c.draws.push({ mode: this.globalCompositeOperation || 'source-over', w: src.width }); } };
    c.getContext = () => x;
    made.push(c); return c; } };
}

function fakePage(calls) {
  return { canvas: { width: 1600, height: 1200 },
    save() {}, restore() {}, setTransform() {}, fillRect() {},
    drawImage(src, ...a) {
      calls.push({ mode: this.globalCompositeOperation || 'source-over', alpha: this.globalAlpha == null ? 1 : this.globalAlpha,
        w: src.width, h: src.height, dest: a.slice(4) });
    } };
}

test('each 3D era is seen on the screen of its day', () => {
  const want = { 5: 'tv-composite', 6: 'tv-composite', 7: 'tv-vga', 8: 'tv-component', 9: 'tv-vga', 10: 'hdtv-720p' };
  for (const [era, kind] of Object.entries(want)) {
    assert.strictEqual(D.row(+era).overlay, kind, `era ${era}`);
    assert.strictEqual(typeof D.OVERLAYS[kind], 'function', `${kind} is registered`);
    assert.ok(D.row(+era).strength > 0 && D.row(+era).strength <= 1, `era ${era} strength`);
  }
  assert.strictEqual(D.row(5).dither, true, 'the PlayStation dithers');
  for (const e of [6, 7, 8, 9, 10]) assert.strictEqual(D.row(e).dither, false, `era ${e} does not`);
  for (let e = 0; e <= 4; e++) assert.ok(!/^(tv-|hdtv-)/.test(D.row(e).overlay), `era ${e} is left to the CRT file`);
});

test('the kinds have the parts the brief names, and the Xbox 360 has no scanlines', () => {
  const K = TV.KINDS;
  assert.ok(K['tv-composite'].scan > K['tv-component'].scan, 'composite lines heavier than component');
  assert.ok(K['tv-component'].scan > K['tv-vga'].scan, 'component heavier than VGA');
  assert.ok(K['tv-composite'].bleed > 0 && K['tv-composite'].chroma > 0, 'composite bleeds colour');
  assert.ok(K['tv-component'].glow > 0 && K['tv-vga'].glow > 0, 'bloom and edge glow');
  assert.strictEqual(K['hdtv-720p'].scan, 0, 'a flat panel has no scanlines');
  assert.ok(K['hdtv-720p'].soft > 0 && K['hdtv-720p'].smear > 0, 'LCD softness and motion smear');
  assert.deepStrictEqual([...TV.BAYER4].sort((a, b) => a - b), [...Array(16).keys()], 'a real 4 x 4 Bayer matrix');
});

test('every blend only brightens or keeps brightness, on the native picture, and the page gets two draws', () => {
  const made = [];
  globalThis.document = fakeDocument(made);
  try {
    for (const era of [5, 6, 7, 8, 9, 10]) {
      const calls = [];
      const page = fakePage(calls);
      D.begin(era, 800, 600);
      D.present(page, era, 1 + era);
      D.begin(era, 800, 600);
      D.present(page, era, 1.016 + era);   // a second frame, so the smear has a previous one
      const post = TV.cache.post;
      assert.ok(post, `era ${era} blends on its own copy`);
      assert.deepStrictEqual([post.width, post.height], [D.row(era).w, D.row(era).h], `era ${era}: at the native size`);
      const blends = post.draws.filter((d) => d.mode !== 'copy');
      assert.ok(blends.length > 0, `era ${era} draws a screen`);
      for (const d of blends) {
        assert.ok(['lighten', 'screen', 'color', 'soft-light'].includes(d.mode), `era ${era} mode ${d.mode}`);
      }
      // Per frame on the page: the picture, the finished copy over it, and the
      // scanline strip -- all plain draws, nothing blended at page size.
      for (const c of calls) assert.strictEqual(c.mode, 'source-over', `era ${era}: no blend at page size`);
      const strips = calls.filter((c) => c.w === 1);
      if (era === 10) assert.strictEqual(strips.length, 0, 'no scanlines on the flat panel');
      else assert.strictEqual(strips.length, 2, `era ${era}: one scanline strip per frame`);
      assert.strictEqual(calls.length, era === 10 ? 4 : 6, `era ${era}: ${era === 10 ? 2 : 3} page draws a frame`);
      if (era === 10) {
        // Two frames of LCD softness (a half-size copy each), plus ONE smear:
        // the first frame had no previous frame to smear.
        const halves = post.draws.filter((d) => d.mode === 'lighten' && d.w === 480);
        assert.strictEqual(halves.length, 3, 'the second frame smears the first one over it');
      }
      post.draws.length = 0;
    }
  } finally {
    delete globalThis.document;
  }
});

test('the made-once canvases are made once, not every frame', () => {
  const made = [];
  globalThis.document = fakeDocument(made);
  try {
    const page = fakePage([]);
    for (let i = 0; i < 3; i++) for (const era of [5, 8, 10]) { D.begin(era, 800, 600); D.present(page, era, i / 60); }
    const n = made.length;
    for (let i = 3; i < 30; i++) for (const era of [5, 8, 10]) { D.begin(era, 800, 600); D.present(page, era, i / 60); }
    assert.strictEqual(made.length, n, 'no canvas created after the first frames');
    const strips = Object.keys(TV.cache).filter((k) => k.startsWith('scan:'));
    assert.ok(strips.length >= 2, 'a strip per screen');
    for (const k of strips) assert.strictEqual(TV.cache[k].made, 1, `${k} drawn once`);
    assert.strictEqual(TV.cache.dither.made, 1, 'the dither screen drawn once');
  } finally {
    delete globalThis.document;
  }
});

test('no document, no overlay, and no per-pixel work', () => {
  const calls = [];
  D.present(fakePage(calls), 5, 0);
  const code = fs.readFileSync(path.join(ROOT, 'src', 'display-tv.js'), 'utf8');
  assert.ok(!/getImageData|putImageData|createImageData/.test(code), 'no pixel reads or writes');
  assert.ok(!/\bimport\b|\bexport\b/.test(code.replace(/\/\*[\s\S]*?\*\//g, '')), 'a plain script');
  for (const f of fs.readdirSync(path.join(ROOT, 'src', 'eras'))) {
    assert.ok(!/PongDisplayTV|tv-composite/.test(fs.readFileSync(path.join(ROOT, 'src', 'eras', f), 'utf8')), `${f} untouched`);
  }
});
