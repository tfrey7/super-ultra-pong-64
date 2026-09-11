'use strict';
/*
 * Era 7, the 1999 Sega Dreamcast look (src/eras/era7-dreamcast.js, docs/ERAS.md
 * chapter 8): cel shading with ink outlines, flat poster bands, the graffiti
 * score, speed lines and starbursts, and the synth-funk voice. Headless: the
 * frame is drawn onto a context that logs every path, stroke and fill.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const { Pong, R } = eralooks.loadRenderer(path.join(__dirname, '..'));
const PongSound = require('../src/sound.js');
const T = R.table3d;
const look = R.eraLook(7);
const INK = '#111111';

/** A context that logs fills, strokes, rects and gradients in order, with the style in force. */
function logCtx() {
  const ops = [];
  const gradients = [];
  const ctx = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, globalAlpha: 1, lineCap: 'butt', lineJoin: 'miter',
    beginPath() { ops.push({ op: 'begin' }); },
    moveTo(x, y) { ops.push({ op: 'move', x, y }); },
    lineTo(x, y) { ops.push({ op: 'line', x, y }); },
    arc(x, y, r) { ops.push({ op: 'arc', x, y, r }); },
    stroke() { ops.push({ op: 'stroke', style: this.strokeStyle, width: this.lineWidth, cap: this.lineCap, alpha: this.globalAlpha }); },
    fill() { ops.push({ op: 'fill', style: this.fillStyle, alpha: this.globalAlpha }); },
    fillRect(x, y, w, h) { ops.push({ op: 'fillRect', style: this.fillStyle, x, y, w, h }); },
    strokeRect(x, y, w, h) { ops.push({ op: 'strokeRect', style: this.strokeStyle, width: this.lineWidth, x, y, w, h }); },
    transform(...m) { ops.push({ op: 'transform', m }); },
    rotate(a) { ops.push({ op: 'rotate', a }); },
    clip() { ops.push({ op: 'clip' }); },
    closePath() {}, save() {}, restore() {}, translate() {}, scale() {},
    createLinearGradient() {
      const g = { stops: [], addColorStop(o, c) { this.stops.push([o, c]); } };
      gradients.push(g);
      return g;
    },
    createRadialGradient() { throw new Error('no radial gradients in the Dreamcast'); },
    createPattern() { throw new Error('no textures in the Dreamcast'); },
    drawImage() { throw new Error('no buffers in the Dreamcast'); }
  };
  return { ctx, ops, gradients };
}

/** A Dreamcast game mid-rally: the ball flying right and up, fast. */
function rally() {
  const g = Pong.createGame({ rng: () => 0.1, phase: 'playing', era: 7 });
  g.serveDelay = 0;
  g.time = 20;
  g.score.left = 10;
  g.score.right = 7;
  g.ball.x = 430; g.ball.y = 260; g.ball.vx = 520; g.ball.vy = -210;
  g.left.y = 380; g.right.y = 60;
  return g;
}

function drawn(g, opts) {
  const log = logCtx();
  R.draw(log.ctx, g, opts);
  return log;
}

const fillsOf = (ops) => ops.filter((o) => o.op === 'fill' || o.op === 'fillRect');

test('era 7 is the Dreamcast now, on the bible\'s outlined camera and name card', () => {
  assert.strictEqual(look.era, 7);
  assert.strictEqual(look.name, '1999 Sega Dreamcast');
  assert.ok(!look.placeholder);
  assert.notStrictEqual(look.draw, R.eraLook(5).draw);
  assert.deepStrictEqual(look.camera, { tilt: 22, height: 1500, fov: 23.5, screenY: 314, outline: { width: 3, colour: INK } });
  assert.deepStrictEqual(look.card, { flash: '#ffffff', wipe: ['#ee5a24', '#ffffff', '#111111'], box: '#ffffff',
    border: '#111111', inner: null, year: '#ee5a24', name: '#111111', label: '#1e73d8', dots: null });
  assert.strictEqual(look.paddleInk, R.eraLook(1).paddleInk, 'wears the colours era 1 picked');
});

