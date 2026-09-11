'use strict';
// The display (src/display.js): every era drawn at its machine's native
// resolution and scaled up to the page with one drawImage.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong } = eralooks.loadRenderer(ROOT);
require('../src/erachange.js');
const D = require('../src/display.js');

test('one display row per rung, at each machine\'s native size', () => {
  assert.strictEqual(D.ROWS.length, Pong.ERAS.length);
  const want = { 2: [256, 240], 3: [320, 224], 4: [256, 224], 5: [320, 240], 6: [320, 240],
    7: [640, 480], 8: [512, 448], 9: [640, 480] };
  for (const [era, [w, h]] of Object.entries(want)) {
    assert.deepStrictEqual([D.row(+era).w, D.row(+era).h], [w, h], `era ${era}`);
  }
  assert.strictEqual(D.row(10).h, 720, 'the Xbox 360 is 720p');
  for (const r of D.ROWS) {
    assert.ok(r.w > 0 && r.h > 0 && r.w <= 1280 && r.h <= 720, `era ${r.era} size`);
    assert.strictEqual(typeof D.OVERLAYS[r.overlay], 'function', `era ${r.era} overlay kind is registered`);
    assert.ok(r.strength >= 0 && r.strength <= 1, `era ${r.era} strength`);
    assert.ok(r.aspect > 0);
  }
});

test('the 2D eras scale with hard pixel edges, the 3D eras soft', () => {
  for (let e = 0; e <= 4; e++) assert.strictEqual(D.row(e).smooth, false, `era ${e}`);
  for (let e = 5; e <= 10; e++) assert.strictEqual(D.row(e).smooth, true, `era ${e}`);
});

test('a rung past the table draws at the top row, and a bad era at the bottom', () => {
  assert.strictEqual(D.row(99), D.ROWS[D.ROWS.length - 1]);
  assert.strictEqual(D.row(-3), D.ROWS[0]);
});

test('overlay kinds plug into a registry; this file ships only "none"', () => {
  assert.deepStrictEqual(Object.keys(D.OVERLAYS), ['none']);
  assert.throws(() => D.registerOverlay('', () => {}));
  assert.throws(() => D.registerOverlay('x', null));
});

test('during an era change the display switches when the ring passes the centre', () => {
  const g = Pong.createGame({ phase: 'playing' });
  g.era = 3; g.startEra = 0; g.eraChangedAt = 0; g.serveDelay = 1.5;
  g.missAt = { x: 0, y: g.height / 2 };
  const R = globalThis.PongRender;
  g.time = 0.2;
  assert.ok(R.eraChangeMoment(g) && !R.eraChangeMoment(g).cardUp, 'ring short of the centre');
  assert.strictEqual(D.shownEra(g), 2, 'still the old machine\'s display');
  g.time = 1.2;
  assert.ok(R.eraChangeMoment(g).cardUp, 'ring past the centre');
  assert.strictEqual(D.shownEra(g), 3, 'the new machine\'s display');
  g.serveDelay = 0;
  assert.strictEqual(D.shownEra(g), 3, 'and after the change');
});

test('present puts the frame on the page with ONE drawImage, then the overlay', () => {
  const calls = [];
  const page = {
    canvas: { width: 1600, height: 1200 },
    save() {}, restore() {}, setTransform() {}, fillRect() { calls.push('fillRect'); },
    drawImage(...a) { calls.push(['drawImage', this.imageSmoothingEnabled, ...a.slice(1)]); }
  };
  // No document under node: begin() has no canvas to make, so stand one in.
  const made = [];
  globalThis.document = { createElement: () => {
    const c = { width: 0, height: 0, getContext: () => ({ setTransform() {}, clearRect() {} }) };
    made.push(c); return c; } };
  try {
    for (const era of [2, 7, 2, 10]) D.begin(era, 800, 600);
    assert.strictEqual(made.length, 1, 'one offscreen canvas, reused across frames and eras');
    assert.deepStrictEqual([D.canvas().width, D.canvas().height], [960, 720]);
    D.begin(2, 800, 600);
    let seen = null;
    D.registerOverlay('probe', (ctx, rect, row) => { seen = { rect, era: row.era }; });
    D.row(2).overlay = 'probe';
    const rect = D.present(page, 2, 0);
    D.row(2).overlay = 'none';
    delete D.OVERLAYS.probe;
    assert.deepStrictEqual(calls, [['drawImage', false, 0, 0, 256, 240, 0, 0, 1600, 1200]]);
    assert.deepStrictEqual(rect, { x: 0, y: 0, w: 1600, h: 1200 }, 'a 4:3 picture fills the canvas');
    assert.deepStrictEqual(seen, { rect, era: 2 }, 'the row\'s overlay drew over it');
    calls.length = 0;
    D.begin(6, 800, 600);
    D.present(page, 6, 0);
    assert.strictEqual(calls[0][1], true, 'a 3D era is scaled soft');
  } finally {
    delete globalThis.document;
  }
});

test('a picture of another shape is letterboxed or pillarboxed, never stretched', () => {
  assert.deepStrictEqual(D.fitRect(800, 600, 16 / 9), { x: 0, y: 75, w: 800, h: 450 });
  assert.deepStrictEqual(D.fitRect(800, 600, 1), { x: 100, y: 0, w: 600, h: 600 });
});

test('?display=off turns the layer off', () => {
  assert.strictEqual(D.enabledFor('?era=3&display=off'), false);
  assert.strictEqual(D.enabledFor('?display=off'), false);
  assert.strictEqual(D.enabledFor('?era=3'), true);
  assert.strictEqual(D.enabledFor(''), true);
});

test('the display does no per-pixel work, and the page loads it and both overlay slots after the renderer', () => {
  const code = fs.readFileSync(path.join(ROOT, 'src', 'display.js'), 'utf8');
  assert.ok(!/getImageData|putImageData|createImageData/.test(code), 'no pixel reads or writes');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const at = (s) => html.indexOf(`src="${s}"`);
  const tpl = html.indexOf('<template'), end = html.indexOf('</template>');
  for (const s of ['src/display.js', 'src/display-crt.js', 'src/display-tv.js']) {
    assert.ok(at(s) > tpl && at(s) < end, `${s} is in the script list`);
    assert.ok(at(s) > at('src/render.js'), `${s} comes after the renderer`);
  }
  assert.ok(at('src/display.js') < at('src/display-crt.js') && at('src/display-crt.js') < at('src/display-tv.js'));
  assert.ok(at('src/display-tv.js') < at('src/main.js'));
});
