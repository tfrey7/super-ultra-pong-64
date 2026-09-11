/*
 * Super Ultra Pong 64: Remastered -- era 1's music: Atari 2600 (1977).
 *
 * ONE ERA, ONE FILE (item 1241): an arrangement card edits only this file,
 * the way an era's look lives in src/eras/. docs/MUSIC.md section "Era 1"
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
  era: 1,
  year: 1977,
  voices: 2,
  kit: {
    kick: { wave: 'square', freq: 90, gain: 0.2, env: { a: 0.001, d: 0.09, s: 0, r: 0.03 }, drop: { ratio: 0.3, time: 0.06 } },
    snare: { wave: 'noise', gain: 0.12, env: { a: 0.001, d: 0.09, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 1400, q: 0.8 } },
    hat: { wave: 'noise', gain: 0.05, env: { a: 0.001, d: 0.03, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 6000, q: 0.7 } },
    tom: { wave: 'square', freq: 140, gain: 0.12, env: { a: 0.001, d: 0.12, s: 0, r: 0.03 }, drop: { ratio: 0.5, time: 0.1 } },
    crash: { wave: 'noise', gain: 0.07, env: { a: 0.001, d: 0.6, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 3000, q: 0.5 } }
  },
  chain: { tone: 6000, tape: { wow: 0.4, flutter: 0.2, sat: 0.3 } },

  // 1 -- 1977 Atari 2600: the TIA's two channels.
  name: 'Atari 2600',
  about: 'The whole tune on two buzzy squares, sour and wobbly, with a thumping eighth-note bass that drops out whenever the snare hiss takes its channel.',
  trait: 'Two channels and coarse pitch dividers: every note lands off true, and a drum has to steal the bass voice to sound.',
  detune: [0, 31, -18, 12, -27, 8, 40, -9, 22, -35, 15, -22],
  parts: [
    { play: 'melody', rule: 'full',
      voice: { wave: 'square', gain: 0.09, env: { a: 0.002, d: 0.05, s: 0.75, r: 0.02 }, legato: 0.8 } },
    { play: 'bass', rule: 'eighths',
      voice: { wave: 'square', gain: 0.08, env: { a: 0.002, d: 0.06, s: 0.5, r: 0.01 }, legato: 0.7 } },
    { play: 'drum', pattern: '. . . . x . . . . . . . x . . .', fill: '. . . . x . . . x . x . x x x x',
      steals: 'bass',
      voice: { wave: 'noise', gain: 0.12, env: { a: 0.001, d: 0.09, s: 0, r: 0.01 },
               filter: { type: 'bandpass', freq: 1400, q: 0.8 } } }
  ]
});