test('every shape is inked: each paddle face is stroked in thick ink before it fills', () => {
  const g = rally();
  const { ops } = drawn(g);
  for (const side of ['left', 'right']) {
    const ink = R.paddleInk(g, side);
    // A paddle face's fill is a two-band gradient whose near-face lit band is the paddle's own colour.
    const idx = ops.findIndex((o) => o.op === 'fill' && o.style && o.style.stops && o.style.stops[0][1] === ink);
    assert.ok(idx > 0, `${side} paddle's near face wears ${ink}`);
    const before = ops.slice(0, idx).reverse().find((o) => o.op === 'stroke' || o.op === 'fill');
    assert.strictEqual(before.op, 'stroke');
    assert.strictEqual(before.style, INK);
    assert.ok(before.width >= 4, `a thick outline (${before.width} px)`);
  }
  const inked = ops.filter((o) => o.op === 'stroke' && o.style === INK);
  assert.ok(inked.length >= 20, `table, rails, skyline, paddles and ball all outlined (${inked.length} ink strokes)`);
});

test('cel shading: the only gradients are hard-edged two-band fills, split 40% down the face', () => {
  const { gradients } = drawn(rally());
  assert.ok(gradients.length >= 4, 'the paddles\' faces');
  for (const g of gradients) {
    assert.deepStrictEqual(g.stops.map((s) => s[0]), [0, 0.4, 0.4, 1]);
    assert.strictEqual(g.stops[0][1], g.stops[1][1], 'the lit band is one flat colour');
    assert.strictEqual(g.stops[2][1], g.stops[3][1], 'the shadow band is one flat colour');
    assert.notStrictEqual(g.stops[1][1], g.stops[2][1], 'a hard edge between them');
  }
});

test('poster colours in flat bands: three sky bands, a skyline, and the table in three depth bands', () => {
  const { ops } = drawn(rally());
  const colours = new Set(fillsOf(ops).map((o) => o.style).filter((s) => typeof s === 'string'));
  for (const c of look.PALETTE.sky) assert.ok(colours.has(c), `sky band ${c}`);
  assert.ok(colours.has(look.PALETTE.skyline), 'the skyline');
  assert.deepStrictEqual(look.BANDS.map((b) => [b.y0, b.y1, b.fill]),
    [[0, 200, '#8ff0e6'], [200, 400, '#2ec4b6'], [400, 600, '#1f9e93']]);
  for (const b of look.BANDS) assert.ok(colours.has(b.fill), `table band ${b.fill}`);
  assert.strictEqual(look.SKYLINE.length, 9);
  for (const b of look.SKYLINE) assert.ok(b.h >= 40 && b.h <= 120, `a building ${b.h} units tall`);
});

test('the ball is the brightest and last thing on the table: white, a shade band, an inked rim and a contact shadow', () => {
  const g = rally();
  const { ops } = drawn(g);
  const fills = fillsOf(ops);
  const white = fills.map((o) => o.style).lastIndexOf('#ffffff');
  assert.ok(white > 0, 'the ball is drawn');
  assert.strictEqual(fills[white + 1].style, look.PALETTE.ballShade, 'its shade band straight after');
  for (const o of fills.slice(white + 2)) {
    assert.ok([look.PALETTE.magenta, look.PALETTE.yellow].includes(o.style), `only the HUD after the ball (${o.style})`);
  }
  assert.strictEqual(fills.filter((o) => o.style === '#ffffff').length, 1, 'nothing else on screen is pure white (R1)');
  assert.strictEqual(fills[white - 1].style, 'rgba(17,17,17,0.350)', 'a flat ink contact shadow at 0.35');
  const before = ops.slice(0, ops.indexOf(fills[white])).reverse().find((o) => o.op === 'stroke' || o.op === 'fill');
  assert.ok(before.op === 'stroke' && before.style === INK, 'an ink rim round the ball');
});

