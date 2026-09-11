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

/** An era's **Sheet:** line in its PLAYERS section: { w, h, hx, hy, scale }. */
function sheetOf(era) {
  const players = sections(pages()[era].body).PLAYERS;
  const m = /\*\*Sheet:\*\* `frame` (\d+) x (\d+), `hand` \((\d+), (\d+)\), `scale` ([\d.]+)/.exec(players);
  assert.ok(m, `era ${era}'s PLAYERS ends with a Sheet line: frame, hand and scale`);
  return { w: +m[1], h: +m[2], hx: +m[3], hy: +m[4], scale: +m[5] };
}

test('every era\'s player sheet fits the rig (src/characters.js) and pixellab\'s limits', () => {
  const C = require('../src/characters.js');
  assert.deepStrictEqual(C.BEATS, ['idle', 'up', 'down', 'swing', 'miss', 'win'],
    'the rig still reads a sheet as six rows in this order, as the bible says');
  assert.deepStrictEqual([C.MOVE, C.SWING_S, C.REACT_S], [60, 0.3, 1.2],
    'the rig\'s move threshold, swing and reaction times are the ones the bible\'s beat table gives');
  const cols = Math.max(...C.BEATS.map((b) => C.DEFAULTS.frames[b]));
  for (let era = 1; era <= 10; era++) {
    const s = sheetOf(era);
    // The hand is on the frame's right-hand edge (the rig mirrors for the right player).
    assert.strictEqual(s.hx, s.w, `era ${era}'s hand is on the frame's edge that meets the paddle`);
    assert.ok(s.hy > 0 && s.hy < s.h, `era ${era}'s hand is inside the frame`);
    // A 2D player fits the 32 units between the wall and the paddle's outer face.
    if (era <= 4) assert.ok(s.w * s.scale <= 32, `era ${era}'s player is ${s.w * s.scale} units wide, room for 32`);
    // The whole sheet is one pixflux image: each side 16 to 400, at least 1,024 pixels.
    const W = s.w * cols, H = s.h * C.BEATS.length;
    assert.ok(W >= 16 && H >= 16 && W <= 400 && H <= 400 && W * H >= 1024,
      `era ${era}'s sheet is ${W} x ${H}, outside what pixflux makes`);
    const assets = sections(pages()[era].body).ASSETS;
    assert.ok(assets.includes(`${W} x ${H}`), `era ${era}'s ASSETS generates its ${W} x ${H} sheet`);
  }
});

