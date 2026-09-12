// Warming the figures (item 1299). The first frame that draws a Blender glTF
// figure used to be the frame that asked for its file, unpacked it, built both
// posed copies and made WebGL build their shader -- all at once, and mid-match
// once each 3D era wears its own figure (cards 1253-1258). The layer now looks
// one era ahead: while era N is on screen it asks for era N+1's files too, and
// builds and draws each at a thousandth of its size in a frame of its own.
//
// This pins the rule that decides WHICH figures are warmed, which is the part a
// node suite can read: one era ahead and no further, both sides, no duplicates,
// nothing at all for the 2D eras -- and that a page with no WebGL never warms.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const F = require('../src/field3d.js');

/** src/characters.js's shape, as much of it as the warm reads. */
function stubCharacters(figuresByEra) {
  return {
    enabled: true,
    configFor(era, side) {
      const own = figuresByEra[era];
      if (!own) return { is3d: era >= 5, side };
      return { is3d: true, side, figure: own[side] || own.both || null };
    }
  };
}

function withCharacters(C, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'PongCharacters');
  const was = globalThis.PongCharacters;
  globalThis.PongCharacters = C;
  try { return fn(); } finally {
    if (had) globalThis.PongCharacters = was; else delete globalThis.PongCharacters;
  }
}

test('an era wants a figure for each side, and the 2D eras want none', () => {
  const C = stubCharacters({ 9: { left: 'era9-player', right: 'era9-rival' } });
  withCharacters(C, () => {
    assert.deepStrictEqual(F.figureNamesFor(9),
      [{ side: 'left', name: 'era9-player' }, { side: 'right', name: 'era9-rival' }]);
    // era 3's block has no figure at all: nothing to warm, and nothing thrown
    assert.deepStrictEqual(F.figureNamesFor(3), []);
  });
});

test('the layer looks ONE era ahead, and no further', () => {
  const C = stubCharacters({
    8: { both: 'era8-figure' }, 9: { both: 'era9-figure' }, 10: { both: 'era10-figure' }
  });
  withCharacters(C, () => {
    const names = F.figuresWanted(8).map((j) => j.name);
    assert.deepStrictEqual(names, ['era8-figure', 'era8-figure', 'era9-figure', 'era9-figure'],
      'era 8 on screen wants its own two and era 9\'s two');
    assert.ok(!names.includes('era10-figure'), 'and never era 10\'s, two rungs away');
  });
});

test('two eras that share a figure ask for it once', () => {
  const C = stubCharacters({ 5: { both: 'player-proof-hi' }, 6: { both: 'player-proof-hi' } });
  withCharacters(C, () => {
    assert.deepStrictEqual(F.figuresWanted(5),
      [{ side: 'left', name: 'player-proof-hi' }, { side: 'right', name: 'player-proof-hi' }]);
  });
});

test('a name that is not a file name is never asked for', () => {
  const C = stubCharacters({ 9: { left: '../secrets', right: 'Player Proof' } });
  withCharacters(C, () => assert.deepStrictEqual(F.figuresWanted(9), []));
});

test('the era before the first 3D one already wants the 3D era\'s figures', () => {
  const C = stubCharacters({ 5: { both: 'era5-figure' } });
  withCharacters(C, () => {
    // era 4 is canvas 2D and has no figures of its own, but era 5 is one rung away
    assert.deepStrictEqual(F.figuresWanted(4).map((j) => j.name), ['era5-figure', 'era5-figure']);
  });
});

test('with no WebGL nothing is warmed and nothing is asked for', () => {
  const C = stubCharacters({ 9: { both: 'era9-figure' } });
  withCharacters(C, () => {
    assert.strictEqual(F.available(), false, 'node has no WebGL');
    assert.strictEqual(F.warmFigures(9), 0);
    assert.strictEqual(F.figureState('era9-figure'), null, 'no file was reached for');
  });
});

test('what the figures cost this page is reported in ms', () => {
  const t = F.figureTimings();
  for (const k of ['parseMs', 'buildMs', 'compileMs', 'warmMs']) {
    assert.strictEqual(typeof t[k], 'number', k);
  }
  assert.strictEqual(t.warms, 0);
  assert.deepStrictEqual(t.warmed, []);
});
