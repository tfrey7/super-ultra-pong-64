/*
 * Super Ultra Pong 64: Remastered -- era 4's music: Super Nintendo (1991).
 *
 * ONE ERA, ONE FILE (item 1241): an arrangement card edits only this file,
 * the way an era's look lives in src/eras/. docs/MUSIC.md section "Era 4"
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
  era: 4,
  year: 1991,
  voices: 8,
  kit: {
    kick: { wave: 'kick', freq: 110, gain: 0.28, env: { a: 0.001, d: 0.22, s: 0, r: 0.03 } },
    snare: { wave: 'noise', gain: 0.08, env: { a: 0.001, d: 0.14, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 1700, q: 0.7 } },
    hat: { wave: 'noise', gain: 0.03, env: { a: 0.001, d: 0.04, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 6500, q: 0.7 } },
    crash: { wave: 'noise', gain: 0.06, env: { a: 0.001, d: 1.4, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 3500, q: 0.5 } },
    tom: { wave: 'sine', freq: 130, gain: 0.2, env: { a: 0.001, d: 0.25, s: 0, r: 0.03 }, drop: { ratio: 0.7, time: 0.2 } },
    timpani: { wave: 'sine', freq: 73, gain: 0.3, env: { a: 0.001, d: 1.1, s: 0, r: 0.03 }, drop: { ratio: 0.92, time: 0.3 } }
  },
  chain: { tone: 7000 },

  // 4 -- 1991 Super Nintendo: eight sampled channels and the echo.
  name: 'Super Nintendo',
  about: 'The warm orchestral version: the melody on a soft brass, strings holding the chords, a plucked bass, and for the B section a marimba climbing the chords and a choir swelling in, all rounded off and ringing in the echo.',
  trait: 'Sampled orchestral instruments, a soft low-pass on the output and the built-in echo everyone remembers.',
  parts: [
    { play: 'melody', rule: 'full',
      voice: { wave: 'sawtooth', gain: 0.07, unison: [7],
               env: { a: 0.035, d: 0.25, s: 0.75, r: 0.2 }, legato: 0.92,
               filter: { type: 'lowpass', freq: 1700, q: 1.6 },
               vibrato: { rate: 5, cents: 20, delay: 0.2 } } },
    { play: 'chords', rule: 'pad',
      voice: { wave: 'sawtooth', gain: 0.03, unison: [-9, 8],
               env: { a: 0.3, d: 0.4, s: 0.8, r: 0.5 }, legato: 0.98,
               filter: { type: 'lowpass', freq: 1400, q: 0.8 } } },
    { play: 'chords', rule: 'pad', octave: 1, sections: ['B'],
      voice: { wave: 'triangle', gain: 0.05, unison: [-6, 6],
               env: { a: 0.45, d: 0.3, s: 0.85, r: 0.6 }, legato: 0.98,
               filter: { type: 'lowpass', freq: 1900, q: 0.7 },
               vibrato: { rate: 4.2, cents: 10, delay: 0.3 } } },
    { play: 'chords', rule: 'broken', octave: 1, sections: ['B'],
      voice: { wave: 'sine', gain: 0.07, env: { a: 0.002, d: 0.18, s: 0, r: 0.05 },
               fm: { ratio: 4, index: 1.2 } } },
    { play: 'bass', rule: 'pizz',
      voice: { wave: 'triangle', gain: 0.24, env: { a: 0.004, d: 0.22, s: 0.2, r: 0.06 }, legato: 0.8,
               filter: { type: 'lowpass', freq: 700, q: 0.7 } } },
    { play: 'drum', pattern: 'X . . . . . . . x . x . . . . .',
      voice: { wave: 'kick', freq: 120, gain: 0.28, env: { a: 0.002, d: 0.22, s: 0, r: 0.03 } } },
    { play: 'drum', pattern: '. . . . x . . . . . . . x . . .', fill: '. . . . x . . . . . . . x . x x',
      voice: { wave: 'noise', gain: 0.07, env: { a: 0.002, d: 0.16, s: 0, r: 0.05 },
               filter: { type: 'bandpass', freq: 1600, q: 0.7 } } }
  ],
  effects: { lowpass: 5200, echo: { time: 0.23, feedback: 0.38, mix: 0.35 } }
});
