'use strict';
/*
 * The art bible (docs/ART.md): every era from 1 (Atari 2600) to 10 (Xbox 360)
 * is dressed as that year's flagship game, and each era card builds its page
 * without a second decision. So the page must be complete: every era carries
 * all eight fixed headings, each with something under it; the players' page
 * names all five animation beats; the flagship page names at least two real
 * games with their years; and the asset plan adds up and stays inside the
 * twelve pixellab generations an era is allowed. Era 0 is the exception and
 * says so: it stays the 1972 machine. The years and machines are the ladder's
 * own, read from docs/ERAS.md, so the two documents cannot drift apart.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ART = fs.readFileSync(path.join(ROOT, 'docs', 'ART.md'), 'utf8');
const ERAS = fs.readFileSync(path.join(ROOT, 'docs', 'ERAS.md'), 'utf8');

const HEADINGS = ['FLAGSHIP LOOK', 'SCENE', 'PLAYERS', 'BALL', 'SCOREBOARD',
  'MOMENTS', 'TREATMENT', 'ASSETS'];
const BEATS = ['idle', 'move', 'swing', 'miss', 'win'];
const BUDGET = 12;

/** The ladder rows between the markers in docs/ERAS.md: era -> { year, machine }. */
function ladder() {
  const m = /<!-- ladder:start -->([\s\S]*?)<!-- ladder:end -->/.exec(ERAS);
  assert.ok(m, 'docs/ERAS.md carries its ladder between the ladder markers');
  const rows = {};
  for (const l of m[1].split(/\r?\n/)) {
    if (!/^\|\s*\d+\s*\|/.test(l)) continue;
    const c = l.split('|').slice(1, -1).map((s) => s.trim());
    rows[Number(c[0])] = { year: Number(c[1]), machine: c[2] };
  }
  return rows;
}

