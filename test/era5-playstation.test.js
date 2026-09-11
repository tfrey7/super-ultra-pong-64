'use strict';
/*
 * Era 5, the 1994 Sony PlayStation (docs/ERAS.md chapter 6): a 320 x 240 buffer
 * scaled up sharp, 8 affine-textured triangles, a snapping, wobbling camera,
 * ordered-dithered gradients, a faceted gem of a ball and the bible's voice --
 * and not one rule different from any other era.
 *
 * The look needs a document for its buffer and tiles, so most tests hand the
 * table helper a stand-in one whose canvases record every call.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
const T = R.table3d;
const PongSound = require('../src/sound.js');
const look = R.eraLook(5);

const close = (got, want, msg, eps = 1e-6) => assert.ok(Math.abs(got - want) < eps, `${msg}: ${got} vs ${want}`);

// ----------------------------------------------------------- stand-ins
// One log for the whole file: the table helper caches its buffers and tiles, so
// a canvas made in one test is drawn into again in the next.
const LOG = [];

function recCtx(name, own) {
  const st = { fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, lineWidth: 1, imageSmoothingEnabled: true };
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const special = {
    save() { stack.push([Object.assign({}, st), m.slice()]); },
    restore() { const s = stack.pop(); if (s) { Object.assign(st, s[0]); m = s[1]; } },
    setTransform(a, b, c, d, e, f) { m = [a, b, c, d, e, f]; },
    createPattern(canvas, rep) { return { pattern: canvas, rep }; },
    createLinearGradient(...args) { return { kind: 'linear', args, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } }; },
    createRadialGradient(...args) { return { kind: 'radial', args, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } }; }
  };
  const ctx = new Proxy(st, {
    get(t, k) {
      if (typeof k === 'symbol') return undefined;
      if (k in t) return t[k];
      return (...args) => {
        const entry = { ctx: name, op: k, args, fillStyle: st.fillStyle, alpha: st.globalAlpha, m: m.slice(), smooth: st.imageSmoothingEnabled };
        LOG.push(entry);
        if (own) own.push(entry);
        return special[k] ? special[k](...args) : undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  return ctx;
}

let made = 0;
const fakeDocument = {
  createElement() {
    const c = { width: 0, height: 0, id: `canvas${made++}`, ops: [] };
    const ctx = recCtx(c.id, c.ops);
    c.getContext = () => ctx;
    return c;
  }
};

/** Draw one frame with a document present; the log of that frame only. */
function pageFrame(state, opts) {
  globalThis.document = fakeDocument;
  try {
    LOG.length = 0;
    R.draw(recCtx('main'), state, opts);
    return LOG.slice();
  } finally {
    delete globalThis.document;
  }
}

/** A rally in progress at era 5: both paddles placed, the ball in flight. */
function rally(overrides) {
  const g = Pong.createGame({ rng: () => 0.1, phase: 'playing', era: 5 });
  g.serveDelay = 0;
  g.score.left = 3;
  g.score.right = 17;
  g.ball.x = 530; g.ball.y = 240; g.ball.vx = 380; g.ball.vy = -120;
  g.left.y = 380; g.right.y = 60;
  g.time = 12.25;
  return Object.assign(g, overrides || {});
}

const upscale = (log) => log.find((o) => o.ctx === 'main' && o.op === 'drawImage');
const bufferOps = (log) => { const up = upscale(log); return log.filter((o) => o.ctx === up.args[0].id); };
const isPattern = (s) => s && typeof s === 'object' && s.pattern;

// ---------------------------------------------------------------- look
test('era 5 is the PlayStation, built rather than a placeholder, on the bible\'s camera', () => {
  assert.match(look.name, /Sony PlayStation/);
  assert.ok(!look.placeholder);
  assert.deepStrictEqual(look.camera, { tilt: 28, height: 1150, fov: 30, screenY: 306 }, 'at rest: the pose section 12 measures');
  assert.strictEqual(look.motion.snap, 2.5);
  assert.deepStrictEqual(look.buffer, { key: 'ps1', w: 320, h: 240, scale: 0.4 });
  assert.strictEqual(R.paddleInk(rally(), 'left'), R.eraLook(1).paddleInk(rally(), 'left'), 'wears the colours era 1 picked');
});

