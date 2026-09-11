/*
 * Super Ultra Pong 64: Remastered -- era 8's music: PlayStation 2 (2000).
 *
 * ONE ERA, ONE FILE (item 1241): an arrangement card edits only this file,
 * the way an era's look lives in src/eras/. docs/MUSIC.md section "Era 8"
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
  era: 8,
  year: 2000,
  voices: 48,
  kit: {
    kick: [{ wave: 'kick', freq: 70, gain: 0.34, env: { a: 0.001, d: 0.35, s: 0, r: 0.03 } }, { wave: 'noise', gain: 0.05, env: { a: 0.001, d: 0.02, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 3000, q: 0.8 } }],
    snare: { wave: 'noise', gain: 0.16, env: { a: 0.001, d: 0.12, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 2000, q: 0.8 } },
    hat: { wave: 'noise', gain: 0.03, env: { a: 0.001, d: 0.04, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 9000, q: 0.7 } },
    crash: { wave: 'noise', gain: 0.06, env: { a: 0.001, d: 1.3, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 4500, q: 0.5 } },
    tom: { wave: 'sine', freq: 110, gain: 0.26, env: { a: 0.001, d: 0.3, s: 0, r: 0.03 }, drop: { ratio: 0.6, time: 0.2 } },
    taiko: [{ wave: 'sine', freq: 62, gain: 0.4, env: { a: 0.001, d: 0.7, s: 0, r: 0.03 }, drop: { ratio: 0.5, time: 0.25 } }, { wave: 'noise', gain: 0.08, env: { a: 0.001, d: 0.08, s: 0, r: 0.02 }, filter: { type: 'lowpass', freq: 400, q: 0.8 } }]
  },
  chain: { tape: { wow: 0.05, flutter: 0.05, sat: 0.15 } },

  // 8 -- 2000 PlayStation 2: streamed film-score audio, wide and dark.
  name: 'PlayStation 2',
  about: 'Cinematic: slow, wide strings singing the melody over a dark string bed, a low A drone that never lets go, a deep eighth-note pulse under it and a heartbeat of distant drums that swell into taiko hits at the end of each section.',
  trait: 'Film-score texture: slow strings spread wide across the stereo field, a low drone and a deep pulse, dark and rolled off, in a long hall.',
  parts: [
    { play: 'melody', rule: 'full',
      voice: { wave: 'sawtooth', gain: 0.06, unison: [-8, 7], spread: 0.7,
               env: { a: 0.22, d: 0.3, s: 0.9, r: 0.5 }, legato: 0.98,
               filter: { type: 'lowpass', freq: 1500, q: 0.8 },
               vibrato: { rate: 4.6, cents: 12, delay: 0.3 } } },
    { play: 'chords', rule: 'pad', octave: -1,
      voice: { wave: 'sawtooth', gain: 0.03, unison: [-14, 13], spread: 1,
               env: { a: 0.9, d: 0.4, s: 0.9, r: 1.2 }, legato: 0.99,
               filter: { type: 'lowpass', freq: 900, q: 0.7 } } },
    { play: 'bass', rule: 'eighths', octave: -1,
      voice: { wave: 'triangle', gain: 0.22, env: { a: 0.004, d: 0.14, s: 0.25, r: 0.05 }, legato: 0.7,
               filter: { type: 'lowpass', freq: 320, q: 0.9 } } },
    { play: 'drum', pattern: 'X . . x . . . . X . . x . . . .', fill: 'X . . x . . . . X . . . X . X X',
      voice: { wave: 'kick', freq: 70, gain: 0.34, env: { a: 0.002, d: 0.35, s: 0, r: 0.05 } } }
  ],
  drone: [
    { wave: 'sawtooth', freq: 55, gain: 0.045, filter: { type: 'lowpass', freq: 240, q: 1 },
      wobble: { rate: 0.13, depth: 0.4 } },
    { wave: 'sine', freq: 110, gain: 0.025 }
  ],
  effects: { lowpass: 4200, reverb: { seconds: 4, decay: 2, mix: 0.45 } }
});
