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
  const court = q.paintOut(q.quantize(q.decodePng(fs.readFileSync(path.join(ASSETS, 'era2-court-raw.png'))), courtInks));
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

test('the court is a tennis floor: its floor ink and whole tile-grid lines, no pitch marking left (items 1191, 1259)', async () => {
  const q = await quantizer();
  const court = q.decodePng(fs.readFileSync(path.join(ASSETS, 'era2-court.png')));
  const ink = (x, y) => {
    const i = (y * court.width + x) * 4;
    return '#' + [0, 1, 2].map((k) => court.rgba[i + k].toString(16).padStart(2, '0')).join('');
  };
  const counts = q.inkCounts(court);
  const inks = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  // Two inks: the floor and its grid. The generator's grey dashes along the
  // pitch lines (#787878) and the boxes that read as a 3 are gone with the rest.
  assert.strictEqual(inks.length, 2, `two inks, floor and grid (${JSON.stringify(counts)})`);
  const [floor, grid] = inks;
  assert.ok(q.luma(grid) < q.luma(floor), 'the grid is the darker ink');
  // Every grid pixel lies on a line that crosses the whole court: a column dark
  // top to bottom or a row dark side to side. A penalty box, an arc, the centre
  // circle, a goal box or the pitch's double border would each leave a dark
  // pixel on neither.
  const fullCol = [], fullRow = [];
  for (let x = 0; x < court.width; x++) {
    let all = true;
    for (let y = 0; y < court.height && all; y++) all = ink(x, y) === grid;
    if (all) fullCol.push(x);
  }
  for (let y = 0; y < court.height; y++) {
    let all = true;
    for (let x = 0; x < court.width && all; x++) all = ink(x, y) === grid;
    if (all) fullRow.push(y);
  }
  for (let y = 0; y < court.height; y++) for (let x = 0; x < court.width; x++) {
    if (ink(x, y) === grid) assert.ok(fullCol.includes(x) || fullRow.includes(y), `court pixel ${x},${y} is a mark off the tile grid`);
  }
  // The grid is regular, about 22 court pixels each way, and leaves the net's column clear.
  const gaps = (a) => a.slice(1).map((v, i) => v - a[i]);
  assert.ok(fullCol.length >= 6 && fullRow.length >= 5, `a grid both ways (${fullCol} / ${fullRow})`);
  for (const g of gaps(fullRow)) assert.ok(g >= 21 && g <= 23, `rows ${fullRow} are one tile apart`);
  for (const g of gaps(fullCol)) assert.ok((g >= 21 && g <= 23) || (g >= 43 && g <= 45), `columns ${fullCol} are one tile apart, two across the net`);
  for (const x of fullCol) assert.ok(Math.abs(x - 99.5) > 3, `no grid column under the net (column ${x}) to read as a halfway line`);
});

test('the tennis lines: two baselines, doubles and singles sidelines, service lines and the centre service line, in one grey no brighter than the ball', async () => {
  const q = await quantizer();
  const look = R.eraLook(2);
  const g = midRally();
  const calls = frame(g);
  const lineInk = look.courtLine;
  assert.strictEqual(lineInk, look.nesPalette[0x10], 'the lines are NES $10');
  assert.ok(q.luma(lineInk) < q.luma(look.nesPalette[0x30]), 'darker than the ball\'s $30 core');
  const lines = look.tennisLines();
  const drawn = calls.filter((c) => c[0] === lineInk);
  for (const r of lines) assert.ok(drawn.some((c) => c[1] === r[0] && c[2] === r[1] && c[3] === r[2] && c[4] === r[3]), `line ${r} is drawn`);
  // Above the court, under everything else: straight after the court's picture.
  const at = calls.findIndex((c) => c[0] === 'image:court');
  assert.deepStrictEqual(calls.slice(at + 1, at + 1 + lines.length).map((c) => c.slice(1)), lines.map((r) => r.slice()),
    'the lines go down right after the court, before the border, the net, the crowd and the band');
  const vertical = lines.filter((r) => r[3] > r[2]), horizontal = lines.filter((r) => r[2] > r[3]);
  const xs = [...new Set(vertical.map((r) => r[0]))].sort((a, b) => a - b);
  // Baselines outside both service lines, just in front of the paddles, which stand behind them.
  assert.strictEqual(xs.length, 4, `two baselines and two service lines (${xs})`);
  assert.ok(xs[0] > g.left.x + g.left.w && xs[3] + vertical[0][2] < g.right.x, 'each baseline in front of its paddle');
  assert.ok(xs[1] < 400 && xs[2] > 400, 'a service line each side of the net');
  // Mirror-true about the net.
  for (const r of lines) {
    const mx = 800 - r[0] - r[2];
    assert.ok(lines.some((o) => Math.abs(o[0] - mx) < 1e-9 && o[1] === r[1] && Math.abs(o[2] - r[2]) < 1e-9), `line ${r} has its mirror across the net`);
  }
  // Doubles sidelines along the top and bottom walls, below the crowd; singles inside them.
  const ys = [...new Set(horizontal.filter((r) => r[2] > 400).map((r) => r[1]))].sort((a, b) => a - b);
  assert.strictEqual(ys.length, 4, `doubles and singles sidelines (${ys})`);
  assert.ok(ys[0] >= 84 && ys[3] < 596, 'between the crowd and the bottom wall');
  // The centre service line runs from each service line to the net, halfway between the singles lines.
  const centre = horizontal.filter((r) => r[2] < 400 && r[2] > 100);
  assert.strictEqual(centre.length, 2, 'a centre service line each side');
  for (const r of centre) assert.ok(Math.abs(r[1] - (ys[1] + ys[2]) / 2) < 5, 'halfway between the singles sidelines');
});

test('with the art decoded, the court and the ball are one drawImage each: court first, ball exactly on its box and last', () => {
  const g = midRally();
  const calls = frame(g);
  const court = calls.filter((c) => c[0] === 'image:court');
  const ball = calls.filter((c) => c[0] === 'image:ball');
  assert.deepStrictEqual(court, [['image:court', 0, 4, 800, 592]], '200x148 at 4 units a pixel, centred under the border');
  assert.deepStrictEqual(ball, [['image:ball', Math.round(g.ball.x), Math.round(g.ball.y), g.ball.size, g.ball.size]]);
  assert.strictEqual(calls.findIndex((c) => c[0] === 'image:court'), 1, 'the court goes down straight after its base fill');
  // Nothing is drawn over the ball but its own seam: one pale-yellow NES pixel
  // inside its box (item 1225, the tennis ball).
  assert.deepStrictEqual(calls[calls.length - 2], ball[0], 'the ball is drawn last but for its seam');
  const seam = calls[calls.length - 1];
  assert.strictEqual(seam[0], R.eraLook(2).nesPalette[0x38], 'the seam is $38');
  assert.ok(seam[1] >= g.ball.x && seam[2] >= g.ball.y && seam[1] + seam[3] <= g.ball.x + g.ball.size + 1 &&
    seam[2] + seam[4] <= g.ball.y + g.ball.size + 1, 'inside the ball');
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
