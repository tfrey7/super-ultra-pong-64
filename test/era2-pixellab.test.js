'use strict';
/*
 * Era 2's generated art (item 1178): the court and the ball from pixellab.ai,
 * boiled down to the NES palette offline by assets/pixellab/era2-nes-quantize.mjs
 * and embedded in src/eras/era2-nes.js as data: URIs.
 *
 * The page's path is exercised headless with a stand-in Image that is decoded
 * the moment its src is set, installed BEFORE the era file loads (it starts
 * decoding at load). Every other era-2 test runs with no Image at all and so
 * pins the hand-drawn fallback.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets', 'pixellab');
const ERA_SRC = fs.readFileSync(path.join(ROOT, 'src', 'eras', 'era2-nes.js'), 'utf8');
const quantizer = () => import(pathToFileURL(path.join(ASSETS, 'era2-nes-quantize.mjs')).href);

class FakeImage {
  set src(v) {
    this._src = v;
    const png = Buffer.from(v.split(',')[1], 'base64');
    this.naturalWidth = png.readUInt32BE(16);
    this.naturalHeight = png.readUInt32BE(20);
    this.complete = true;
  }
  get src() { return this._src; }
}
globalThis.Image = FakeImage;
const { Pong, R } = eralooks.loadRenderer(ROOT);

/** The two data: URIs embedded in the era file. */
function embeds() {
  const court = /court: '(data:image\/png;base64,[^']+)'/.exec(ERA_SRC);
  const ball = /ball: '(data:image\/png;base64,[^']+)'/.exec(ERA_SRC);
  assert.ok(court && ball, 'both pieces are embedded');
  return { court: court[1], ball: ball[1] };
}
const bytesOf = (uri) => Buffer.from(uri.split(',')[1], 'base64');

function midRally(rng = 0.1) {
  const g = Pong.createGame({ rng: () => rng, phase: 'playing', era: 2 });
  g.score.left = 3;
  g.score.right = 11;
  g.serveDelay = 0;
  g.ball.x = 612.5;
  g.ball.y = 297.25;
  g.left.y = 40;
  g.right.y = 390;
  return g;
}

/** A frame with the images recorded too, as ['image:<piece>', x, y, w, h]. */
function frame(g) {
  const rec = eralooks.recorder();
  const e = embeds();
  rec.ctx.drawImage = (img, x, y, w, h) => {
    const piece = img.src === e.court ? 'court' : img.src === e.ball ? 'ball' : 'other';
    rec.calls.push(['image:' + piece, x, y, w, h]);
  };
  R.draw(rec.ctx, g, null);
  return rec.calls;
}

test('the embedded court and ball are exactly the committed PNGs', () => {
  const e = embeds();
  assert.deepStrictEqual(bytesOf(e.court), fs.readFileSync(path.join(ASSETS, 'era2-court.png')));
  assert.deepStrictEqual(bytesOf(e.ball), fs.readFileSync(path.join(ASSETS, 'era2-ball.png')));
});

test('the quantizer rebuilds both pictures byte for byte from the raw generations', async () => {
  const q = await quantizer();
  const pal = q.nesPalette(ERA_SRC);
  const courtInks = [...new Set(pal)].filter((c) => q.luma(c) < q.COURT_LUMA_MAX);
  const court = q.quantize(q.decodePng(fs.readFileSync(path.join(ASSETS, 'era2-court-raw.png'))), courtInks);
  const ball = q.shrink(q.decodePng(fs.readFileSync(path.join(ASSETS, 'era2-ball-raw2.png'))),
    q.BALL_SIZE, [pal[0x30], pal[0x10], pal[0x00], pal[0x0F]]);
  assert.deepStrictEqual(q.encodePng(court.width, court.height, court.rgba), fs.readFileSync(path.join(ASSETS, 'era2-court.png')));
  assert.deepStrictEqual(q.encodePng(ball.width, ball.height, ball.rgba), fs.readFileSync(path.join(ASSETS, 'era2-ball.png')));
});

