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
    taiko: [{ wave: 'sine', freq: 55, gain: 0.25, env: { a: 0.001, d: 0.9, s: 0, r: 0.03 }, drop: { ratio: 0.5, time: 0.3 } }, { wave: 'noise', gain: 0.05, env: { a: 0.001, d: 0.1, s: 0, r: 0.02 }, filter: { type: 'lowpass', freq: 350, q: 0.8 } }]
  },
  chain: { hall: { seconds: 3.5, decay: 2.5, mix: 0.15 } },

  // 10 -- 2005 Xbox 360: the top of the ladder, where the match ends. Item
  // 1243: the trailer orchestra of Halo 2, Gears of War and Kameo, the
  // biggest arrangement of the eleven, with the big-room drop kept as the
  // climax's pulse. In a real match this era arrives at match point, so it
  // is heard from the climax up; ?era=10 starts it at the intro.
  //   intro  (0)    the string ostinato and the pulse: plucked arpeggios on
  //                 the tune, a pumping sub bass, a ticking hat
  //   build  (0.3)  low brass on the tune and low brass hits on every
  //                 downbeat, taiko on the beat, the huge kick and the snare
  //                 roll, a riser sweeping into each section
  //   climax (0.7)  the choir (chord and tune), the supersaw lead and pads,
  //                 the wobble bass, the taiko ensemble in sixteenths, the
  //                 clap, and the achievement sting on the turnaround; the
  //                 engine's tom roll and crash on top at 0.7 and 0.9
  name: 'Xbox 360',
  about: 'A 2005 trailer orchestra on top of a big-room drop: a string ostinato and plucked arpeggios over a pumping sub bass; as the rally builds, low brass takes the tune and hits every downbeat, taiko pound the beat under a huge kick and a riser sweeps into each section; at the top a choir sings the chords and the B-section tune, a wide supersaw lead and pumping pads join the wobble bass, the taiko ensemble breaks into sixteenths, and a bright two-note achievement chime rings on the turnaround.',
  trait: 'Software mixing on a three-core machine: effectively unlimited voices, so the trailer orchestra, the choir, the epic percussion and the big-room synths all play at once, wide, loud and clean in a huge hall.',
  parts: [
    // ---------------------------------------------------------- the intro
    { play: 'melody', rule: 'arp', speed: 1, shape: [0, 12, 7, 12],
      voice: { wave: 'sawtooth', gain: 0.07, unison: [8], spread: 0.5,
               env: { a: 0.001, d: 0.12, s: 0.25, r: 0.05 }, legato: 0.85,
               filter: { type: 'lowpass', freq: 3000, q: 3, sweep: { to: 900, time: 0.1 } } } },
    // The string ostinato: the chord's notes an octave down, in sixteenths.
    { play: 'chords', rule: 'arp', speed: 1, octave: -1,
      voice: { wave: 'sawtooth', gain: 0.04, env: { a: 0.003, d: 0.08, s: 0.4, r: 0.04 }, legato: 0.75,
               filter: { type: 'lowpass', freq: 1800, q: 1.2 } } },
    { play: 'bass', rule: 'held', octave: -1,
      voice: { wave: 'sine', gain: 0.16, pump: 0.6, env: { a: 0.005, d: 0.1, s: 0.9, r: 0.05 }, legato: 0.97 } },
    { play: 'drum', from: 0.3, pattern: 'X . . . X . . . X . . . X . . .',
      voice: { wave: 'kick', freq: 165, gain: 0.6, env: { a: 0.001, d: 0.3, s: 0, r: 0.03 } } },
    { play: 'drum', hit: 'hat', pattern: '. . x . . . x . . . x . . . x .' },
    // ---------------------------------------------------------- the build
    // Low brass on the tune: the melody a whole loop late (the same step), an
    // octave down, on a brass that opens up as it speaks.
    { play: 'echo', of: 'melody', delay: 8 * 16, octave: -1, from: 0.3,
      voice: { wave: 'sawtooth', gain: 0.055, unison: [-7, 7], spread: 0.3,
               env: { a: 0.05, d: 0.3, s: 0.85, r: 0.3 }, legato: 0.95,
               filter: { type: 'lowpass', freq: 900, q: 1.5, sweep: { to: 2400, time: 0.15 } } } },
    // Low brass hits on every downbeat, held for half a bar.
    { play: 'chords', rule: 'rhythm', octave: -1, from: 0.3,
      pattern: 'X - - - - - - . . . . . . . . .', fill: 'X - - - - - - . X - - - X - - -',
      voice: { wave: 'sawtooth', gain: 0.035, unison: [10], drive: 0.3,
               env: { a: 0.02, d: 0.4, s: 0.7, r: 0.3 }, legato: 0.95,
               filter: { type: 'lowpass', freq: 700, q: 1.5, sweep: { to: 1800, time: 0.2 } } } },
    { play: 'drum', hit: 'taiko', from: 0.3, pattern: 'X . . . x . . . X . . . x . x .' },
    { play: 'drum', from: 0.3, pattern: '. . . . X . . . . . . . X . . .', fill: '. . . . X . . . X . X . X X X X',
      voice: { wave: 'noise', gain: 0.16, env: { a: 0.001, d: 0.11, s: 0, r: 0.03 },
               filter: { type: 'bandpass', freq: 1250, q: 1 } } },
    // The riser: a saw sweeping up two octaves over the last half bar of
    // each section, peaking on the next downbeat.
    { play: 'drum', from: 0.3,
      pattern: '. . . . . . . . . . . . . . . .', fill: '. . . . . . . . x . . . . . . .',
      voice: { wave: 'sawtooth', freq: 220, gain: 0.03, drop: { ratio: 4, time: 0.85 },
               env: { a: 0.85, d: 0.06, s: 0, r: 0.02 },
               filter: { type: 'highpass', freq: 400, q: 0.7, sweep: { to: 3000, time: 0.85 } } } },
    // --------------------------------------------------------- the climax
    { play: 'melody', rule: 'full', sections: ['B'], from: 0.7,
      voice: { wave: 'sawtooth', gain: 0.04, unison: [-15, -7, 7, 15], spread: 0.9,
               env: { a: 0.01, d: 0.2, s: 0.8, r: 0.15 }, legato: 0.92,
               filter: { type: 'lowpass', freq: 5000, q: 0.8 } } },
    { play: 'chords', rule: 'pad', from: 0.7,
      voice: { wave: 'sawtooth', gain: 0.025, unison: [-12, -5, 5, 12], spread: 0.8, pump: 0.8,
               env: { a: 0.05, d: 0.3, s: 0.9, r: 0.3 }, legato: 0.98,
               filter: { type: 'lowpass', freq: 3500, q: 0.7 } } },
    // The choir: the chord on "ah" (two formants) and the B-section tune.
    { play: 'chords', rule: 'pad', from: 0.7,
      voice: { wave: 'sawtooth', gain: 0.07, unison: [-7, 7], spread: 0.6,
               env: { a: 0.4, d: 0.4, s: 0.9, r: 0.8 }, legato: 0.99,
               filter: { type: 'bandpass', freq: 780, q: 2.5 },
               vibrato: { rate: 4.2, cents: 9, delay: 0.3 } } },
    { play: 'echo', of: 'melody', delay: 8 * 16, sections: ['B'], from: 0.7,
      voice: { wave: 'sawtooth', gain: 0.08, unison: [-6, 6],
               env: { a: 0.12, d: 0.3, s: 0.9, r: 0.35 }, legato: 0.97,
               filter: { type: 'bandpass', freq: 1150, q: 3 },
               vibrato: { rate: 4.3, cents: 10, delay: 0.2 } } },
    { play: 'bass', rule: 'held', octave: -1, from: 0.7,
      voice: { wave: 'sawtooth', gain: 0.11, unison: [-10, 10], drive: 0.3,
               env: { a: 0.005, d: 0.1, s: 0.9, r: 0.05 }, legato: 0.97,
               filter: { type: 'lowpass', freq: 900, q: 8, lfo: { perBeat: 2, depth: 0.88 } } } },
    // The taiko ensemble breaks into sixteenths, and the clap doubles the snare.
    { play: 'drum', hit: 'taiko', from: 0.7, pattern: '. . x x . . x . . x x . . . x x' },
    { play: 'drum', hit: 'clap', from: 0.7, pattern: '. . . . X . . . . . . . X . . .' },
    // The achievement sting: a bright two-note chime, B5 then E6, into the
    // top of the loop on the E major turnaround.
    { play: 'drum', from: 0.7, sections: ['B'],
      pattern: '. . . . . . . . . . . . . . . .', fill: '. . . . . . . . . . . . X . . .',
      voice: { wave: 'sine', freq: 987.77, gain: 0.06, fm: { ratio: 3.5, index: 0.6 },
               env: { a: 0.001, d: 0.6, s: 0, r: 0.05 } } },
    { play: 'drum', from: 0.7, sections: ['B'],
      pattern: '. . . . . . . . . . . . . . . .', fill: '. . . . . . . . . . . . . . X .',
      voice: { wave: 'sine', freq: 1318.51, gain: 0.07, fm: { ratio: 3.5, index: 0.6 },
               env: { a: 0.001, d: 0.9, s: 0, r: 0.05 } } }
  ],
  effects: { reverb: { seconds: 1.8, decay: 3, mix: 0.2 } }
});
