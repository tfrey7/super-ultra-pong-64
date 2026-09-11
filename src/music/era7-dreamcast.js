/*
 * Super Ultra Pong 64: Remastered -- era 7's music: Dreamcast (1999).
 *
 * ONE ERA, ONE FILE (item 1241): an arrangement card edits only this file,
 * the way an era's look lives in src/eras/. docs/MUSIC.md section "Era 7"
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
  era: 7,
  year: 1999,
  voices: 64,
  kit: {
    kick: { wave: 'kick', freq: 140, gain: 0.38, env: { a: 0.001, d: 0.15, s: 0, r: 0.03 } },
    snare: { wave: 'noise', gain: 0.13, env: { a: 0.001, d: 0.12, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 2100, q: 0.7 } },
    hat: { wave: 'noise', gain: 0.03, env: { a: 0.001, d: 0.2, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 6500, q: 0.7 }, pan: -0.35 },
    clap: { wave: 'noise', gain: 0.1, bursts: 3, env: { a: 0.001, d: 0.13, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 1400, q: 1 } },
    open: { wave: 'noise', gain: 0.04, env: { a: 0.001, d: 0.3, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 7000, q: 0.7 }, pan: -0.35 },
    tom: { wave: 'sine', freq: 150, gain: 0.24, env: { a: 0.001, d: 0.22, s: 0, r: 0.03 }, drop: { ratio: 0.5, time: 0.18 } },
    crash: { wave: 'noise', gain: 0.06, env: { a: 0.001, d: 1.1, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 5000, q: 0.5 }, pan: 0.4 }
  },
  chain: { chorus: { rate: 0.6, depth: 0.003, mix: 0.2 } },

  // 7 -- 1998 Dreamcast: the AICA's 64 voices at full CD quality, and a
  // proper effects DSP.
  name: 'Dreamcast',
  about: 'Bright and upbeat: jazzy ninth chords comped on an electric piano, a funky bass popping octaves, the melody on a crisp synth lead, a vibraphone climbing the chords in the B section, over a swung breakbeat with ghost-note snares, a sizzling ride and a crash at each section.',
  trait: 'Crisp, full-band sound for the first time: clean bright chords with real extensions, a breakbeat with real cymbals, and no filter muffling the top end.',
  swing: 0.12,
  parts: [
    { play: 'melody', rule: 'full',
      voice: { wave: 'sawtooth', gain: 0.06, unison: [5], env: { a: 0.004, d: 0.2, s: 0.7, r: 0.1 }, legato: 0.85,
               filter: { type: 'lowpass', freq: 5200, q: 0.8 },
               vibrato: { rate: 6, cents: 14, delay: 0.15 } } },
    { play: 'chords', rule: 'rhythm', voicing: 'ninth', pattern: 'x - . . . . x - . . x . . . . .',
      fill: 'x - . . . . x - . . x . x . x .',
      voice: { wave: 'sine', gain: 0.07, fm: { ratio: 1, index: 1.3 },
               env: { a: 0.002, d: 0.45, s: 0.3, r: 0.18 }, legato: 0.9 } },
    { play: 'chords', rule: 'broken', voicing: 'seventh', octave: 1, sections: ['B'],
      voice: { wave: 'sine', gain: 0.045, pan: 0.35, fm: { ratio: 3.5, index: 0.8 },
               env: { a: 0.002, d: 0.35, s: 0, r: 0.1 } } },
    { play: 'bass', rule: 'octaves',
      voice: { wave: 'sine', gain: 0.18, fm: { ratio: 1, index: 2 },
               env: { a: 0.002, d: 0.14, s: 0.35, r: 0.03 }, legato: 0.75 } },
    { play: 'drum', pattern: 'X . x . . . . . . . x x . . . .', fill: 'X . x . . . . . . . x . x . x .',
      voice: { wave: 'kick', freq: 140, gain: 0.38, env: { a: 0.001, d: 0.15, s: 0, r: 0.02 } } },
    { play: 'drum', pattern: '. . . . X . . x . x . . X . . x', fill: '. . . . X . . x . x . . X x X X',
      voice: { wave: 'noise', gain: 0.13, env: { a: 0.001, d: 0.12, s: 0, r: 0.03 },
               filter: { type: 'bandpass', freq: 2100, q: 0.7 } } },
    { play: 'drum', pattern: 'X . x x X . x x X . x x X . x x',
      voice: { wave: 'noise', gain: 0.03, pan: -0.35, env: { a: 0.001, d: 0.2, s: 0, r: 0.04 },
               filter: { type: 'highpass', freq: 6500, q: 0.6 } } },
    { play: 'drum', pattern: '. . . . . . . . . . . . . . . .', open: 'X . . . . . . . . . . . . . . .',
      voice: { wave: 'noise', gain: 0.06, pan: 0.4, env: { a: 0.001, d: 1.1, s: 0, r: 0.1 },
               filter: { type: 'highpass', freq: 5000, q: 0.5 } } }
  ],
  effects: { reverb: { seconds: 1.2, decay: 4, mix: 0.16 } }
});
