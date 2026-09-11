/*
 * The version stamp (item 1276): src/version.js says which build the site is
 * serving, the title screen's NOW WITH line shows it, and tools/stamp.mjs is
 * how a landing rewrites it. Drawing runs on the recording canvas from
 * tools/eralooks.js; the script runs in a child Node writing to a temp file,
 * never the checked-in stamp.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { loadRenderer, recorder } = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = loadRenderer(ROOT);
globalThis.Pong = Pong;
const PongAttract = require('../src/attract.js');

const fixed = () => 0.5;
const V = PongAttract.TITLE.version;

function loadStamp(file) {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox);
  return sandbox.PongVersion;
}

/** The blocks the attract screen draws in the version line's ink. */
function versionBlocks(stamp) {
  const saved = globalThis.PongVersion;
  globalThis.PongVersion = stamp;
  try {
    const g = Pong.createGame({ rng: fixed });
    const cab = PongAttract.create();
    cab.warm = true;
    const rec = recorder();
    cab.drawTitle(rec.ctx, g, null);
    return rec.calls.filter((c) => c[0] === V.ink);
  } finally {
    if (saved === undefined) delete globalThis.PongVersion; else globalThis.PongVersion = saved;
  }
}

/** The same line drawn straight from its expected text: the font's blocks plus the middle dot. */
function expectedBlocks(text, cell, gap) {
  const rec = recorder();
  rec.ctx.fillStyle = V.ink;
  R.drawText(rec.ctx, text, 400, V.top, cell, gap);
  return rec.calls;
}

test('the checked-in stamp names a feature, its item, a short sha and a date', () => {
  const stamp = loadStamp(path.join(ROOT, 'src', 'version.js'));
  assert.ok(stamp.feature.length > 3, 'a feature title');
  assert.match(String(stamp.item), /^\d+$/);
  assert.match(stamp.sha, /^[0-9a-f]{7}$/);
  assert.match(stamp.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('the title screen draws NOW WITH: <feature> · <sha> from the stamp, in its own block letters', () => {
  const stamp = { feature: 'Short one', item: '7', sha: 'abcdef1', date: '2026-09-11' };
  const line = PongAttract.versionLine(stamp);
  assert.strictEqual(line.text, 'NOW WITH: SHORT ONE · ABCDEF1');
  assert.strictEqual(line.cell, 3, 'a short line keeps the larger of the two sizes');

  const drawn = versionBlocks(stamp);
  const want = expectedBlocks(line.text, line.cell, line.gap);
  assert.strictEqual(drawn.length, want.length + 1, 'every block of the text, plus the middle dot');
  assert.deepStrictEqual(drawn.slice(0, want.length), want, 'the very blocks of NOW WITH: SHORT ONE . ABCDEF1');
  const dot = drawn[want.length];
  assert.strictEqual(dot[3], line.cell);
  assert.strictEqual(dot[2], V.top + 2 * line.cell, 'the dot sits on the middle row');

  const other = versionBlocks(Object.assign({}, stamp, { sha: '1234567' }));
  assert.notDeepStrictEqual(other, drawn, 'a different sha draws a different line');
});

test('the line stays small and between 64 REMASTERED and INSERT COIN, and a long feature is cut, never the sha', () => {
  const T = PongAttract.TITLE;
  const below = T.under.top + 5 * T.under.cell;
  for (const size of V.sizes) {
    assert.ok(size.cell < T.how.cell, 'smaller than the smallest line already on the title');
    assert.ok(V.top > below && V.top + 5 * size.cell < T.coin.top, 'in the gap, clear of both');
  }
  const seeded = loadStamp(path.join(ROOT, 'src', 'version.js'));
  const drawn = versionBlocks(seeded);
  assert.ok(drawn.length > 0, 'the seeded stamp is drawn');
  assert.ok(drawn.every((c) => c[1] >= 20 && c[1] + c[3] <= 780), 'inside the field with a margin');

  const long = PongAttract.versionLine({ feature: 'x'.repeat(300), sha: '0123abc' });
  assert.ok(long.text.endsWith('... · 0123ABC'), long.text);
  assert.strictEqual(long.cell, 2);
  assert.strictEqual(PongAttract.versionLine(null), null, 'no stamp, no line');
  assert.deepStrictEqual(versionBlocks(undefined), [], 'and nothing drawn');
});

test('tools/stamp.mjs writes the item, title and sha it is given, and today\'s date', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pong-stamp-'));
  try {
    const out = path.join(dir, 'version.js');
    const title = 'Title screen: a "Now with" line';
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'stamp.mjs'),
      '--item', '1276', '--title', title, '--sha', '0ABCDEF123456', '--out', out], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    const stamp = loadStamp(out);
    assert.deepStrictEqual(Object.keys(stamp), ['feature', 'item', 'sha', 'date']);
    assert.strictEqual(stamp.feature, title);
    assert.strictEqual(stamp.item, '1276');
    assert.strictEqual(stamp.sha, '0abcdef', 'cut to seven, lower case');
    assert.strictEqual(stamp.date, new Date().toISOString().slice(0, 10));

    const bad = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'stamp.mjs'),
      '--item', '1', '--title', 't', '--out', path.join(dir, 'no.js')], { encoding: 'utf8' });
    assert.strictEqual(bad.status, 2, 'no --sha is refused');
    assert.strictEqual(fs.existsSync(path.join(dir, 'no.js')), false, 'and writes nothing');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('fleet.json names the stamp command, and index.html loads the stamp before the cabinet', () => {
  const fleet = JSON.parse(fs.readFileSync(path.join(ROOT, 'fleet.json'), 'utf8'));
  assert.match(fleet.stamp, /^node tools\/stamp\.mjs --item \{item\} --title \{title\} --sha \{sha\}$/);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const v = html.indexOf('src="src/version.js"'), a = html.indexOf('src="src/attract.js"');
  assert.ok(v > 0 && v < a, 'version.js is in the script list, ahead of attract.js');
});