test('the camera wobbles every frame by the bible\'s amplitudes, and snaps to the 2.5 pixel chunk grid', () => {
  const heights = new Set();
  for (let t = 0; t < 12; t += 0.37) {
    const cam = look.cameraAt(T, { time: t }, look.camera);
    close(cam.height, 1150 + 6 * Math.sin(t * 1.3), `height at ${t}`);
    close(cam.panX, 1.5 * Math.sin(t * 2.1), `panX at ${t}`);
    assert.strictEqual(cam.snap, 2.5);
    assert.strictEqual(cam.tilt, 28);
    assert.ok(cam.height >= 1144 && cam.height <= 1156 && Math.abs(cam.panX) <= 1.5, 'never past the measured poses');
    heights.add(cam.height.toFixed(3));
  }
  assert.ok(heights.size > 20, 'it moves');
});

test('every vertex snaps to the grid, so a still corner pops between chunks as the camera wobbles', () => {
  const seen = new Set();
  for (let t = 0; t < 6; t += 0.05) {
    const p = T.project(look.cameraAt(T, { time: t }), 90, 0, 22);
    close(p.x / 2.5, Math.round(p.x / 2.5), 'x on the grid');
    close(p.y / 2.5, Math.round(p.y / 2.5), 'y on the grid');
    seen.add(`${p.x},${p.y}`);
  }
  assert.ok(seen.size >= 3, `the far rail's corner lands on ${seen.size} different chunks`);
});

// -------------------------------------------------------------- picture
test('the picture is drawn at 320 x 240 and scaled up sharp; the ball never enters the buffer', () => {
  const log = pageFrame(rally());
  const up = upscale(log);
  assert.ok(up, 'the buffer is copied onto the canvas');
  assert.strictEqual(up.args[0].width, 320);
  assert.strictEqual(up.args[0].height, 240);
  assert.deepStrictEqual(up.args.slice(1), [0, 0, 800, 600], 'stretched over the whole field');
  assert.strictEqual(up.smooth, false, 'with smoothing off: hard-edged chunks');
  const buf = bufferOps(log);
  assert.ok(buf.some((o) => o.op === 'setTransform' && o.args[0] === 0.4 && o.args[3] === 0.4), 'field units address the buffer through a 0.4 transform');
  assert.ok(!buf.some((o) => o.op === 'fill' && o.fillStyle === '#ffffff'), 'no white in the buffer: the ball is not in it (R2)');
  const main = log.filter((o) => o.ctx === 'main' && o.op === 'fill');
  assert.ok(main.length && log.indexOf(main[0]) > log.indexOf(up), 'everything on the canvas itself comes after the upscale');
});

test('the table is 8 triangles, each mapped by one affine transform: no perspective correction, so it swims', () => {
  const g = rally();
  const cam = look.cameraAt(T, g, look.camera);
  const buf = bufferOps(pageFrame(g));
  const clips = buf.filter((o) => o.op === 'clip');
  assert.strictEqual(clips.length, 8, 'eight clipped triangles');
  const maps = buf.filter((o) => o.op === 'transform');
  assert.strictEqual(maps.length, 8, 'one affine map each');
  let worst = 0;
  look.triangles.forEach((tri, i) => {
    const p = tri.map(([x, y]) => T.project(cam, x, y, 0));
    const want = look.affine(...tri.flatMap(([x, y]) => [x * look.uv, y * look.uv]), ...p.flatMap((q) => [q.x, q.y]));
    want.forEach((v, j) => close(maps[i].args[j], v, `triangle ${i} matrix ${j}`, 1e-9));
    // Each corner's texture point lands on its snapped screen corner...
    tri.forEach(([x, y], c) => {
      const [a, b, cc, d, e, f] = want;
      close(a * x * look.uv + cc * y * look.uv + e, p[c].x, 'u to x', 1e-6);
      close(b * x * look.uv + d * y * look.uv + f, p[c].y, 'v to y', 1e-6);
    });
    // ...but the middle of the triangle does not land where perspective puts it.
    const mx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, my = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    const [a, b, cc, d, e, f] = want;
    const exact = T.project(T.camera(Object.assign({}, cam, { snap: 0 })), mx, my, 0);
    worst = Math.max(worst, Math.hypot(a * mx * look.uv + cc * my * look.uv + e - exact.x, b * mx * look.uv + d * my * look.uv + f - exact.y));
    const fill = buf[buf.indexOf(maps[i]) + 1];
    assert.strictEqual(fill.op, 'fillRect');
    assert.ok(isPattern(fill.fillStyle), 'filled with the texture');
  });
  assert.ok(worst > 5, `the texture is off true perspective by up to ${worst.toFixed(1)} px: the swim`);
  assert.ok(clips.every((c) => c.fillStyle !== '#2b3a55'), 'no base colour papered under the triangles');
});

