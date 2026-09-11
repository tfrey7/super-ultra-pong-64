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
  // Item 1242: honest near-silence that still builds. One beeper, so every
  // layer sits on a step no other layer uses (the chip never sounds two at
  // once), and each is the board's own blip rather than a tune:
  //   intro   the melody's bones, two taps a bar, over the hum
  //   build   the wall blip answers on beats two and four: a tap every beat
  //   climax  an off-beat tick between them, the pulse doubling to eighths
  //   match   a two-blip pickup into every bar, the cabinet's heart racing
  name: '1972 arcade',
  about: 'The melody\'s bones tapped as lonely square beeps, two a bar, over the cabinet\'s 60-cycle hum and a flickering fluorescent buzz; as the game tightens the board\'s own blips fill the gaps, a tap every beat, then every eighth, then a racing pickup into each bar at match point.',
  trait: 'No sound chip at all: one beeper and the mains hum is all the board had, so the build is the same blip coming faster, never a second note at once.',
  parts: [
    { play: 'melody', rule: 'bones',
      voice: { wave: 'square', gain: 0.075, env: { a: 0.001, d: 0.07, s: 0, r: 0.01 } } },
    // build: the wall blip (an octave under the hit) on beats two and four
    { play: 'drum', from: 0.3, pattern: '. . . . x . . . . . . . x . . .',
      voice: { wave: 'square', freq: 246, gain: 0.05, env: { a: 0.001, d: 0.05, s: 0, r: 0.01 } } },
    // climax: a short high tick on every off-beat eighth
    { play: 'drum', from: 0.7, pattern: '. . x . . . x . . . x . . . x .',
      voice: { wave: 'square', freq: 491, gain: 0.03, env: { a: 0.001, d: 0.025, s: 0, r: 0.01 } } },
    // match point: two quick blips on the last sixteenths, pushing into the next bar
    { play: 'drum', from: 0.9, pattern: '. . . . . . . . . . . . . x . x',
      voice: { wave: 'square', freq: 491, gain: 0.04, env: { a: 0.001, d: 0.03, s: 0, r: 0.01 } } }
  ],
  drone: [
    { wave: 'sine', freq: 60, gain: 0.07 },
    { wave: 'sine', freq: 120, gain: 0.035 },
    { wave: 'sawtooth', freq: 120, gain: 0.02,
      filter: { type: 'bandpass', freq: 3100, q: 6 }, wobble: { rate: 7.3, depth: 0.5 } }
  ]
});
