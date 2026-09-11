'use strict';
/*
 * The era signboards (src/signboards.js): the name card the ring brings in is
 * drawn by the arriving machine's own routine, looked up by rung, with the
 * plain card for a rung that has none yet. Headless, on the recording canvas
 * from tools/eralooks.js, which records every fillRect and the ink it was in.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
require('../src/erachange.js');

const FRAME = 1 / 60;
const S = R.SIGNBOARD;

function playing(opts) {
  return Pong.createGame(Object.assign({ rng: () => 0.3, phase: 'playing' }, opts || {}));
}

/** Score one point for the computer, so the machine moves up a rung. */
function concede(g) {
  g.serveDelay = 0;
  g.ball.x = 1;
  g.ball.y = g.height / 2;
  g.ball.vx = -400;
  g.ball.vy = 0;
  g.left.y = g.height - g.left.h;
  Pong.step(g, 0.05, {});
}

/** The signboard for era at t seconds after the point, drawn on a recorder. */
function board(g, era, t) {
  const rec = eralooks.recorder();
  const m = { era, text: R.eraCardText(era), t };
  const k = R.drawSignboard(rec.ctx, g, m, R.eraCardStyle(era));
  return { k, calls: rec.calls };
}

function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return null;
  const c = [0, 2, 4].map((i) => {
    const v = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  if (la === null || lb === null) return Infinity;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Every lit block of the name, where the block font puts it: [x, y] of each cell. */
function nameCells(k) {
  // A routine that letters its name at its own size says so (k.nameCell, the
  // Atari's since item 1196); every other rung uses the card's.
  const cw = k.nameCell ? k.nameCell.w : S.card.cell;
  const ch = k.nameCell ? k.nameCell.h : S.card.cell;
  const gap = k.nameGap !== undefined ? k.nameGap : S.card.gap;
  const out = [];
  let x = k.nameLeft !== undefined ? k.nameLeft : k.mid - k.textW / 2;
  for (const c0 of k.text) {
    const rows = S.glyphs[c0];
    if (rows) {
      rows.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) {
          if (row[c] === '1') out.push([x + c * cw, k.nameTop + r * ch]);
        }
      });
    }
    x += (rows ? rows[0].length : 2) * cw + gap;
  }
  return out;
}

/** Is v a whole number of steps of size step? */
function onGrid(v, step) {
  const n = v / step;
  return Math.abs(n - Math.round(n)) < 1e-6;
}

test('the hook takes all eleven rungs, and every machine has a signboard of its own', () => {
  const own = new Set();
  for (let era = 0; era <= 10; era++) {
    const fn = R.signboardFor(era);
    assert.strictEqual(typeof fn, 'function', `era ${era} finds a routine`);
    assert.notStrictEqual(fn, S.plain, `era ${era} has a signboard of its own`);
    own.add(fn);
  }
  assert.strictEqual(own.size, 11, 'no two machines share a signboard');
  assert.strictEqual(R.signboardFor(11), S.plain, 'a rung with none falls back to the plain card');
});

test('the 3D machines\' signboards wear their era\'s own card colours', () => {
  const g = playing({ era: 10 });
  for (let era = 5; era <= 10; era++) {
    const style = R.eraCardStyle(era);
    const { k, calls } = board(g, era, 1);
    const inks = new Set(calls.map((c) => c[0]));
    assert.ok(inks.has(k.ink('name')), `era ${era}: the name is in its era's ink ${style.name}`);
    assert.ok(inks.has(k.ink('label')), `era ${era}: the ERA line is in its era's ink ${style.label}`);
  }
});

test('every signboard\'s name is lettered in the block font, so it is spelled right', () => {
  for (let era = 0; era <= 10; era++) {
    const text = R.eraCardText(era);
    assert.ok(text.length > 0, `era ${era} has a name`);
    assert.ok(S.canSpell(text), `the block font can letter "${text}"`);
  }
});

test('everything a signboard fills stays inside the card, the rectangle era 4 crops and the playtest leaves out', () => {
  const g = playing({ era: 4 });
  for (let era = 0; era <= 10; era++) {
    for (const t of [0.7, 1.0, 1.3, 1.7]) {
      const { k, calls } = board(g, era, t);
      const r = k.rect;
      for (const [ink, x, y, w, h] of calls) {
        assert.ok(x >= r.x - 1e-6 && y >= r.y - 1e-6 && x + w <= r.x + r.w + 1e-6 && y + h <= r.y + r.h + 1e-6,
          `era ${era} at ${t}s: ${ink} ${x},${y} ${w}x${h} is inside ${JSON.stringify(r)}`);
      }
    }
  }
  // The rectangle is the one the Super Nintendo's arrival crops.
  const snes = R.eraLook(4).arrival.cardRect;
  for (let era = 0; era <= 10; era++) {
    assert.deepStrictEqual(S.rect(800, 600, R.eraCardText(era)), snes(800, 600, R.eraCardText(era)), `era ${era}`);
  }
});