test('the texture is a 64 x 64 tile built once from rectangles: an 8 x 8 checker and one scuff', () => {
  const buf = bufferOps(pageFrame(rally()));
  const fill = buf.find((o) => o.op === 'fillRect' && isPattern(o.fillStyle) && o.fillStyle.pattern.width === 64);
  assert.ok(fill, 'the triangles are filled with a 64 pixel tile');
  const rects = fill.fillStyle.pattern.ops.filter((o) => o.op === 'fillRect');
  const byColour = (c) => rects.filter((o) => o.fillStyle === c).length;
  assert.strictEqual(byColour('#3c4f78'), 32);
  assert.strictEqual(byColour('#24324f'), 32);
  assert.strictEqual(byColour('#1a2236'), 32, 'a diagonal scuff line');
  assert.ok(!fill.fillStyle.pattern.ops.some((o) => /ImageData/.test(o.op)), 'no pixel reads or writes');
  const again = bufferOps(pageFrame(rally({ time: 30 })));
  const next = again.find((o) => o.op === 'fillRect' && isPattern(o.fillStyle) && o.fillStyle.pattern.width === 64);
  assert.strictEqual(next.fillStyle, fill.fillStyle, 'the same tile, not rebuilt');
});

test('the table\'s corners move between frames: edges wobble even on a still rally', () => {
  const corners = (time) => bufferOps(pageFrame(rally({ time })))
    .filter((o) => o.op === 'moveTo' || o.op === 'lineTo').map((o) => o.args.join(','));
  const a = corners(3.0), b = corners(3.4);
  assert.notDeepStrictEqual(a, b);
  assert.deepStrictEqual(corners(3.0), a, 'the same moment always draws the same frame');
});

test('gradients are ordered-dithered: 6 flat backdrop bands with Bayer strips across every seam, and a 3-band pool of light', () => {
  const buf = bufferOps(pageFrame(rally()));
  const bands = buf.filter((o) => o.op === 'fillRect' && typeof o.fillStyle === 'string' && o.args[2] === 320 && o.args[3] === 40);
  assert.strictEqual(bands.length, 6, 'six flat bands');
  assert.strictEqual(bands[0].fillStyle, '#07070c');
  assert.strictEqual(bands[5].fillStyle, '#2b3a55');
  const strips = buf.filter((o) => o.op === 'fillRect' && isPattern(o.fillStyle) && o.fillStyle.pattern.width === 4 && o.args[2] === 320);
  assert.strictEqual(strips.length, 15, 'three strips on each of five seams');
  for (const s of strips) {
    const cells = s.fillStyle.pattern.ops.filter((o) => o.op === 'fillRect');
    assert.strictEqual(cells.length, 16, 'a 4 x 4 tile of 1-pixel cells');
    assert.deepStrictEqual(s.m, [1, 0, 0, 1, 0, 0], 'laid in buffer pixels');
  }
  const pool = buf.filter((o) => o.op === 'fill' && isPattern(o.fillStyle) &&
    o.fillStyle.pattern.ops.some((c) => c.fillStyle === '#4b5f8f'));
  assert.strictEqual(pool.length, 3, 'three stippled bands of light');
  const lit = pool.map((p) => p.fillStyle.pattern.ops.filter((c) => c.op === 'fillRect' && c.fillStyle === '#4b5f8f').length);
  assert.deepStrictEqual(lit, [4, 8, 12], 'denser toward the middle');
});

