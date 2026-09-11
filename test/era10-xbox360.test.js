'use strict';
/*
 * Era 10, the 2005 Xbox 360 (docs/ERAS.md chapter 11): bloom, the grade,
 * grain, motion blur, depth of field, the Blades HUD and the Achievement
 * toast -- and not one rule different from any other era.
 *
 * The look draws with gradients, patterns, composite modes, offscreen buffers
 * and text, so this file brings a canvas that records all of it, and a
 * stand-in document so the buffered passes (bloom, grain, depth of field) run
 * here the way they run in the page.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
const PongSound = require('../src/sound.js');
const T = R.table3d;
const look = () => R.eraLook(10);

const GLOW = (a) => `rgba(255,248,231,${a})`;
const HD_FONT = '600 20px "Segoe UI", "Helvetica Neue", Arial, sans-serif';

/** A recording 2D context. opts.measure 0 makes measureText report no width; opts.canvas gives it a canvas. */
function canvas(opts) {
  opts = opts || {};
  const ops = [];
  const st = { fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, lineWidth: 1,
    globalCompositeOperation: 'source-over', font: '10px sans-serif' };
  const stack = [];
  let sub = [];
  const gradient = (kind, args) => ({ kind, args, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } });
  const rec = (op, extra) => ops.push(Object.assign({ op, fill: st.fillStyle, stroke: st.strokeStyle,
    alpha: st.globalAlpha, comp: st.globalCompositeOperation, width: st.lineWidth }, extra));
  const m = {
    save() { stack.push(Object.assign({}, st)); },
    restore() { Object.assign(st, stack.pop()); },
    beginPath() { sub = []; },
    moveTo(x, y) { sub.push([[x, y]]); },
    lineTo(x, y) { if (!sub.length) sub.push([]); sub[sub.length - 1].push([x, y]); },
    quadraticCurveTo(cx, cy, x, y) { m.lineTo(x, y); },
    arc(x, y, r) { sub.push([[x - r, y - r], [x + r, y + r]]); },
    rect(x, y, w, h) { sub.push([[x, y], [x + w, y + h]]); },
    closePath() {}, clip() {}, translate() {}, scale() {}, setTransform() {}, clearRect() {},
    fill() { rec('fill', { pts: sub.flat() }); },
    stroke() { rec('stroke', { pts: sub.flat() }); },
    fillRect(x, y, w, h) { rec('fillRect', { rect: [x, y, w, h] }); },
    fillText(text, x, y) { rec('fillText', { text, x, y, font: st.font }); },
    measureText(text) { return { width: opts.measure === 0 ? 0 : String(text).length * 10 }; },
    drawImage(img, ...args) { rec('drawImage', { img, args }); },
    createLinearGradient(...a) { return gradient('linear', a); },
    createRadialGradient(...a) { return gradient('radial', a); },
    createPattern(img) { return { kind: 'pattern', img }; }
  };
  if (opts.canvas) m.canvas = { id: 'main' };
  const ctx = new Proxy(m, {
    get(t, k) { return k in t ? t[k] : st[k]; },
    set(t, k, v) { st[k] = v; return true; },
    has(t, k) { return k in t || k in st; }
  });
  return { ctx, ops };
}

/** Run fn with a document whose canvases record; every canvas made is listed. */
function withDocument(fn) {
  const made = [];
  globalThis.document = {
    createElement() {
      const c = canvas();
      const el = { width: 0, height: 0, ops: c.ops, getContext: () => c.ctx };
      made.push(el);
      return el;
    }
  };
  try { return fn(made); } finally { delete globalThis.document; }
}

/** A rally at era 10: the right paddle far, the left near, the ball in flight. */
function rally(overrides) {
  const g = Pong.createGame({ rng: () => 0.1, phase: 'playing', era: 10 });
  g.serveDelay = 0;
  g.score.left = 3;
  g.score.right = 11;
  g.ball.x = 412.5;
  g.ball.y = 340;
  g.ball.vx = 420;
  g.ball.vy = -180;
  g.left.y = 380;
  g.right.y = 60;
  g.time = 12.25;
  return Object.assign(g, overrides || {});
}

function frame(state, opts) {
  const c = canvas(opts);
  R.draw(c.ctx, state);
  return c.ops;
}

const isBallCore = (o) => o.op === 'fill' && o.fill && o.fill.kind === 'radial' && o.fill.stops[0][1] === '#ffffff';
const farY = () => T.project(T.camera(look().camera), 400, 0, 0).y;

/** The JS voice block from the bible's chapter 11, evaluated. */
function bibleVoice() {
  const md = fs.readFileSync(path.join(ROOT, 'docs', 'ERAS.md'), 'utf8');
  const chapter = md.slice(md.indexOf('## 11. Era 10'), md.indexOf('## 12.'));
  const block = /```js\n([\s\S]*?)```/.exec(chapter)[1];
  return new Function(`return {${block}}.voice;`)();
}

