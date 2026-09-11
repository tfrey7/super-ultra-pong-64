/*
 * Super Ultra Pong 64: Remastered -- era 3's music: Genesis (1989).
 *
 * ONE ERA, ONE FILE (item 1241): an arrangement card edits only this file,
 * the way an era's look lives in src/eras/. docs/MUSIC.md section "Era 3"
 * is the brief for what goes here; the vocabulary (parts, rules, voices,
 * effects) is at the head of src/music.js.
 *
 *   era, year   the rung and the year it stands for
 *   voices      the chip's simultaneous notes; the player drops anything over
 *   kit         the era's drum kit: a drum part names a piece with `hit`
 *   chain       the period's production over the whole era (tone, tape,
 *               chorus, hall with an optional gate)
 *   the rest    the arrangement of the one theme; any part may carry
 *               `from: 0..1`, the intensity at which it joins
 *
 * Plain script in the page (it registers itself on window.PongMusicEras,
 * before src/music.js reads it); require() under node.
 */
(function (root, era) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = era;
  else (root.PongMusicEras = root.PongMusicEras || [])[era.era] = era;
})(typeof globalThis !== 'undefined' ? globalThis : this, {
  era: 3,
  year: 1989,
  voices: 10,
  kit: {
    kick: { wave: 'kick', freq: 170, gain: 0.45, env: { a: 0.001, d: 0.16, s: 0, r: 0.03 } },
    snare: [{ wave: 'noise', gain: 0.16, env: { a: 0.001, d: 0.11, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 2200, q: 0.9 } }, { wave: 'sine', freq: 220, gain: 0.08, env: { a: 0.001, d: 0.05, s: 0, r: 0.03 }, drop: { ratio: 0.6, time: 0.04 } }],
    clap: { wave: 'noise', gain: 0.14, bursts: 3, env: { a: 0.001, d: 0.12, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 1200, q: 1.2 } },
    hat: { wave: 'noise', gain: 0.045, env: { a: 0.001, d: 0.03, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 8000, q: 0.7 } },
    open: { wave: 'noise', gain: 0.045, env: { a: 0.001, d: 0.22, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 8000, q: 0.7 } },
    tom: { wave: 'sine', freq: 150, gain: 0.25, env: { a: 0.001, d: 0.18, s: 0, r: 0.03 }, drop: { ratio: 0.5, time: 0.15 } },
    crash: { wave: 'noise', gain: 0.07, env: { a: 0.001, d: 1.0, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 5000, q: 0.5 } }
  },
  chain: { chorus: { rate: 0.8, depth: 0.004, mix: 0.3 }, hall: { seconds: 1.2, decay: 3.5, mix: 0.12 } },

  // 3 -- 1989 Genesis: the YM2612's FM channels and the PSG square on top.
  name: 'Genesis',
  about: 'A driving FM groove: a growling slap bass in sixteenths, the melody on a brassy FM horn, a thin square stabbing the chords on the off-beats, and a hard kick and snare with a gritty edge on everything.',
  trait: 'FM synthesis: punchy metallic bass and brass patches, the PSG square riding on top, and that slightly crunchy output.',
  parts: [
    { play: 'bass', rule: 'sixteenths',
      voice: { wave: 'sine', gain: 0.2, fm: { ratio: 1, index: 3.4 },
               env: { a: 0.002, d: 0.09, s: 0.4, r: 0.02 }, legato: 0.7 } },
    { play: 'melody', rule: 'full',
      voice: { wave: 'sine', gain: 0.12, fm: { ratio: 1, index: 2.4 },
               env: { a: 0.012, d: 0.2, s: 0.65, r: 0.06 }, vibrato: { rate: 6, cents: 14, delay: 0.18 } } },
    { play: 'chords', rule: 'offbeat', octave: 1,
      voice: { wave: 'square', gain: 0.03, env: { a: 0.001, d: 0.06, s: 0.3, r: 0.02 }, legato: 0.6 } },
    { play: 'drum', pattern: 'X . . . . . . x x . . . . . . .', fill: 'X . . . . . . x x . . . . x x x',
      voice: { wave: 'kick', freq: 170, gain: 0.45, env: { a: 0.001, d: 0.16, s: 0, r: 0.02 } } },
    { play: 'drum', pattern: '. . . . X . . . . . . . X . . .', fill: '. . . . X . . . . . . . X x X X',
      voice: { wave: 'noise', gain: 0.18, env: { a: 0.001, d: 0.11, s: 0, r: 0.02 },
               filter: { type: 'bandpass', freq: 2200, q: 0.9 } } },
    { play: 'drum', pattern: 'x x X x x x X x x x X x x x X x',
      voice: { wave: 'noise', gain: 0.045, env: { a: 0.001, d: 0.03, s: 0, r: 0.01 },
               filter: { type: 'highpass', freq: 8000, q: 0.7 } } }
  ],
  effects: { grit: 0.35 }
});
