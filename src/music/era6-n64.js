/*
 * Super Ultra Pong 64: Remastered -- era 6's music: Nintendo 64 (1996).
 *
 * ONE ERA, ONE FILE (item 1241): an arrangement card edits only this file,
 * the way an era's look lives in src/eras/. docs/MUSIC.md section "Era 6"
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
  era: 6,
  year: 1996,
  voices: 24,
  kit: {
    kick: { wave: 'kick', freq: 95, gain: 0.3, env: { a: 0.001, d: 0.35, s: 0, r: 0.03 } },
    snare: { wave: 'noise', gain: 0.1, env: { a: 0.001, d: 0.13, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 1900, q: 0.9 } },
    hat: { wave: 'noise', gain: 0.035, env: { a: 0.001, d: 0.05, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 6000, q: 0.7 } },
    crash: { wave: 'noise', gain: 0.06, env: { a: 0.001, d: 1.2, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 4500, q: 0.6 } },
    tom: { wave: 'sine', freq: 120, gain: 0.22, env: { a: 0.001, d: 0.3, s: 0, r: 0.03 }, drop: { ratio: 0.6, time: 0.25 } },
    timpani: { wave: 'sine', freq: 65, gain: 0.3, env: { a: 0.001, d: 1.2, s: 0, r: 0.03 }, drop: { ratio: 0.92, time: 0.3 } }
  },
  chain: { tone: 9500 },

  // 6 -- 1996 Nintendo 64: samples squeezed onto a cartridge, played by the
  // RSP, so everything sounds muffled and bathed in reverb.
  name: 'Nintendo 64',
  about: 'Synth-orchestral: a fat, slowly vibrating string pad, brassy stabs punching the chords, the melody on a breathy flute in the A section and a proud horn in the B, bowed basses, timpani and a crash at each section, all a little muffled and swimming in a big hall reverb.',
  trait: 'Cartridge-squeezed samples: the whole mix rolled off above about 9 kHz, orchestral pads and brass, and a big reverb over everything.',
  parts: [
    { play: 'melody', rule: 'full', sections: ['A'],
      voice: { wave: 'triangle', gain: 0.085, env: { a: 0.04, d: 0.25, s: 0.75, r: 0.2 }, legato: 0.92,
               filter: { type: 'lowpass', freq: 2600, q: 0.7 },
               vibrato: { rate: 5.2, cents: 16, delay: 0.18 } } },
    { play: 'melody', rule: 'full', sections: ['B'],
      voice: { wave: 'sawtooth', gain: 0.065, unison: [6], env: { a: 0.05, d: 0.25, s: 0.8, r: 0.2 }, legato: 0.92,
               filter: { type: 'lowpass', freq: 1500, q: 1.2 },
               vibrato: { rate: 5, cents: 14, delay: 0.25 } } },
    { play: 'chords', rule: 'pad',
      voice: { wave: 'sawtooth', gain: 0.028, unison: [-13, -5, 6, 12], spread: 0.6,
               env: { a: 0.45, d: 0.4, s: 0.85, r: 0.7 }, legato: 0.98,
               filter: { type: 'lowpass', freq: 2100, q: 0.7 },
               vibrato: { rate: 4.4, cents: 8, delay: 0.3 } } },
    { play: 'chords', rule: 'rhythm', pattern: 'X . . x . . x . . . . . x . . .', fill: 'X . . x . . x . . . x . X . X .',
      voice: { wave: 'sawtooth', gain: 0.04, unison: [8],
               env: { a: 0.015, d: 0.16, s: 0.45, r: 0.1 }, legato: 0.8,
               filter: { type: 'lowpass', freq: 850, q: 1.5, sweep: { to: 2700, time: 0.07 } } } },
    { play: 'bass', rule: 'held',
      voice: { wave: 'sawtooth', gain: 0.1, env: { a: 0.08, d: 0.3, s: 0.8, r: 0.25 }, legato: 0.95,
               filter: { type: 'lowpass', freq: 420, q: 0.8 } } },
    { play: 'drum', pattern: 'X . . . . . . . x . . . . . . .', fill: 'X . . . . . . . x . . . x . x x',
      voice: { wave: 'kick', freq: 95, gain: 0.26, env: { a: 0.002, d: 0.4, s: 0, r: 0.05 } } },
    { play: 'drum', pattern: '. . . . . . . . . . . . . . . .', open: 'X . . . . . . . . . . . . . . .',
      voice: { wave: 'noise', gain: 0.06, env: { a: 0.002, d: 1.2, s: 0, r: 0.1 },
               filter: { type: 'highpass', freq: 4500, q: 0.6 } } }
  ],
  effects: { lowpass: 9000, reverb: { seconds: 3.2, decay: 2.5, mix: 0.42 } }
});
