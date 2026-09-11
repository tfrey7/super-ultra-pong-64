/*
 * Super Ultra Pong 64: Remastered -- era 3's music: Genesis (1989).
 *
 * ONE ERA, ONE FILE (item 1241): an arrangement card edits only this file,
 * the way an era's look lives in src/eras/. docs/MUSIC.md section "Era 3"
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
  era: 3,
  year: 1989,
  level: 2.5,   // dB on the whole bus: item 1275's balance
  voices: 10,
  kit: {
    kick: { wave: 'kick', freq: 170, gain: 0.45, env: { a: 0.001, d: 0.16, s: 0, r: 0.03 } },
    // the snare with a clap layered on it (one sample on the DAC, one voice)
    snare: [{ wave: 'noise', gain: 0.16, env: { a: 0.001, d: 0.11, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 2200, q: 0.9 } }, { wave: 'sine', freq: 220, gain: 0.08, env: { a: 0.001, d: 0.05, s: 0, r: 0.03 }, drop: { ratio: 0.6, time: 0.04 } }, { wave: 'noise', gain: 0.1, bursts: 3, env: { a: 0.001, d: 0.12, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 1200, q: 1.2 } }],
    clap: { wave: 'noise', gain: 0.14, bursts: 3, env: { a: 0.001, d: 0.12, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 1200, q: 1.2 } },
    hat: { wave: 'noise', gain: 0.045, env: { a: 0.001, d: 0.03, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 8000, q: 0.7 } },
    open: { wave: 'noise', gain: 0.045, env: { a: 0.001, d: 0.22, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 8000, q: 0.7 } },
    tom: { wave: 'sine', freq: 150, gain: 0.25, env: { a: 0.001, d: 0.18, s: 0, r: 0.03 }, drop: { ratio: 0.5, time: 0.15 } },
    crash: { wave: 'noise', gain: 0.07, env: { a: 0.001, d: 1.0, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 5000, q: 0.5 } }
  },
  chain: { chorus: { rate: 0.8, depth: 0.004, mix: 0.3 }, hall: { seconds: 1.2, decay: 3.5, mix: 0.12 } },

  // 3 -- 1989 Genesis: the YM2612's FM channels and the PSG square on top.
  // Item 1242: Koshiro's club on a cartridge. Ten voices: FM 1 the slap bass,
  // FM 2 the brass lead, FM 3-5 the DX7-style house piano, FM 6 the sampled
  // kick (the DAC), the PSG's squares the octave lead, its noise the hats
  // and the claps share with the snare. The loop never uses more than nine,
  // so the engine's tom roll and crash always have a voice to land on:
  //   intro   the slap bass in sixteenths, the FM brass on the tune, the
  //           909 kick on every beat and ticking hats, swung new-jack style
  //   build   the house piano stabbing the off-beats, the snare-and-clap on
  //           two and four, the open hat on every "and"
  //   climax  the PSG square doubling the tune an octave up and a snare roll
  //           into each section
  name: 'Genesis',
  about: 'A Koshiro club track on a cartridge: a growling FM slap bass in swung sixteenths, the tune on a brassy FM horn, a four-on-the-floor 909 kick and ticking hats; then a glassy DX7-style house piano stabs the off-beats over a snare-and-clap and open hats, and at the climax a PSG square doubles the tune an octave up while snare rolls throw it into each section.',
  trait: 'FM synthesis: punchy metallic bass, brass and bell-piano patches, the PSG square riding on top, a sampled kick on the DAC and that slightly crunchy output.',
  swing: 0.12,
  parts: [
    { play: 'bass', rule: 'sixteenths',
      voice: { wave: 'sine', gain: 0.2, fm: { ratio: 1, index: 3.4 },
               env: { a: 0.002, d: 0.09, s: 0.4, r: 0.02 }, legato: 0.7 } },
    { play: 'melody', rule: 'full',
      voice: { wave: 'sine', gain: 0.12, fm: { ratio: 1, index: 2.4 },
               env: { a: 0.012, d: 0.2, s: 0.65, r: 0.06 }, vibrato: { rate: 6, cents: 14, delay: 0.18 } } },
    // the 909 on every beat: four on the floor
    { play: 'drum', hit: 'kick',
      pattern: 'X . . . x . . . X . . . x . . .', fill: 'X . . . x . . . X . . . x . x x' },
    // closed hats on the sixteenths the open hat leaves
    { play: 'drum', hit: 'hat',
      pattern: 'x x . x x x . x x x . x x x . x' },
    // build: the house piano, a bell-toothed FM tine stabbing the chord (the M1 organ-piano rhythm)
    { play: 'chords', rule: 'rhythm', from: 0.3, pattern: '. . x . . . x x . . x . . x . .',
      voice: { wave: 'sine', gain: 0.045, fm: { ratio: 14, index: 0.55 },
               env: { a: 0.001, d: 0.22, s: 0.15, r: 0.08 }, legato: 0.5 } },
    { play: 'drum', hit: 'snare', from: 0.3,
      pattern: '. . . . X . . . . . . . X . . .' },
    { play: 'drum', hit: 'open', from: 0.3,
      pattern: '. . x . . . x . . . x . . . x .' },
    // climax: the PSG square on the tune an octave up
    { play: 'melody', rule: 'full', octave: 1, from: 0.7,
      voice: { wave: 'square', gain: 0.035, env: { a: 0.002, d: 0.05, s: 0.7, r: 0.03 }, legato: 0.85,
               vibrato: { rate: 6, cents: 10, delay: 0.2 } } },
    // climax: a snare roll into each section, around the backbeat
    { play: 'drum', hit: 'snare', from: 0.7,
      pattern: '. . . . . . . . . . . . . . . .', fill: '. . . . . . . . x x x x . x x x' }
  ],
  effects: { grit: 0.35 }
});