test('every generation an era asks for is a size pixflux can make', () => {
  for (let era = 1; era <= 10; era++) {
    const rows = sections(pages()[era].body).ASSETS.split(/\r?\n/).filter((l) => /^\|\s*\d+\s*\|/.test(l));
    for (const l of rows) {
      const c = l.split('|').map((s) => s.trim());
      const m = /^(\d+) x (\d+)/.exec(c[3]);
      if (!m) continue;   // the re-roll reserve
      const [w, h] = [+m[1], +m[2]];
      assert.ok(w >= 16 && h >= 16 && w <= 400 && h <= 400 && w * h >= 1024,
        `era ${era}'s ${c[2]} is ${w} x ${h}, outside what pixflux makes`);
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

/*
 * Reference games (item 1286): the bible ends with the real games each era is
 * built in the manner of, the add-one / change-one ladder as one list, and one
 * entry per era with its picks, numbers and sources. The ten era cards that
 * follow cite the section by its name, and each era's lessons page opens THE
 * MACHINE with its line, so the ladder, the entries and the pages must agree.
 */
const LESSON_PAGES = {
  1: 'era1-atari2600', 2: 'era2-nes', 3: 'era3-genesis', 4: 'era4-snes', 5: 'era5-playstation',
  6: 'era6-n64', 7: 'era7-dreamcast', 8: 'era8-ps2', 9: 'era9-xbox', 10: 'era10-xbox360'
};
const squash = (s) => s.replace(/\s+/g, ' ').trim();

/** The Reference games section: from its heading to the next level-2 heading, or the end. */
function referenceSection() {
  const at = ART.search(/^## Reference games$/m);
  assert.ok(at >= 0, 'docs/ART.md has a "## Reference games" section');
  const stop = ART.slice(at + 1).search(/^## /m);
  return stop >= 0 ? ART.slice(at, at + 1 + stop) : ART.slice(at);
}

/** The ladder list: era -> { machine, games: [names], added, changed }. */
function referenceLadder() {
  const out = {};
  for (const l of referenceSection().split(/\r?\n/)) {
    const m = /^- \*\*Era (\d+)\*\*, (.+)$/.exec(l);
    if (!m) continue;
    const c = m[2].split(' | ').map((s) => s.trim());
    assert.strictEqual(c.length, 4, `ladder row for era ${m[1]} has machine, reference, added and changed`);
    const games = [...c[1].matchAll(/\*([^*]+)\*/g)].map((g) => g[1]);
    out[Number(m[1])] = { machine: c[0], games, added: c[2], changed: c[3] };
  }
  return out;
}

/** The era entries: era -> the text under its "### Era N reference:" heading. */
function referenceEntries() {
  const out = {};
  const parts = referenceSection().split(/^### /m).slice(1);
  for (const p of parts) {
    const m = /^Era (\d+) reference: /.exec(p);
    assert.ok(m, `every entry heading in Reference games reads "Era N reference: ...", not "${p.split('\n')[0]}"`);
    assert.ok(!(m[1] in out), `era ${m[1]} has one reference entry`);
    out[Number(m[1])] = p;
  }
  return out;
}

test('the bible ends with Reference games, after the era 10 page', () => {
  const at = ART.search(/^## Reference games$/m);
  assert.ok(at >= 0, 'docs/ART.md has a "## Reference games" section');
  assert.ok(at > ART.search(/^## Era 10: /m), 'Reference games comes after the era 10 page');
  const intro = referenceSection().split(/^- \*\*Era 0\*\*/m)[0];
  assert.match(intro, /in the manner of/, 'the intro says every era is built in the manner of its games');
  assert.match(intro, /never copies/i, 'the intro says style, never copies');
  assert.match(intro, /Era 0 is Pong itself/, 'the intro says era 0 is Pong itself');
});

test('the add-one / change-one ladder lists all eleven eras, each with its games, addition and change', () => {
  const l = referenceLadder();
  assert.deepStrictEqual(Object.keys(l).map(Number), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (let era = 1; era <= 10; era++) {
    assert.ok(l[era].games.length >= 1 && l[era].games.length <= 2, `era ${era} is modelled on one or two games`);
    assert.match(l[era].added, /^Added: \S/, `era ${era}'s ladder row names its addition`);
    assert.match(l[era].changed, /^Changed: \S/, `era ${era}'s ladder row names its change`);
  }
  assert.match(l[0].changed, /^Changed: nothing\.$/, 'era 0 changes nothing: it is where the ladder starts');
});

test('Reference games has one entry for every era from 0 to 10, in order', () => {
  const heads = [...referenceSection().matchAll(/^### Era (\d+) reference: /gm)].map((m) => Number(m[1]));
  assert.deepStrictEqual(heads, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.match(referenceEntries()[0], /Pong itself/, 'era 0\'s pick is Pong itself');
});

for (let era = 1; era <= 10; era++) {
  test(`era ${era}'s reference entry carries its pick, addition, change, numbers, exclusions and sources`, () => {
    const e = referenceEntries()[era];
    const l = referenceLadder()[era];
    for (const field of ['Pick', 'Why', 'Take', 'Not']) {
      assert.match(e, new RegExp(`^- \\*\\*${field}:\\*\\* \\S`, 'm'), `era ${era}'s entry has a ${field}: line`);
    }
    const added = /^- \*\*Added:\*\* ([\s\S]+?)(?=^- \*\*)/m.exec(e);
    const changed = /^- \*\*Changed:\*\* ([\s\S]+?)(?=^- \*\*)/m.exec(e);
    assert.ok(added, `era ${era}'s entry has an Added: line`);
    assert.ok(changed, `era ${era}'s entry has a Changed: line`);
    assert.strictEqual(squash(added[1]).replace(/\.$/, ''), l.added.replace(/^Added: /, '').replace(/\.$/, ''),
      `era ${era}'s Added: line says what its ladder row says`);
    assert.strictEqual(squash(changed[1]).replace(/\.$/, ''), l.changed.replace(/^Changed: /, '').replace(/\.$/, ''),
      `era ${era}'s Changed: line says what its ladder row says`);
    const sources = e.slice(e.search(/^- \*\*Sources:\*\*/m));
    assert.match(sources, /^\s+- https?:\/\/\S+$/m, `era ${era}'s entry lists at least one http source`);
    for (const g of l.games) {
      const bare = g.replace(/ \(.*\)$/, '');
      assert.ok(squash(e).includes(bare), `era ${era}'s entry names ${bare}, its ladder reference`);
    }
  });

  test(`era ${era}'s lessons page opens THE MACHINE with its reference games, addition and change`, () => {
    const name = LESSON_PAGES[era];
    const doc = fs.readFileSync(path.join(ROOT, 'docs', 'lessons', `${name}.md`), 'utf8');
    const m = /^## THE MACHINE\r?\n\r?\n(- \*\*Reference games?\*\*[\s\S]*?)(?=\r?\n- |\r?\n\r?\n)/m.exec(doc);
    assert.ok(m, `${name}.md's first line under THE MACHINE is its "- **Reference game(s)**" line`);
    const line = squash(m[1]);
    const l = referenceLadder()[era];
    for (const g of l.games) assert.ok(line.includes(`*${g}*`), `${name}.md names ${g}`);
    assert.ok(line.includes(l.added), `${name}.md carries the ladder's "${l.added}"`);
    assert.ok(line.includes(l.changed), `${name}.md carries the ladder's "${l.changed}"`);
    assert.ok(line.includes('../ART.md#reference-games'), `${name}.md links the bible's Reference games`);
  });
}
