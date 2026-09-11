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
    // the DPCM channel's sampled snare: a crack of noise on a fast-falling body
    dpcm: [{ wave: 'noise', gain: 0.09, env: { a: 0.001, d: 0.07, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 2600, q: 1.1 } }, { wave: 'triangle', freq: 240, gain: 0.1, env: { a: 0.001, d: 0.05, s: 0, r: 0.02 }, drop: { ratio: 0.45, time: 0.04 } }],
    tom: { wave: 'triangle', freq: 160, gain: 0.18, env: { a: 0.001, d: 0.14, s: 0, r: 0.03 }, drop: { ratio: 0.55, time: 0.12 } },
    crash: { wave: 'noise', gain: 0.06, env: { a: 0.001, d: 0.8, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 4000, q: 0.5 } }
  },
  chain: { hall: { seconds: 0.9, decay: 1, mix: 0.18, gate: 0.28 } },

  // 2 -- 1985 NES: two pulses, a triangle, a noise channel, the DPCM.
  // Item 1242: the Konami anthem. Five channels and the parts sit on them the
  // way a sound driver would: pulse 1 the tune, pulse 2 the arpeggio (A) or
  // the harmony (B), the triangle the leaping bass, the noise channel the hats
  // and snare hiss (never on the same sixteenth), the DPCM the kick, the
  // sampled snare and the fills (never on the same sixteenth). The noise
  // channel is left free on each bar's downbeat so the engine's match-point
  // crash has somewhere to land:
  //   intro   the lead, the whirring arpeggio, the triangle and ticking hats
  //   build   pulse 2 echoes the tune in the B section, the DPCM kit enters
  //           under a noise snare on two and four
  //   climax  the hats double to sixteenths and a DPCM snare fill rolls into
  //           each section; the engine's tom and crash on top
  name: 'NES',
  about: 'A heroic Konami-style anthem: a pulse lead with vibrato that narrows and sharpens for the B section, chords faked by a whirring arpeggio, a triangle bass leaping octaves and ticking noise hats; then the second pulse answers the tune, the sampled kick and snare slam in under a gated hall, and at the climax the hats go to sixteenths and a snare fill rolls into every section.',
  trait: 'Pulse channels with a changing duty cycle, chords only as fast arpeggios, a volume-less triangle bass, and a noise channel and a sample channel sharing out the kit.',
  parts: [
    { play: 'melody', rule: 'full', sections: ['A'],
      voice: { wave: 'pulse25', gain: 0.1, env: { a: 0.002, d: 0.06, s: 0.75, r: 0.03 },
               vibrato: { rate: 5.5, cents: 18, delay: 0.14 } } },
    { play: 'melody', rule: 'full', sections: ['B'],
      voice: { wave: 'pulse12', gain: 0.11, env: { a: 0.002, d: 0.06, s: 0.75, r: 0.03 },
               vibrato: { rate: 6, cents: 22, delay: 0.12 } } },
    // pulse 2: the fake chord, four notes a step, whirring
    { play: 'chords', rule: 'arp', speed: 4, octave: 1, sections: ['A'],
      voice: { wave: 'pulse50', gain: 0.042, env: { a: 0.001, d: 0.02, s: 0.8, r: 0.005 }, legato: 0.95 } },
    // pulse 2 in the B section, from the build: the tune answered a dotted eighth late
    { play: 'echo', of: 'melody', delay: 3, sections: ['B'], from: 0.3,
      voice: { wave: 'pulse50', gain: 0.05, env: { a: 0.002, d: 0.06, s: 0.7, r: 0.03 } } },
    // the triangle, leaping octaves
    { play: 'bass', rule: 'octaves',
      voice: { wave: 'triangle', gain: 0.22, env: { a: 0.002, d: 0.01, s: 1, r: 0.005 }, legato: 0.9 } },
    // the noise channel: hats off the downbeat, then the snare hiss on two and four
    { play: 'drum', hit: 'hat',
      pattern: '. . x . . . x . x . x . . . x .', fill: '. . x . . . x . x . x . . . . .' },
    { play: 'drum', hit: 'snare', from: 0.3,
      pattern: '. . . . x . . . . . . . X . . .', fill: '. . . . x . . . . . . . X x X x' },
    // the DPCM: kick, then fills rolling into each section at the climax
    { play: 'drum', hit: 'kick', from: 0.3,
      pattern: 'X . . . . . . x x . . . . . . .', fill: 'X . . . . . . x x . . . . . . .' },
    { play: 'drum', hit: 'dpcm', from: 0.3,
      pattern: '. . . . x . . . . . . . x . . .' },
    { play: 'drum', hit: 'dpcm', from: 0.7,
      pattern: '. . . . . . . . . . . . . . . .', fill: '. . . . . . . . . x x x . x x X' },
    // climax: the hats double to sixteenths on the steps the eighths leave free
    { play: 'drum', hit: 'hat', from: 0.7,
      pattern: '. x . x . x . x . x . x . x . x', fill: '. x . x . x . x . x . x . . . .' }
  ]
});