test('era 10 is the Xbox 360, built rather than a placeholder, on the bible\'s camera and card', () => {
  const l = look();
  assert.match(l.name, /Xbox 360/);
  assert.ok(!l.placeholder, 'no longer a placeholder');
  assert.strictEqual(typeof l.draw, 'function');
  assert.deepStrictEqual(l.camera, { tilt: 32, height: 1600, fov: 20.5, screenY: 312 });
  assert.deepStrictEqual(l.card, { flash: '#fff8e7', wipe: ['#5dc21e', '#d9dcd6', '#3b342b'], box: '#1b1b1b',
    border: '#5dc21e', inner: null, year: '#5dc21e', name: '#ffffff', label: '#a8a296', dots: null });
  const g = rally();
  assert.strictEqual(R.paddleInk(g, 'left'), R.eraLook(1).paddleInk(g, 'left'), 'wears the colours era 1 picked');
});

test('drawing era 10 reads the state and never writes it, and behind the title keeps the stock dimmed frame', () => {
  const g = rally();
  const before = JSON.stringify(g);
  frame(g);
  withDocument(() => frame(g, { canvas: true }));
  assert.strictEqual(JSON.stringify(g), before);
  const got = eralooks.recorder();
  R.draw(got.ctx, g, { ink: '#3a3a3a' });
  const want = eralooks.recorder();
  R.drawBase(want.ctx, g, { ink: '#3a3a3a' });
  assert.deepStrictEqual(got.calls, want.calls);
});

test('post passes in order: bloom added twice, the grade, the vignette, grain, the inks restored -- then the ball, then the HUD', () => {
  withDocument((made) => {
    const g = rally({ time: 30 });
    const ops = frame(g, { canvas: true });
    const at = (pred, what) => { const i = ops.findIndex(pred); assert.ok(i >= 0, what); return i; };
    const bloomMain = at((o) => o.op === 'drawImage' && o.comp === 'lighter' && o.alpha === 0.55 &&
      o.img.width === 200 && o.img.height === 150, 'the quarter-scale bloom buffer added back at 0.55');
    const bloomWide = at((o) => o.op === 'drawImage' && o.comp === 'lighter' && o.alpha === 0.35 &&
      o.img.width === 100 && o.img.height === 75, 'and its eighth-scale copy at 0.35');
    const drain = at((o) => o.op === 'fillRect' && o.comp === 'saturation' && o.fill === '#6e6a60' && o.alpha === 0.55, 'the colour drains');
    const tint = at((o) => o.op === 'fillRect' && o.comp === 'multiply' && o.fill === '#c9b89a' && o.alpha === 0.35, 'the brown tint');
    const vignette = at((o) => o.op === 'fillRect' && o.fill.kind === 'radial' &&
      JSON.stringify(o.fill.args) === '[400,300,250,400,300,520]' && o.fill.stops[1][1] === 'rgba(0,0,0,0.65)', 'the vignette');
    const grain = at((o) => o.op === 'fillRect' && o.comp === 'overlay' && o.alpha === 0.12 && o.fill.kind === 'pattern', 'the grain');
    const ink = R.paddleInk(g, 'left');
    const restored = ops.findIndex((o, i) => i > grain && o.op === 'fill' && o.fill === ink && o.comp === 'source-over');
    const ball = at(isBallCore, 'the white ball');
    const blade = ops.findIndex((o, i) => i > ball && o.op === 'fill' && o.fill === '#5dc21e');
    assert.ok(bloomMain < bloomWide && bloomWide < drain && drain < tint && tint < vignette && vignette < grain,
      'bloom, then the grade, the vignette and the grain');
    assert.ok(grain < restored && restored < ball, 'each paddle\'s ink comes back at full strength after the grade (R4)');
    assert.ok(ball < blade, 'the green blade is HUD, drawn after the ball');
    assert.strictEqual(ops.filter(isBallCore).length, 1);
    assert.ok(!ops.slice(ball + 1).some((o) => o.comp !== 'source-over'), 'nothing composites over the ball (R1, R2)');

    // Depth of field: the scenery comes from a third-scale buffer, and the far
    // strip is redrawn from a half-scale copy BEFORE any paddle goes down.
    const soft = at((o) => o.op === 'drawImage' && o.img.width === 267 && o.img.height === 200, 'the soft scenery buffer');
    const strip = at((o) => o.op === 'drawImage' && o.img.width === 400 && o.img.height === 300 && o.alpha === 0.6, 'the far strip at 0.6');
    const firstPaddle = ops.findIndex((o) => o.op === 'fill' && o.fill.kind === 'linear' &&
      o.fill.stops.some((s) => s[1] === T.shade(T.shade(R.paddleInk(g, 'right'), -0.05), 0.2)));
    assert.ok(soft < strip && strip < firstPaddle, 'no paddle is ever softened');

    // Grain: three 128-pixel tiles of 1400 specks on grain mid, built once
    // (the buffers outlive this document, so they are found through the pattern).
    const grainAt = (time) => frame(rally({ time }), { canvas: true }).find((o) => o.comp === 'overlay').fill.img;
    const tiles = [0, 1, 2].map((k) => grainAt(40 + k / 24 + 0.001));
    assert.strictEqual(new Set(tiles).size, 3, 'a different tile each 24th of a second, three in turn');
    assert.strictEqual(grainAt(40 + 3 / 24 + 0.001), tiles[0], 'and round again');
    for (const t of tiles) {
      assert.deepStrictEqual([t.width, t.height], [128, 128]);
      const rects = t.ops.filter((o) => o.op === 'fillRect');
      assert.strictEqual(rects.length, 1401);
      assert.strictEqual(rects[0].fill, '#808080');
    }
    assert.ok(made.length === 0 || made.every((c) => c.width !== 128), 'no tile is rebuilt');
  });
});