test('speed lines trail a fast ball, never ahead of it, and vanish when it is slow or serving', () => {
  const g = rally();
  const cam = T.camera(look.camera);
  const lines = look.speedLines(T, cam, g);
  assert.strictEqual(lines.length, 5);
  assert.deepStrictEqual(lines.map((l) => l.width), [3, 2, 3, 2, 1]);
  const s = T.ballScreen(cam, g);
  const ahead = T.project(cam, g.ball.x + g.ball.size / 2 + g.ball.vx * 0.05, g.ball.y + g.ball.size / 2 + g.ball.vy * 0.05, g.ball.size * 0.6);
  const fx = ahead.x - s.x, fy = ahead.y - s.y;
  for (const l of lines) {
    assert.ok((l.x1 - l.x0) * fx + (l.y1 - l.y0) * fy < 0, 'runs back along -velocity');
    assert.ok((l.x0 - s.x) * fx + (l.y0 - s.y) * fy <= 1e-9, 'starts at the ball\'s back edge, not ahead');
  }
  const { ops } = drawn(g);
  const strokes = ops.filter((o) => o.op === 'stroke' && o.style === INK && o.cap === 'round' && [1, 2, 3].includes(o.width));
  assert.ok(strokes.length >= 5, 'drawn as round-capped ink lines');

  const slow = rally();
  slow.ball.vx = 300; slow.ball.vy = 100;
  assert.strictEqual(look.speedLines(T, cam, slow).length, 0, 'none at 316 units a second');
  const serving = rally();
  serving.serveDelay = 0.4;
  assert.strictEqual(look.speedLines(T, cam, serving).length, 0, 'none in the serve pause');
  const faster = rally();
  faster.ball.vx *= 1.3; faster.ball.vy *= 1.3;
  const len = (l) => Math.hypot(l.x1 - l.x0, l.y1 - l.y0);
  assert.ok(len(look.speedLines(T, cam, faster)[0]) > len(lines[0]), 'longer the faster it flies');
});

/** Fills of a colour whose path has exactly n corners: the starburst is the 16-corner yellow one. */
function shapes(ops, colour, n) {
  const out = [];
  let corners = 0;
  for (const o of ops) {
    if (o.op === 'begin') corners = 0;
    else if (o.op === 'move' || o.op === 'line') corners += 1;
    else if (o.op === 'fill' && o.style === colour && corners === n) out.push(o);
  }
  return out;
}

test('a paddle hit pops a yellow starburst that fades out within 0.15 s', () => {
  const g = rally();
  const bursts = () => shapes(drawn(g).ops, look.PALETTE.yellow, 2 * look.BURST.points);
  g.time = 50; g.rally = 2;
  bursts();                                            // the file sees rally 2 (and that rise's own burst)
  g.time = 50.5;
  assert.strictEqual(bursts().length, 0, 'no new hit, no burst');
  g.time = 50.54; g.rally = 3;
  const hit = bursts();
  assert.strictEqual(hit.length, 1, 'the rally rose: an 8-point star');
  assert.strictEqual(hit[0].alpha, 1);
  g.time = 50.64;
  const late = bursts();
  assert.strictEqual(late.length, 1);
  assert.ok(late[0].alpha < 0.4, `fading (${late[0].alpha})`);
  g.time = 50.7;
  assert.strictEqual(bursts().length, 0, 'gone after 0.15 s');
  g.time = 10; g.rally = 0;
  assert.strictEqual(bursts().length, 0, 'a new state, earlier in time, fires nothing');
});

