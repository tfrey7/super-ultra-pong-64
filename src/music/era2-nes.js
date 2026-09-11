/*
 * Super Ultra Pong 64: Remastered -- era 2's music: NES (1985).
 *
 * ONE ERA, ONE FILE (item 1241): an arrangement card edits only this file,
 * the way an era's look lives in src/eras/. docs/MUSIC.md section "Era 2"
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
  era: 2,
  year: 1985,
  voices: 5,
  kit: {
    kick: { wave: 'triangle', freq: 120, gain: 0.3, env: { a: 0.001, d: 0.1, s: 0, r: 0.03 }, drop: { ratio: 0.25, time: 0.05 } },
    snare: [{ wave: 'noise', gain: 0.1, env: { a: 0.001, d: 0.11, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 1800, q: 0.8 } }, { wave: 'triangle', freq: 190, gain: 0.08, env: { a: 0.001, d: 0.06, s: 0, r: 0.03 }, drop: { ratio: 0.6, time: 0.05 } }],
    hat: { wave: 'noise', gain: 0.05, env: { a: 0.001, d: 0.03, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 7000, q: 0.7 } },
    open: { wave: 'noise', gain: 0.05, env: { a: 0.001, d: 0.2, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 7000, q: 0.7 } },
    tom: { wave: 'triangle', freq: 160, gain: 0.18, env: { a: 0.001, d: 0.14, s: 0, r: 0.03 }, drop: { ratio: 0.55, time: 0.12 } },
    crash: { wave: 'noise', gain: 0.06, env: { a: 0.001, d: 0.8, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 4000, q: 0.5 } }
  },
  chain: { hall: { seconds: 0.9, decay: 1, mix: 0.18, gate: 0.28 } },

  // 2 -- 1985 NES: two pulses, a triangle, a noise channel.
  name: 'NES',
  about: 'Brisk and bright: a pulse lead that narrows and sharpens for the B section, chords faked by a whirring arpeggio, a triangle bass leaping octaves and ticking noise hats; in the B section the second pulse echoes the tune back, quieter.',
  trait: 'Pulse channels with a changing duty cycle, chords only as fast arpeggios, and a volume-less triangle bass.',
  parts: [
    { play: 'melody', rule: 'full', sections: ['A'],
      voice: { wave: 'pulse25', gain: 0.1, env: { a: 0.002, d: 0.06, s: 0.75, r: 0.03 },
               vibrato: { rate: 5.5, cents: 18, delay: 0.14 } } },
    { play: 'melody', rule: 'full', sections: ['B'],
      voice: { wave: 'pulse12', gain: 0.11, env: { a: 0.002, d: 0.06, s: 0.75, r: 0.03 },
               vibrato: { rate: 6, cents: 22, delay: 0.12 } } },
    { play: 'chords', rule: 'arp', speed: 2, octave: 1, sections: ['A'],
      voice: { wave: 'pulse50', gain: 0.045, env: { a: 0.001, d: 0.02, s: 0.8, r: 0.005 }, legato: 0.95 } },
    { play: 'echo', of: 'melody', delay: 3, sections: ['B'],
      voice: { wave: 'pulse50', gain: 0.045, env: { a: 0.002, d: 0.06, s: 0.7, r: 0.03 } } },
    { play: 'bass', rule: 'octaves',
      voice: { wave: 'triangle', gain: 0.22, env: { a: 0.002, d: 0.01, s: 1, r: 0.005 }, legato: 0.9 } },
    { play: 'drum', pattern: 'x . x . x . x . x . x . x . x .', fill: 'x . x . x . x . x x x x x x x x',
      voice: { wave: 'noise', gain: 0.06, env: { a: 0.001, d: 0.035, s: 0, r: 0.005 },
               filter: { type: 'highpass', freq: 7000, q: 0.7 } } },
    { play: 'drum', pattern: '. . . . x . . . . . . . x . . .', fill: '. . . . x . . . . . x . x . x x',
      voice: { wave: 'noise', gain: 0.1, env: { a: 0.001, d: 0.1, s: 0, r: 0.01 },
               filter: { type: 'bandpass', freq: 1800, q: 0.8 } } }
  ]
});