/** docs/ART.md cut into era pages: era -> { title, year, machine, body }. */
function pages() {
  const out = {};
  const re = /^## Era (\d+): (\d{4}) (.+)$/gm;
  const heads = [];
  let m;
  while ((m = re.exec(ART))) heads.push({ era: Number(m[1]), year: Number(m[2]), machine: m[3].trim(), at: m.index, end: re.lastIndex });
  heads.forEach((h, i) => {
    // A page runs to the next era heading, or to the next level-2 heading of any kind.
    const rest = ART.slice(h.end, i + 1 < heads.length ? heads[i + 1].at : ART.length);
    const stop = rest.search(/^## /m);
    out[h.era] = { year: h.year, machine: h.machine, body: stop >= 0 ? rest.slice(0, stop) : rest };
  });
  return out;
}

/** One page cut into its level-3 sections: heading -> text under it. */
function sections(body) {
  const out = {};
  const parts = body.split(/^### /m).slice(1);
  for (const p of parts) {
    const nl = p.indexOf('\n');
    const head = p.slice(0, nl < 0 ? p.length : nl).trim();
    assert.ok(!(head in out), `the heading ${head} appears once on its page`);
    out[head] = nl < 0 ? '' : p.slice(nl + 1);
  }
  return out;
}

test('the art bible has a page for every era from 0 to 10, in ladder order', () => {
  const p = pages();
  assert.deepStrictEqual(Object.keys(p).map(Number), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const order = [...ART.matchAll(/^## Era (\d+):/gm)].map((m) => Number(m[1]));
  assert.deepStrictEqual(order, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('every page carries the year and machine the era bible\'s ladder gives it', () => {
  const p = pages();
  const l = ladder();
  for (let era = 0; era <= 10; era++) {
    assert.ok(l[era], `docs/ERAS.md has a ladder row for era ${era}`);
    assert.strictEqual(p[era].year, l[era].year, `era ${era}'s year`);
    assert.strictEqual(p[era].machine, l[era].machine, `era ${era}'s machine`);
  }
});

test('era 0 stays 1972 Pong, bars and a dot, and has no page of headings to build', () => {
  const body = pages()[0].body;
  assert.match(body, /1972/);
  assert.match(body, /Pong/);
  assert.match(body, /bars/i);
  assert.match(body, /dot/i);
  assert.deepStrictEqual(Object.keys(sections(body)), [], 'era 0 has no build headings');
});

test('a 56-unit player on the end strip never leans over its paddle, in any 3D camera pose', () => {
  // The claim in the art bible's "Where a player stands": feet at x 4 to 30
  // (left) and 770 to 796 (right), head at z 56, measured in every pose the
  // era bible measures, every 50 units along the table.
  const cameras = require('../tools/table3d-cameras.js');
  assert.deepStrictEqual(cameras.ERAS.map((e) => e.era), [5, 6, 7, 8, 9, 10]);
  for (const e of cameras.ERAS) {
    for (const pose of cameras.poses(e)) {
      const c = cameras.camera(pose);
      for (let y = 0; y <= 600; y += 50) {
        const p = (x, z) => cameras.project(c, x, y, z).x;
        const left = p(46, 0) - Math.max(p(30, 56), p(30, 0));
        const right = Math.min(p(770, 56), p(770, 0)) - p(754, 0);
        assert.ok(left >= 11, `era ${e.era} at y ${y}: the left player is ${left.toFixed(1)} px clear of its paddle`);
        assert.ok(right >= 11, `era ${e.era} at y ${y}: the right player is ${right.toFixed(1)} px clear of its paddle`);
        const h = cameras.project(c, 17, y, 0).y - cameras.project(c, 17, y, 56).y;
        assert.ok(h >= 9 && h <= 30, `era ${e.era} at y ${y}: the player is ${h.toFixed(1)} px tall, outside the bible's 9 to 30`);
      }
    }
  }
});

for (let era = 1; era <= 10; era++) {
  test(`era ${era} has every fixed heading, in order, each with something under it`, () => {
    const s = sections(pages()[era].body);
    for (const h of HEADINGS) {
      assert.ok(h in s, `era ${era} lacks the heading ${h}`);
      assert.ok(s[h].trim().length >= 80, `era ${era}'s ${h} is empty or a stub`);
    }
    const order = Object.keys(s).filter((h) => HEADINGS.includes(h));
    assert.deepStrictEqual(order, HEADINGS, `era ${era}'s headings run in the fixed order`);
  });

  test(`era ${era} names two flagship games with their years and all five player beats`, () => {
    const s = sections(pages()[era].body);
    const games = s['FLAGSHIP LOOK'].match(/\*[^*\n]+\* \((?:19|20)\d\d/g) || [];
    assert.ok(games.length >= 2, `era ${era} names ${games.length} flagship games`);
    for (const b of BEATS) {
      assert.match(s.PLAYERS, new RegExp(`\\*\\*${b}:?\\*\\*`, 'i'), `era ${era}'s players have a ${b} beat`);
    }
  });

  test(`era ${era}'s asset plan adds up and fits in ${BUDGET} generations`, () => {
    const a = sections(pages()[era].body).ASSETS;
    const m = /\*\*Budget:\*\* (\d+) of 12 generations/.exec(a);
    assert.ok(m, `era ${era} states its budget as "**Budget:** N of 12 generations"`);
    const budget = Number(m[1]);
    assert.ok(budget <= BUDGET, `era ${era} spends ${budget} generations`);
    const rows = a.split(/\r?\n/).filter((l) => /^\|\s*\d+\s*\|/.test(l));
    assert.ok(rows.length >= 2, `era ${era} lists its generations one row each`);
    const sum = rows.reduce((t, l) => t + Number(l.split('|')[1]), 0);
    assert.strictEqual(sum, budget, `era ${era}'s rows add up to its budget`);
    assert.match(a, /drawn in code/i, `era ${era} says what is drawn in code instead`);
  });
}
