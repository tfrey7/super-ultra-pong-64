'use strict';
/*
 * Era 4's pixel art (item 1180): the sky, the paddles and the ball are images
 * made with tools/pixellab.mjs, drawn through window.PongSprites with one
 * drawImage each. The images are committed with their manifest entries; until
 * one has decoded, that piece draws its hand-drawn look instead. The Mode 7
 * floor stays hand-drawn -- it scrolls in perspective every frame, which a
 * still picture cannot.
 *
 * Node has no Image and no canvas, so this file hands era 4 a sprite loader
 * built with fake images (PongSprites.create({ makeImage })) and, for the
 * paddle's dye, a fake document whose canvases record what is drawn on them.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
const Sprites = require('../src/sprites.js');
delete globalThis.PongSprites;          // each test below installs the loader it wants

const ART = path.join(ROOT, 'assets', 'pixellab');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8'));
const NAMES = ['snes-sky', 'snes-paddle', 'snes-ball'];
const entryOf = (name) => MANIFEST.images.find((e) => e.name === name);

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

/** An image that decodes (to its manifest size) as soon as it is given a src -- or never. */
function makeImage(never) {
  return () => {
    const img = { width: 0, height: 0, naturalWidth: 0, naturalHeight: 0, complete: false };
    Object.defineProperty(img, 'src', {
      get() { return this._src; },
      set(v) {
        this._src = v;
        if (never) return;
        const e = entryOf(path.basename(v, '.png'));
        if (!e) { if (this.onerror) this.onerror(); return; }
        this.width = this.naturalWidth = e.pixels.width;
        this.height = this.naturalHeight = e.pixels.height;
        this.complete = true;
        if (this.onload) this.onload();
      }
    });
    return img;
  };
}

