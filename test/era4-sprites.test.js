'use strict';
/*
 * Era 4's generated art (item 1180): the sky, the paddles and the ball are
 * pixel art from pixellab.ai, fitted to the Super Nintendo's 15-bit colour
 * offline by assets/pixellab/era4-snes-embed.mjs and embedded in
 * src/eras/era4-snes.js as data: URIs. Until a picture has decoded, that piece
 * draws its hand-drawn look. The Mode 7 floor stays hand-drawn.
 *
 * Node has no Image and no canvas, so this file installs a stand-in Image
 * BEFORE the era file loads (it starts decoding at load) whose decoding the
 * test switches on and off, and, for the paddle's dye, a document whose
 * canvases record what is drawn on them. Every other era-4 test runs with no
 * Image at all and so pins the hand-drawn look.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const ART = path.join(ROOT, 'assets', 'pixellab');
const ERA_SRC = fs.readFileSync(path.join(ROOT, 'src', 'eras', 'era4-snes.js'), 'utf8');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8'));
const entryOf = (name) => MANIFEST.images.find((e) => e.name === name);
const embedder = () => import(pathToFileURL(path.join(ART, 'era4-snes-embed.mjs')).href);

let decoding = true;                    // flip to false: every image stays undecoded
class FakeImage {
  set src(v) {
    this._src = v;
    const png = Buffer.from(v.split(',')[1], 'base64');
    this._w = png.readUInt32BE(16);
    this._h = png.readUInt32BE(20);
  }
  get src() { return this._src; }
  get complete() { return decoding; }
  get naturalWidth() { return decoding ? this._w : 0; }
  get naturalHeight() { return decoding ? this._h : 0; }
}
globalThis.Image = FakeImage;
const eralooks = require('../tools/eralooks.js');
const { Pong, R } = eralooks.loadRenderer(ROOT);

/** The three data: URIs embedded in the era file. */
function embeds() {
  const out = {};
  for (const key of ['sky', 'paddle', 'ball']) {
    const m = new RegExp(key + ": '(data:image/png;base64,[^']+)'").exec(ERA_SRC);
    assert.ok(m, `${key} is embedded`);
    out[key] = m[1];
  }
  return out;
}
const bytesOf = (uri) => Buffer.from(uri.split(',')[1], 'base64');

/** A 2D context that records every call, with the state in force at the time. */
function canvas() {
  const calls = [];
  const st = { fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, lineWidth: 1,
    imageSmoothingEnabled: true, globalCompositeOperation: 'source-over' };
  const gradient = (kind) => ({ kind, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } });
  const ctx = new Proxy(st, {
    get(t, k) {
      if (k === 'createLinearGradient') return () => gradient('linear');
      if (k === 'createRadialGradient') return () => gradient('radial');
      if (k in t || typeof k === 'symbol') return t[k];
      return (...args) => {
        calls.push({ op: k, args, fillStyle: t.fillStyle, smoothing: t.imageSmoothingEnabled,
          comp: t.globalCompositeOperation });
      };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  return { ctx, calls };
}

/** A canvas-making document for the length of fn; answers what fn answers, with the canvases made. */
const made = [];
globalThis.document = {
  createElement() {
    const c = canvas();
    const el = { width: 0, height: 0, calls: c.calls, getContext: () => c.ctx };
    made.push(el);
    return el;
  }
};

function withDecoding(on, fn) {
  const was = decoding;
  decoding = on;
  try { return fn(); } finally { decoding = was; }
}

function rally(overrides) {
  const g = Pong.createGame({ rng: () => 0.1, phase: 'playing', era: 4 });
  g.serveDelay = 0;
  g.ball.x = 412.5;
  g.ball.y = 340;
  g.ball.vx = 420;
  g.ball.vy = -180;
  g.left.y = 280;
  g.right.y = 410;
  g.time = 12.25;
  return Object.assign(g, overrides || {});
}

function frame(state) {
  const c = canvas();
  R.draw(c.ctx, state);
  return c.calls;
}

const srcOf = (call) => (call.args[0] && call.args[0].src) || '';

/** RGBA pixels of an 8-bit, non-interlaced RGBA/RGB PNG. */
function decodePng(buf) {
  let at = 8, w = 0, h = 0, type = 0;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at), kind = buf.toString('ascii', at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9]; }
    else if (kind === 'IDAT') idat.push(data);
    at += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 4);
  const line = w * bpp;
  let prev = Buffer.alloc(line);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (line + 1)];
    const cur = Buffer.from(raw.subarray(y * (line + 1) + 1, (y + 1) * (line + 1)));
    for (let i = 0; i < line; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const add = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 :
        f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      cur[i] = (cur[i] + add) & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * bpp;
      out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = bpp === 4 ? cur[s + 3] : 255;
    }
    prev = cur;
  }
  return { w, h, px: out };
}

