/*
 * Super Ultra Pong 64: Remastered -- era 5's music: PlayStation (1994).
 *
 * ONE ERA, ONE FILE (item 1241): an arrangement card edits only this file,
 * the way an era's look lives in src/eras/. docs/MUSIC.md section "Era 5"
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
  era: 5,
  year: 1994,
  voices: 24,
  kit: {
    kick: { wave: 'kick', freq: 115, gain: 0.34, env: { a: 0.001, d: 0.2, s: 0, r: 0.03 } },
    snare: [{ wave: 'noise', gain: 0.1, env: { a: 0.001, d: 0.12, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 2400, q: 0.7 } }, { wave: 'sine', freq: 200, gain: 0.07, env: { a: 0.001, d: 0.06, s: 0, r: 0.03 }, drop: { ratio: 0.6, time: 0.04 } }],
    clap: { wave: 'noise', gain: 0.1, bursts: 3, env: { a: 0.001, d: 0.12, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 1300, q: 1.1 } },
    hat: { wave: 'noise', gain: 0.04, env: { a: 0.001, d: 0.04, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 8500, q: 0.7 }, pan: 0.3 },
    open: { wave: 'noise', gain: 0.04, env: { a: 0.001, d: 0.25, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 8000, q: 0.7 }, pan: 0.3 },
    tom: { wave: 'sine', freq: 140, gain: 0.22, env: { a: 0.001, d: 0.2, s: 0, r: 0.03 }, drop: { ratio: 0.5, time: 0.15 } },
    crash: { wave: 'noise', gain: 0.06, env: { a: 0.001, d: 1.2, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 5000, q: 0.5 } },
    hit: [{ wave: 'sawtooth', freq: 220, gain: 0.08, unison: [-12, 12], env: { a: 0.001, d: 0.25, s: 0, r: 0.05 }, filter: { type: 'lowpass', freq: 3000, q: 0.8 } }, { wave: 'sawtooth', freq: 261.6, gain: 0.07, env: { a: 0.001, d: 0.25, s: 0, r: 0.05 } }, { wave: 'sawtooth', freq: 329.6, gain: 0.07, env: { a: 0.001, d: 0.25, s: 0, r: 0.05 } }, { wave: 'noise', gain: 0.05, env: { a: 0.001, d: 0.1, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 3000, q: 0.6 } }]
  },
  chain: { chorus: { rate: 0.5, depth: 0.003, mix: 0.2 } },

  // 5 -- 1994 PlayStation: the SPU's 24 voices of compressed samples, and
  // its hardware reverb. Item 1243: Ridge Racer's rave and wipEout's club
  // sound, built the way a 1994 techno record builds.
  //   intro  (0)    the pad, the squelchy stabs, the rolling bass, a soft
  //                 four-on-the-floor and the melody on the smooth lead
  //   build  (0.3)  the Reese bass, the 909 hats open, the clap, a snare
  //                 roll doubling into every section, the orchestra hit on B
  //   climax (0.7)  the jungle break at double time over the four-on-the-
  //                 floor, orchestra hits into each section, the lead doubled
  //                 an octave up as a gated rave riff, a ride of 16th hats
  name: 'PlayStation',
  about: 'Rave and techno, Ridge Racer and wipEout: lush seventh-chord pads, squelchy off-beat stabs and a rolling bass over a four-on-the-floor; as the rally builds a Reese bass growls in, the 909 hats open, a snare roll doubles into every section and the 90s orchestra hit slams the B section; at the top a jungle break races at double time and the lead doubles an octave up, the whole mix breathing through a slow resonant filter sweep.',
  trait: 'CD-era sequenced samples: a slightly grainy compressed edge, real chords for the first time, resonant filter sweeps, the orchestra-hit sample every 1994 record used, and the SPU\'s built-in reverb.',
  parts: [
    // ---------------------------------------------------------- the intro
    { play: 'melody', rule: 'full',
      voice: { wave: 'triangle', gain: 0.085, unison: [6],
               env: { a: 0.012, d: 0.3, s: 0.65, r: 0.25 }, legato: 0.9,
               filter: { type: 'lowpass', freq: 3200, q: 0.9 },
               vibrato: { rate: 5, cents: 10, delay: 0.25 } } },
    { play: 'chords', rule: 'pad', voicing: 'seventh',
      voice: { wave: 'sawtooth', gain: 0.03, unison: [-10, 10], spread: 0.6,
               env: { a: 0.6, d: 0.5, s: 0.85, r: 0.8 }, legato: 0.98,
               filter: { type: 'lowpass', freq: 1700, q: 0.8 } } },
    { play: 'chords', rule: 'rhythm', pattern: '. . x . . . x . . . x . . . x .',
      voice: { wave: 'sawtooth', gain: 0.03, env: { a: 0.001, d: 0.16, s: 0, r: 0.04 },
               filter: { type: 'lowpass', freq: 3400, q: 9, sweep: { to: 380, time: 0.13 } } } },
    { play: 'bass', rule: 'octaves',
      voice: { wave: 'sawtooth', gain: 0.11, env: { a: 0.002, d: 0.1, s: 0.45, r: 0.03 }, legato: 0.8,
               filter: { type: 'lowpass', freq: 900, q: 7, sweep: { to: 200, time: 0.11 } } } },
    { play: 'drum', pattern: 'X . . . x . . . X . . . x . . .',
      voice: { wave: 'kick', freq: 115, gain: 0.3, env: { a: 0.001, d: 0.2, s: 0, r: 0.02 } } },
    { play: 'drum', hit: 'hat', pattern: '. . x . . . x . . . x . . . x .' },
    // ---------------------------------------------------------- the build
    // The Reese: two saws a few cents apart under a low-pass, the growl of
    // every 1994 jungle record, an octave under the bass line.
    { play: 'bass', rule: 'held', octave: -1, from: 0.3,
      voice: { wave: 'sawtooth', gain: 0.08, unison: [-16, 16], spread: 0.4,
               env: { a: 0.01, d: 0.2, s: 0.85, r: 0.08 }, legato: 0.96,
               filter: { type: 'lowpass', freq: 520, q: 2 } } },
    { play: 'drum', hit: 'open', from: 0.3, pattern: '. . X . . . X . . . X . . . X .' },
    { play: 'drum', hit: 'clap', from: 0.3, pattern: '. . . . X . . . . . . . X . . .' },
    // The techno build: a snare roll doubling from quarters to eighths to
    // sixteenths over the last bar of every section.
    { play: 'drum', hit: 'snare', from: 0.3,
      pattern: '. . . . . . . . . . . . . . . .', fill: 'x . . . x . . . x . x . x x X X' },
    { play: 'drum', hit: 'hit', from: 0.3, sections: ['B'],
      pattern: '. . . . . . . . . . . . . . . .', open: 'X . . . . . . . . . . . . . . .' },
    // --------------------------------------------------------- the climax
    // The jungle break: an Amen-shaped snare and kick at double time.
    { play: 'drum', hit: 'snare', from: 0.7, pattern: '. . . . X . . x . x X . . x X .' },
    { play: 'drum', hit: 'kick', from: 0.7, pattern: 'X . X . . . . . . . X X . . . .' },
    { play: 'drum', hit: 'hat', from: 0.7, pattern: 'x x . x x x . x x x . x x x . x' },
    { play: 'drum', hit: 'hit', from: 0.7,
      pattern: '. . . . . . . . . . . . . . . .', fill: 'X . . X . . X . . . . . . . . .' },
    // The lead doubled an octave up, gated into sixteenths: the rave riff.
    { play: 'melody', rule: 'arp', speed: 1, shape: [12, 12, 0, 12], octave: 0, from: 0.7,
      voice: { wave: 'pulse25', gain: 0.035, env: { a: 0.001, d: 0.06, s: 0.3, r: 0.03 }, legato: 0.6,
               filter: { type: 'lowpass', freq: 4200, q: 3, sweep: { to: 1400, time: 0.08 } } } }
  ],
  effects: { crush: 8, sweep: { freq: 2600, depth: 2100, bars: 4, q: 5 },
             echo: { time: 0.34, feedback: 0.32, mix: 0.22 },
             reverb: { seconds: 2.2, decay: 3, mix: 0.3 } }
});
