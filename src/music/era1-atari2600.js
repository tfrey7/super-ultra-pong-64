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
  // Item 1242: disco under a Star Wars fanfare, on two voices. Channel one is
  // the tune from start to finish; channel two is the bass AND the whole kit,
  // so every drum steals the bass note it lands on (for good: the steal is
  // part of the loop, heard as the disco "oom-pah" where the kick is the oom),
  // and every later layer sits on a sixteenth the bass never uses:
  //   intro   the tune, the octave bass and the kick on beats one and three
  //   build   the snare hiss on two and four (four on the floor), and a
  //           brass-style triplet pickup on E, a fourth under the A it lands
  //           on, into each section
  //   climax  sixteenth hats on every off-sixteenth and a snare roll into
  //           each section
  // The engine's tom and crash never find a free channel here: the TIA had two.
  name: 'Atari 2600',
  about: 'Disco on two buzzy squares: the tune sour and wobbly on one channel, the other a thumping octave bass that gives way to a four-on-the-floor kick and snare hiss, a triplet fanfare pickup into each section, and at the climax sizzling sixteenth hats and a snare roll.',
  trait: 'Two channels and coarse pitch dividers: every note lands off true, and every drum has to steal the bass voice to sound.',
  detune: [0, 31, -18, 12, -27, 8, 40, -9, 22, -35, 15, -22],
  parts: [
    { play: 'melody', rule: 'full',
      voice: { wave: 'square', gain: 0.09, env: { a: 0.002, d: 0.05, s: 0.75, r: 0.02 }, legato: 0.8 } },
    // the I Feel Love octave bass, in eighths
    { play: 'bass', rule: 'octaves',
      voice: { wave: 'square', gain: 0.08, env: { a: 0.002, d: 0.06, s: 0.5, r: 0.01 }, legato: 0.7 } },
    // intro: the kick on one and three
    { play: 'drum', hit: 'kick', steals: 'bass',
      pattern: 'X . . . . . . . x . . . . . . .' },
    // build: the snare hiss on two and four, so the thump is on every beat
    { play: 'drum', hit: 'snare', steals: 'bass', from: 0.3,
      pattern: '. . . . x . . . . . . . X . . .' },
    // build: the fanfare's triplet pickup into each section, on the E a fourth under the A
    { play: 'drum', steals: 'bass', from: 0.3,
      pattern: '. . . . . . . . . . . . . . . .', fill: '. . . . . . . . . . . . . x x X',
      voice: { wave: 'square', freq: 329.6, gain: 0.08, env: { a: 0.002, d: 0.08, s: 0, r: 0.01 } } },
    // climax: the hats sizzle on every off-sixteenth
    { play: 'drum', hit: 'hat', from: 0.7,
      pattern: '. x . x . x . x . x . x . x . x', fill: '. x . x . x . x . . . . . . . .' },
    // climax: a snare roll into each section, ahead of the pickup
    { play: 'drum', hit: 'snare', from: 0.7,
      pattern: '. . . . . . . . . . . . . . . .', fill: '. . . . . . . . . x . x . . . .' }
  ]
});