test('every signboard stays legible for its whole display time, at its machine\'s resolution', () => {
  for (let era = 1; era <= 10; era++) {
    const g = playing({ era: era - 1 });
    concede(g);
    assert.strictEqual(g.era, era);
    const px = S.resolution[era];
    const pw = g.width / px.w, ph = g.height / px.h;
    let m = R.eraChangeMoment(g);
    let frames = 0;
    while (m) {
      if (m.cardUp) {
        frames++;
        const { k, calls } = board(g, era, m.t);
        assert.ok(k && k.nameTop > 0, `era ${era} at ${m.t.toFixed(2)}s draws its signboard`);
        const box = k.style.box;
        for (const [cx, cy] of nameCells(k)) {
          // The topmost ink over this block's corner is what the player sees there.
          let hit = null;
          for (const c of calls) {
            if (Math.abs(c[1] - cx) < 1e-6 && Math.abs(c[2] - cy) < 1e-6 && c[0] !== box) hit = c;
          }
          assert.ok(hit, `era ${era} at ${m.t.toFixed(2)}s: the block at ${cx},${cy} of "${k.text}" is lit`);
          assert.ok(hit[3] >= pw - 1e-6 && hit[4] >= ph - 1e-6,
            `era ${era}: a ${hit[3]}x${hit[4]} block is at least one ${px.w}x${px.h} pixel (${pw.toFixed(2)}x${ph.toFixed(2)})`);
          assert.ok(contrast(hit[0], box) >= 3, `era ${era}: ${hit[0]} on ${box} reads (contrast ${contrast(hit[0], box).toFixed(2)})`);
          // A block under two machine pixels across that straddles the machine's
          // pixels smears into its neighbours on that screen: the Atari's old
          // 7-wide blocks were 1.4 of its pixels, and at 160 wide the 9 of 1977
          // read as a 5 and 2600 ran together (item 1196). Such a block has to
          // start and end on the machine's own pixel columns, and start on its lines.
          if (hit[3] < 2 * pw - 1e-6) {
            assert.ok(onGrid(hit[1], pw) && onGrid(hit[1] + hit[3], pw),
              `era ${era}: the ${hit[3]}-wide block at x ${hit[1]} of "${k.text}" sits on the ${px.w}-wide screen's pixels (${pw.toFixed(2)} each)`);
          }
          if (hit[4] < 2 * ph - 1e-6) {
            assert.ok(onGrid(hit[2], ph),
              `era ${era}: the ${hit[4]}-high block at y ${hit[2]} of "${k.text}" starts on one of the ${px.h} lines (${ph.toFixed(3)} each)`);
          }
        }
      }
      Pong.step(g, FRAME, {});
      m = R.eraChangeMoment(g);
    }
    assert.ok(frames > 30, `era ${era}: the card was up for ${frames} frames`);
  }
  // Era 0 is where a session starts, so its signboard is drawn on its own.
  const g = playing();
  for (let t = 0; t < 2; t += 0.05) {
    const { k, calls } = board(g, 0, t);
    for (const [cx, cy] of nameCells(k)) {
      assert.ok(calls.some((c) => Math.abs(c[1] - cx) < 1e-6 && Math.abs(c[2] - cy) < 1e-6 && c[0] !== k.style.box),
        `era 0 at ${t.toFixed(2)}s: the block at ${cx},${cy} is lit`);
    }
  }
});

test('the blinking words blink, but the name never does', () => {
  const g = playing();
  const on = board(g, 2, 0.1).calls.length;
  const off = board(g, 2, 0.6).calls.length;
  assert.ok(on > off, 'PUSH START is off for half of each second');
  assert.ok(nameCells(board(g, 2, 0.6).k).length > 20, 'the name is still all there');
});

test('a card held back invisible draws nothing: the Super Nintendo spins its own copy in', () => {
  const g = playing({ era: 4 });
  const rec = eralooks.recorder();
  const style = R.eraLook(4).arrival.heldCard;
  assert.ok(style, 'the Super Nintendo publishes the card it holds back');
  assert.strictEqual(R.drawSignboard(rec.ctx, g, { era: 4, text: R.eraCardText(4), t: 1 }, style), null);
  assert.strictEqual(rec.calls.length, 0);
});