/** The opaque pixels' luminance: the brightest, and the average of the brightest tenth. */
function brightness(buf) {
  const { px } = decodePng(buf);
  const lum = [];
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    lum.push(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
  }
  lum.sort((a, b) => b - a);
  const top = lum.slice(0, Math.max(1, Math.round(lum.length / 10)));
  return { max: lum[0], top: top.reduce((s, v) => s + v, 0) / top.length };
}

test('the Super Nintendo art is committed: the three generations and the three pictures drawn, each matching its manifest entry', () => {
  for (const name of ['snes-sky', 'snes-paddle', 'snes-ball', 'era4-sky', 'era4-paddle', 'era4-ball']) {
    const e = entryOf(name);
    assert.ok(e, `${name} has a manifest entry`);
    const png = fs.readFileSync(path.join(ART, e.file));
    assert.deepStrictEqual({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }, e.pixels);
    assert.strictEqual(crypto.createHash('sha256').update(png).digest('hex'), e.sha256, `${name} is the image the manifest describes`);
    assert.ok(e.prompt && Number.isInteger(e.seed) && e.cost, `${name} can be made again`);
  }
  for (const key of ['sky', 'paddle', 'ball']) {
    const e = entryOf('era4-' + key);
    assert.strictEqual(e.derivedFrom, `snes-${key}.png`);
    assert.deepStrictEqual(e.cost, { type: 'derived', generations: 0 }, 'a derived picture costs no generation');
    assert.strictEqual(entryOf('snes-' + key).cost.generations, 1, 'its source was one generation');
  }
  // At the Super Nintendo's own scale: its 256-pixel line spans the 800-wide field, down to the horizon.
  assert.deepStrictEqual(entryOf('era4-sky').pixels, { width: 256, height: 48 });
  assert.strictEqual(48 * 800 / 256, R.eraLook(4).horizon);
});

test('the embedded pictures are exactly the committed era4-*.png files', () => {
  const e = embeds();
  for (const key of ['sky', 'paddle', 'ball']) {
    assert.ok(bytesOf(e[key]).equals(fs.readFileSync(path.join(ART, `era4-${key}.png`))), `${key} embed matches era4-${key}.png`);
  }
});

test('the embed script reproduces the committed pictures from the raw generations: 15-bit colour, one-bit transparency', async () => {
  const { toSnes, cropToOpaque, snap5, embed, PIECES } = await embedder();
  const { decodePng: dec, encodePng } = await import(pathToFileURL(path.join(ART, 'era2-nes-quantize.mjs')).href);
  assert.strictEqual(snap5(255), 255, 'white stays white, so the ball keeps its #ffffff core (R1)');
  assert.strictEqual(snap5(0), 0);
  const art = {};
  for (const p of PIECES) {
    let img = toSnes(dec(fs.readFileSync(path.join(ART, p.from))));
    if (p.crop) img = cropToOpaque(img);
    for (let i = 0; i < img.rgba.length; i += 4) {
      assert.ok(img.rgba[i + 3] === 0 || img.rgba[i + 3] === 255, `${p.to}: every pixel drawn or clear`);
      for (let c = 0; c < 3; c++) assert.strictEqual(snap5(img.rgba[i + c]), img.rgba[i + c], `${p.to}: a 15-bit colour`);
    }
    art[p.key] = encodePng(img.width, img.height, img.rgba);
    assert.ok(art[p.key].equals(fs.readFileSync(path.join(ART, p.to))), `${p.to} is what the script writes`);
  }
  assert.strictEqual(embed(ERA_SRC, art), ERA_SRC, 'and the era file already carries them');
});

test('with the pictures decoded, era 4 draws the sky, both paddles and the ball from them over its Mode 7 floor', () => {
  withDecoding(true, () => {
    const e = embeds();
    const g = rally();
    const calls = frame(g);
    const images = calls.filter((c) => c.op === 'drawImage');

    const sky = images.find((c) => srcOf(c) === e.sky);
    assert.ok(sky, 'the sky is the generated picture');
    assert.deepStrictEqual(sky.args.slice(1), [0, 0, 800, R.eraLook(4).horizon]);
    assert.strictEqual(sky.smoothing, false, 'unsmoothed, so its pixels stay square');
    assert.ok(!calls.some((c) => c.op === 'fillRect' && c.fillStyle.kind === 'linear' && c.args[1] === 0 && c.args[3] === R.eraLook(4).horizon),
      'and the hand-drawn gradient sky is not drawn under it');
    const floor = calls.findIndex((c) => c.op === 'fill' && c.fillStyle === '#2e2a86');
    assert.ok(floor > calls.indexOf(sky), 'the Mode 7 floor is still drawn, after the sky');

    const paddles = images.filter((c) => made.includes(c.args[0]));
    assert.strictEqual(paddles.length, 2, 'both paddles are the dyed sprite');
    for (const p of [g.left, g.right]) {
      assert.ok(paddles.some((c) => c.args.slice(1).join() === [p.x, p.y, p.w, p.h].join() && c.smoothing === false),
        'over the exact rectangle the rules collide with, unsmoothed');
    }

    const ball = images.find((c) => srcOf(c) === e.ball);
    assert.ok(ball, 'the ball is the generated picture');
    const [, bx, by, bw, bh] = ball.args;
    assert.deepStrictEqual([bw, bh], [16, 16], 'drawn at half its 32 pixels');
    assert.ok(Math.abs(bx + 8 - (g.ball.x + g.ball.size / 2)) <= 0.5 && Math.abs(by + 8 - (g.ball.y + g.ball.size / 2)) <= 0.5,
      'centred on the ball');
    assert.strictEqual(ball.smoothing, false);
    assert.ok(calls.indexOf(ball) > Math.max(...paddles.map((c) => calls.indexOf(c))), 'on top of both paddles (R2)');
    assert.ok(!calls.some((c) => c.op === 'fill' && c.fillStyle.kind === 'radial' && c.fillStyle.stops[0][1] === '#ffffff'),
      'and the hand-drawn orb is not drawn under it');
  });
});

