'use strict';
/*
 * Era 3's generated pixel art (item 1179): the pixellab court, paddles and
 * ball, snapped to the Genesis palette and drawn with drawImage. Node has no
 * Image, so each test hands the era a stand-in sprite loader for the length of
 * the test and takes it away again; the rest of the suite sees the plain
 * hand-drawn look, exactly as the page does until the pictures have decoded.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets', 'pixellab');
const { Pong, R } = eralooks.loadRenderer(ROOT);
const look = R.eraLook(3);
const ART = ['genesis-court', 'genesis-paddle', 'genesis-ball'];

function rally() {
  const g = Pong.createGame({ rng: () => 0.1, phase: 'playing', era: 3 });
  g.serveDelay = 0;
  g.time = 12.5;
  g.ball.x = 300;
  g.ball.y = 200;
  g.ball.vx = 420;
  g.ball.vy = -160;
  g.left.y = 120;
  g.right.y = 330;
  return g;
}

/** A recording canvas that also remembers every drawImage. */
function recorder() {
  const rec = eralooks.recorder();
  rec.images = [];
  rec.ctx.drawImage = (img, ...args) => rec.images.push([img, ...args]);
  return rec;
}

/**
 * Run fn with a stand-in PongSprites (every name decoded when `ready`), an
 * Image constructor and a document whose canvases record, then restore them.
 */
function withArt(ready, fn) {
  const saved = { S: globalThis.PongSprites, Image: globalThis.Image, document: globalThis.document };
  const sizes = { 'genesis-court': [320, 240], 'genesis-paddle': [12, 96], 'genesis-ball': [24, 24] };
  const loaded = [];
  const fake = {
    load(name) { loaded.push(name); return { name, naturalWidth: sizes[name][0], naturalHeight: sizes[name][1] }; },
    ready: () => ready,
    draw(ctx, name, x, y, w, h) {
      if (!ready) { loaded.push(name); return false; }
      ctx.drawImage({ name }, x, y, w, h);
      return true;
    }
  };
  globalThis.PongSprites = fake;
  globalThis.Image = function Image() {};
  globalThis.document = {
    createElement: () => {
      const c = { width: 0, height: 0, tinted: true };
      c.getContext = () => recorder().ctx;
      return c;
    }
  };
  try {
    return fn(loaded);
  } finally {
    for (const [k, v] of [['PongSprites', saved.S], ['Image', saved.Image], ['document', saved.document]]) {
      if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
    }
  }
}

test('with the art decoded, the court, the paddles and the ball are drawn from their pictures', () => {
  const g = rally();
  const rec = withArt(true, () => { const r = recorder(); R.draw(r.ctx, g); return r; });
  const byName = (n) => rec.images.filter(([img]) => img.name === n);

  // The court fills the field edge to edge, in one or two copies as it scrolls.
  const court = byName('genesis-court');
  assert.ok(court.length >= 1 && court.length <= 2, `${court.length} copies of the court`);
  for (const [, , y, w, h] of court) assert.deepStrictEqual([y, w, h], [0, g.width, g.height]);
  // ...in place of the hand-drawn sky: none of its bands are painted.
  assert.ok(!rec.calls.some(([ink, x, y, w]) => ink === '#000024' && x === 0 && y === 0 && w === g.width),
    'the banded sky is not drawn under the picture');

  // One tinted copy of the paddle art per side, drawn into the paddle's own box.
  for (const side of ['left', 'right']) {
    const p = g[side];
    const hits = rec.images.filter(([img, x, y, w, h]) => img.tinted && x === p.x && y === p.y && w === p.w && h === p.h);
    assert.strictEqual(hits.length, 1, `${side} paddle drawn once from its picture`);
    assert.ok(rec.calls.some(([ink, x, y]) => ink === look.SHADOW && x === p.x + 5 && y === p.y + 5), `${side} paddle casts a shadow`);
  }

  // The ball is its picture at the ball's own box, and the trail still follows it.
  const ball = byName('genesis-ball');
  assert.deepStrictEqual(ball.map((c) => c.slice(1)), [[Math.round(g.ball.x), Math.round(g.ball.y), g.ball.size, g.ball.size]]);
  assert.ok(!rec.calls.some(([ink]) => ink === '#b6b6db'), 'the hand-drawn ball body is not drawn');
  assert.strictEqual(rec.calls.filter(([ink]) => ink.startsWith(`rgba(${look.TRAIL_INK},`)).length, look.TRAIL);
});

