'use strict';
/*
 * The pixel-art loader (src/sprites.js) and what tools/pixellab.mjs left in
 * assets/pixellab/: a name resolves to its PNG, the PNG is really there with a
 * manifest entry that can ask for it again, and a loaded image is drawn with
 * one drawImage call -- and nothing is drawn before it has loaded.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Sprites = require('../src/sprites.js');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets', 'pixellab');

/** A stand-in for the browser's Image: records its src, loads when told to. */
function fakeImages() {
  const made = [];
  return {
    made,
    makeImage() {
      const img = { src: '', complete: false, naturalWidth: 0, onload: null, onerror: null };
      img.finish = (ok = true) => {
        img.complete = true;
        img.naturalWidth = ok ? 32 : 0;
        (ok ? img.onload : img.onerror)();
      };
      made.push(img);
      return img;
    }
  };
}

/** A canvas context that records every drawImage and the smoothing it ran under. */
function recordingCtx() {
  const calls = [];
  return {
    calls,
    imageSmoothingEnabled: true,
    drawImage(...args) { calls.push({ args, smoothing: this.imageSmoothingEnabled }); }
  };
}

test('a name resolves to its PNG under assets/pixellab/, and that file is there', () => {
  assert.strictEqual(Sprites.path('test-ball'), 'assets/pixellab/test-ball.png');
  assert.ok(fs.existsSync(path.join(ROOT, Sprites.path('test-ball'))), 'the generated test image is committed');
  assert.throws(() => Sprites.path('../index'), /not a sprite name/);
  assert.throws(() => Sprites.path('Test Ball'), /not a sprite name/);
});

test('the loader draws a named image with one drawImage once it has loaded, and not before', () => {
  const imgs = fakeImages();
  const S = Sprites.create({ makeImage: imgs.makeImage });
  const ctx = recordingCtx();

  assert.strictEqual(S.status('test-ball'), 'unloaded');
  assert.strictEqual(S.draw(ctx, 'test-ball', 10, 20, 64, 64), false, 'nothing to draw before it loads');
  assert.strictEqual(ctx.calls.length, 0, 'so the era draws its own look that frame');
  assert.strictEqual(imgs.made.length, 1);
  assert.strictEqual(imgs.made[0].src, 'assets/pixellab/test-ball.png', 'the first draw started the load');
  assert.strictEqual(S.status('test-ball'), 'loading');

  imgs.made[0].finish();
  assert.strictEqual(S.draw(ctx, 'test-ball', 10, 20, 64, 64), true);
  assert.strictEqual(ctx.calls.length, 1, 'one drawImage call');
  assert.strictEqual(ctx.calls[0].args[0], imgs.made[0], 'of the image the name resolved to');
  assert.deepStrictEqual(ctx.calls[0].args.slice(1), [10, 20, 64, 64]);
  assert.strictEqual(ctx.calls[0].smoothing, false, 'scaled up blocky, not blurred');
  assert.strictEqual(ctx.imageSmoothingEnabled, true, 'and the canvas setting is put back after');

  assert.strictEqual(S.draw(ctx, 'test-ball', 0, 0), true);
  assert.deepStrictEqual(ctx.calls[1].args.slice(1), [0, 0], 'no size given: drawn at its own size');
  assert.strictEqual(imgs.made.length, 1, 'loaded once, however often it is drawn');
});

test('a name with no file fails quietly: draw answers false and draws nothing', () => {
  const imgs = fakeImages();
  const S = Sprites.create({ makeImage: imgs.makeImage });
  const ctx = recordingCtx();
  S.load('no-such-sprite');
  imgs.made[0].finish(false);
  assert.strictEqual(S.status('no-such-sprite'), 'failed');
  assert.strictEqual(S.draw(ctx, 'no-such-sprite', 0, 0), false);
  assert.strictEqual(ctx.calls.length, 0);
});

test('an image the browser already had counts as ready before its onload runs', () => {
  const S = Sprites.create({ makeImage: () => ({ complete: true, naturalWidth: 32 }) });
  S.load('test-ball');
  assert.strictEqual(S.ready('test-ball'), true);
});

test('the loader does no per-pixel work, and index.html loads it before every era file', () => {
  const code = fs.readFileSync(path.join(ROOT, 'src', 'sprites.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const k of ['getImageData', 'putImageData', 'createImageData']) {
    assert.ok(!code.includes(k), `src/sprites.js does not call ${k}`);
  }
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const at = html.indexOf('src="src/sprites.js"');
  assert.ok(at > 0, 'index.html loads src/sprites.js');
  assert.ok(at < html.indexOf('src="src/eras/'), 'before the first era file');
});

test('every PNG in assets/pixellab has a manifest entry that can ask for it again', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ASSETS, 'manifest.json'), 'utf8'));
  const pngs = fs.readdirSync(ASSETS).filter((f) => f.endsWith('.png')).sort();
  assert.deepStrictEqual(manifest.images.map((e) => e.file).sort(), pngs, 'one entry per image, no strays');
  for (const e of manifest.images) {
    for (const k of ['prompt', 'size', 'style', 'date', 'cost', 'seed', 'request']) {
      assert.ok(e[k] !== undefined, `${e.name} records its ${k}`);
    }
    assert.strictEqual(e.request.description, e.prompt, `${e.name}: the request carries the prompt`);
    assert.strictEqual(e.request.seed, e.seed, `${e.name}: and the seed`);
    const buf = fs.readFileSync(path.join(ASSETS, e.file));
    assert.strictEqual(buf.subarray(1, 4).toString(), 'PNG', `${e.file} is a PNG`);
    assert.deepStrictEqual({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }, e.pixels);
    assert.strictEqual(crypto.createHash('sha256').update(buf).digest('hex'), e.sha256,
      `${e.file} is the image its entry describes`);
  }
});