test('motion blur is a capsule and three fading ghosts behind the ball, and none of it in the serve pause', () => {
  const ops = frame(rally({ time: 50 }));
  const ball = ops.findIndex(isBallCore);
  const capsule = ops.findIndex((o) => o.op === 'stroke' && o.stroke.kind === 'linear' &&
    o.stroke.stops[0][1] === GLOW(0) && o.stroke.stops[1][1] === GLOW(0.5));
  assert.ok(capsule >= 0 && capsule < ball, 'the capsule is drawn behind the ball');
  const ghosts = [0.3, 0.2, 0.1].map((a) => ops.findIndex((o) => o.op === 'fill' && o.fill === GLOW(a)));
  assert.ok(ghosts.every((i) => i > capsule && i < ball), 'three ghosts, 0.3 then 0.2 then 0.1, behind the ball');
  const s = T.ballScreen(T.camera(look().camera), rally());
  assert.ok(Math.abs(ops[capsule].width - 2 * s.r) < 1e-9, 'as wide as the ball');
  // With no buffers (no document) the halo is drawn straight on at 0.35.
  assert.ok(ops.some((o) => o.op === 'fill' && o.comp === 'lighter' && o.alpha === 0.35 && o.fill.kind === 'radial'));

  const serving = frame(rally({ time: 60, serveDelay: 0.5 }));
  assert.strictEqual(serving.filter(isBallCore).length, 0, 'no ball');
  assert.ok(!serving.some((o) => o.op === 'stroke' && o.stroke.kind === 'linear'), 'no capsule');
  assert.ok(!serving.some((o) => o.fill === GLOW(0.3)), 'no ghosts');
});

test('the Blades HUD: the scores in the HD font on green and silver blades, all of it above the far edge (R8)', () => {
  const g = rally({ time: 70 });
  const ops = frame(g);
  const ball = ops.findIndex(isBallCore);
  const band = farY() - 6;
  const texts = ops.filter((o) => o.op === 'fillText');
  const left = texts.find((o) => o.text === '3');
  const right = texts.find((o) => o.text === '11');
  assert.ok(left && right, 'both scores are drawn as text');
  assert.strictEqual(left.font, HD_FONT);
  assert.strictEqual(left.fill, '#ffffff', 'the left score is toast text on the green blade');
  assert.strictEqual(right.fill, '#1b1b1b', 'the right score is toast on the silver blade');
  assert.ok(left.x > 400 && right.x > left.x, 'across the band\'s right half');
  for (const o of ops.slice(ball + 1)) {
    const ys = o.op === 'fillText' ? [o.y] : o.op === 'fillRect' ? [o.rect[1] + o.rect[3]] : (o.pts || []).map((p) => p[1]);
    assert.ok(ys.every((y) => y <= band), `${o.op} at y ${Math.max(...ys)} stays in the HUD band above ${band}`);
  }
  const blades = ops.filter((o, i) => i > ball && o.op === 'fill' && ['#5dc21e', '#d9dcd6'].includes(o.fill));
  assert.strictEqual(blades.length, 2, 'a green blade and a silver one');
  // A context that cannot measure text gets the block font instead.
  const blocks = frame(rally({ time: 71 }), { measure: 0 });
  assert.ok(!blocks.some((o) => o.op === 'fillText'), 'no text calls');
  assert.ok(blocks.some((o) => o.op === 'fillRect' && o.fill === '#1b1b1b' && o.rect[0] > 600), 'the right score in blocks');
});

