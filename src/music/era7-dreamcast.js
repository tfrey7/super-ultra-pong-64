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

  // 7 -- 1999 Dreamcast: the AICA's 64 voices at full CD quality, and a
  // proper effects DSP. Item 1243: Jet Set Radio's funk, Sonic Adventure's
  // rock guitars, Soulcalibur's orchestra and the trance on the radio.
  //   intro  (0)    the electric piano comping ninths, the funky octave bass,
  //                 the crisp lead on the tune, kick and a sizzling ride
  //   build  (0.3)  the ghost-note breakbeat snare, the vibraphone climbing
  //                 the chords, a clap roll building into each section
  //   climax (0.7)  the trance drop: a gated supersaw on the tune, rock
  //                 guitars chugging power chords through the B section,
  //                 Soulcalibur strings under it all, four-on-the-floor and
  //                 open hats
  name: 'Dreamcast',
  about: 'Funk, rock and trance, Jet Set Radio to Sonic Adventure to Soulcalibur: jazzy ninth chords comped on an electric piano over a funky bass popping octaves and a swung kick and ride, the melody on a crisp synth lead; as the rally builds the ghost-note breakbeat snare and the vibraphone come in and a clap roll builds into each section; at the top it drops into trance, a gated supersaw on the tune, rock guitars chugging the B section and an orchestra of strings under everything.',
  trait: 'Crisp, full-band sound for the first time: clean bright chords with real extensions, a breakbeat with real cymbals, CD-quality guitars and strings, and no filter muffling the top end.',
  swing: 0.12,
  parts: [
    // ---------------------------------------------------------- the intro
    { play: 'melody', rule: 'full',
      voice: { wave: 'sawtooth', gain: 0.06, unison: [5], env: { a: 0.004, d: 0.2, s: 0.7, r: 0.1 }, legato: 0.85,
               filter: { type: 'lowpass', freq: 5200, q: 0.8 },
               vibrato: { rate: 6, cents: 14, delay: 0.15 } } },
    { play: 'chords', rule: 'rhythm', voicing: 'ninth', pattern: 'x - . . . . x - . . x . . . . .',
      fill: 'x - . . . . x - . . x . x . x .',
      voice: { wave: 'sine', gain: 0.06, fm: { ratio: 1, index: 1.3 },
               env: { a: 0.002, d: 0.45, s: 0.3, r: 0.18 }, legato: 0.9 } },
    { play: 'bass', rule: 'octaves',
      voice: { wave: 'sine', gain: 0.18, fm: { ratio: 1, index: 2 },
               env: { a: 0.002, d: 0.14, s: 0.35, r: 0.03 }, legato: 0.75 } },
    { play: 'drum', pattern: 'X . x . . . . . . . x x . . . .', fill: 'X . x . . . . . . . x . x . x .',
      voice: { wave: 'kick', freq: 140, gain: 0.38, env: { a: 0.001, d: 0.15, s: 0, r: 0.02 } } },
    // ---------------------------------------------------------- the build
    { play: 'drum', from: 0.3, pattern: '. . . . X . . x . x . . X . . x', fill: '. . . . X . . x . x . . X x X X',
      voice: { wave: 'noise', gain: 0.13, env: { a: 0.001, d: 0.12, s: 0, r: 0.03 },
               filter: { type: 'bandpass', freq: 2100, q: 0.7 } } },
    { play: 'drum', pattern: 'X . x x X . x x X . x x X . x x',
      voice: { wave: 'noise', gain: 0.03, pan: -0.35, env: { a: 0.001, d: 0.2, s: 0, r: 0.04 },
               filter: { type: 'highpass', freq: 6500, q: 0.6 } } },
    { play: 'drum', pattern: '. . . . . . . . . . . . . . . .', open: 'X . . . . . . . . . . . . . . .',
      voice: { wave: 'noise', gain: 0.06, pan: 0.4, env: { a: 0.001, d: 1.1, s: 0, r: 0.1 },
               filter: { type: 'highpass', freq: 5000, q: 0.5 } } },
    { play: 'chords', rule: 'broken', voicing: 'seventh', octave: 1, from: 0.3,
      voice: { wave: 'sine', gain: 0.045, pan: 0.35, fm: { ratio: 3.5, index: 0.8 },
               env: { a: 0.002, d: 0.35, s: 0, r: 0.1 } } },
    // The trance build: a clap roll doubling into every section.
    { play: 'drum', hit: 'clap', from: 0.3,
      pattern: '. . . . . . . . . . . . . . . .', fill: 'x . . . x . . . x . x . x x x x' },
    // --------------------------------------------------------- the climax
    // The drop: a supersaw on the tune, gated into sixteenths the trance way.
    { play: 'melody', rule: 'arp', speed: 1, shape: [0, 0, 12, 0], from: 0.7,
      voice: { wave: 'sawtooth', gain: 0.03, unison: [-14, -6, 6, 14], spread: 0.9,
               env: { a: 0.002, d: 0.08, s: 0.5, r: 0.04 }, legato: 0.7,
               filter: { type: 'lowpass', freq: 6000, q: 1 } } },
    // Sonic Adventure's guitars: power chords through a hard drive, B section.
    { play: 'chords', rule: 'rhythm', voicing: 'power', octave: -1, from: 0.7, sections: ['B'],
      pattern: 'X - x - X - x x X - x - X - x x', fill: 'X - x - X - x - X x X x X x X x',
      voice: { wave: 'sawtooth', gain: 0.07, unison: [9], spread: 0.8, drive: 0.8,
               env: { a: 0.002, d: 0.1, s: 0.6, r: 0.04 }, legato: 0.85,
               filter: { type: 'lowpass', freq: 3200, q: 0.9 } } },
    // Soulcalibur's orchestra: wide strings holding the chords.
    { play: 'chords', rule: 'pad', voicing: 'seventh', from: 0.7,
      voice: { wave: 'sawtooth', gain: 0.026, unison: [-11, 11], spread: 0.9,
               env: { a: 0.35, d: 0.4, s: 0.9, r: 0.6 }, legato: 0.98,
               filter: { type: 'lowpass', freq: 3800, q: 0.7 },
               vibrato: { rate: 5, cents: 9, delay: 0.3 } } },
    { play: 'drum', hit: 'kick', from: 0.7, pattern: 'X . . . X . . . X . . . X . . .' },
    { play: 'drum', hit: 'open', from: 0.7, pattern: '. . X . . . X . . . X . . . X .' },
    { play: 'drum', hit: 'clap', from: 0.7, pattern: '. . . . X . . . . . . . X . . .' }
  ],
  effects: { reverb: { seconds: 1.2, decay: 4, mix: 0.16 } }
});