test('the court scrolls with the far plane and always covers the whole field', () => {
  for (const t of [0, 7.3, 66.6, 133.4, 400]) {
    const g = rally();
    g.time = t;
    const rec = withArt(true, () => { const r = recorder(); R.draw(r.ctx, g); return r; });
    const court = rec.images.filter(([img]) => img.name === 'genesis-court');
    // A mirrored copy is drawn at 0 under a transform, so read each copy's left
    // edge off the scroll instead: together they must span 0..width.
    const off = ((look.planes(t).far % (2 * g.width)) + 2 * g.width) % (2 * g.width);
    const lefts = [0, 1, 2].map((k) => Math.floor(k * g.width - off)).filter((x) => x < g.width && x + g.width > 0);
    assert.strictEqual(court.length, lefts.length, `at ${t} s`);
    assert.ok(Math.min(...lefts) <= 0 && Math.max(...lefts) + g.width >= g.width, `covered at ${t} s`);
  }
});

test('while the art is still loading the frame is the hand-drawn look, call for call', () => {
  const g = rally();
  const plain = recorder();
  R.draw(plain.ctx, g);
  const { rec, loaded } = withArt(false, (l) => { const r = recorder(); R.draw(r.ctx, g); return { rec: r, loaded: l }; });
  assert.deepStrictEqual(rec.calls, plain.calls);
  assert.strictEqual(rec.images.length, 0);
  for (const n of ART) assert.ok(loaded.includes(n), `${n} is asked for, so it will be ready next frame`);
});

test('the era file never reads or writes a pixel', () => {
  const code = fs.readFileSync(path.join(ROOT, 'src', 'eras', 'era3-genesis.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const k of ['getImageData', 'putImageData', 'createImageData']) {
    assert.ok(!code.includes(k), `era 3 does not call ${k}`);
  }
});

test('the three pictures are on the Genesis palette, recorded with their snap, and the ball is the brightest', async () => {
  const snap = await import('../tools/palette-snap.mjs');
  const manifest = JSON.parse(fs.readFileSync(path.join(ASSETS, 'manifest.json'), 'utf8'));
  const levels = new Set(look.LEVELS);
  const mean = {};
  for (const name of ART) {
    const entry = manifest.images.find((e) => e.name === name);
    assert.ok(entry, `${name} has a manifest entry`);
    assert.strictEqual(entry.palette.bits, 3, `${name} was snapped to 3 bits a channel`);
    assert.deepStrictEqual(entry.palette.levels, look.LEVELS, `${name}: the era's own levels`);
    assert.match(entry.palette.sourceSha256, /^[0-9a-f]{64}$/, `${name}: the image pixellab returned is named`);
    const img = snap.decode(fs.readFileSync(path.join(ASSETS, entry.file)));
    let sum = 0;
    let solid = 0;
    for (let i = 0; i < img.rgba.length; i += 4) {
      const a = img.rgba[i + 3];
      assert.ok(a === 0 || a === 255, `${name}: no half-clear pixels`);
      if (!a) continue;
      for (let c = 0; c < 3; c++) assert.ok(levels.has(img.rgba[i + c]), `${name}: off-palette pixel at ${i / 4}`);
      sum += 0.2126 * img.rgba[i] + 0.7152 * img.rgba[i + 1] + 0.0722 * img.rgba[i + 2];
      solid += 1;
    }
    mean[name] = sum / solid;
  }
  // Readability: the ball outshines everything else. The paddle art is before
  // its tint, which only darkens it (a multiply), so this is the hardest case.
  assert.ok(mean['genesis-ball'] > mean['genesis-paddle'] + 40, `ball ${mean['genesis-ball'].toFixed(0)} vs paddle ${mean['genesis-paddle'].toFixed(0)}`);
  assert.ok(mean['genesis-ball'] > 4 * mean['genesis-court'], `ball ${mean['genesis-ball'].toFixed(0)} vs court ${mean['genesis-court'].toFixed(0)}`);
});
