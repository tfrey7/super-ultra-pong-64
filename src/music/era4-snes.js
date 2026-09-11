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
    // tuned to the key's A, settling a touch flat as it rings
    timpani: { wave: 'sine', freq: 110, gain: 0.3, env: { a: 0.001, d: 1.1, s: 0, r: 0.03 }, drop: { ratio: 0.96, time: 0.3 } }
  },
  chain: { tone: 7000 },

  // 4 -- 1991 Super Nintendo: eight sampled channels and the echo.
  // Item 1242: the Uematsu orchestra. Eight sampled channels, each part one
  // sample (a pad is one chord sample, as the SPC drivers did it); the loop
  // never uses more than eight, and at every bar's downbeat it leaves one
  // free for the engine's match-point cymbal:
  //   intro   the tune on a flute, strings holding the chords, pizzicato bass
  //   build   the horns take the tune an octave under the flute, a harp
  //           climbs the chords, and the timpani lands on every downbeat
  //   climax  the choir's "aah" swells under everything, and a timpani roll
  //           and a military snare roll throw each section to the next
  name: 'Super Nintendo',
  about: 'The sampled orchestra in the echo: the tune on a breathy flute over held strings and a pizzicato bass; then the horns take the tune an octave under, a harp climbs the chords and the timpani lands on every downbeat; and at the climax a choir swells in and timpani and snare rolls hurl each section into the next.',
  trait: 'Sampled orchestral instruments, eight channels, a soft low-pass on the output and the built-in echo everyone remembers.',
  parts: [
    // the flute: a soft triangle with a breathy vibrato
    { play: 'melody', rule: 'full',
      voice: { wave: 'triangle', gain: 0.085, unison: [4],
               env: { a: 0.04, d: 0.2, s: 0.8, r: 0.18 }, legato: 0.92,
               filter: { type: 'lowpass', freq: 2600, q: 0.8 },
               vibrato: { rate: 5.2, cents: 16, delay: 0.18 } } },
    // the strings, holding the chord
    { play: 'chords', rule: 'pad',
      voice: { wave: 'sawtooth', gain: 0.03, unison: [-9, 8],
               env: { a: 0.3, d: 0.4, s: 0.8, r: 0.5 }, legato: 0.98,
               filter: { type: 'lowpass', freq: 1400, q: 0.8 } } },
    { play: 'bass', rule: 'pizz',
      voice: { wave: 'triangle', gain: 0.24, env: { a: 0.004, d: 0.22, s: 0.2, r: 0.06 }, legato: 0.8,
               filter: { type: 'lowpass', freq: 700, q: 0.7 } } },
    // build: the horns on the tune an octave under the flute, the brass opening as it speaks
    { play: 'melody', rule: 'full', octave: -1, from: 0.3,
      voice: { wave: 'sawtooth', gain: 0.07, unison: [7],
               env: { a: 0.035, d: 0.25, s: 0.75, r: 0.2 }, legato: 0.92,
               filter: { type: 'lowpass', freq: 900, q: 1.6, sweep: { to: 1800, time: 0.09 } },
               vibrato: { rate: 5, cents: 18, delay: 0.25 } } },
    // build: the harp climbing the chord in eighths
    { play: 'chords', rule: 'broken', octave: 1, from: 0.3,
      voice: { wave: 'sine', gain: 0.06, env: { a: 0.002, d: 0.3, s: 0, r: 0.05 },
               fm: { ratio: 2, index: 0.8 } } },
    // build: the timpani on every downbeat
    { play: 'drum', hit: 'timpani', from: 0.3,
      pattern: 'X . . . . . . . . . . . . . . .' },
    // climax: the choir, a sawtooth through the "ah" formant, swelling slowly
    { play: 'chords', rule: 'pad', from: 0.7,
      voice: { wave: 'sawtooth', gain: 0.05, unison: [-7, 7],
               env: { a: 0.6, d: 0.3, s: 0.9, r: 0.6 }, legato: 0.98,
               filter: { type: 'bandpass', freq: 800, q: 2.5 },
               vibrato: { rate: 4.5, cents: 12, delay: 0.4 } } },
    // climax: a timpani roll and a military snare roll into each section
    { play: 'drum', hit: 'timpani', from: 0.7,
      pattern: '. . . . . . . . . . . . . . . .', fill: '. . . . . . . . x x x x x x x X' },
    { play: 'drum', hit: 'snare', from: 0.7,
      pattern: '. . . . . . . . . . . . . . . .', fill: '. . . . . . . . x x x x x x X X' }
  ],
  effects: { lowpass: 5200, echo: { time: 0.23, feedback: 0.38, mix: 0.35 } }
});