test('paddles are flat-shaded boxes with a stippled top, far one first, near face in full ink (R4)', () => {
  const g = rally();
  const buf = bufferOps(pageFrame(g));
  const left = R.paddleInk(g, 'left'), right = R.paddleInk(g, 'right');
  const fills = buf.filter((o) => o.op === 'fill');
  const iRight = fills.findIndex((o) => o.fillStyle === right);
  const iLeft = fills.findIndex((o) => o.fillStyle === left);
  assert.ok(iRight >= 0 && iLeft >= 0, 'each paddle has a face in its own ink');
  assert.ok(iRight < iLeft, 'the far paddle (right, y 60) first');
  const sheens = fills.filter((o) => isPattern(o.fillStyle) &&
    o.fillStyle.pattern.ops.some((c) => c.fillStyle === T.shade(left, 0.6) || c.fillStyle === T.shade(right, 0.6)));
  assert.strictEqual(sheens.length, 2, 'a stippled top on each');
});

test('the ball is a low-poly gem: 8 facets from its centre, drawn last, only its brightest facets white (R1)', () => {
  const g = rally();
  const cam = look.cameraAt(T, g, look.camera);
  const s = T.ballScreen(cam, g);
  const log = pageFrame(g);
  const fills = log.filter((o) => o.ctx === 'main' && o.op === 'fill');
  assert.strictEqual(fills.length, 8, 'eight facets on the canvas');
  assert.deepStrictEqual(fills.map((o) => o.fillStyle),
    ['#b4b4b4', '#b4b4b4', '#b4b4b4', '#b4b4b4', '#dcdcdc', '#dcdcdc', '#ffffff', '#ffffff']);
  const main = log.filter((o) => o.ctx === 'main');
  assert.strictEqual(main.filter((o) => o.op === 'fill').pop(), main.filter((o) => o.op === 'fill' || o.op === 'fillRect' || o.op === 'drawImage').pop(), 'white is the last thing drawn');
  const starts = main.filter((o) => o.op === 'moveTo');
  starts.forEach((o) => { close(o.args[0], s.x, 'facet from the centre x'); close(o.args[1], s.y, 'facet from the centre y'); });
  const tips = main.filter((o) => o.op === 'lineTo');
  tips.forEach((o) => close(Math.hypot(o.args[0] - s.x, o.args[1] - s.y), s.r, 'a vertex on the ball radius'));
  // White facets point up and left.
  const whiteTips = tips.slice(12);
  assert.ok(whiteTips.every((o) => o.args[0] <= s.x + 1e-9 && o.args[1] <= s.y + 1e-9), 'the white facets are the upper-left ones');
  const others = log.filter((o) => o.ctx !== 'main' && (o.op === 'fill' || o.op === 'fillRect') && o.fillStyle === '#ffffff');
  assert.deepStrictEqual(others, [], 'nothing else is white');
});

test('in the serve pause the ball and its contact shadow are both hidden', () => {
  const log = pageFrame(rally({ serveDelay: 0.5 }));
  assert.strictEqual(log.filter((o) => o.ctx === 'main' && o.op === 'fill').length, 0, 'no gem');
  assert.ok(!bufferOps(log).some((o) => o.fillStyle === 'rgba(0,0,0,0.55)' && o.op === 'fill'), 'no shadow');
  assert.ok(bufferOps(pageFrame(rally())).some((o) => o.fillStyle === 'rgba(0,0,0,0.55)' && o.op === 'fill'), 'a shadow in play');
});

