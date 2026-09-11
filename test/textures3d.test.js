'use strict';
/*
 * The 3D eras' pixellab textures (item 1187): the embedded tiles, the shared
 * table's strip-mapped court and its overlays, and the headless fallback that
 * keeps every recorded era look unchanged. No browser: a stand-in document and
 * Image where a test needs the textures to "decode".
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ART = path.join(ROOT, 'assets', 'pixellab');
const EMBED = require('../src/textures3d.js');

function freshTable() {
  delete require.cache[require.resolve('../src/table3d.js')];
  return require('../src/table3d.js');
}

// ------------------------------------------------------------------ the art
test('every tex3d tile is embedded byte for byte, and each has its manifest entry', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8'));
  const files = fs.readdirSync(ART).filter((f) => /^tex3d-.*\.png$/.test(f)).sort();
  assert.deepStrictEqual(files.map((f) => f.slice(6, -4)).sort(), Object.keys(EMBED.TILES).sort());
  for (const f of files) {
    const want = 'data:image/png;base64,' + fs.readFileSync(path.join(ART, f)).toString('base64');
    assert.strictEqual(EMBED.TILES[f.slice(6, -4)], want, `${f} is embedded as it is on disk`);
    const entry = manifest.images.find((e) => e.file === f);
    assert.ok(entry && entry.prompt && Number.isInteger(entry.seed) && entry.cost, `${f} has its prompt, seed and bill`);
  }
  assert.ok(files.length >= 4 && files.length <= 12, `a small set, inside the 12-generation budget: ${files.length}`);
});

test('every texture a 3D era names is one of the embedded tiles', () => {
  const eras = ['era5-playstation', 'era6-n64', 'era7-dreamcast', 'era8-ps2', 'era9-xbox', 'era10-xbox360'];
  for (const era of eras) {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'eras', era + '.js'), 'utf8');
    const block = /var TEXTURE = \{([\s\S]*?)\n  \};/.exec(src);
    assert.ok(block, `${era} declares its textures`);
    const names = [...block[1].matchAll(/name: '([a-z0-9-]+)'/g)].map((m) => m[1]);
    assert.deepStrictEqual(names.length, 4, `${era}: court, trim, paddle and ball`);
    for (const n of names) assert.ok(EMBED.TILES[n], `${era} names ${n}, which is embedded`);
    // The ball's skin goes through ball()'s texture, or (era 5's faceted gem,
    // which draws its own ball) straight through textureOver.
    assert.ok(/texture: TEXTURE\.court/.test(src) && /texture: TEXTURE\.paddle/.test(src) &&
      /texture: TEXTURE\.ball|textureOver\([^)]*TEXTURE\.ball/.test(src),
      `${era} hands the court, the paddles and the ball their textures`);
  }
});

test('the page loads the tiles before the shared table', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const a = html.indexOf('src/textures3d.js'), b = html.indexOf('src/table3d.js');
  assert.ok(a > 0 && a < b);
});

// ------------------------------------------------------------ the geometry
test('floorYAt is the inverse of project on the floor, for every 3D camera shape', () => {
  const T = freshTable();
  const cams = [
    T.camera({ tilt: 28, height: 1150, fov: 30, screenY: 306 }),
    T.camera({ tilt: 40, fov: 45, panX: 30 }),
    T.camera({ tilt: 12, height: 900, fov: 25, screenY: 280 })
  ];
  for (const cam of cams) {
    for (const y of [0, 75, 300, 512, 600]) {
      const sy = T.project(cam, 123, y, 0).y;
      assert.ok(Math.abs(T.floorYAt(cam, sy) - y) < 1e-6, `row ${y}`);
    }
  }
});

// ------------------------------------------------------------ the fallback
function logCtx() {
  const ops = [];
  const ctx = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, globalAlpha: 1,
    beginPath() { ops.push('begin'); }, moveTo() { ops.push('move'); }, lineTo() { ops.push('line'); },
    closePath() {}, arc() { ops.push('arc'); }, save() {}, restore() {}, translate() {}, scale() {},
    stroke() { ops.push('stroke'); }, fill() { ops.push('fill:' + this.fillStyle); }, fillRect() {},
    clip() { ops.push('clip'); }, drawImage() { ops.push('drawImage'); },
    createLinearGradient() { return { addColorStop() {} }; }
  };
  return { ctx, ops };
}

test('headless, a texture spec changes nothing: the same draw calls as the plain surfaces', () => {
  const T = freshTable();
  const cam = T.camera({ tilt: 28, height: 1150, fov: 30, screenY: 306 });
  const tex = { name: 'court-grain', alpha: 0.5 };
  const draw = (withTex) => {
    const { ctx, ops } = logCtx();
    T.table(ctx, cam, withTex ? { texture: tex, trim: { name: 'trim' } } : {});
    T.box(ctx, cam, { x: 30, y: 250, w: 12, h: 80 }, 0, 24, withTex ? { ink: '#ff0000', texture: tex } : { ink: '#ff0000' });
    T.ball(ctx, cam, { x: 400, y: 300, size: 12 }, withTex ? { texture: { name: 'ball' } } : {});
    return ops;
  };
  assert.deepStrictEqual(draw(true), draw(false));
  assert.strictEqual(T.textureReady('court-grain'), false);
});

// ------------------------------------------------- the strip-mapped court
function withBrowser(fn) {
  const made = [];
  const saved = { document: globalThis.document, Image: globalThis.Image };
  const context = (canvas) => ({
    canvas, calls: [], globalAlpha: 1, imageSmoothingEnabled: true,
    setTransform() {}, clearRect() {}, scale() {}, translate() {}, save() {}, restore() {},
    fillRect() { this.calls.push('fillRect'); },
    drawImage(...a) { this.calls.push(['drawImage', ...a]); },
    createPattern() { return { pattern: true }; }
  });
  globalThis.document = {
    createElement() {
      const canvas = { width: 300, height: 150 };
      canvas.ctx = context(canvas);
      canvas.getContext = () => canvas.ctx;
      made.push(canvas);
      return canvas;
    }
  };
  globalThis.Image = function () { this.complete = true; this.naturalWidth = 64; this.naturalHeight = 64; };
  try { return fn(freshTable(), made); } finally {
    if (saved.document === undefined) delete globalThis.document; else globalThis.document = saved.document;
    if (saved.Image === undefined) delete globalThis.Image; else globalThis.Image = saved.Image;
    freshTable();
  }
}

test('the court is drawn in horizontal strips once, then reused: one drawImage a frame', () => {
  withBrowser((T, made) => {
    const cam = T.camera({ tilt: 28, height: 1150, fov: 30, screenY: 306 });
    const tex = { name: 'court-grain', period: 64, strip: 2 };
    const frame = [];
    const ctx = { globalAlpha: 1, save() {}, restore() {}, drawImage(...a) { frame.push(a); } };
    assert.strictEqual(T.courtTexture(ctx, cam, tex), true);
    const court = made.find((c) => c.width === 800 && c.height === 600 && c.ctx.calls.length > 50);
    assert.ok(court, 'a canvas the size of the frame holds the strips');
    const strips = court.ctx.calls.filter((c) => c[0] === 'drawImage');
    const far = T.project(cam, 400, 0, 0).y, near = T.project(cam, 400, 600, 0).y;
    assert.ok(Math.abs(strips.length - (near - far) / 2) < 3, `one strip per 2 rows: ${strips.length}`);
    // each strip is a band of the flat field, scaled to the width that depth gives it
    const s = strips[Math.floor(strips.length / 2)];
    const [, , sx, srcY, srcW, srcH, dx, dy, dw, dh] = s;
    assert.strictEqual(sx, 0); assert.strictEqual(srcW, 800); assert.strictEqual(dh, 2);
    const mid = T.project(cam, 0, srcY + srcH / 2, 0);
    assert.ok(Math.abs(dx - mid.x) < 1e-6 && Math.abs(dw - 800 * mid.scale) < 1e-6);
    assert.ok(Math.abs(T.project(cam, 0, srcY, 0).y - dy) < 1e-6, 'the band starts on the row it was cut for');
    const before = made.length, drawn = strips.length;
    T.courtTexture(ctx, cam, tex);
    T.courtTexture(ctx, cam, tex);
    assert.strictEqual(made.length, before, 'no new canvas for the same camera');
    assert.strictEqual(court.ctx.calls.filter((c) => c[0] === 'drawImage').length, drawn, 'no strip redrawn');
    assert.strictEqual(frame.length, 3, 'each frame is one drawImage of the cached court');
  });
});

test('a drifting camera reuses the cache\'s canvases rather than making one a frame', () => {
  withBrowser((T, made) => {
    const ctx = { globalAlpha: 1, save() {}, restore() {}, drawImage() {} };
    const tex = { name: 'court-metal', strip: 2 };
    for (let i = 0; i < 40; i++) T.courtTexture(ctx, T.camera({ tilt: 28 + i * 0.01, fov: 30 }), tex);
    const courts = made.filter((c) => c.width === 800 && c.height === 600).length;
    assert.ok(courts <= 14, `a bounded number of court canvases: ${courts}`);
  });
});

test('nothing in the texture path reads pixels back', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'table3d.js'), 'utf8');
  assert.ok(!/getImageData|putImageData|createImageData/.test(src));
});
