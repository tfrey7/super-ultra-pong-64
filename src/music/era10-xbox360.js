/*
 * Super Ultra Pong 64: Remastered -- era 10's music: Xbox 360 (2005).
 *
 * ONE ERA, ONE FILE (item 1241): an arrangement card edits only this file,
 * the way an era's look lives in src/eras/. docs/MUSIC.md section "Era 10"
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
  era: 10,
  year: 2005,
  voices: 256,
  kit: {
    kick: [{ wave: 'kick', freq: 165, gain: 0.6, env: { a: 0.001, d: 0.3, s: 0, r: 0.03 } }, { wave: 'noise', gain: 0.06, env: { a: 0.001, d: 0.02, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 3500, q: 0.8 } }],
    snare: { wave: 'noise', gain: 0.16, env: { a: 0.001, d: 0.2, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 1250, q: 1 } },
    hat: { wave: 'noise', gain: 0.05, env: { a: 0.001, d: 0.06, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 9000, q: 0.7 }, pan: -0.3 },
    clap: { wave: 'noise', gain: 0.12, bursts: 3, env: { a: 0.001, d: 0.14, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 1300, q: 1 } },
    crash: { wave: 'noise', gain: 0.07, env: { a: 0.001, d: 1.6, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 4500, q: 0.5 } },
    tom: { wave: 'sine', freq: 105, gain: 0.3, env: { a: 0.001, d: 0.35, s: 0, r: 0.03 }, drop: { ratio: 0.55, time: 0.25 } },
    taiko: [{ wave: 'sine', freq: 55, gain: 0.5, env: { a: 0.001, d: 0.9, s: 0, r: 0.03 }, drop: { ratio: 0.5, time: 0.3 } }, { wave: 'noise', gain: 0.1, env: { a: 0.001, d: 0.1, s: 0, r: 0.02 }, filter: { type: 'lowpass', freq: 350, q: 0.8 } }]
  },
  chain: { hall: { seconds: 3.5, decay: 2.5, mix: 0.15 } },

  // 10 -- 2005 Xbox 360: the big-room era; the soundtrack is a festival.
  name: 'Xbox 360',
  about: 'Big-room: a huge four-on-the-floor kick, a wobbling bass whose filter throbs twice a beat, supersaw pads pumping against the kick, the melody spun into bright plucked arpeggios the whole way through, and for the B section a wide supersaw lead on the tune itself, with a snare roll building into each section.',
  trait: 'Big-room production: a bass filter driven by a tempo-locked LFO, side-chain pumping on the pads, arpeggios and a huge kick, wide and loud.',
  parts: [
    { play: 'melody', rule: 'arp', speed: 1, shape: [0, 12, 7, 12],
      voice: { wave: 'sawtooth', gain: 0.055, unison: [8], spread: 0.5,
               env: { a: 0.001, d: 0.12, s: 0.25, r: 0.05 }, legato: 0.85,
               filter: { type: 'lowpass', freq: 3000, q: 3, sweep: { to: 900, time: 0.1 } } } },
    { play: 'melody', rule: 'full', sections: ['B'],
      voice: { wave: 'sawtooth', gain: 0.045, unison: [-15, -7, 7, 15], spread: 0.9,
               env: { a: 0.01, d: 0.2, s: 0.8, r: 0.15 }, legato: 0.92,
               filter: { type: 'lowpass', freq: 5000, q: 0.8 } } },
    { play: 'chords', rule: 'pad',
      voice: { wave: 'sawtooth', gain: 0.03, unison: [-12, -5, 5, 12], spread: 0.8, pump: 0.8,
               env: { a: 0.05, d: 0.3, s: 0.9, r: 0.3 }, legato: 0.98,
               filter: { type: 'lowpass', freq: 3500, q: 0.7 } } },
    { play: 'bass', rule: 'held', octave: -1,
      voice: { wave: 'sawtooth', gain: 0.13, unison: [-10, 10], drive: 0.3,
               env: { a: 0.005, d: 0.1, s: 0.9, r: 0.05 }, legato: 0.97,
               filter: { type: 'lowpass', freq: 900, q: 8, lfo: { perBeat: 2, depth: 0.88 } } } },
    { play: 'bass', rule: 'held', octave: -1,
      voice: { wave: 'sine', gain: 0.1, pump: 0.6, env: { a: 0.005, d: 0.1, s: 0.9, r: 0.05 }, legato: 0.97 } },
    { play: 'drum', pattern: 'X . . . X . . . X . . . X . . .',
      voice: { wave: 'kick', freq: 165, gain: 0.6, env: { a: 0.001, d: 0.3, s: 0, r: 0.03 } } },
    { play: 'drum', pattern: '. . . . X . . . . . . . X . . .', fill: '. . . . X . . . X . X . X X X X',
      voice: { wave: 'noise', gain: 0.16, env: { a: 0.001, d: 0.11, s: 0, r: 0.03 },
               filter: { type: 'bandpass', freq: 1250, q: 1 } } },
    { play: 'drum', pattern: '. . x . . . x . . . x . . . x .',
      voice: { wave: 'noise', gain: 0.05, pan: -0.3, env: { a: 0.001, d: 0.06, s: 0, r: 0.01 },
               filter: { type: 'highpass', freq: 9000, q: 0.7 } } }
  ],
  effects: { reverb: { seconds: 1.8, decay: 3, mix: 0.2 } }
});
