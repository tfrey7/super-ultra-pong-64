'use strict';
/*
 * The character rig (src/characters.js, item 1223): the beat machine reads
 * only what the rules report, each figure's hand sits on the outer edge of its
 * paddle (projected onto the table, depth-scaled, on the 3D eras), the right
 * player is mirrored, era 0 draws nothing, and the rig never writes the state.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Pong = require('../src/game.js');
require('../src/render.js');
const Sprites = require('../src/sprites.js');
const T = require('../src/table3d.js');
const C = require('../src/characters.js');

const ROOT = path.join(__dirname, '..');
// Every era look, in page order, the way the page loads them.
const R = require('../tools/eralooks.js').loadRenderer(ROOT).R;

/** A 2D context that records every call; properties just stick. */
function recorder() {
  const calls = [];
  const ctx = new Proxy({ calls }, {
    get(t, k) {
      if (k in t) return t[k];
      return (...args) => {
        calls.push([k, args]);
        // A gradient or pattern the era asks for: one that takes colour stops.
        if (typeof k === 'string' && /^create/.test(k)) return { addColorStop() {} };
        if (k === 'measureText') return { width: 0 };
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  return ctx;
}

function playing(era) {
  let n = 0;
  const g = Pong.createGame({ era, phase: 'playing', rng: () => ((n++ * 0.37) % 1) });
  g.serveDelay = 0;
  return g;
}

// ------------------------------------------------------------------ configs
test('era 0 has no figure; eras 1 to 10 each have a whole config block', () => {
  assert.strictEqual(C.configFor(0), null);
  for (let e = 1; e <= 10; e++) {
    const c = C.configFor(e);
    assert.ok(c, 'era ' + e + ' has a config');
    for (const k of ['sheet', 'frame', 'frames', 'hand', 'anchor', 'scale', 'fps']) {
      assert.ok(k in c, 'era ' + e + ' config has ' + k);
    }
    assert.ok(c.frame.w > 0 && c.frame.h > 0);
    assert.ok(c.scale > 0);
    assert.strictEqual(c.is3d, e >= 5, 'era ' + e + ' 3D flag');
    for (const b of C.BEATS) assert.ok(c.frames[b] > 0, 'era ' + e + ' placeholder has ' + b);
  }
});

test('an era block overrides only what it names; the rest comes from DEFAULTS', () => {
  const saved = C.ERAS[2];
  try {
    C.ERAS[2] = { sheet: 'era2-players', frame: { w: 32, h: 48 }, frames: { swing: 0 }, anchor: { dx: 4 } };
    const c = C.configFor(2);
    assert.strictEqual(c.sheet, 'era2-players');
    assert.deepStrictEqual(c.frame, { w: 32, h: 48 });
    assert.strictEqual(c.frames.swing, 0);
    assert.strictEqual(c.frames.idle, C.DEFAULTS.frames.idle);
    assert.strictEqual(c.anchor.dx, 4);
    assert.strictEqual(c.anchor.dy, C.DEFAULTS.anchor.dy);
    assert.strictEqual(c.scale, C.DEFAULTS.scale);
  } finally {
    C.ERAS[2] = saved;
  }
});

// -------------------------------------------------------------- the machine
test('a contact starts a swing on that side only', () => {
  const m = C.observe(C.freshMemory(), [{ type: 'paddle', side: 'left', time: 3 }], 3);
  assert.deepStrictEqual(m.left, { held: 'swing', since: 3 });
  assert.deepStrictEqual(m.right, { held: null, since: 0 });
});

test('a point is a win for the side that scored and a miss for the other', () => {
  const m = C.observe(C.freshMemory(), [{ type: 'score', side: 'right', time: 7 }], 7);
  assert.strictEqual(m.right.held, 'win');
  assert.strictEqual(m.left.held, 'miss');
  const cfg = C.configFor(3);
  assert.strictEqual(C.beatOf(m.left, 7.5, 0, cfg).beat, 'miss');
  assert.strictEqual(C.beatOf(m.right, 7.5, 0, cfg).beat, 'win');
  assert.strictEqual(C.beatOf(m.right, 7 + C.REACT_S + 0.01, 0, cfg).beat, 'idle');
});

test('wall bounces change nobody', () => {
  const m = C.observe(C.freshMemory(), [{ type: 'wall', side: 'top', time: 1 }], 1);
  assert.strictEqual(m.left.held, null);
  assert.strictEqual(m.right.held, null);
});

test('observe is pure, and the same events drawn twice start nothing twice', () => {
  const a = C.freshMemory();
  const evs = [{ type: 'paddle', side: 'right', time: 2 }];
  const b = C.observe(a, evs, 2);
  assert.strictEqual(a.right.held, null, 'the old memory is untouched');
  const again = C.observe(b, evs, 2.2);    // the same step's events seen again later
  assert.deepStrictEqual(again.right, { held: 'swing', since: 2 });
});

test('the clock going backwards is a new game and forgets every beat', () => {
  const m = C.observe(C.freshMemory(), [{ type: 'score', side: 'left', time: 9 }], 9);
  const fresh = C.observe(m, [], 0.1);
  assert.strictEqual(fresh.left.held, null);
  assert.strictEqual(fresh.right.held, null);
});

test('with nothing held the paddle speed picks idle, up or down', () => {
  const cfg = C.configFor(1);
  const none = { held: null, since: 0 };
  assert.strictEqual(C.beatOf(none, 1, 0, cfg).beat, 'idle');
  assert.strictEqual(C.beatOf(none, 1, C.MOVE - 1, cfg).beat, 'idle');
  assert.strictEqual(C.beatOf(none, 1, -(C.MOVE + 1), cfg).beat, 'up');
  assert.strictEqual(C.beatOf(none, 1, C.MOVE + 1, cfg).beat, 'down');
});

test('a swing plays its frames in order over SWING_S, then gives way to movement', () => {
  const cfg = C.configFor(4);
  const side = { held: 'swing', since: 10 };
  const n = cfg.frames.swing;
  const seen = [];
  for (let i = 0; i < n; i++) seen.push(C.beatOf(side, 10 + (i + 0.5) * C.SWING_S / n, 0, cfg).frame);
  assert.deepStrictEqual(seen, [...Array(n).keys()]);
  assert.strictEqual(C.beatOf(side, 10 + C.SWING_S + 0.01, 200, cfg).beat, 'down');
});

test('a beat the era has no frames for falls back to idle', () => {
  const cfg = Object.assign({}, C.configFor(2), { frames: { idle: 2, up: 0, down: 0, swing: 0, miss: 0, win: 0 } });
  assert.strictEqual(C.beatOf({ held: 'swing', since: 0 }, 0.1, 0, cfg).beat, 'idle');
  assert.strictEqual(C.beatOf({ held: null, since: 0 }, 0.1, -500, cfg).beat, 'idle');
  assert.strictEqual(C.beatOf({ held: 'win', since: 0 }, 0.1, 0, cfg).beat, 'idle');
});

test('driven by the real rules: a return swings the player, a miss slumps it', () => {
  const g = playing(3);
  // The ball right in front of the player's paddle, heading for it.
  g.ball.x = g.left.x + g.left.w + 2;
  g.ball.y = g.left.y + g.left.h / 2;
  g.ball.vx = -400; g.ball.vy = 0; g.ball.spin = 0;
  Pong.step(g, 1 / 60, { pointerY: g.left.y + g.left.h / 2 });
  assert.ok(g.events.some((e) => e.type === 'paddle' && e.side === 'left'), 'the rules reported the contact');
  let mem = C.memoryOf(g);
  assert.strictEqual(C.beatOf(mem.left, g.time, 0, C.configFor(3)).beat, 'swing');

  // Now let one past the player: the computer scores.
  const g2 = playing(3);
  g2.ball.x = -g2.ball.size - 1 + 2; g2.ball.y = 20; g2.ball.vx = -600; g2.ball.vy = 0;
  Pong.step(g2, 1 / 60, { pointerY: 500 });
  assert.ok(g2.events.some((e) => e.type === 'score' && e.side === 'right'), 'the rules reported the point');
  mem = C.memoryOf(g2);
  const cfg = C.configFor(g2.era);
  assert.strictEqual(C.beatOf(mem.left, g2.time, 0, cfg).beat, 'miss');
  assert.strictEqual(C.beatOf(mem.right, g2.time, 0, cfg).beat, 'win');
});

// ---------------------------------------------------------------- anchoring
test('2D: the hand sits on the middle of each paddle\'s outer edge, the right player mirrored', () => {
  const g = playing(2);
  const cfg = C.configFor(2);
  const l = C.anchorOf(g, 'left', cfg);
  const r = C.anchorOf(g, 'right', cfg);
  assert.strictEqual(l.x, g.left.x);
  assert.strictEqual(l.y, g.left.y + g.left.h / 2);
  assert.strictEqual(l.mirror, 1);
  assert.strictEqual(r.x, g.right.x + g.right.w);
  assert.strictEqual(r.y, g.right.y + g.right.h / 2);
  assert.strictEqual(r.mirror, -1);
  // The figure stands wholly behind its paddle: its frame ends at the hand.
  const box = C.frameBox(l, cfg);
  assert.ok(Math.abs(box.x + box.w) < 1e-9, 'frame ends at the hand, never over the paddle');
  assert.ok(box.x < 0);
});

test('2D: the figure follows its paddle, and the anchor offset moves it away from the ball', () => {
  const g = playing(1);
  const cfg = C.configFor(1);
  const before = C.anchorOf(g, 'left', cfg);
  g.left.y += 50;
  assert.strictEqual(C.anchorOf(g, 'left', cfg).y, before.y + 50);
  const off = Object.assign({}, cfg, { anchor: { dx: 5, dy: -3, dz: 0 } });
  assert.strictEqual(C.anchorOf(g, 'left', off).x, g.left.x - 5);
  assert.strictEqual(C.anchorOf(g, 'right', off).x, g.right.x + g.right.w + 5);
  assert.strictEqual(C.anchorOf(g, 'right', off).y, g.right.y + g.right.h / 2 - 3);
});

test('3D: the hand is projected from the table, and a far paddle draws a smaller player', () => {
  for (let e = 5; e <= 10; e++) {
    const g = playing(e);
    const look = R.eraLook(e);
    const cam = C.cameraFor(g, look, T);
    assert.ok(cam, 'era ' + e + ' has a camera');
    const cfg = C.configFor(e);
    const a = C.anchorOf(g, 'left', cfg, cam, T);
    const p = T.project(cam, g.left.x, g.left.y + g.left.h / 2, cfg.anchor.dz);
    assert.strictEqual(a.x, p.x);
    assert.strictEqual(a.y, p.y);
    assert.strictEqual(a.scale, cfg.scale * p.scale);
    g.left.y = 0;
    const far = C.anchorOf(g, 'left', cfg, cam, T);
    g.left.y = g.height - g.left.h;
    const near = C.anchorOf(g, 'left', cfg, cam, T);
    assert.ok(far.scale < near.scale, 'era ' + e + ': far ' + far.scale + ' < near ' + near.scale);
    assert.strictEqual(C.anchorOf(g, 'right', cfg, cam, T).mirror, -1);
  }
});

// ------------------------------------------------------------------ drawing
test('era 0 and the dimmed attract frame draw no players', () => {
  const ctx = recorder();
  assert.strictEqual(C.drawPlayers(ctx, playing(0), null, R), false);
  assert.strictEqual(C.drawPlayers(ctx, playing(3), { ink: '#3a3a3a' }, R), false);
  assert.strictEqual(ctx.calls.length, 0);
});

test('every era from 1 up draws both players, the right one mirrored, and writes no state', () => {
  // The real loader, and no Image under node: an era whose block names a
  // sheet (era 8's `sheets`, item 1232) draws its placeholder rather than
  // throwing -- as a page does until the PNG has loaded (item 1249).
  assert.strictEqual(typeof globalThis.Image, 'undefined', 'node has no Image');
  assert.strictEqual(globalThis.PongSprites, Sprites, 'the real loader, no stand-in');
  for (let e = 1; e <= 10; e++) {
    const g = playing(e);
    g.events = [{ type: 'paddle', side: 'left', era: e, time: g.time }];
    const before = JSON.stringify(g, (k, v) => (k === 'rng' ? undefined : v));
    const ctx = recorder();
    assert.strictEqual(C.drawPlayers(ctx, g, null, R), true, 'era ' + e);
    assert.strictEqual(JSON.stringify(g, (k, v) => (k === 'rng' ? undefined : v)), before, 'era ' + e + ' state untouched');
    const mirrors = ctx.calls.filter(([k, a]) => k === 'scale' && a[0] === -1);
    assert.strictEqual(mirrors.length, 1, 'era ' + e + ': one mirrored player');
    assert.ok(ctx.calls.some(([k]) => k === 'fillRect'), 'era ' + e + ' drew its placeholder');
  }
});

test('headless, a block naming `sheet` or `sheets` draws the placeholder on both sides and never throws', () => {
  // The default loader's makeImage is `new Image()`, which throws under node.
  assert.throws(() => Sprites.create().load('test-headless-probe'), /Image/, 'the real loader cannot make an image here');
  const saved = C.ERAS[3];
  try {
    for (const block of [
      { sheet: 'test-headless-one', frame: { w: 20, h: 40 }, hand: { x: 20, y: 20 }, scale: 2 },
      { sheets: { left: 'test-headless-l', right: 'test-headless-r' }, frame: { w: 20, h: 40 }, hand: { x: 20, y: 20 }, scale: 2 }
    ]) {
      C.ERAS[3] = block;
      const g = playing(3);
      const ctx = recorder();
      assert.doesNotThrow(() => C.drawPlayers(ctx, g, null, R), Object.keys(block)[0]);
      assert.ok(!ctx.calls.some(([k]) => k === 'drawImage'), 'no sheet image drawn');
      // Both players are the placeholder pose: each draws its torso in its paddle's ink.
      const inks = ctx.calls.filter(([k]) => k === 'fillRect').length;
      assert.ok(inks > 0, 'the placeholder is drawn');
      assert.strictEqual(ctx.calls.filter(([k, a]) => k === 'scale' && a[0] === -1).length, 1, 'both sides drawn, one mirrored');
      assert.strictEqual(ctx.calls.filter(([k]) => k === 'save').length, ctx.calls.filter(([k]) => k === 'restore').length,
        'every save restored, even with the loader failing');
      // And through the page's own wrapper too, which must not need its try/catch for this.
      assert.doesNotThrow(() => R.draw(recorder(), g));
    }
  } finally {
    C.ERAS[3] = saved;
  }
});

test('clip: { y0, y1 } draws both players inside that band, and an era without one clips nothing', () => {
  const saved = C.ERAS[4];
  try {
    assert.strictEqual(C.configFor(4).clip, null, 'no clip by default');
    let ctx = recorder();
    C.drawPlayers(ctx, playing(4), null, R);
    assert.ok(!ctx.calls.some(([k]) => k === 'clip'), 'an era with no clip never clips');

    C.ERAS[4] = Object.assign({}, saved, { clip: { y0: 52, y1: 548 } });
    assert.deepStrictEqual(C.configFor(4, 'right').clip, { y0: 52, y1: 548 }, 'both sides carry it');
    const g = playing(4);
    ctx = recorder();
    C.drawPlayers(ctx, g, null, R);
    const calls = ctx.calls;
    const at = (k) => calls.findIndex(([n]) => n === k);
    const clipAt = at('clip');
    assert.ok(clipAt > 0, 'the players are clipped');
    assert.strictEqual(calls.filter(([k]) => k === 'clip').length, 1, 'one clip for both players');
    const rect = calls.slice(0, clipAt).reverse().find(([k]) => k === 'rect');
    assert.deepStrictEqual(rect[1], [0, 52, g.width, 496], 'the band: the whole width, y 52 to 548');
    assert.strictEqual(calls[0][0], 'save', 'the clip is inside its own save');
    // Every figure is drawn after the clip, and the clip's save is the last restored.
    const drawn = calls.map(([k], i) => (k === 'fillRect' || k === 'drawImage' ? i : -1)).filter((i) => i >= 0);
    assert.ok(drawn.length > 0 && drawn.every((i) => i > clipAt), 'nothing of a player is drawn outside the clip');
    assert.strictEqual(calls[calls.length - 1][0], 'restore', 'the clip is lifted when the players are done');
    assert.strictEqual(calls.filter(([k]) => k === 'save').length, calls.filter(([k]) => k === 'restore').length);

    // A band that makes no sense clips nothing rather than hiding the players.
    assert.strictEqual(C.clipBand({ y0: 300, y1: 100 }), null);
    assert.strictEqual(C.clipBand({ y0: 'a', y1: 5 }), null);
    assert.deepStrictEqual(C.clipBand({ y0: '10', y1: 20 }), { y0: 10, y1: 20 });

    // A stand-in canvas that knows no clip() (the era tests' own) still gets its players.
    const plain = recorder();
    plain.clip = undefined;
    assert.strictEqual(C.drawPlayers(plain, playing(4), null, R), true);
    assert.ok(plain.calls.some(([k]) => k === 'fillRect'), 'drawn, unclipped');
  } finally {
    C.ERAS[4] = saved;
  }
});

test('era 8 keeps its players between its letterbox bars, through the rig and not a wrapper of its own', () => {
  const bar = R.eraLook(8).fx.BAR;
  const g = playing(8);
  assert.deepStrictEqual(C.configFor(8).clip, { y0: bar, y1: g.height - bar });
  // Through the renderer: the bars are drawn, then the players clipped to the picture between them.
  const ctx = recorder();
  R.draw(ctx, g);
  const calls = ctx.calls;
  const topBar = calls.findIndex(([k, a]) => k === 'fillRect' && a.join() === [0, 0, g.width, bar].join());
  const clipAt = calls.findIndex(([k]) => k === 'clip');
  assert.ok(topBar >= 0, 'the letterbox is drawn');
  assert.ok(clipAt > topBar, 'the players are clipped, after the bars');
  const rect = calls.slice(0, clipAt).reverse().find(([k]) => k === 'rect');
  assert.deepStrictEqual(rect[1], [0, bar, g.width, g.height - 2 * bar]);
  // Nothing lays the bars a second time over the players any more.
  const bars = calls.filter(([k, a]) => k === 'fillRect' && a.join() === [0, 0, g.width, bar].join());
  assert.strictEqual(bars.length, 1, 'the top bar is drawn once a frame');
});

test('through the renderer: PongRender.draw draws the era, then the players over it', () => {
  const g = playing(2);
  const ctx = recorder();
  R.draw(ctx, g);
  const idx = ctx.calls.findIndex(([k, a]) => k === 'scale' && a[0] === -1);
  assert.ok(idx > 0, 'the mirrored player is drawn, after the frame');
  const ctx0 = recorder();
  R.draw(ctx0, playing(0));
  assert.ok(!ctx0.calls.some(([k, a]) => k === 'scale' && a[0] === -1), 'era 0: bars and a dot as before');
});

test('an era sheet is loaded through src/sprites.js and drawn one pre-cut frame at a time', () => {
  const made = [];
  const saved = { sprites: globalThis.PongSprites, era: C.ERAS[3] };
  globalThis.PongSprites = Sprites.create({
    makeImage() {
      const img = { src: '', complete: false, naturalWidth: 0 };
      made.push(img);
      return img;
    }
  });
  try {
    C.ERAS[3] = { sheet: 'test-players', frame: { w: 20, h: 40 }, hand: { x: 20, y: 20 }, scale: 2 };
    const g = playing(3);
    let ctx = recorder();
    C.drawPlayers(ctx, g, null, R);
    assert.strictEqual(made.length, 1, 'the sheet started loading once');
    assert.ok(made[0].src.endsWith('assets/pixellab/test-players.png'));
    assert.ok(ctx.calls.some(([k]) => k === 'fillRect'), 'placeholder while it loads');
    made[0].complete = true; made[0].naturalWidth = 120; made[0].onload();
    g.events = [{ type: 'paddle', side: 'right', era: 3, time: g.time + 1 }];
    g.time += 1;
    ctx = recorder();
    C.drawPlayers(ctx, g, null, R);
    const draws = ctx.calls.filter(([k]) => k === 'drawImage');
    assert.strictEqual(draws.length, 2, 'one drawImage a player');
    assert.ok(!ctx.calls.some(([k]) => k === 'fillRect'), 'no placeholder once the sheet is in');
    // The right player is swinging: the swing row (BEATS index 3), frame 0.
    const swingRow = C.BEATS.indexOf('swing') * 40;
    assert.ok(draws.some(([, a]) => a[0] === made[0] && a[1] === 0 && a[2] === swingRow && a[3] === 20 && a[4] === 40),
      'the right player drew the swing row\'s first frame');
    assert.ok(draws.some(([, a]) => a[2] === 0), 'the left player drew the idle row');
  } finally {
    globalThis.PongSprites = saved.sprites;
    C.ERAS[3] = saved.era;
  }
});

/** A stand-in PongSprites whose images are made loaded on demand; answers { made, restore }. */
function fakeSprites() {
  const made = [];
  const saved = globalThis.PongSprites;
  globalThis.PongSprites = Sprites.create({
    makeImage() {
      const img = { src: '', complete: false, naturalWidth: 0 };
      made.push(img);
      return img;
    }
  });
  const loadAll = () => {
    for (const img of made) {
      if (img.complete) continue;
      img.complete = true; img.naturalWidth = 120; img.onload();
    }
  };
  return { made, loadAll, restore() { globalThis.PongSprites = saved; } };
}

/** Which image each drawImage in a draw used, left player first by x. */
function imagesDrawn(ctx) {
  return ctx.calls.filter(([k]) => k === 'drawImage').map(([, a]) => a[0]);
}

test('sheets: { left, right } -- each side wears its own sheet, the right one still mirrored', () => {
  const fake = fakeSprites();
  const saved = C.ERAS[4];
  try {
    C.ERAS[4] = { sheets: { left: 'test-knight', right: 'test-barbarian' },
                  frame: { w: 20, h: 40 }, hand: { x: 20, y: 20 }, scale: 2 };
    assert.strictEqual(C.configFor(4).sheet, 'test-knight', 'configFor(era) is the left side');
    assert.strictEqual(C.configFor(4, 'left').sheet, 'test-knight');
    assert.strictEqual(C.configFor(4, 'right').sheet, 'test-barbarian');
    assert.deepStrictEqual(C.configFor(4, 'right').frame, { w: 20, h: 40 }, 'the sides share the block\'s frame');
    assert.strictEqual(C.configFor(4, 'right').scale, 2);

    const g = playing(4);
    C.drawPlayers(recorder(), g, null, R);            // starts both loads
    const byName = (n) => fake.made.find((img) => img.src.endsWith('assets/pixellab/' + n + '.png'));
    assert.ok(byName('test-knight'), 'the left sheet is loaded');
    assert.ok(byName('test-barbarian'), 'the right sheet is loaded');
    fake.loadAll();

    // Draw each side on its own to see which image it used and whether it was mirrored.
    const ctx = recorder();
    C.drawPlayers(ctx, g, null, R);
    const calls = ctx.calls;
    const draws = calls.map((c, i) => [c, i]).filter(([[k]]) => k === 'drawImage');
    assert.strictEqual(draws.length, 2, 'one drawImage a player');
    for (const [[, a], i] of draws) {
      // The mirror is the scale(-1, 1) between this player's save and its drawImage.
      let s = i; while (s >= 0 && calls[s][0] !== 'save') s--;
      const mirrored = calls.slice(s, i).some(([k, b]) => k === 'scale' && b[0] === -1);
      if (a[0] === byName('test-knight')) assert.ok(!mirrored, 'the player\'s knight faces right, unmirrored');
      else if (a[0] === byName('test-barbarian')) assert.ok(mirrored, 'the computer\'s barbarian is mirrored');
      else assert.fail('a draw used neither sheet');
    }
    assert.deepStrictEqual(new Set(imagesDrawn(ctx)), new Set([byName('test-knight'), byName('test-barbarian')]),
      'both sheets drawn, one each');
  } finally {
    fake.restore();
    C.ERAS[4] = saved;
  }
});

test('a block with only `sheet` still serves both sides, as before sheets existed', () => {
  const fake = fakeSprites();
  const saved = C.ERAS[2];
  try {
    C.ERAS[2] = { sheet: 'test-one-player', frame: { w: 20, h: 40 }, hand: { x: 20, y: 20 }, scale: 2 };
    assert.strictEqual(C.configFor(2, 'left').sheet, 'test-one-player');
    assert.strictEqual(C.configFor(2, 'right').sheet, 'test-one-player');
    const g = playing(2);
    C.drawPlayers(recorder(), g, null, R);
    assert.strictEqual(fake.made.length, 1, 'one sheet, loaded once for both sides');
    fake.loadAll();
    const ctx = recorder();
    C.drawPlayers(ctx, g, null, R);
    assert.deepStrictEqual(imagesDrawn(ctx), [fake.made[0], fake.made[0]], 'both players wear it');
    assert.strictEqual(ctx.calls.filter(([k, a]) => k === 'scale' && a[0] === -1).length, 1, 'the right one mirrored');

    // A `sheets` that names one side only: the other falls back to `sheet`.
    C.ERAS[2] = { sheet: 'test-one-player', sheets: { right: 'test-rival' } };
    assert.strictEqual(C.configFor(2, 'left').sheet, 'test-one-player');
    assert.strictEqual(C.configFor(2, 'right').sheet, 'test-rival');
    // And no sheet anywhere is the placeholder on both sides, exactly as now --
    // for every era whose own block still brings no art (the era cards fill theirs in).
    for (let e = 1; e <= 10; e++) {
      if (e === 2) continue;
      // an era card's own art (item 1232 on), whether sheets or, since item
      // 1258, its own pair of Blender-built figures named per side
      if (C.ERAS[e].sheet || C.ERAS[e].sheets || C.ERAS[e].model || C.ERAS[e].models) continue;
      assert.strictEqual(C.configFor(e, 'left').sheet, null, 'era ' + e + ' left is the placeholder');
      assert.deepStrictEqual(C.configFor(e, 'right'), Object.assign(C.configFor(e, 'left'), { side: 'right' }),
        'era ' + e + ': the two sides are the same config');
    }
  } finally {
    fake.restore();
    C.ERAS[2] = saved;
  }
});

test('no per-pixel work, and index.html loads the rig after the eras and before the loop', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'characters.js'), 'utf8');
  assert.ok(!/getImageData|putImageData|createImageData/.test(src), 'no per-pixel canvas calls');
  assert.ok(!/^\s*(import|export)\s/m.test(src), 'no ES module syntax');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const at = (s) => html.indexOf('<script src="' + s + '"');
  assert.ok(at('src/characters.js') > 0, 'index.html loads src/characters.js');
  assert.ok(at('src/characters.js') > at('src/render.js'));
  assert.ok(at('src/characters.js') > at('src/eras/era10-xbox360.js'));
  assert.ok(at('src/characters.js') < at('src/main.js'));
});