test('each paddle wears its own ink: the ink overlaid on the grey sprite and cut to its shape, once per ink', () => {
  withDecoding(true, () => {
    const e = embeds();
    const g = rally();
    frame(g);
    const before = made.length;
    frame(g);
    frame(g);
    assert.strictEqual(made.length, before, 'drawing again makes no new canvases');

    const ink = '#5a8f2c';
    const P = Object.assign({}, R, { paddleInk: (s, side) => (side === 'left' ? ink : R.paddleInk(s, side)) });
    const look = R.eraLook(4);
    look.draw(canvas().ctx, g, undefined, P);
    look.draw(canvas().ctx, g, undefined, P);
    assert.strictEqual(made.length, before + 1, 'one new canvas for a new ink, across two frames');
    const dyed = made[made.length - 1];
    assert.deepStrictEqual(dyed.calls.map((x) => [x.op, x.comp]), [
      ['drawImage', 'source-over'], ['fillRect', 'overlay'], ['drawImage', 'destination-in']
    ], 'the picture, the ink overlaid on it, the picture\'s shape kept');
    assert.strictEqual(dyed.calls[1].fillStyle, ink);
    assert.ok(srcOf(dyed.calls[0]) === e.paddle && srcOf(dyed.calls[2]) === e.paddle);
    assert.deepStrictEqual([dyed.width, dyed.height], [10, 58], 'the paddle cropped to the pixels it draws');
  });
});

test('before the pictures have decoded, era 4 draws its hand-drawn sky, paddles and ball for that frame', () => {
  withDecoding(false, () => {
    // Inks no test has dyed yet: a dye, once made, is kept, which is right for the page.
    const g = rally();
    const P = Object.assign({}, R, { paddleInk: (s, side) => (side === 'left' ? '#123456' : '#654321') });
    const c = canvas();
    R.eraLook(4).draw(c.ctx, g, undefined, P);
    const calls = c.calls;
    const fromArt = calls.filter((c) => c.op === 'drawImage' && (srcOf(c).startsWith('data:image/png') || made.includes(c.args[0])));
    assert.strictEqual(fromArt.length, 0, 'nothing drawn from a picture yet');
    assert.ok(calls.some((c) => c.op === 'fillRect' && c.fillStyle.kind === 'linear' && c.args.join() === [0, 0, 800, R.eraLook(4).horizon].join()),
      'the gradient sky');
    assert.ok(calls.some((c) => c.op === 'fill' && c.fillStyle.kind === 'radial' && c.fillStyle.stops[0][1] === '#ffffff'), 'the lit orb');
    assert.ok(calls.filter((c) => c.op === 'fill' && c.fillStyle.kind === 'linear').length >= 2, 'the shaded paddles');
  });
});

test('the ball stays the brightest thing on the court: its picture outshines the sky and the paddle (R1)', () => {
  const e = embeds();
  const ball = brightness(bytesOf(e.ball));
  const sky = brightness(bytesOf(e.sky));
  const paddle = brightness(bytesOf(e.paddle));     // before it is dyed, which only darkens it
  assert.strictEqual(Math.round(ball.max), 255, 'a white-hot core');
  assert.ok(ball.max >= sky.max, `brightest pixel: ball ${ball.max.toFixed(0)}, sky ${sky.max.toFixed(0)}`);
  assert.ok(ball.max >= paddle.max, `brightest pixel: ball ${ball.max.toFixed(0)}, paddle ${paddle.max.toFixed(0)}`);
  assert.ok(ball.top > sky.top, `brightest tenth: ball ${ball.top.toFixed(0)}, sky ${sky.top.toFixed(0)}`);
  assert.ok(ball.top > paddle.top, `brightest tenth: ball ${ball.top.toFixed(0)}, paddle ${paddle.top.toFixed(0)}`);
});
