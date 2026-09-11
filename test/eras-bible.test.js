'use strict';
/*
 * The era bible (docs/ERAS.md) and the ladder it promises.
 *
 * The bible is what every era card from the PlayStation to the Xbox 360 is
 * built to, so the two facts a card cannot be allowed to drift on are pinned
 * here: the order of the ladder with each rung's year and machine, and each
 * rung's name-card text. Every rung the rules already carry must match it, so
 * the card that adds eras 5 to 10 to Pong.ERAS lands exactly these rows. And
 * every era camera the bible gives must pass its readability rule R3, measured
 * by tools/table3d-cameras.js.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');
const cameras = require('../tools/table3d-cameras.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
require('../src/erachange.js');

const LADDER = [
  [0, 1972, 'arcade Pong'],
  [1, 1977, 'Atari 2600'],
  [2, 1985, 'NES'],
  [3, 1989, 'Sega Genesis'],
  [4, 1991, 'Super Nintendo'],
  [5, 1994, 'Sony PlayStation'],
  [6, 1996, 'Nintendo 64'],
  [7, 1999, 'Sega Dreamcast'],
  [8, 2000, 'PlayStation 2'],
  [9, 2001, 'Xbox'],
  [10, 2005, 'Xbox 360']
];

const CARDS = [
  '1972 · ARCADE PONG',
  '1977 · ATARI 2600',
  '1985 · NES',
  '1989 · SEGA GENESIS',
  '1991 · SUPER NINTENDO',
  '1994 · SONY PLAYSTATION',
  '1996 · NINTENDO 64',
  '1999 · SEGA DREAMCAST',
  '2000 · PLAYSTATION 2',
  '2001 · XBOX',
  '2005 · XBOX 360'
];

/** The ladder table between the markers in docs/ERAS.md. */
function bibleLadder() {
  const doc = fs.readFileSync(path.join(ROOT, 'docs', 'ERAS.md'), 'utf8');
  const m = /<!-- ladder:start -->([\s\S]*?)<!-- ladder:end -->/.exec(doc);
  assert.ok(m, 'docs/ERAS.md carries its ladder between the ladder markers');
  return m[1].split(/\r?\n/).filter((l) => /^\|\s*\d+\s*\|/.test(l)).map((l) => {
    const c = l.split('|').slice(1, -1).map((s) => s.trim().replace(/`/g, ''));
    return { era: Number(c[0]), year: Number(c[1]), machine: c[2], card: c[3] };
  });
}

test('the bible\'s ladder runs 0 to 10 in this order, with these years and machines', () => {
  const rows = bibleLadder();
  assert.deepStrictEqual(rows.map((r) => [r.era, r.year, r.machine]), LADDER);
});

test('every name card reads "year · MACHINE", exactly as the bible writes it', () => {
  const rows = bibleLadder();
  assert.deepStrictEqual(rows.map((r) => r.card), CARDS);
  for (const r of rows) assert.strictEqual(r.card, `${r.year} · ${r.machine.toUpperCase()}`);
});

test('every rung the rules already carry matches the bible, and so does its card', () => {
  assert.ok(Pong.ERAS.length >= 5 && Pong.ERAS.length <= LADDER.length,
    `the rules carry ${Pong.ERAS.length} rungs`);
  Pong.ERAS.forEach((e, i) => {
    assert.deepStrictEqual([e.era, e.year, e.machine], LADDER[i], `rung ${i}`);
    assert.strictEqual(R.eraCardText(e.era), CARDS[i], `rung ${i}'s card`);
  });
});

test('every name card is drawable in the block font and fits the card', () => {
  const CELL = 7;          // src/erachange.js CARD.cell
  const GAP = 5;           // CARD.gap
  const ROOM = 800 - 40 - 2 * 36;   // the widest card, less its padding
  const cells = (ch) => {
    if (ch === ' ') return 2;
    if (ch === '·') return 1;
    const rows = R.DIGITS[ch] || R.LETTERS[ch];
    assert.ok(rows, `the block font draws ${JSON.stringify(ch)}`);
    return rows[0].length;
  };
  for (const text of CARDS) {
    const width = [...text].reduce((w, ch, i) => w + (i ? GAP : 0) + cells(ch) * CELL, 0);
    assert.ok(width <= ROOM, `${text} is ${width} units wide, room for ${ROOM}`);
  }
});

test('every era camera in the bible passes rule R3, at rest and at each motion extreme', () => {
  assert.deepStrictEqual(cameras.ERAS.map((e) => e.era), [5, 6, 7, 8, 9, 10]);
  for (const e of cameras.ERAS) {
    for (const pose of cameras.poses(e)) {
      const m = cameras.measure(pose);
      assert.ok(cameras.readable(m), `era ${e.era} at ${JSON.stringify(pose)}: ${JSON.stringify(m)}`);
    }
  }
});
