/*
 * Super Ultra Pong 64: Remastered -- the soundtrack.
 *
 * The game has ONE theme, written once, and every era plays it in the voice of
 * its own sound chip -- the way Banjo-Kazooie plays the same song in a different
 * style for each place. The melody, key, chords, length and tempo never change;
 * the instruments, the rhythm feel, how thick the harmony is and the ornaments
 * do. The 1972 arcade has no sound chip, so it only taps the melody's bones
 * over the cabinet's hum; the Atari plays it on two out-of-tune squares; the
 * NES on its pulse, triangle and noise channels; the Genesis as an FM groove;
 * the Super Nintendo as a small orchestra in the echo. Then the 3D table: the
 * PlayStation as grainy ambient techno under a filter sweep, the Nintendo 64
 * as a muffled synth orchestra, the Dreamcast as bright jazzy chords over a
 * breakbeat, the PlayStation 2 as a wide dark film score, the Xbox as
 * drop-tuned rock and the Xbox 360 as big-room with a wobbling bass.
 *
 * Every arrangement shares the bar count and the tempo, so the song position
 * is ONE clock: at an era change the old arrangement fades out and the new one
 * fades in over the ring wipe at the same bar and beat. The tune changes
 * clothes and never restarts.
 *
 * Two halves, kept apart like src/sound.js:
 *   - THEME and ARRANGEMENTS are plain data, so a stranger adds an era's
 *     arrangement without reading the player. A row may be null (silence).
 *     arrange() turns theme + arrangement into the notes of the loop.
 *   - createMusic() books those notes AHEAD on the audio clock (a lookahead
 *     scheduler: each tick books every step that starts in the next LOOKAHEAD
 *     seconds at its exact audio time; no timer ever fires a note). It READS
 *     the game and never writes it.
 *
 * It rides the sound effects' first-click unlock: the same click or key that
 * starts the game opens the music's audio. src/sound.js is untouched; the
 * music sits MUSIC_DB under the effects and ducks a touch on every paddle hit.
 * The tempo climbs a little as a rally goes on (one multiplier on the whole
 * clock); the M key mutes; ?music=off keeps it silent.
 *
 * UMD like src/game.js: window.PongMusic in the page, require() under node.
 * In the page it attaches itself (see the foot of the file), so src/main.js
 * carries no music code.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PongMusic = api;
  if (typeof document !== 'undefined' && !(typeof module === 'object' && module.exports)) {
    api.attachToPage(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // ============================================================== THE THEME
  // The one song. Original, in A minor: an A section that climbs and a B
  // section that soars and turns back home on an E major chord.
  //   bpm       the one tempo every era plays at (a bar is four beats)
  //   steps     steps in a bar (16 = sixteenth notes)
  //   bars      bars in the loop; sections name which bars are which
  //   melody    one string a bar, `steps` tokens each (the token grammar below)
  //   bass      the bass line: one note per half bar (bars * 2 notes)
  //   chords    one chord a bar, its notes joined by '+', root first
  //
  // Tokens: a note (C4, F#3, Bb5), '-' holds the note before one more step,
  // '.' is a rest. (Drum patterns use 'x' for a hit and 'X' for an accent.)
  var THEME = {
    title: 'Super Ultra Pong 64 theme',
    key: 'A minor',
    bpm: 132,
    steps: 16,
    bars: 8,
    sections: { A: [0, 1, 2, 3], B: [4, 5, 6, 7] },
    melody: [
      'A4 - - C5 E5 - D5 C5 D5 - E5 - C5 - A4 -',     // A1  Am
      'F4 - A4 - C5 - - A4 C5 - F5 - E5 - C5 -',      // A2  F
      'E5 - - G5 E5 - C5 - D5 - E5 - G5 - E5 -',      // A3  C
      'D5 - B4 - G4 - B4 D5 G5 - - - . . . .',        // A4  G
      'A5 - - - G5 - F5 - E5 - - F5 E5 - C5 -',       // B1  F
      'D5 - - - E5 - D5 - B4 - - C5 D5 - G4 -',       // B2  G
      'C5 - E5 - A5 - - G5 A5 - B5 - C6 - A5 -',      // B3  Am
      'B5 - - - G#5 - - - E5 - - - B4 - - -'          // B4  E
    ],
    bass: ['A2', 'E2', 'F2', 'C3', 'C3', 'G2', 'G2', 'D3',
           'F2', 'C3', 'G2', 'D3', 'A2', 'E2', 'E2', 'G#2'],
    chords: ['A3+C4+E4', 'F3+A3+C4', 'C4+E4+G4', 'G3+B3+D4',
             'F3+A3+C4', 'G3+B3+D4', 'A3+C4+E4', 'E3+G#3+B3']
  };

  // ======================================================== ARRANGEMENTS
  // One row per era; null is an empty slot (played as silence). A row:
  //   name, about (what it sounds like), trait (the chip trait that sells it)
  //   parts    the players, each one of:
  //     { play: 'melody', rule: 'full' | 'bones' | 'arp', voice, octave?, sections? }
  //         full  = every note as written; bones = the first note of each
  //         half bar, as one short tap (two a bar); arp = each melody note
  //         broken into a fast arpeggio while it sounds, `speed` notes a step,
  //         cycling `shape` (semitones above the note, default [0, 12, 7, 12]),
  //         so the melody note itself always lands on its own beat
  //     { play: 'bass', rule: 'held' | 'eighths' | 'octaves' | 'sixteenths' | 'pizz', voice, octave? }
  //         held = each note for its half bar; eighths = repeated 8ths;
  //         octaves = 8ths leaping root/octave; sixteenths = 16ths with an
  //         octave pop on the off-16ths; pizz = short quarter notes
  //     { play: 'chords', rule: 'pad' | 'arp' | 'offbeat' | 'broken' | 'rhythm', voice, speed?, octave?, voicing? }
  //         pad = the chord held the whole bar; arp = its notes cycled fast,
  //         `speed` per step (the NES's fake chord); offbeat = stabs on the
  //         8th off-beats; broken = 8ths climbing the chord; rhythm = the
  //         chord struck on a `pattern` (and `fill`) written like a drum's,
  //         where '-' holds it (stabs, comping, chugs)
  //         voicing: 'triad' (as written), 'power' (root, fifth, octave: a
  //         guitar's power chord), 'seventh' / 'ninth' (the key's own 7th, and
  //         9th, stacked on: the jazzy chords)
  //     { play: 'echo', of: 'melody', delay: steps, voice }
  //         the melody again, `delay` steps late, on a quieter voice
  //     { play: 'drum', pattern, fill?, open?, voice, steals? }
  //         one bar of 'x'/'X'/'.' repeated; `fill` replaces it in the last
  //         bar of each section and `open` in the first (a crash on the
  //         downbeat); steals: 'bass' silences the bass while the drum sounds
  //         (a chip with too few channels)
  //     Any part may carry sections: ['A'] or ['B'] to play in only one.
  //   swing    optional share of a step every off-16th is played late (the
  //            rhythm feel: 0 straight, 0.2 a lazy shuffle)
  //   detune   optional 12 cents offsets by pitch class, C first (a chip whose
  //            pitch dividers cannot hit the scale)
  //   drone    optional [{ wave, freq, gain, filter?, wobble?: { rate, depth } }]
  //            sounds that run the whole time the era is on
  //   effects  optional { grit, crush (bits: a grainy, compressed edge),
  //                       lowpass, sweep: { freq, depth, bars, q } (a resonant
  //                       low-pass over the whole mix whose cutoff rises and
  //                       falls once every `bars` bars), echo: { time,
  //                       feedback, mix }, reverb: { seconds, decay, mix } }
  //
  // A voice: { wave: 'square'|'triangle'|'sine'|'sawtooth'|'pulse12'|'pulse25'
  //            |'pulse50'|'noise'|'kick', gain, env: { a, d, s, r }, legato?,
  //            freq? (for a drum's hit), unison?: [cents...], spread? (0..1:
  //            the unison layers placed left and right), pan? (-1..1),
  //            drive? (0..1: an overdrive before the filter, a guitar amp),
  //            pump? (0..1: the side-chain duck on every beat), filter?: {
  //            type, freq, q, sweep?: { to, time } (the cutoff glides there
  //            as the note starts), lfo?: { perBeat, depth, wave? } (the
  //            cutoff wobbles `perBeat` times a beat, by depth x freq) },
  //            fm?: { ratio, index }, vibrato?: { rate, cents, delay } }
  // Gains are on src/sound.js's scale; the whole soundtrack then sits
  // MUSIC_DB under it.

  var ARRANGEMENTS = [
    // 0 -- 1972 arcade: no sound chip, no music. The theme is only hinted.
    {
      name: '1972 arcade',
      about: 'The melody\'s bones tapped as lonely square beeps, two a bar, over the cabinet\'s 60-cycle hum and a flickering fluorescent buzz.',
      trait: 'No sound chip at all: one beeper and the mains hum is all the board had.',
      parts: [
        { play: 'melody', rule: 'bones',
          voice: { wave: 'square', gain: 0.075, env: { a: 0.001, d: 0.07, s: 0, r: 0.01 } } }
      ],
      drone: [
        { wave: 'sine', freq: 60, gain: 0.07 },
        { wave: 'sine', freq: 120, gain: 0.035 },
        { wave: 'sawtooth', freq: 120, gain: 0.02,
          filter: { type: 'bandpass', freq: 3100, q: 6 }, wobble: { rate: 7.3, depth: 0.5 } }
      ]
    },

    // 1 -- 1977 Atari 2600: the TIA's two channels.
    {
      name: 'Atari 2600',
      about: 'The whole tune on two buzzy squares, sour and wobbly, with a thumping eighth-note bass that drops out whenever the snare hiss takes its channel.',
      trait: 'Two channels and coarse pitch dividers: every note lands off true, and a drum has to steal the bass voice to sound.',
      detune: [0, 31, -18, 12, -27, 8, 40, -9, 22, -35, 15, -22],
      parts: [
        { play: 'melody', rule: 'full',
          voice: { wave: 'square', gain: 0.09, env: { a: 0.002, d: 0.05, s: 0.75, r: 0.02 }, legato: 0.8 } },
        { play: 'bass', rule: 'eighths',
          voice: { wave: 'square', gain: 0.08, env: { a: 0.002, d: 0.06, s: 0.5, r: 0.01 }, legato: 0.7 } },
        { play: 'drum', pattern: '. . . . x . . . . . . . x . . .', fill: '. . . . x . . . x . x . x x x x',
          steals: 'bass',
          voice: { wave: 'noise', gain: 0.12, env: { a: 0.001, d: 0.09, s: 0, r: 0.01 },
                   filter: { type: 'bandpass', freq: 1400, q: 0.8 } } }
      ]
    },

    // 2 -- 1985 NES: two pulses, a triangle, a noise channel.
    {
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
    },

    // 3 -- 1989 Genesis: the YM2612's FM channels and the PSG square on top.
    {
      name: 'Genesis',
      about: 'A driving FM groove: a growling slap bass in sixteenths, the melody on a brassy FM horn, a thin square stabbing the chords on the off-beats, and a hard kick and snare with a gritty edge on everything.',
      trait: 'FM synthesis: punchy metallic bass and brass patches, the PSG square riding on top, and that slightly crunchy output.',
      parts: [
        { play: 'bass', rule: 'sixteenths',
          voice: { wave: 'sine', gain: 0.2, fm: { ratio: 1, index: 3.4 },
                   env: { a: 0.002, d: 0.09, s: 0.4, r: 0.02 }, legato: 0.7 } },
        { play: 'melody', rule: 'full',
          voice: { wave: 'sine', gain: 0.12, fm: { ratio: 1, index: 2.4 },
                   env: { a: 0.012, d: 0.2, s: 0.65, r: 0.06 }, vibrato: { rate: 6, cents: 14, delay: 0.18 } } },
        { play: 'chords', rule: 'offbeat', octave: 1,
          voice: { wave: 'square', gain: 0.03, env: { a: 0.001, d: 0.06, s: 0.3, r: 0.02 }, legato: 0.6 } },
        { play: 'drum', pattern: 'X . . . . . . x x . . . . . . .', fill: 'X . . . . . . x x . . . . x x x',
          voice: { wave: 'kick', freq: 170, gain: 0.45, env: { a: 0.001, d: 0.16, s: 0, r: 0.02 } } },
        { play: 'drum', pattern: '. . . . X . . . . . . . X . . .', fill: '. . . . X . . . . . . . X x X X',
          voice: { wave: 'noise', gain: 0.18, env: { a: 0.001, d: 0.11, s: 0, r: 0.02 },
                   filter: { type: 'bandpass', freq: 2200, q: 0.9 } } },
        { play: 'drum', pattern: 'x x X x x x X x x x X x x x X x',
          voice: { wave: 'noise', gain: 0.045, env: { a: 0.001, d: 0.03, s: 0, r: 0.01 },
                   filter: { type: 'highpass', freq: 8000, q: 0.7 } } }
      ],
      effects: { grit: 0.35 }
    },

    // 4 -- 1991 Super Nintendo: eight sampled channels and the echo.
    {
      name: 'Super Nintendo',
      about: 'The warm orchestral version: the melody on a soft brass, strings holding the chords, a plucked bass, and for the B section a marimba climbing the chords and a choir swelling in, all rounded off and ringing in the echo.',
      trait: 'Sampled orchestral instruments, a soft low-pass on the output and the built-in echo everyone remembers.',
      parts: [
        { play: 'melody', rule: 'full',
          voice: { wave: 'sawtooth', gain: 0.07, unison: [7],
                   env: { a: 0.035, d: 0.25, s: 0.75, r: 0.2 }, legato: 0.92,
                   filter: { type: 'lowpass', freq: 1700, q: 1.6 },
                   vibrato: { rate: 5, cents: 20, delay: 0.2 } } },
        { play: 'chords', rule: 'pad',
          voice: { wave: 'sawtooth', gain: 0.03, unison: [-9, 8],
                   env: { a: 0.3, d: 0.4, s: 0.8, r: 0.5 }, legato: 0.98,
                   filter: { type: 'lowpass', freq: 1400, q: 0.8 } } },
        { play: 'chords', rule: 'pad', octave: 1, sections: ['B'],
          voice: { wave: 'triangle', gain: 0.05, unison: [-6, 6],
                   env: { a: 0.45, d: 0.3, s: 0.85, r: 0.6 }, legato: 0.98,
                   filter: { type: 'lowpass', freq: 1900, q: 0.7 },
                   vibrato: { rate: 4.2, cents: 10, delay: 0.3 } } },
        { play: 'chords', rule: 'broken', octave: 1, sections: ['B'],
          voice: { wave: 'sine', gain: 0.07, env: { a: 0.002, d: 0.18, s: 0, r: 0.05 },
                   fm: { ratio: 4, index: 1.2 } } },
        { play: 'bass', rule: 'pizz',
          voice: { wave: 'triangle', gain: 0.24, env: { a: 0.004, d: 0.22, s: 0.2, r: 0.06 }, legato: 0.8,
                   filter: { type: 'lowpass', freq: 700, q: 0.7 } } },
        { play: 'drum', pattern: 'X . . . . . . . x . x . . . . .',
          voice: { wave: 'kick', freq: 120, gain: 0.28, env: { a: 0.002, d: 0.22, s: 0, r: 0.03 } } },
        { play: 'drum', pattern: '. . . . x . . . . . . . x . . .', fill: '. . . . x . . . . . . . x . x x',
          voice: { wave: 'noise', gain: 0.07, env: { a: 0.002, d: 0.16, s: 0, r: 0.05 },
                   filter: { type: 'bandpass', freq: 1600, q: 0.7 } } }
      ],
      effects: { lowpass: 5200, echo: { time: 0.23, feedback: 0.38, mix: 0.35 } }
    },

    // 5 -- 1995 PlayStation: the SPU's 24 voices of compressed samples, and
    // its hardware reverb.
    {
      name: 'PlayStation',
      about: 'Ambient techno: a soft four-on-the-floor under lush seventh-chord pads, squelchy off-beat stabs and a rolling bass, the melody on a smooth sampled lead, the whole mix breathing through a slow resonant filter sweep and washing out in reverb and a dotted-eighth delay.',
      trait: 'CD-era sequenced samples: a slightly grainy compressed edge, real chords for the first time, resonant filter sweeps and the SPU\'s built-in reverb.',
      parts: [
        { play: 'melody', rule: 'full',
          voice: { wave: 'triangle', gain: 0.085, unison: [6],
                   env: { a: 0.012, d: 0.3, s: 0.65, r: 0.25 }, legato: 0.9,
                   filter: { type: 'lowpass', freq: 3200, q: 0.9 },
                   vibrato: { rate: 5, cents: 10, delay: 0.25 } } },
        { play: 'chords', rule: 'pad', voicing: 'seventh',
          voice: { wave: 'sawtooth', gain: 0.03, unison: [-10, 10], spread: 0.6,
                   env: { a: 0.6, d: 0.5, s: 0.85, r: 0.8 }, legato: 0.98,
                   filter: { type: 'lowpass', freq: 1700, q: 0.8 } } },
        { play: 'chords', rule: 'rhythm', pattern: '. . x . . . x . . . x . . . x .',
          voice: { wave: 'sawtooth', gain: 0.03, env: { a: 0.001, d: 0.16, s: 0, r: 0.04 },
                   filter: { type: 'lowpass', freq: 3400, q: 9, sweep: { to: 380, time: 0.13 } } } },
        { play: 'bass', rule: 'octaves',
          voice: { wave: 'sawtooth', gain: 0.12, env: { a: 0.002, d: 0.1, s: 0.45, r: 0.03 }, legato: 0.8,
                   filter: { type: 'lowpass', freq: 900, q: 7, sweep: { to: 200, time: 0.11 } } } },
        { play: 'drum', pattern: 'X . . . x . . . X . . . x . . .',
          voice: { wave: 'kick', freq: 115, gain: 0.3, env: { a: 0.001, d: 0.2, s: 0, r: 0.02 } } },
        { play: 'drum', pattern: '. . x . . . x . . . x . . . x .', fill: '. . x . . . x . . . x . x x x x',
          voice: { wave: 'noise', gain: 0.04, pan: 0.3, env: { a: 0.001, d: 0.05, s: 0, r: 0.01 },
                   filter: { type: 'highpass', freq: 8500, q: 0.7 } } },
        { play: 'drum', pattern: '. . . . x . . . . . . . x . . .',
          voice: { wave: 'noise', gain: 0.06, pan: -0.2, env: { a: 0.001, d: 0.14, s: 0, r: 0.04 },
                   filter: { type: 'bandpass', freq: 1500, q: 0.8 } } }
      ],
      effects: { crush: 8, sweep: { freq: 2600, depth: 2100, bars: 4, q: 5 },
                 echo: { time: 0.34, feedback: 0.32, mix: 0.22 },
                 reverb: { seconds: 2.2, decay: 3, mix: 0.3 } }
    },

    // 6 -- 1996 Nintendo 64: samples squeezed onto a cartridge, played by the
    // RSP, so everything sounds muffled and bathed in reverb.
    {
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
    },

    // 7 -- 1998 Dreamcast: the AICA's 64 voices at full CD quality, and a
    // proper effects DSP.
    {
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
    },

    // 8 -- 2000 PlayStation 2: streamed film-score audio, wide and dark.
    {
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
    },

    // 9 -- 2001 Xbox: a PC sound chip in a box, streaming real recordings;
    // the soundtrack goes guitar.
    {
      name: 'Xbox',
      about: 'Drop-tuned rock: low palm-muted power-chord chugs double-tracked hard left and right, the melody screamed out on an overdriven lead guitar, a growling bass an octave down, a heavy kick and a cracking snare that rolls into each new section, with a crash to open it.',
      trait: 'A guitar amp in software: a saw through a heavy drive, power chords tuned down low, a heavy kick and snare and wide stereo.',
      parts: [
        { play: 'melody', rule: 'full',
          voice: { wave: 'sawtooth', gain: 0.055, drive: 0.6, env: { a: 0.004, d: 0.2, s: 0.8, r: 0.1 }, legato: 0.92,
                   filter: { type: 'lowpass', freq: 3600, q: 1 },
                   vibrato: { rate: 6.2, cents: 28, delay: 0.14 } } },
        // The riff double-tracked: two takes, one hard left and one hard right,
        // a few cents apart, so the chugs fill the sides and leave the middle
        // to the kick, the bass and the lead.
        { play: 'chords', rule: 'rhythm', voicing: 'power', octave: -1,
          pattern: 'X - x x X - x x X - x x X x X x', fill: 'X - x x X - x x X - X - X - X -',
          voice: { wave: 'sawtooth', gain: 0.11, unison: [-7], pan: -1, drive: 0.85,
                   env: { a: 0.002, d: 0.08, s: 0.55, r: 0.03 }, legato: 0.8,
                   filter: { type: 'lowpass', freq: 3000, q: 0.9 } } },
        { play: 'chords', rule: 'rhythm', voicing: 'power', octave: -1,
          pattern: 'X - x x X - x x X - x x X x X x', fill: 'X - x x X - x x X - X - X - X -',
          voice: { wave: 'sawtooth', gain: 0.11, unison: [8], pan: 1, drive: 0.85,
                   env: { a: 0.003, d: 0.08, s: 0.55, r: 0.03 }, legato: 0.78,
                   filter: { type: 'lowpass', freq: 2800, q: 0.9 } } },
        { play: 'bass', rule: 'eighths', octave: -1,
          voice: { wave: 'sawtooth', gain: 0.12, drive: 0.25, env: { a: 0.002, d: 0.1, s: 0.6, r: 0.03 }, legato: 0.85,
                   filter: { type: 'lowpass', freq: 520, q: 1 } } },
        { play: 'drum', pattern: 'X . . . . . x . X . x . . . . .', fill: 'X . . . . . x . X x X x X x X x',
          voice: { wave: 'kick', freq: 125, gain: 0.45, env: { a: 0.001, d: 0.14, s: 0, r: 0.02 } } },
        { play: 'drum', pattern: '. . . . X . . . . . . . X . . .', fill: '. . . . X . . . . . X . X X X X',
          voice: { wave: 'noise', gain: 0.2, env: { a: 0.001, d: 0.15, s: 0, r: 0.03 },
                   filter: { type: 'bandpass', freq: 1900, q: 0.8 } } },
        { play: 'drum', pattern: 'x . x . x . x . x . x . x . x .',
          voice: { wave: 'noise', gain: 0.04, pan: 0.45, env: { a: 0.001, d: 0.05, s: 0, r: 0.01 },
                   filter: { type: 'highpass', freq: 8000, q: 0.7 } } },
        { play: 'drum', pattern: '. . . . . . . . . . . . . . . .', open: 'X . . . . . . . . . . . . . . .',
          voice: { wave: 'noise', gain: 0.07, pan: -0.45, env: { a: 0.001, d: 1.0, s: 0, r: 0.1 },
                   filter: { type: 'highpass', freq: 4500, q: 0.5 } } }
      ],
      effects: { reverb: { seconds: 1, decay: 4, mix: 0.12 } }
    },

    // 10 -- 2005 Xbox 360: the big-room era; the soundtrack is a festival.
    {
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
    }
  ];

  // ============================================================ the numbers
  var MUSIC_DB = -12;          // the music, under the effects' master (0.5)
  var EFFECTS_MASTER = 0.5;    // src/sound.js's own master gain, for the sum above
  var DUCK = 0.55;             // a paddle hit drops the music to this share...
  var DUCK_BACK = 0.3;         // ...and lets it back over this many seconds
  var FADE_S = 1.5;            // the ring wipe's length (src/erachange.js WIPE_S)
  var LOOKAHEAD = 0.2;         // seconds of music booked ahead on each tick
  var TICK_MS = 50;            // how often the page's timer books more
  var RALLY_STEP = 0.012;      // each paddle hit in a rally: +1.2% tempo...
  var RALLY_MAX = 0.18;        // ...up to +18%

  var NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var PLAYS = { melody: 1, bass: 1, chords: 1, echo: 1, drum: 1 };
  var RULES = {
    melody: { full: 1, bones: 1, arp: 1 },
    bass: { held: 1, eighths: 1, octaves: 1, sixteenths: 1, pizz: 1 },
    chords: { pad: 1, arp: 1, offbeat: 1, broken: 1, rhythm: 1 }
  };
  var VOICINGS = { triad: 1, power: 1, seventh: 1, ninth: 1 };
  var SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };

  /** The theme's key as pitch classes: 'A minor' -> [9, 11, 0, 2, 4, 5, 7]. */
  function keyScale(theme) {
    var m = /^([A-G])([#b]?)\s+(major|minor)/i.exec(String(theme.key || 'C major'));
    var tonic = m ? noteMidi(m[1] + m[2] + '4') % 12 : 0;
    var steps = SCALES[m ? m[3].toLowerCase() : 'major'];
    return steps.map(function (s) { return (tonic + s) % 12; });
  }

  /** A chord (midis, root first) re-voiced: power chord, or the key's 7th / 9th stacked on. */
  function voiceChord(chord, voicing, theme) {
    if (!voicing || voicing === 'triad') return chord;
    var root = chord[0];
    if (voicing === 'power') return [root, root + 7, root + 12];
    var scale = keyScale(theme);
    var pc = ((root % 12) + 12) % 12;
    var idx = scale.indexOf(pc);
    if (idx === -1) return chord;   // a root outside the key: leave it plain
    function above(degree, floor) {
      var want = scale[(idx + degree) % 7];
      var m = root + ((want - pc + 12) % 12);
      while (m <= floor) m += 12;
      return m;
    }
    var out = chord.concat([above(6, root)]);
    if (voicing === 'ninth') out.push(above(1, root + 12));
    return out;
  }

  /** 'C#4' -> MIDI note number (A4 = 69); NaN for anything that is not a note. */
  function noteMidi(name) {
    var m = /^([A-G])([#b]?)(-?\d)$/.exec(String(name));
    if (!m) return NaN;
    var semi = NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return (Number(m[3]) + 1) * 12 + semi;
  }
  function midiFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
  function noteFreq(name) { return midiFreq(noteMidi(name)); }
  function dbToGain(db) { return Math.pow(10, db / 20); }

  /** One bar string -> `steps` entries: null, or { midis: [..], len, accent }. */
  function parseBar(bar) {
    var tokens = String(bar).trim().split(/\s+/);
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t === '.' || t === '-') { out.push(null); continue; }
      var len = 1;
      while (i + len < tokens.length && tokens[i + len] === '-') len += 1;
      var ev = { midis: [], len: len, accent: t === 'X' };
      if (t !== 'x' && t !== 'X') ev.midis = t.split('+').map(noteMidi);
      out.push(ev);
    }
    return out;
  }

  function sectionOf(bar, theme) {
    var names = Object.keys(theme.sections || {});
    for (var i = 0; i < names.length; i++) if (theme.sections[names[i]].indexOf(bar) !== -1) return names[i];
    return '';
  }
  function lastBarOfSection(bar, theme) {
    var s = sectionOf(bar, theme);
    var list = s ? theme.sections[s] : [];
    return list.length && list[list.length - 1] === bar;
  }
  function firstBarOfSection(bar, theme) {
    var s = sectionOf(bar, theme);
    return !!s && theme.sections[s][0] === bar;
  }

  /**
   * Theme + one arrangement -> the loop as notes: an array of THEME.steps *
   * THEME.bars steps, each a list of { part, voice, midis, len (steps), at
   * (fraction of a step), accent }. Pure data; the player books it.
   */
  function arrange(arr, theme) {
    theme = theme || THEME;
    var S = theme.steps, total = S * theme.bars;
    var out = [];
    for (var s = 0; s < total; s++) out.push([]);
    if (!arr) return out;
    var melody = theme.melody.map(parseBar);
    var chords = theme.chords.map(function (c) { return c.split('+').map(noteMidi); });
    var half = S / 2;
    var stolen = {};   // steps where a stealing drum sounds -> the part it steals

    function add(step, part, pi, midis, len, at, accent) {
      var sh = 12 * (part.octave || 0);
      var late = arr.swing && (step % 2) ? arr.swing : 0;   // the off-16ths, played late
      out[step % total].push({
        part: pi, voice: part.voice, midis: midis.map(function (m) { return m + sh; }),
        len: len, at: (at || 0) + late, accent: !!accent
      });
    }
    function inSection(part, bar) {
      return !part.sections || part.sections.indexOf(sectionOf(bar, theme)) !== -1;
    }
    function patternFor(part, bar) {
      if (part.fill && lastBarOfSection(bar, theme)) return part.fill;
      if (part.open && firstBarOfSection(bar, theme)) return part.open;
      return part.pattern;
    }

    arr.parts.forEach(function (part, pi) {
      for (var bar = 0; bar < theme.bars; bar++) {
        if (!inSection(part, bar)) continue;
        var b0 = bar * S;
        var chord = voiceChord(chords[bar], part.voicing, theme);
        if (part.play === 'melody' || part.play === 'echo') {
          var delay = part.play === 'echo' ? (part.delay || 3) : 0;
          if (part.rule === 'arp') {
            var asp = part.speed || 1, shp = part.shape || [0, 12, 7, 12];
            var cur = null, curEnd = 0, ti = 0;
            for (var mk = 0; mk < S; mk++) {
              var me = melody[bar][mk];
              if (me) { cur = me.midis[0]; curEnd = mk + me.len; ti = 0; }
              if (cur === null || mk >= curEnd) continue;
              for (var aj = 0; aj < asp; aj++) {
                add(b0 + mk + delay, part, pi, [cur + shp[ti++ % shp.length]], 1 / asp, aj / asp, !!me && aj === 0);
              }
            }
          } else if (part.rule === 'bones') {
            for (var h = 0; h < 2; h++) {
              for (var k = h * half; k < (h + 1) * half; k++) {
                var e = melody[bar][k];
                if (e) { add(b0 + h * half, part, pi, e.midis, 1, 0, false); break; }
              }
            }
          } else {
            melody[bar].forEach(function (e, k) {
              if (e) add(b0 + k + delay, part, pi, e.midis, e.len, 0, e.accent);
            });
          }
        } else if (part.play === 'bass') {
          for (var hb = 0; hb < 2; hb++) {
            var root = noteMidi(theme.bass[bar * 2 + hb]);
            var h0 = b0 + hb * half;
            if (part.rule === 'held') add(h0, part, pi, [root], half, 0, false);
            else if (part.rule === 'pizz') { for (var q = 0; q < half; q += 4) add(h0 + q, part, pi, [root], 1, 0, q === 0); }
            else if (part.rule === 'eighths') { for (var q2 = 0; q2 < half; q2 += 2) add(h0 + q2, part, pi, [root], 1, 0, false); }
            else if (part.rule === 'octaves') { for (var q3 = 0; q3 < half; q3 += 2) add(h0 + q3, part, pi, [root + (q3 % 4 ? 12 : 0)], 1, 0, false); }
            else if (part.rule === 'sixteenths') { for (var q4 = 0; q4 < half; q4++) add(h0 + q4, part, pi, [root + (q4 % 4 === 3 ? 12 : 0)], 1, 0, q4 % 4 === 0); }
          }
        } else if (part.play === 'chords') {
          if (part.rule === 'pad') add(b0, part, pi, chord, S, 0, false);
          else if (part.rule === 'offbeat') { for (var o = 2; o < S; o += 4) add(b0 + o, part, pi, chord, 1, 0, false); }
          else if (part.rule === 'broken') {
            var climb = chord.concat([chord[0] + 12]);
            for (var br = 0; br < S; br += 2) add(b0 + br, part, pi, [climb[(br / 2) % climb.length]], 2, 0, false);
          } else if (part.rule === 'arp') {
            var sp = part.speed || 2, tones = chord.concat([chord[0] + 12]), idx = 0;
            for (var st = 0; st < S; st++) {
              for (var j = 0; j < sp; j++) add(b0 + st, part, pi, [tones[idx++ % tones.length]], 1 / sp, j / sp, false);
            }
          } else if (part.rule === 'rhythm') {
            parseBar(patternFor(part, bar)).forEach(function (e, k) {
              if (e) add(b0 + k, part, pi, chord, e.len, 0, e.accent);
            });
          }
        } else if (part.play === 'drum') {
          var pat = parseBar(patternFor(part, bar));
          pat.forEach(function (e, k) {
            if (!e) return;
            add(b0 + k, part, pi, [], 1, 0, e.accent);
            if (part.steals) stolen[b0 + k] = part.steals;
          });
        }
      }
    });

    // A drum that steals a voice: the stolen part's notes starting under the
    // hit are dropped, and ones held across it are cut short there.
    var steps = Object.keys(stolen).map(Number);
    if (steps.length) {
      for (var s2 = 0; s2 < total; s2++) {
        out[s2] = out[s2].filter(function (ev) {
          var p = arr.parts[ev.part];
          if (p.play === 'drum') return true;
          for (var i = 0; i < steps.length; i++) {
            if (stolen[steps[i]] !== p.play) continue;
            var d = steps[i] - s2;
            if (d === 0) return false;
            if (d > 0 && d < ev.len) ev.len = d;
          }
          return true;
        });
      }
    }
    return out;
  }

  /** The table's own check, the one the suite runs: every problem, as sentences. */
  function themeProblems(theme) {
    theme = theme || THEME;
    var bad = [];
    if (!(theme.bpm > 0)) bad.push('the theme needs a bpm');
    if (theme.melody.length !== theme.bars) bad.push('melody has ' + theme.melody.length + ' bars, the theme ' + theme.bars);
    if (theme.chords.length !== theme.bars) bad.push('chords has ' + theme.chords.length + ' bars, the theme ' + theme.bars);
    if (theme.bass.length !== theme.bars * 2) bad.push('bass has ' + theme.bass.length + ' notes, want ' + theme.bars * 2);
    theme.melody.forEach(function (bar, i) {
      var n = String(bar).trim().split(/\s+/).length;
      if (n !== theme.steps) bad.push('melody bar ' + (i + 1) + ': ' + n + ' steps, want ' + theme.steps);
      parseBar(bar).forEach(function (e, k) {
        if (e && e.midis.some(function (m) { return !(m >= 0); })) bad.push('melody bar ' + (i + 1) + ' step ' + (k + 1) + ': not a note');
      });
    });
    theme.bass.concat(theme.chords.join('+').split('+')).forEach(function (n) {
      if (!(noteMidi(n) >= 0)) bad.push('not a note: ' + n);
    });
    return bad;
  }

  function arrangementProblems(arr, theme) {
    theme = theme || THEME;
    var bad = [];
    if (arr === null) return bad;
    if (!arr || !Array.isArray(arr.parts)) return ['not an arrangement'];
    arr.parts.forEach(function (p, i) {
      var tag = 'part ' + (i + 1) + ' (' + p.play + ')';
      if (!PLAYS[p.play]) bad.push(tag + ': unknown play');
      if (RULES[p.play] && !RULES[p.play][p.rule]) bad.push(tag + ': unknown rule ' + p.rule);
      if (!p.voice || !(p.voice.gain > 0) || !p.voice.wave) bad.push(tag + ': needs a voice with a wave and a gain');
      if (p.play === 'drum' || p.rule === 'rhythm') {
        if (p.pattern === undefined) bad.push(tag + ': needs a pattern');
        [p.pattern, p.fill, p.open].forEach(function (pat) {
          if (pat === undefined) return;
          var n = String(pat).trim().split(/\s+/).length;
          if (n !== theme.steps) bad.push(tag + ': a pattern of ' + n + ' steps, want ' + theme.steps);
        });
      }
      if (p.play === 'drum' && p.voice && p.voice.wave !== 'noise' && !(p.voice.freq > 0)) bad.push(tag + ': a pitched drum needs a freq');
      if (p.voicing && !VOICINGS[p.voicing]) bad.push(tag + ': unknown voicing ' + p.voicing);
      (p.sections || []).forEach(function (s) { if (!theme.sections[s]) bad.push(tag + ': no section ' + s); });
    });
    if (arr.detune && arr.detune.length !== 12) bad.push('detune needs 12 offsets');
    if (arr.swing !== undefined && !(arr.swing >= 0 && arr.swing < 0.5)) bad.push('swing is a share of a step under 0.5');
    return bad;
  }

  /** The arrangement an era plays, or null for silence (an empty slot). */
  function arrangementFor(era) {
    var n = Math.floor(Number(era));
    if (!(n >= 0)) n = 0;
    if (n >= ARRANGEMENTS.length) n = ARRANGEMENTS.length - 1;
    return ARRANGEMENTS[n] || null;
  }

  /** Seconds one step lasts, sped up by a rally of `rally` hits. */
  function stepSeconds(rally, theme) {
    theme = theme || THEME;
    var speed = 1 + Math.min(RALLY_MAX, Math.max(0, rally || 0) * RALLY_STEP);
    return (60 / (theme.bpm * speed)) * 4 / theme.steps;
  }

  /** ?music=off (or =0, =no, =false) keeps the soundtrack silent. */
  function offFromQuery(search) {
    var m = /[?&]music=([^&#]*)/.exec(String(search || ''));
    return !!m && /^(off|0|no|false)$/i.test(decodeURIComponent(m[1]));
  }

  // ============================================================= the player
  /**
   * opts.AudioContext overrides the browser's constructor (a test hands in a
   * recorder; null = no audio here). opts.off keeps it silent for good.
   */
  function createMusic(opts) {
    opts = opts || {};
    var AC = ('AudioContext' in opts)
      ? opts.AudioContext
      : (root.AudioContext || root.webkitAudioContext || null);
    var theme = opts.theme || THEME;
    var total = theme.steps * theme.bars;

    var ctx = null, master = null, duck = null, noiseBuf = null;
    var pulseWaves = {};
    var current = null;         // the arrangement playing: { era, arr, bus, fxIn, drones }
    var fading = [];            // arrangements fading out, each with `until`
    var lastTime = null;        // the game time whose events were last read
    var pos = 0;                // THE song position, in steps: shared by every era
    var nextTime = 0;           // audio time of step `pos`
    var rally = 0;

    var music = {
      off: !!opts.off,
      unlocked: false,
      available: false,
      muted: false,
      era: null,                // the era whose arrangement is playing
      scheduled: 0,             // notes booked on the audio clock
      crossfades: 0,
      ducks: 0,
      errors: 0,
      lastSwitch: null,         // { from, to, bar, step } of the latest era change
      unlock: unlock,
      update: update,
      toggleMute: toggleMute,
      setMuted: setMuted,
      position: function () { return { bar: Math.floor(pos / theme.steps), step: pos % theme.steps }; },
      tempo: function () { return Math.round(theme.bpm * (60 / theme.bpm * 4 / theme.steps) / stepSeconds(rally, theme) * 10) / 10; },
      audioState: function () { return ctx ? String(ctx.state) : 'none'; }
    };

    function level() { return EFFECTS_MASTER * dbToGain(MUSIC_DB); }

    /** Call from inside a click or keypress, like src/sound.js's unlock. */
    function unlock() {
      if (music.off) return false;
      if (music.unlocked) { resume(); return music.available; }
      music.unlocked = true;
      if (typeof AC !== 'function') return false;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = music.muted ? 0 : level();
        duck = ctx.createGain();
        duck.gain.value = 1;
        duck.connect(master);
        master.connect(ctx.destination);
        music.available = true;
        resume();
      } catch (e) {
        ctx = null; master = null; duck = null;
        music.errors += 1;
      }
      return music.available;
    }

    function resume() {
      try {
        if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
          var p = ctx.resume();
          if (p && typeof p.catch === 'function') p.catch(function () { music.errors += 1; });
        }
      } catch (e) { music.errors += 1; }
    }

    function setMuted(on) {
      music.muted = !!on;
      if (!master) return;
      try {
        var t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(music.muted ? 0 : level(), t + 0.05);
      } catch (e) { music.errors += 1; }
    }
    function toggleMute() { setMuted(!music.muted); return music.muted; }

    /**
     * The whole of the per-frame work, handed the real game: follow the era,
     * duck under a paddle hit, book the next LOOKAHEAD seconds. Plays nothing
     * on the title screen.
     */
    function update(game) {
      if (!ctx || !music.available || !game) return 0;
      try {
        if (game.phase === 'title') {
          // Back on the title screen (a finished match): the tune fades away.
          if (current) { fadeOut(current); current = null; music.era = null; }
          retireFaded();
          return 0;
        }
        var era = Math.max(0, Math.floor(game.era || 0));
        if (!current || current.era !== era) switchTo(era);
        if (game.time !== lastTime) {
          lastTime = game.time;
          var evs = game.events || [];
          for (var i = 0; i < evs.length; i++) if (evs[i] && evs[i].type === 'paddle') { duckNow(); break; }
        }
        rally = game.rally || 0;
        retireFaded();
        return book();
      } catch (e) {
        music.errors += 1;
        return 0;
      }
    }

    function duckNow() {
      var t = ctx.currentTime;
      duck.gain.cancelScheduledValues(t);
      duck.gain.setValueAtTime(DUCK, t);
      duck.gain.linearRampToValueAtTime(1, t + DUCK_BACK);
      music.ducks += 1;
    }

    /**
     * The era changed: the old arrangement fades out and the new one fades in
     * over the ring, both reading the SAME song position -- the tune goes on
     * at the bar and beat it had reached.
     */
    function switchTo(era) {
      var t = ctx.currentTime;
      var first = !current;
      if (first) nextTime = t + 0.05;
      if (current) { fadeOut(current); music.crossfades += 1; }
      var arr = arrangementFor(era);
      var bus = ctx.createGain();
      bus.gain.setValueAtTime(first ? 1 : 0.0001, t);
      if (!first) bus.gain.linearRampToValueAtTime(1, t + FADE_S);
      bus.connect(duck);
      music.lastSwitch = { from: current ? current.era : null, to: era,
                           bar: Math.floor(pos / theme.steps), step: pos % theme.steps };
      current = { era: era, arr: arr, bus: bus, fxIn: bus, drones: [], score: null };
      music.era = era;
      if (arr) {
        current.score = scoreOf(arr);
        if (arr.effects) current.fxIn = effectsChain(arr.effects, bus, current);
        if (arr.drone) startDrones(current);
      }
    }

    function fadeOut(track) {
      var t = ctx.currentTime;
      track.bus.gain.cancelScheduledValues(t);
      track.bus.gain.setValueAtTime(track.bus.gain.value, t);
      track.bus.gain.linearRampToValueAtTime(0.0001, t + FADE_S);
      track.until = t + FADE_S + 0.1;
      fading.push(track);
    }

    function scoreOf(arr) {
      if (!arr._score || arr._scoreTheme !== theme) { arr._score = arrange(arr, theme); arr._scoreTheme = theme; }
      return arr._score;
    }

    function retireFaded() {
      var t = ctx.currentTime;
      for (var i = fading.length - 1; i >= 0; i--) {
        if (t >= fading[i].until) {
          stopDrones(fading[i]);
          try { fading[i].bus.disconnect(); } catch (e) { /* already gone */ }
          fading.splice(i, 1);
        }
      }
    }

    /** Book every step inside the lookahead window, for every arrangement still sounding. */
    function book() {
      var horizon = ctx.currentTime + LOOKAHEAD;
      // A tab that slept past its window picks up at now, not in a burst.
      if (nextTime < ctx.currentTime - 0.25) nextTime = ctx.currentTime + 0.02;
      var booked = 0, guard = 0;
      while (nextTime < horizon && guard++ < 64) {
        var dt = stepSeconds(rally, theme);
        var tracks = [current].concat(fading);
        for (var k = 0; k < tracks.length; k++) {
          var tr = tracks[k];
          if (!tr || !tr.score || (tr.until && nextTime > tr.until)) continue;
          var list = tr.score[pos];
          for (var n = 0; n < list.length; n++) {
            note(list[n], tr.arr, nextTime + list[n].at * dt, dt, tr.fxIn);
            booked += 1;
          }
        }
        nextTime += dt;
        pos = (pos + 1) % total;
      }
      music.scheduled += booked;
      return booked;
    }

    /** One note (or chord, or hit) of one voice, at audio time t. */
    function note(ev, arr, t, stepDur, out) {
      var v = ev.voice;
      var accent = ev.accent ? 1.35 : 1;
      var hit = !ev.midis.length;
      var held = ev.len * stepDur * (v.legato || 0.85) * (ev.accent && hit ? 2 : 1);
      var env = v.env || { a: 0.005, d: 0.05, s: 0.7, r: 0.05 };
      var peak = v.gain * accent;
      var freqs = hit ? [v.freq || 1000] : ev.midis.map(function (m) {
        var f = midiFreq(m);
        return arr.detune ? f * Math.pow(2, arr.detune[((m % 12) + 12) % 12] / 1200) : f;
      });
      var beat = stepDur * theme.steps / 4;
      for (var i = 0; i < freqs.length; i++) {
        var end = t + held + (env.s > 0 ? env.r : env.d) + 0.03;
        // osc -> drive -> filter -> envelope -> pump -> pan -> the era's bus
        var g = ctx.createGain();
        shape(g.gain, t, held, peak / Math.sqrt(freqs.length), env);
        var tail = g;
        if (v.pump) {
          var pg = ctx.createGain();
          pumpShape(pg.gain, t, end, beat, v.pump);
          tail.connect(pg);
          tail = pg;
        }
        if (v.pan) tail = panned(tail, v.pan);
        tail.connect(out);
        var head = g;
        if (v.filter) {
          var flt = ctx.createBiquadFilter();
          flt.type = v.filter.type;
          flt.frequency.value = v.filter.freq;
          flt.Q.value = v.filter.q || 0.7;
          if (v.filter.sweep) {
            flt.frequency.setValueAtTime(v.filter.freq, t);
            flt.frequency.exponentialRampToValueAtTime(Math.max(20, v.filter.sweep.to), t + Math.max(0.01, v.filter.sweep.time));
          }
          if (v.filter.lfo) {
            var wob = ctx.createOscillator();
            wob.type = v.filter.lfo.wave || 'sine';
            wob.frequency.value = v.filter.lfo.perBeat / beat;
            var wd = ctx.createGain();
            wd.gain.value = v.filter.freq * v.filter.lfo.depth;
            wob.connect(wd);
            wd.connect(flt.frequency);
            wob.start(t);
            wob.stop(end);
          }
          flt.connect(head);
          head = flt;
        }
        if (v.drive) {
          var sh = ctx.createWaveShaper();
          sh.curve = driveCurve(v.drive);
          sh.connect(head);
          head = sh;
        }
        if (v.wave === 'noise') { noise(head, t, end); continue; }
        var layers = [0].concat(v.unison || []);
        for (var u = 0; u < layers.length; u++) {
          // spread: the unison layers alternate left and right (the centre layer stays put)
          var into = v.spread && u > 0 ? panned(null, (u % 2 ? -1 : 1) * v.spread, head) : head;
          osc(v, freqs[i], layers[u], into, t, held, end, layers.length);
        }
      }
    }

    /** A stereo panner after `from` (or before `to`); a context without one passes straight through. */
    function panned(from, pan, to) {
      if (typeof ctx.createStereoPanner !== 'function') return from || to;
      var p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      if (from) from.connect(p);
      if (to) p.connect(to);
      return p;
    }

    /** The side-chain pump: the gain dips on every beat and swells back, as if a kick pushed it. */
    function pumpShape(param, t, end, beat, depth) {
      param.setValueAtTime(1, t);
      for (var b = t, n = 0; b < end && n < 64; b += beat, n++) {
        param.setValueAtTime(Math.max(0.0001, 1 - depth), b);
        param.linearRampToValueAtTime(1, b + beat * 0.6);
      }
    }

    var driveCurves = {};
    /** An overdrive's transfer curve (a hard-ish tanh), cached per amount. */
    function driveCurve(amount) {
      if (driveCurves[amount]) return driveCurves[amount];
      var n = 1024, c = new Float32Array(n), k = 1 + amount * 30, norm = Math.tanh(k);
      for (var i = 0; i < n; i++) { var x = i * 2 / n - 1; c[i] = Math.tanh(k * x) / norm; }
      driveCurves[amount] = c;
      return c;
    }

    function shape(param, t, held, peak, env) {
      var a = Math.max(0.001, env.a);
      var sus = Math.max(0.0001, peak * env.s);
      param.setValueAtTime(0.0001, t);
      param.linearRampToValueAtTime(peak, t + a);
      if (env.s > 0) {
        var hold = Math.max(held, a + env.d);
        param.linearRampToValueAtTime(sus, t + a + Math.max(0.001, env.d));
        param.setValueAtTime(sus, t + hold);
        param.exponentialRampToValueAtTime(0.0001, t + hold + Math.max(0.005, env.r));
      } else {
        param.exponentialRampToValueAtTime(0.0001, t + a + Math.max(0.005, env.d));
      }
    }

    function osc(v, f, cents, into, t, held, end, layers) {
      var o = ctx.createOscillator();
      var wave = v.wave === 'kick' ? 'sine' : v.wave;
      var duty = { pulse12: 0.125, pulse25: 0.25, pulse50: 0.5 }[wave];
      if (duty) o.setPeriodicWave(pulse(duty));
      else o.type = wave;
      o.detune.value = cents;
      o.frequency.setValueAtTime(f, t);
      if (v.wave === 'kick') o.frequency.exponentialRampToValueAtTime(Math.max(20, f / 4), t + 0.12);
      var node = o;
      if (layers > 1) {
        var share = ctx.createGain();
        share.gain.value = 1 / Math.sqrt(layers);
        o.connect(share);
        node = share;
      }
      node.connect(into);
      if (v.vibrato) {
        var lfo = ctx.createOscillator();
        lfo.frequency.value = v.vibrato.rate;
        var depth = ctx.createGain();
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(v.vibrato.cents, t + (v.vibrato.delay || 0) + 0.1);
        lfo.connect(depth);
        depth.connect(o.detune);
        lfo.start(t);
        lfo.stop(end);
      }
      if (v.fm) {
        var mod = ctx.createOscillator();
        mod.frequency.setValueAtTime(f * v.fm.ratio, t);
        var dep = ctx.createGain();
        dep.gain.setValueAtTime(f * v.fm.index, t);
        dep.gain.exponentialRampToValueAtTime(Math.max(1, f * v.fm.index * 0.15), t + Math.max(0.02, held));
        mod.connect(dep);
        dep.connect(o.frequency);
        mod.start(t);
        mod.stop(end);
      }
      o.start(t);
      o.stop(end);
    }

    /** A pulse as a periodic wave: the NES pulse channel's duty cycles. */
    function pulse(duty) {
      if (pulseWaves[duty]) return pulseWaves[duty];
      var N = 32;
      var real = new Float32Array(N), imag = new Float32Array(N);
      for (var k = 1; k < N; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      pulseWaves[duty] = ctx.createPeriodicWave(real, imag);
      return pulseWaves[duty];
    }

    function noise(into, t, end) {
      if (!noiseBuf) {
        var len = Math.floor(ctx.sampleRate * 1);
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = noiseBuf.getChannelData(0);
        var seed = 1;   // a fixed sequence: the same hiss every session
        for (var i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; d[i] = seed / 1073741823.5 - 1; }
      }
      var src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.connect(into);
      src.start(t, (pos % 7) * 0.07);
      src.stop(end);
    }

    /**
     * An era's output chain, into its bus: grit (a soft clip), a low-pass
     * over the whole mix, then an echo and/or a reverb fed from after them.
     */
    function effectsChain(fx, bus, track) {
      var input = ctx.createGain();
      var node = input;
      if (fx.grit) {
        var shaper = ctx.createWaveShaper();
        var n = 1024, curve = new Float32Array(n), k = fx.grit * 20;
        for (var i = 0; i < n; i++) { var x = i * 2 / n - 1; curve[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
        shaper.curve = curve;
        node.connect(shaper);
        node = shaper;
      }
      if (fx.crush) {
        // Fewer amplitude steps: the grainy edge of compressed samples.
        var crusher = ctx.createWaveShaper();
        var cn = 2048, cc = new Float32Array(cn), lv = Math.pow(2, fx.crush) / 2;
        for (var ci = 0; ci < cn; ci++) cc[ci] = Math.round((ci * 2 / cn - 1) * lv) / lv;
        crusher.curve = cc;
        node.connect(crusher);
        node = crusher;
      }
      if (fx.lowpass) {
        var lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = fx.lowpass;
        lp.Q.value = 0.5;
        node.connect(lp);
        node = lp;
      }
      if (fx.sweep) {
        // A resonant low-pass whose cutoff rises and falls once every `bars` bars.
        var sw = ctx.createBiquadFilter();
        sw.type = 'lowpass';
        sw.frequency.value = fx.sweep.freq;
        sw.Q.value = fx.sweep.q || 6;
        var lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 1 / ((fx.sweep.bars || 4) * 4 * 60 / theme.bpm);
        var dep = ctx.createGain();
        dep.gain.value = Math.min(fx.sweep.depth, fx.sweep.freq - 40);
        lfo.connect(dep);
        dep.connect(sw.frequency);
        lfo.start(ctx.currentTime);
        if (track) track.drones.push(lfo);
        node.connect(sw);
        node = sw;
      }
      node.connect(bus);   // the dry path
      if (fx.echo) {
        var delay = ctx.createDelay(1.0);
        delay.delayTime.value = fx.echo.time;
        var fb = ctx.createGain();
        fb.gain.value = fx.echo.feedback;
        var ew = ctx.createGain();
        ew.gain.value = fx.echo.mix;
        node.connect(delay);
        delay.connect(fb);
        fb.connect(delay);
        delay.connect(ew);
        ew.connect(bus);
      }
      if (fx.reverb) {
        var conv = ctx.createConvolver();
        var sr = ctx.sampleRate, len = Math.floor(sr * fx.reverb.seconds);
        var ir = ctx.createBuffer(2, len, sr);
        var seed = 7;
        for (var ch = 0; ch < 2; ch++) {
          var d = ir.getChannelData(ch);
          for (var j = 0; j < len; j++) {
            seed = (seed * 16807) % 2147483647;
            d[j] = (seed / 1073741823.5 - 1) * Math.pow(1 - j / len, fx.reverb.decay);
          }
        }
        conv.buffer = ir;
        var wet = ctx.createGain();
        wet.gain.value = fx.reverb.mix;
        node.connect(conv);
        conv.connect(wet);
        wet.connect(bus);
      }
      return input;
    }

    function startDrones(track) {
      var t = ctx.currentTime;
      var list = track.arr.drone;
      for (var i = 0; i < list.length; i++) {
        var d = list[i];
        var o = ctx.createOscillator();
        o.type = d.wave;
        o.frequency.value = d.freq;
        var g = ctx.createGain();
        g.gain.value = d.gain;
        var head = o;
        if (d.filter) {
          var flt = ctx.createBiquadFilter();
          flt.type = d.filter.type;
          flt.frequency.value = d.filter.freq;
          flt.Q.value = d.filter.q || 0.7;
          o.connect(flt);
          head = flt;
        }
        head.connect(g);
        g.connect(track.bus);
        var nodes = [o];
        if (d.wobble) {
          var lfo = ctx.createOscillator();
          lfo.frequency.value = d.wobble.rate;
          var depth = ctx.createGain();
          depth.gain.value = d.gain * d.wobble.depth;
          lfo.connect(depth);
          depth.connect(g.gain);
          lfo.start(t);
          nodes.push(lfo);
        }
        o.start(t);
        track.drones = track.drones.concat(nodes);
        music.scheduled += 1;
      }
    }

    function stopDrones(track) {
      for (var i = 0; i < track.drones.length; i++) {
        try { track.drones[i].stop(); } catch (e) { /* already stopped */ }
      }
      track.drones = [];
    }

    return music;
  }

  // =========================================================== in the page
  /**
   * The page's wiring, so src/main.js needs no music code: the same click, key
   * or tap that starts the game (and unlocks src/sound.js) unlocks this; M
   * mutes; a timer and every animation frame book the next notes -- the timer
   * only BOOKS, on the audio clock, so a late tick never makes a late note.
   */
  function attachToPage(win) {
    var music = createMusic({ off: offFromQuery(win.location && win.location.search) });
    win.__pongMusic = music;
    function tick() { music.update(win.__pong || null); }
    function gesture() { if (music.unlock()) tick(); }
    win.addEventListener('keydown', function (e) {
      if (e && (e.key === 'm' || e.key === 'M') && !e.repeat && music.unlocked) { music.toggleMute(); return; }
      gesture();
    });
    win.addEventListener('mousedown', gesture);
    win.addEventListener('touchstart', gesture);
    if (typeof win.setInterval === 'function') win.setInterval(tick, TICK_MS);
    if (typeof win.requestAnimationFrame === 'function') {
      (function frame() { tick(); win.requestAnimationFrame(frame); })();
    }
    return music;
  }

  return {
    THEME: THEME,
    ARRANGEMENTS: ARRANGEMENTS,
    MUSIC_DB: MUSIC_DB,
    FADE_S: FADE_S,
    LOOKAHEAD: LOOKAHEAD,
    noteMidi: noteMidi,
    noteFreq: noteFreq,
    parseBar: parseBar,
    keyScale: keyScale,
    voiceChord: voiceChord,
    arrange: arrange,
    themeProblems: themeProblems,
    arrangementProblems: arrangementProblems,
    arrangementFor: arrangementFor,
    stepSeconds: stepSeconds,
    offFromQuery: offFromQuery,
    createMusic: createMusic,
    attachToPage: attachToPage
  };
});