/** Install a sprite loader and a canvas-making document for the length of fn. */
function withSprites(opts, fn) {
  const made = [];
  globalThis.PongSprites = Sprites.create({ makeImage: makeImage(opts.never) });
  globalThis.document = {
    createElement() {
      const c = canvas();
      const el = { width: 0, height: 0, calls: c.calls, getContext: () => c.ctx };
      made.push(el);
      return el;
    }
  };
  try {
    return fn(made);
  } finally {
    delete globalThis.PongSprites;
    delete globalThis.document;
  }
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

/** RGBA pixels of an 8-bit, non-interlaced PNG (colour type 2 or 6), for the brightness check. */
function decodePng(buf) {
  let at = 8, idat = [], w = 0, h = 0, type = 0;
  while (at < buf.length) {
    const len = buf.readUInt32BE(at), kind = buf.toString('ascii', at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + len);
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9];
      assert.strictEqual(data[8], 8, 'an 8-bit PNG');
      assert.strictEqual(data[12], 0, 'not interlaced');
    } else if (kind === 'IDAT') idat.push(data);
    at += 12 + len;
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 0;
  assert.ok(bpp, `colour type ${type} is RGB or RGBA`);
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
function brightness(file) {
  const { px } = decodePng(fs.readFileSync(path.join(ART, file)));
  const lum = [];
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    lum.push(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
  }
  lum.sort((a, b) => b - a);
  const top = lum.slice(0, Math.max(1, Math.round(lum.length / 10)));
  return { max: lum[0], top: top.reduce((s, v) => s + v, 0) / top.length };
}

test('the Super Nintendo art is committed: each PNG matches its manifest entry, prompt, seed and bill included', () => {
  for (const name of NAMES) {
    const e = entryOf(name);
    assert.ok(e, `${name} has a manifest entry`);
    const png = fs.readFileSync(path.join(ART, e.file));
    assert.strictEqual(png.subarray(1, 4).toString('ascii'), 'PNG');
    assert.deepStrictEqual({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }, e.pixels);
    assert.deepStrictEqual(e.pixels, e.size, 'saved at the size it was asked for');
    assert.strictEqual(crypto.createHash('sha256').update(png).digest('hex'), e.sha256, `${name} is the image the manifest describes`);
    assert.ok(e.prompt && Number.isInteger(e.seed) && e.cost, `${name} can be made again`);
  }
  // At the Super Nintendo's own scale: its 256-pixel line spans the 800-wide field.
  assert.deepStrictEqual(entryOf('snes-sky').pixels, { width: 256, height: 48 });
  assert.strictEqual(entryOf('snes-sky').pixels.height * 800 / 256, R.eraLook(4).horizon, 'the sky fills exactly down to the horizon');
});

test('with the images decoded, era 4 draws the sky, both paddles and the ball as sprites over its Mode 7 floor', () => {
  withSprites({}, (made) => {
    const g = rally();
    const calls = frame(g);
    const images = calls.filter((c) => c.op === 'drawImage');

    const sky = images.find((c) => srcOf(c).endsWith('snes-sky.png'));
    assert.ok(sky, 'the sky is the generated image');
    assert.deepStrictEqual(sky.args.slice(1), [0, 0, 800, R.eraLook(4).horizon]);
    assert.ok(!calls.some((c) => c.op === 'fillRect' && c.fillStyle.kind === 'linear' && c.args[1] === 0),
      'and the hand-drawn gradient sky is not drawn under it');
    const floor = calls.findIndex((c) => c.op === 'fill' && c.fillStyle === '#2e2a86');
    assert.ok(floor > calls.indexOf(sky), 'the Mode 7 floor is still drawn, after the sky');

    const paddles = images.filter((c) => made.includes(c.args[0]));
    assert.strictEqual(paddles.length, 2, 'both paddles are the dyed sprite');
    for (const p of [g.left, g.right]) {
      assert.ok(paddles.some((c) => c.args.slice(1).join() === [p.x, p.y, p.w, p.h].join() && c.smoothing === false),
        'over the exact rectangle the rules collide with, unsmoothed');
    }

    const ball = images.find((c) => srcOf(c).endsWith('snes-ball.png'));
    assert.ok(ball, 'the ball is the generated image');
    const [, bx, by, bw, bh] = ball.args;
    assert.deepStrictEqual([bw, bh], [16, 16], 'drawn at half its 32 pixels, so every pixel stays whole');
    assert.ok(Math.abs(bx + 8 - (g.ball.x + g.ball.size / 2)) <= 0.5 && Math.abs(by + 8 - (g.ball.y + g.ball.size / 2)) <= 0.5,
      'centred on the ball');
    assert.strictEqual(ball.smoothing, false);
    assert.ok(calls.indexOf(ball) > Math.max(...paddles.map((c) => calls.indexOf(c))), 'on top of both paddles');
    assert.ok(!calls.some((c) => c.op === 'fill' && c.fillStyle.kind === 'radial' && c.fillStyle.stops[0][1] === '#ffffff'),
      'and the hand-drawn orb is not drawn under it');
  });
});

test('each paddle wears its own ink: the grey sprite multiplied by the ink and cut to its shape, once per ink', () => {
  withSprites({}, (made) => {
    const g = rally();
    const inks = [R.paddleInk(g, 'left'), R.paddleInk(g, 'right')];
    frame(g);
    const dyedNow = made.length;
    for (const ink of inks) {
      // The dye for this ink may have been made by the test above; find it or it is made here.
      frame(g);
    }
    assert.strictEqual(made.length, dyedNow, 'drawing again makes no new canvases');
    // A fresh ink is dyed exactly once, however many frames draw it.
    const fresh = rally({ time: 13 });
    const ink = '#5a8f2c';
    fresh.left.ink = ink;
    const before = made.length;
    const orig = R.paddleInk;
    const look = R.eraLook(4);
    const c = canvas();
    look.draw(c.ctx, fresh, undefined, Object.assign({}, R, { paddleInk: (s, side) => (side === 'left' ? ink : orig(s, side)) }));
    look.draw(canvas().ctx, fresh, undefined, Object.assign({}, R, { paddleInk: (s, side) => (side === 'left' ? ink : orig(s, side)) }));
    assert.strictEqual(made.length, before + 1, 'one new canvas for the new ink, across two frames');
    const dye = made[made.length - 1].calls;
    assert.deepStrictEqual(dye.map((x) => [x.op, x.comp]), [
      ['drawImage', 'source-over'], ['fillRect', 'multiply'], ['drawImage', 'destination-in']
    ], 'the image, the ink multiplied over it, the image\'s shape kept');
    assert.strictEqual(dye[1].fillStyle, ink);
    assert.ok(srcOf(dye[0]).endsWith('snes-paddle.png') && srcOf(dye[2]).endsWith('snes-paddle.png'));
    assert.deepStrictEqual([made[made.length - 1].width, made[made.length - 1].height], [16, 64]);
  });
});

test('before an image has decoded, era 4 draws its hand-drawn sky, paddles and ball for that frame', () => {
  withSprites({ never: true }, (made) => {
    const g = rally();
    const calls = frame(g);
    assert.strictEqual(calls.filter((c) => c.op === 'drawImage').length, 0, 'nothing drawn from an image yet');
    assert.strictEqual(made.length, 0, 'no dye made for an image that is not there');
    assert.ok(calls.some((c) => c.op === 'fillRect' && c.fillStyle.kind === 'linear' && c.args.join() === [0, 0, 800, R.eraLook(4).horizon].join()),
      'the gradient sky');
    assert.ok(calls.some((c) => c.op === 'fill' && c.fillStyle.kind === 'radial' && c.fillStyle.stops[0][1] === '#ffffff'), 'the lit orb');
    assert.ok(calls.filter((c) => c.op === 'fill' && c.fillStyle.kind === 'linear').length >= 2, 'the shaded paddles');
  });
});

test('the ball stays the brightest thing on the court: its sprite outshines the sky and the paddle', () => {
  const ball = brightness('snes-ball.png');
  const sky = brightness('snes-sky.png');
  const paddle = brightness('snes-paddle.png');     // before it is dyed, which only darkens it
  assert.ok(ball.max >= sky.max, `brightest pixel: ball ${ball.max.toFixed(0)}, sky ${sky.max.toFixed(0)}`);
  assert.ok(ball.max >= paddle.max, `brightest pixel: ball ${ball.max.toFixed(0)}, paddle ${paddle.max.toFixed(0)}`);
  assert.ok(ball.top > sky.top, `brightest tenth: ball ${ball.top.toFixed(0)}, sky ${sky.top.toFixed(0)}`);
  assert.ok(ball.top > paddle.top, `brightest tenth: ball ${ball.top.toFixed(0)}, paddle ${paddle.top.toFixed(0)}`);
});
