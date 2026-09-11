'use strict';
/*
 * The era lessons (item 1236): docs/lessons/ holds one page per era, named
 * after that era's look in src/eras/, and a README.md index that links every
 * page. Each page answers the same six questions under the same six headings,
 * because the era cards that follow append to these pages and a new one-era
 * game starts from them -- so a heading that drifts, or a page nobody linked,
 * fails here.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const LESSONS = path.join(ROOT, 'docs', 'lessons');

const HEADINGS = [
  'THE MACHINE',
  'WHAT SOLD THE LOOK',
  'WHAT DID NOT WORK',
  'SOUND AND MUSIC',
  'REUSABLE PIECES',
  'START HERE'
];

const PAGES = [
  'era0-arcade.md',
  'era1-atari2600.md',
  'era2-nes.md',
  'era3-genesis.md',
  'era4-snes.md',
  'era5-playstation.md',
  'era6-n64.md',
  'era7-dreamcast.md',
  'era8-ps2.md',
  'era9-xbox.md',
  'era10-xbox360.md'
];

const read = (name) => fs.readFileSync(path.join(LESSONS, name), 'utf8');

/** The page's level-two headings, in order, and the text under each. */
function sections(doc) {
  const out = [];
  for (const line of doc.split(/\r?\n/)) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) out.push({ heading: m[1], body: '' });
    else if (out.length) out[out.length - 1].body += line + '\n';
  }
  return out;
}

test('there is one lessons page for every era look in src/eras/, and no other', () => {
  const looks = fs.readdirSync(path.join(ROOT, 'src', 'eras'))
    .filter((f) => /^era\d+-.+\.js$/.test(f)).map((f) => f.replace(/\.js$/, '.md'));
  const byEra = (a, b) => Number(/^era(\d+)/.exec(a)[1]) - Number(/^era(\d+)/.exec(b)[1]);
  assert.deepStrictEqual(looks.sort(byEra), PAGES);
  const pages = fs.readdirSync(LESSONS).filter((f) => /^era\d+-.+\.md$/.test(f)).sort(byEra);
  assert.deepStrictEqual(pages, PAGES);
});

for (const page of PAGES) {
  test(`${page} answers all six questions, under the fixed headings, in order`, () => {
    const found = sections(read(page));
    const names = found.map((s) => s.heading);
    let at = -1;
    for (const h of HEADINGS) {
      const i = names.indexOf(h);
      assert.ok(i >= 0, `${page} has no "## ${h}" heading (it has: ${names.join(', ')})`);
      assert.ok(i > at, `${page} puts "## ${h}" out of order`);
      at = i;
      assert.ok(found[i].body.trim().length > 0, `${page} leaves "## ${h}" empty`);
    }
  });

  test(`${page} names its own era's ?era=N`, () => {
    const n = /^era(\d+)-/.exec(page)[1];
    assert.match(read(page), new RegExp(`\\?era=${n}\\b`));
  });
}

test('the README links every era page and says how to start a one-era game', () => {
  const doc = read('README.md');
  for (const page of PAGES) {
    assert.ok(doc.includes(`](${page})`), `README.md does not link ${page}`);
  }
  assert.match(doc, /single-era game|one-era game/i);
});

test('every relative link in the lessons points at a file that exists', () => {
  for (const name of ['README.md', ...PAGES]) {
    const doc = read(name);
    for (const m of doc.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      const target = m[1];
      if (/^[a-z]+:/i.test(target)) continue;
      assert.ok(fs.existsSync(path.resolve(LESSONS, target)), `${name} links ${target}, which is not there`);
    }
  }
});
