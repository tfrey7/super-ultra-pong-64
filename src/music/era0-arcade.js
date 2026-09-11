/*
 * Super Ultra Pong 64: Remastered -- era 0's music: 1972 arcade (1972).
 *
 * ONE ERA, ONE FILE (item 1241): an arrangement card edits only this file,
 * the way an era's look lives in src/eras/. docs/MUSIC.md section "Era 0"
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
  era: 0,
  year: 1972,
  voices: 1,
  kit: null,
  chain: { tone: 5000 },

  // 0 -- 1972 arcade: no sound chip, no music. The theme is only hinted.
  name: '1972 arcade',
  about: 'The melody\'s bones tapped as lonely square beeps, two a bar, over the cabinet\'s 60-cycle hum and a flickering fluorescent buzz.',
  trait: 'No sound chip at all: one beeper and the mains hum is all the board had.',
  parts: [
    { play: 'melody', rule: 'bones',
      voice: { wave: 'square', gain: 0.075, env: { a: 0.001, d: 0.07, s: 0, r: 0.01 } } }
  ],
  drone: [
    { wave: 'sine', freq: 60, gain: 0.07 },
    { wave: 'sine', freq: 120, gain: 0.035 },
    { wave: 'sawtooth', freq: 120, gain: 0.02,
      filter: { type: 'bandpass', freq: 3100, q: 6 }, wobble: { rate: 7.3, depth: 0.5 } }
  ]
});