test('the score is graffiti: skewed and tilted, a magenta extrusion, a fat ink outline, yellow fill and two drips', () => {
  const g = rally();
  const { ops } = drawn(g);
  const tag = look.graffiti(R, 10, 280, 'left');
  assert.strictEqual(tag.drips.length, 2);
  for (const d of tag.drips) assert.ok(d.w === 3 && d.h >= 8 && d.h <= look.SCORE.dripMax, 'a thin drip');
  assert.deepStrictEqual(look.graffiti(R, 10, 280, 'left'), tag, 'the drips are seeded: they never flicker');

  // A cell's left edge leans (skew) and its top edge slopes (tilt).
  const c = tag.cells[0];
  const tl = look.sprayPoint(tag, c.x, c.y), bl = look.sprayPoint(tag, c.x, c.y + c.h), tr = look.sprayPoint(tag, c.x + c.w, c.y);
  assert.ok(Math.abs(tl.x - bl.x) > 1, `skewed (${tl.x} vs ${bl.x})`);
  assert.ok(tr.y < tl.y, 'tilted up to the right');

  const starts = (i, p) => {
    // the first corner of the path this op paints
    let j = i;
    while (j > 0 && ops[j].op !== 'begin') j--;
    const m = ops.slice(j).find((o) => o.op === 'move');
    return m && Math.abs(m.x - p.x) < 1e-9 && Math.abs(m.y - p.y) < 1e-9;
  };
  const deepest = look.sprayPoint(tag, c.x + 8, c.y + 8);
  assert.ok(ops.some((o, i) => o.op === 'fill' && o.style === look.PALETTE.magenta && starts(i, deepest)), 'extruded 8 deep in magenta');
  assert.ok(ops.some((o, i) => o.op === 'stroke' && o.style === INK && o.width === 6 && starts(i, tl)), '6-pixel ink outline');
  assert.ok(ops.some((o, i) => o.op === 'fill' && o.style === look.PALETTE.yellow && starts(i, tl)), 'yellow fill');
  for (const m of ['transform', 'rotate', 'strokeRect', 'clip']) {
    assert.ok(!ops.some((o) => o.op === m), `no ctx.${m}: every era test's recorder can draw it`);
  }
});

test('the HUD stays in the band above the far edge (R8), for every score up to 99', () => {
  const cam = T.camera(look.camera);
  const limit = T.project(cam, 400, 0, 0).y - 6;
  for (let n = 0; n <= 99; n++) {
    const tag = look.graffiti(R, n, 520, 'right');
    assert.ok(look.tagBottom(tag) <= limit, `score ${n} reaches ${look.tagBottom(tag).toFixed(1)}, limit ${limit.toFixed(1)}`);
    for (const d of tag.drips) assert.ok(d.y + d.h <= limit, `score ${n}'s drip`);
  }
});

test('its voice is the bible\'s synth-funk: slap bass and a clap on a hit, stabs on a point, through a short echo', () => {
  const paddle = PongSound.voicesFor(7, 'paddle');
  assert.deepStrictEqual(paddle.map((v) => v.wave), ['sawtooth', 'noise']);
  assert.strictEqual(paddle[0].slideTo, 82, 'the slap bass drops');
  assert.deepStrictEqual(PongSound.voicesFor(7, 'wall').map((v) => v.wave), ['square', 'noise']);
  const score = PongSound.voicesFor(7, 'score');
  assert.strictEqual(score.length, 9);
  assert.strictEqual(score.filter((v) => v.unison && v.unison.voices === 3).length, 6, 'six detuned stabs');
  assert.ok(PongSound.voicesFor(7, 'boot').length >= 10, 'the modem-and-chime boot sting');
  assert.deepStrictEqual(PongSound.echoFor(7), { time: 0.12, feedback: 0.25, mix: 0.2 });
  assert.notDeepStrictEqual(PongSound.voicesFor(7, 'paddle'), PongSound.voicesFor(6, 'paddle'), 'not the Nintendo 64\'s voice');
});

test('drawing never touches the state, so the game plays exactly as it did', () => {
  const g = rally();
  const before = JSON.stringify(g);
  drawn(g);
  assert.strictEqual(JSON.stringify(g), before);
  const lcg = (s) => () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const shown = Pong.createGame({ rng: lcg(7), phase: 'playing', era: 7 });
  const unseen = Pong.createGame({ rng: lcg(7), phase: 'playing', era: 7 });
  for (let f = 0; f < 600; f++) {
    Pong.step(shown, 1 / 60, { pointerY: shown.ball.y, up: false, down: false });
    Pong.step(unseen, 1 / 60, { pointerY: unseen.ball.y, up: false, down: false });
    drawn(shown);
  }
  assert.strictEqual(JSON.stringify(shown), JSON.stringify(unseen));
});

test('the attract rally behind the title stays the stock dimmed frame', () => {
  const g = rally();
  const got = eralooks.recorder();
  R.draw(got.ctx, g, { ink: '#3a3a3a' });
  const want = eralooks.recorder();
  R.drawBase(want.ctx, g, { ink: '#3a3a3a' });
  assert.deepStrictEqual(got.calls, want.calls);
});
