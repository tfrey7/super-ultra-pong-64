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

  // 9 -- 2001 Xbox: a PC sound chip in a box, streaming real recordings.
  // Item 1243: Halo -- the monk chant, the string ostinato, the war drums,
  // and the turn from chant to rock guitar.
  //   intro  (0)    the monk choir alone: the tune sung on "ah" (a saw
  //                 through two formant band-passes) over a low "oo" chord
  //   build  (0.3)  the string ostinato in sixteenths, war drums (taiko) on
  //                 the beat and rolling into each section, a bass pulse
  //   climax (0.7)  the rock turn: drop-tuned power chords double-tracked
  //                 hard left and right, an overdriven lead guitar on the
  //                 tune, the full rock kit, and the choir an octave up
  name: 'Xbox',
  about: 'Halo: a monk choir alone on the tune, singing "ah" over a low "oo" chord in a cathedral; as the rally builds the strings drive a sixteenth-note ostinato and war drums pound the beat; at the top it turns to rock the way Halo does, drop-tuned power chords double-tracked hard left and right, an overdriven lead guitar on the tune, a heavy kick and cracking snare, and the choir climbing an octave over it all.',
  trait: 'A PC sound chip in a box streaming real recordings: a sung choir made from formant filters, strings, taiko and a guitar amp in software, wide and saturated.',
  parts: [
    // ---------------------------------------------------------- the intro
    // The monk choir on "ah": one saw per note through the first formant
    // (about 750 Hz) here and the second (about 1150 Hz) on the echo below.
    { play: 'melody', rule: 'full',
      voice: { wave: 'sawtooth', gain: 0.11, unison: [-6, 6],
               env: { a: 0.14, d: 0.3, s: 0.9, r: 0.35 }, legato: 0.97,
               filter: { type: 'bandpass', freq: 750, q: 3 },
               vibrato: { rate: 5, cents: 10, delay: 0.2 } } },
    { play: 'echo', of: 'melody', delay: 8 * 16,
      voice: { wave: 'sawtooth', gain: 0.06, unison: [4],
               env: { a: 0.14, d: 0.3, s: 0.9, r: 0.35 }, legato: 0.97,
               filter: { type: 'bandpass', freq: 1150, q: 4 },
               vibrato: { rate: 5.3, cents: 10, delay: 0.2 } } },
    // The low monks on "oo": the chord an octave down through a low formant.
    { play: 'chords', rule: 'pad', octave: -1,
      voice: { wave: 'sawtooth', gain: 0.07, unison: [-8, 8], spread: 0.5,
               env: { a: 0.6, d: 0.4, s: 0.9, r: 0.9 }, legato: 0.99,
               filter: { type: 'bandpass', freq: 420, q: 2.5 } } },
    // ---------------------------------------------------------- the build
    // The string ostinato: the chord's notes cycled in sixteenths.
    { play: 'chords', rule: 'arp', speed: 1, from: 0.3,
      voice: { wave: 'sawtooth', gain: 0.035, unison: [7], spread: 0.4,
               env: { a: 0.004, d: 0.09, s: 0.4, r: 0.05 }, legato: 0.8,
               filter: { type: 'lowpass', freq: 2200, q: 1 } } },
    { play: 'drum', hit: 'taiko', from: 0.3,
      pattern: 'X . . . X . . . X . . . X . x .', fill: 'X . . X . . X . X . X . X X X X' },
    { play: 'bass', rule: 'eighths', octave: -1, from: 0.3,
      voice: { wave: 'sawtooth', gain: 0.11, drive: 0.25, env: { a: 0.002, d: 0.1, s: 0.6, r: 0.03 }, legato: 0.85,
               filter: { type: 'lowpass', freq: 520, q: 1 } } },
    // --------------------------------------------------------- the climax
    // The riff double-tracked: two takes, one hard left and one hard right,
    // a few cents apart, so the chugs fill the sides and leave the middle
    // to the kick, the bass and the lead.
    { play: 'chords', rule: 'rhythm', voicing: 'power', octave: -1, from: 0.7,
      pattern: 'X - x x X - x x X - x x X x X x', fill: 'X - x x X - x x X - X - X - X -',
      voice: { wave: 'sawtooth', gain: 0.1, unison: [-7], pan: -1, drive: 0.85,
               env: { a: 0.002, d: 0.08, s: 0.55, r: 0.03 }, legato: 0.8,
               filter: { type: 'lowpass', freq: 3000, q: 0.9 } } },
    { play: 'chords', rule: 'rhythm', voicing: 'power', octave: -1, from: 0.7,
      pattern: 'X - x x X - x x X - x x X x X x', fill: 'X - x x X - x x X - X - X - X -',
      voice: { wave: 'sawtooth', gain: 0.1, unison: [8], pan: 1, drive: 0.85,
               env: { a: 0.003, d: 0.08, s: 0.55, r: 0.03 }, legato: 0.78,
               filter: { type: 'lowpass', freq: 2800, q: 0.9 } } },
    // The lead guitar on the tune: the melody a whole loop late, which is
    // the same step (the one tune, doubled), through a hard drive.
    { play: 'echo', of: 'melody', delay: 8 * 16, from: 0.7,
      voice: { wave: 'sawtooth', gain: 0.05, drive: 0.6, env: { a: 0.004, d: 0.2, s: 0.8, r: 0.1 }, legato: 0.92,
               filter: { type: 'lowpass', freq: 3600, q: 1 },
               vibrato: { rate: 6.2, cents: 28, delay: 0.14 } } },
    // The choir an octave up.
    { play: 'echo', of: 'melody', delay: 8 * 16, octave: 1, from: 0.7,
      voice: { wave: 'sawtooth', gain: 0.06, unison: [-5, 5],
               env: { a: 0.12, d: 0.3, s: 0.9, r: 0.35 }, legato: 0.97,
               filter: { type: 'bandpass', freq: 1100, q: 3 },
               vibrato: { rate: 5, cents: 10, delay: 0.2 } } },
    { play: 'drum', hit: 'kick', from: 0.7, pattern: 'X . . . . . x . X . x . . . . .', fill: 'X . . . . . x . X x X x X x X x' },
    { play: 'drum', hit: 'snare', from: 0.7, pattern: '. . . . X . . . . . . . X . . .', fill: '. . . . X . . . . . X . X X X X' },
    { play: 'drum', hit: 'hat', from: 0.7, pattern: 'x . x . x . x . x . x . x . x .' }
  ],
  effects: { reverb: { seconds: 2.8, decay: 2.5, mix: 0.3 } }
});