test('Achievement Unlocked: WELCOME TO HD on arriving, 10G on every point, sliding in, holding 2 s and gone by 2.5 s', () => {
  const toast = look().toast;
  const g = rally({ time: 100 });
  let t = toast(g);
  assert.strictEqual(t.text, '50G - WELCOME TO HD');
  assert.ok(t.y < 8 - 52, 'it starts above the frame');
  t = toast(Object.assign(g, { time: 100.1 }));
  assert.ok(t.y > -60 && t.y < 8, 'and slides down');
  // Frames arrive every few milliseconds in play; a gap of more than half a
  // second is an arrival, so walk the hold a tenth of a second at a time.
  for (let k = 3; k <= 22; k++) {
    const time = 100 + k / 10;
    assert.strictEqual(toast(Object.assign(g, { time })).y, 8, `held at y 8 (${time})`);
  }
  t = toast(Object.assign(g, { time: 102.4 }));
  assert.ok(t.y < 8, 'then slides back up');
  assert.strictEqual(toast(Object.assign(g, { time: 102.6 })), null, 'gone after 2.5 s');

  g.score.left += 1;
  t = toast(Object.assign(g, { time: 103 }));
  assert.strictEqual(t.text, '10G - POINT SCORED');
  assert.strictEqual(t.t, 0);
  toast(Object.assign(g, { time: 103.4 }));
  g.score.right += 1;
  t = toast(Object.assign(g, { time: 103.8 }));
  assert.strictEqual(t.t, 0, 'a new point replaces the toast showing');

  // Arriving through an era change is timed from the change.
  const arrived = rally({ time: 200.4, eraChangedAt: 200 });
  t = toast(arrived);
  assert.strictEqual(t.text, '50G - WELCOME TO HD');
  assert.ok(Math.abs(t.t - 0.4) < 1e-9);

  // Even when era 10 was on screen a moment before: the playtest's forced
  // change from 9 to 10 caught the first version of this calling it a point.
  const again = rally({ time: 250, eraChangedAt: 0 });
  toast(again);
  toast(Object.assign(again, { time: 250.1 }));
  again.score.left += 1;
  t = toast(Object.assign(again, { time: 250.2, eraChangedAt: 250.2 }));
  assert.strictEqual(t.text, '50G - WELCOME TO HD', 'a change stamped by the rules is an arrival, not a point');
  assert.strictEqual(t.t, 0);

  // Drawn: a dark rounded card at 0.92 in the top centre, with both lines.
  const ops = frame(rally({ time: 300.5 }));
  const card = ops.find((o) => o.op === 'fill' && o.fill === 'rgba(27,27,27,0.92)');
  assert.ok(card, 'the toast card');
  const xs = card.pts.map((p) => p[0]);
  assert.deepStrictEqual([Math.min(...xs), Math.max(...xs)], [230, 570], '340 wide, top centre');
  const lines = ops.filter((o) => o.op === 'fillText').map((o) => o.text);
  assert.ok(lines.includes('ACHIEVEMENT UNLOCKED') && lines.includes('50G - WELCOME TO HD'));
});

test('the voice is the bible\'s Xbox 360 voice, to the letter, and the sound hook plays it at era 10', () => {
  assert.deepStrictEqual(look().voice, bibleVoice());
  assert.strictEqual(PongSound.TOP_ERA, 10);
  assert.deepStrictEqual(PongSound.voicesFor(10, 'score'), look().voice.score, 'the achievement blip on every point');
  assert.deepStrictEqual(PongSound.voicesFor(10, 'score').filter((v) => v.wave === 'sine').map((v) => v.freq), [1175, 1568]);
  assert.notDeepStrictEqual(PongSound.voicesFor(10, 'paddle'), PongSound.voicesFor(4, 'paddle'), 'no longer the Super Nintendo');
  assert.deepStrictEqual(PongSound.echoFor(10), null, 'a reverb, not the Super Nintendo echo');
});

test('era 10 plays exactly like era 1: drawing it every frame changes nothing about the game', () => {
  const seeded = () => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
  const play = (era, drawEachFrame) => {
    const g = Pong.createGame({ rng: seeded(), phase: 'playing', era, rules: { eraChangePause: 0 } });
    const trail = [];
    for (let i = 0; i < 2400; i++) {
      const pointerY = i < 1200 ? 300 + 220 * Math.sin(i / 35) : 20;
      Pong.step(g, 1 / 60, { pointerY, up: false, down: false });
      if (drawEachFrame) R.draw(canvas().ctx, g);
      trail.push([g.ball.x, g.ball.y, g.ball.vx, g.ball.vy, g.left.y, g.right.y, g.score.left, g.score.right, g.serveDelay]);
    }
    return trail;
  };
  const one = play(1, false);
  const ten = play(10, true);
  assert.deepStrictEqual(ten, one);
  const [, , , , , , left, right] = one[one.length - 1];
  assert.ok(left + right >= 2, `the run crossed serves (score ${left}-${right})`);
});