test('the score is bold chunky block digits drawn into the buffer on whole pixels, above the far edge (R8)', () => {
  const g = rally();
  const cam = look.cameraAt(T, g, look.camera);
  const buf = bufferOps(pageFrame(g));
  const ink = buf.filter((o) => o.op === 'fillRect' && o.fillStyle === '#e8e8e8');
  const shadow = buf.filter((o) => o.op === 'fillRect' && o.fillStyle === '#000000');
  assert.ok(ink.length > 20, 'the digits are drawn');
  assert.strictEqual(shadow.length, ink.length, 'each cell has a drop shadow');
  const farEdge = T.project(cam, 400, 0, 22).y * 0.4;
  for (const r of ink) {
    assert.deepStrictEqual(r.m, [1, 0, 0, 1, 0, 0], 'in buffer pixels');
    assert.strictEqual(r.args[2], 3, '3-pixel cells');
    assert.ok(Number.isInteger(r.args[0]) && Number.isInteger(r.args[1]), 'on whole chunks');
    assert.ok(r.args[1] + r.args[3] <= farEdge - 6 * 0.4, 'above the far edge');
  }
  assert.ok(ink.some((r) => r.args[0] < 160) && ink.some((r) => r.args[0] > 160), 'one score each side');
});

test('with no document it draws the same scene flat, straight onto the canvas, and never writes the state', () => {
  const g = rally();
  const before = JSON.stringify(g);
  const rec = eralooks.recorder();
  R.draw(rec.ctx, g);
  R.draw(rec.ctx, Object.assign(g, { serveDelay: 0.4 }));
  g.serveDelay = 0;
  assert.strictEqual(JSON.stringify(g), before);
  assert.strictEqual(rec.calls.filter((c) => c[3] === 800 && c[4] === 100).length, 12, 'six backdrop bands a frame, at canvas scale');
  pageFrame(g);
  assert.strictEqual(JSON.stringify(g), before, 'the buffered frame writes nothing either');
});

test('behind the title era 5 keeps the stock dimmed frame', () => {
  const g = rally();
  const got = eralooks.recorder();
  R.draw(got.ctx, g, { ink: '#3a3a3a' });
  const want = eralooks.recorder();
  R.drawBase(want.ctx, g, { ink: '#3a3a3a' });
  assert.deepStrictEqual(got.calls, want.calls);
});

// ---------------------------------------------------------------- voice
test('the voice is the bible\'s PlayStation voice, to the letter, and the sound player reads it off the look', () => {
  const md = fs.readFileSync(path.join(ROOT, 'docs', 'ERAS.md'), 'utf8');
  const m = /## 6\. Era 5[\s\S]*?\*\*Voice\*\*[^\n]*\r?\n\r?\n```js\r?\n([\s\S]*?)\r?\n```/.exec(md);
  assert.ok(m, 'chapter 6 has a voice block');
  const bible = new Function(`return ({${m[1]}}).voice;`)();
  assert.deepStrictEqual(look.voice, bible);
  for (const type of ['paddle', 'wall', 'score']) {
    assert.strictEqual(PongSound.voicesFor(5, type), look.voice[type], `${type} plays era 5's own notes`);
    assert.ok(look.voice[type].some((n) => n.wave === 'triangle'), `${type} has a plucky triangle note`);
  }
  assert.deepStrictEqual(look.voice.effects, { reverb: { seconds: 1.2, decay: 2.5, mix: 0.25 } }, 'one room reverb');
  assert.strictEqual(PongSound.echoFor(5), null, 'not the Super Nintendo\'s echo');
});

// ---------------------------------------------------------------- rules
test('era 5 plays exactly like era 1: drawing it every frame changes nothing about the game', () => {
  const seeded = () => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
  const play = (era, drawEachFrame) => {
    const g = Pong.createGame({ rng: seeded(), phase: 'playing', era, rules: { eraChangePause: 0 } });
    const trail = [];
    const rec = eralooks.recorder();
    for (let i = 0; i < 2400; i++) {
      const pointerY = i < 1200 ? 300 + 220 * Math.sin(i / 35) : 20;
      Pong.step(g, 1 / 60, { pointerY, up: false, down: false });
      if (drawEachFrame) { rec.calls.length = 0; R.draw(rec.ctx, g); }
      trail.push([g.ball.x, g.ball.y, g.ball.vx, g.ball.vy, g.left.y, g.right.y, g.score.left + g.score.right, g.serveDelay]);
    }
    return trail;
  };
  const one = play(1, false);
  const five = play(5, true).map((r, i) => r);
  // Era 1 climbs the ladder and era 5 climbs it too, so compare the physics, not the era.
  assert.deepStrictEqual(five, one);
  assert.ok(one[one.length - 1][6] >= 2, 'the run crossed serves');
});