test('every pixel is an NES colour, at NES resolution, and the court never out-shines the ball (R1)', async () => {
  const q = await quantizer();
  const pal = R.eraLook(2).nesPalette;
  const court = q.decodePng(fs.readFileSync(path.join(ASSETS, 'era2-court.png')));
  const ball = q.decodePng(fs.readFileSync(path.join(ASSETS, 'era2-ball.png')));
  assert.deepStrictEqual([court.width, court.height], [200, 148], 'one court pixel is one 4-unit sprite pixel');
  assert.deepStrictEqual([ball.width, ball.height], [12, 12], 'the ball is its own 12-unit box');
  const courtInks = Object.keys(q.inkCounts(court));
  const ballInks = Object.keys(q.inkCounts(ball));
  for (const c of courtInks.concat(ballInks)) assert.ok(pal.includes(c), `${c} is not an NES colour`);
  const brightest = Math.max(...pal.map(q.luma));
  assert.ok(ballInks.includes('#fcfcfc') && q.luma('#fcfcfc') === brightest, 'the ball core is the palette\'s lightest entry');
  const courtMax = Math.max(...courtInks.map(q.luma));
  assert.ok(courtMax < q.luma('#fcfcfc'), `the court's brightest ink (luma ${courtMax.toFixed(2)}) stays below the ball core`);
  for (let i = 3; i < court.rgba.length; i += 4) assert.strictEqual(court.rgba[i], 255, 'the court is opaque');
  for (let i = 3; i < ball.rgba.length; i += 4) assert.ok(ball.rgba[i] === 0 || ball.rgba[i] === 255, 'the ball is crisp: opaque or clear');
});

test('with the art decoded, the court and the ball are one drawImage each: court first, ball exactly on its box and last', () => {
  const g = midRally();
  const calls = frame(g);
  const court = calls.filter((c) => c[0] === 'image:court');
  const ball = calls.filter((c) => c[0] === 'image:ball');
  assert.deepStrictEqual(court, [['image:court', 0, 4, 800, 592]], '200x148 at 4 units a pixel, centred under the border');
  assert.deepStrictEqual(ball, [['image:ball', Math.round(g.ball.x), Math.round(g.ball.y), g.ball.size, g.ball.size]]);
  assert.strictEqual(calls.findIndex((c) => c[0] === 'image:court'), 1, 'the court goes down straight after its base fill');
  assert.deepStrictEqual(calls[calls.length - 1], ball[0], 'nothing is drawn over the ball');
  const mortar = calls.filter(([i, , , w, h]) => i === '#000000' && (w === 800 || h === 600));
  assert.strictEqual(mortar.length, 0, 'the hand-drawn tiles give way to the generated court');
});

test('the paddles stay the hand-drawn two-tone sprites (both generated paddles were rejected)', () => {
  const g = midRally();
  const calls = frame(g);
  for (const side of ['left', 'right']) {
    const p = g[side];
    const { body, shade } = R.eraLook(2).spriteInks(g, side);
    const sprite = calls.filter(([i, x, y, w, h]) => (i === body || i === shade) &&
      x >= p.x - 5 && y >= p.y - 5 && x + w <= p.x + p.w + 5 && y + h <= p.y + p.h + 5);
    assert.ok(sprite.length >= 6, `${side} paddle is still the hand-drawn sprite (${sprite.length} pieces)`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(ASSETS, 'manifest.json'), 'utf8'));
  const paddles = manifest.images.filter((e) => /^era2-paddle/.test(e.name));
  assert.strictEqual(paddles.length, 2, 'tried twice');
  for (const e of paddles) assert.match(e.verdict, /^rejected/);
});

test('the generated ball still blinks out while the serve waits', () => {
  const g = midRally();
  g.serveDelay = 0.4;
  assert.strictEqual(frame(g).filter((c) => c[0] === 'image:ball').length, 0);
});

test('drawing with the art reads the state and never changes it', () => {
  const g = midRally();
  const before = JSON.stringify(g);
  frame(g);
  assert.strictEqual(JSON.stringify(g), before);
});
