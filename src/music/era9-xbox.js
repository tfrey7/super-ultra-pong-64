/*
 * Super Ultra Pong 64: Remastered -- era 9's music: Xbox (2001).
 *
 * ONE ERA, ONE FILE (item 1241): an arrangement card edits only this file,
 * the way an era's look lives in src/eras/. docs/MUSIC.md section "Era 9"
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
  era: 9,
  year: 2001,
  voices: 64,
  kit: {
    kick: { wave: 'kick', freq: 125, gain: 0.45, env: { a: 0.001, d: 0.14, s: 0, r: 0.03 } },
    snare: { wave: 'noise', gain: 0.2, env: { a: 0.001, d: 0.15, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 1900, q: 0.8 } },
    hat: { wave: 'noise', gain: 0.04, env: { a: 0.001, d: 0.05, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 8000, q: 0.7 }, pan: 0.45 },
    crash: { wave: 'noise', gain: 0.07, env: { a: 0.001, d: 1.0, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 4500, q: 0.5 }, pan: -0.45 },
    tom: { wave: 'sine', freq: 115, gain: 0.28, env: { a: 0.001, d: 0.3, s: 0, r: 0.03 }, drop: { ratio: 0.55, time: 0.2 } },
    taiko: [{ wave: 'sine', freq: 58, gain: 0.42, env: { a: 0.001, d: 0.8, s: 0, r: 0.03 }, drop: { ratio: 0.5, time: 0.3 } }, { wave: 'noise', gain: 0.09, env: { a: 0.001, d: 0.09, s: 0, r: 0.02 }, filter: { type: 'lowpass', freq: 380, q: 0.8 } }]
  },
  chain: { tape: { wow: 0.05, flutter: 0.05, sat: 0.25 } },

  // 9 -- 2001 Xbox: a PC sound chip in a box, streaming real recordings;
  // the soundtrack goes guitar.
  name: 'Xbox',
  about: 'Drop-tuned rock: low palm-muted power-chord chugs double-tracked hard left and right, the melody screamed out on an overdriven lead guitar, a growling bass an octave down, a heavy kick and a cracking snare that rolls into each new section, with a crash to open it.',
  trait: 'A guitar amp in software: a saw through a heavy drive, power chords tuned down low, a heavy kick and snare and wide stereo.',
  parts: [
    { play: 'melody', rule: 'full',
      voice: { wave: 'sawtooth', gain: 0.055, drive: 0.6, env: { a: 0.004, d: 0.2, s: 0.8, r: 0.1 }, legato: 0.92,
               filter: { type: 'lowpass', freq: 3600, q: 1 },
               vibrato: { rate: 6.2, cents: 28, delay: 0.14 } } },
    // The riff double-tracked: two takes, one hard left and one hard right,
    // a few cents apart, so the chugs fill the sides and leave the middle
    // to the kick, the bass and the lead.
    { play: 'chords', rule: 'rhythm', voicing: 'power', octave: -1,
      pattern: 'X - x x X - x x X - x x X x X x', fill: 'X - x x X - x x X - X - X - X -',
      voice: { wave: 'sawtooth', gain: 0.11, unison: [-7], pan: -1, drive: 0.85,
               env: { a: 0.002, d: 0.08, s: 0.55, r: 0.03 }, legato: 0.8,
               filter: { type: 'lowpass', freq: 3000, q: 0.9 } } },
    { play: 'chords', rule: 'rhythm', voicing: 'power', octave: -1,
      pattern: 'X - x x X - x x X - x x X x X x', fill: 'X - x x X - x x X - X - X - X -',
      voice: { wave: 'sawtooth', gain: 0.11, unison: [8], pan: 1, drive: 0.85,
               env: { a: 0.003, d: 0.08, s: 0.55, r: 0.03 }, legato: 0.78,
               filter: { type: 'lowpass', freq: 2800, q: 0.9 } } },
    { play: 'bass', rule: 'eighths', octave: -1,
      voice: { wave: 'sawtooth', gain: 0.12, drive: 0.25, env: { a: 0.002, d: 0.1, s: 0.6, r: 0.03 }, legato: 0.85,
               filter: { type: 'lowpass', freq: 520, q: 1 } } },
    { play: 'drum', pattern: 'X . . . . . x . X . x . . . . .', fill: 'X . . . . . x . X x X x X x X x',
      voice: { wave: 'kick', freq: 125, gain: 0.45, env: { a: 0.001, d: 0.14, s: 0, r: 0.02 } } },
    { play: 'drum', pattern: '. . . . X . . . . . . . X . . .', fill: '. . . . X . . . . . X . X X X X',
      voice: { wave: 'noise', gain: 0.2, env: { a: 0.001, d: 0.15, s: 0, r: 0.03 },
               filter: { type: 'bandpass', freq: 1900, q: 0.8 } } },
    { play: 'drum', pattern: 'x . x . x . x . x . x . x . x .',
      voice: { wave: 'noise', gain: 0.04, pan: 0.45, env: { a: 0.001, d: 0.05, s: 0, r: 0.01 },
               filter: { type: 'highpass', freq: 8000, q: 0.7 } } },
    { play: 'drum', pattern: '. . . . . . . . . . . . . . . .', open: 'X . . . . . . . . . . . . . . .',
      voice: { wave: 'noise', gain: 0.07, pan: -0.45, env: { a: 0.001, d: 1.0, s: 0, r: 0.1 },
               filter: { type: 'highpass', freq: 4500, q: 0.5 } } }
  ],
  effects: { reverb: { seconds: 1, decay: 4, mix: 0.12 } }
});
