/*
 * Super Ultra Pong 64: Remastered -- the soundtrack.
 *
 * Every era plays a looping tune in the voice of the machine on screen, all of
 * it synthesised here with the Web Audio API: no audio files, no dependencies.
 * The 1972 arcade has no music at all -- only the cabinet humming and the
 * fluorescent tube over it buzzing -- the Atari plays a two-voice square loop,
 * the NES a three-channel chiptune, the Genesis an FM groove with punchy drums
 * and the Super Nintendo a warm pad tune in a reverberant room.
 *
 * Two halves, kept apart like src/sound.js:
 *   - SONGS is plain data, one row per era, so a stranger adds an era's loop
 *     without reading the player. Rows 5 to 10 are empty slots.
 *   - createMusic() turns a row into notes scheduled AHEAD on the audio clock
 *     (a lookahead scheduler: each tick books every step that starts in the
 *     next LOOKAHEAD seconds at its exact audio time; no timer ever fires a
 *     note). It READS the game and never writes it.
 *
 * It rides the sound effects' first-click unlock: the same click or key that
 * starts the game opens the music's audio (browsers refuse sound before a
 * gesture). src/sound.js is untouched; the music sits MUSIC_DB under the
 * effects and ducks a touch on every paddle hit. At an era change the old
 * loop fades out and the new one fades in over the ring wipe; the tempo
 * climbs a little as a rally goes on; the M key mutes; ?music=off keeps it
 * silent (the playtest's quiet switch).
 *
 * UMD like src/game.js: window.PongMusic in the page, require() under node.
 * In the page it attaches itself (see the foot of the file), so the loop in
 * src/main.js carries no music code at all.
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

  // ------------------------------------------------------------- the format
  //
  // A SONG (one per era; null = an empty slot, played as silence):
  //   name     the machine, for people reading the table
  //   about    one sentence on what it sounds like
  //   bpm      tempo in beats a minute (a bar is four beats)
  //   steps    steps in one bar (16 = sixteenth notes)
  //   bars     bars in the loop
  //   voices   { trackName: VOICE }  -- the instruments
  //   tracks   { trackName: [ bar, bar, ... ] }  -- exactly `bars` strings,
  //            each exactly `steps` space-separated tokens:
  //              C4 F#3 Bb5  a note (sharps '#', flats 'b', octave 0-8)
  //              D4+F#4+A4   a chord, every note on the same voice
  //              x           a hit, for a voice with no pitch of its own
  //              X           an accented hit or note: louder and twice as long
  //              -           hold the note before for one more step
  //              .           rest
  //   effects  optional { reverb: { seconds, decay, mix },
  //                       echo:   { time, feedback, mix } }
  //   drone    optional [ DRONE ] -- sounds that run under the loop the whole
  //            time the era is on (the arcade's hum); a song may be all drone
  //
  // A VOICE:
  //   wave     'square' | 'triangle' | 'sine' | 'sawtooth'
  //            | 'pulse25' | 'pulse12' (the NES pulse channel's narrow duties)
  //            | 'noise'  (white noise through the voice's filter)
  //            | 'kick'   (a sine dropping from freq to freq/4: a drum)
  //   freq     Hz, for 'x' hits on a voice with no pitch of its own
  //   gain     peak loudness, 0..1, on the same scale as src/sound.js
  //   env      { a, d, s, r }: attack, decay seconds; sustain level 0..1 of
  //            gain; release seconds after the note ends
  //   legato   fraction of its steps a note holds before release (default 0.85)
  //   detune   optional cents for the whole voice (the Atari's coarse pitch)
  //   unison   optional [cents, ...]: one extra oscillator per entry (a pad)
  //   octave   optional, shifts every note by whole octaves
  //   filter   optional { type: 'lowpass'|'highpass'|'bandpass', freq, q }
  //   fm       optional { ratio, index }: a sine modulator at freq * ratio
  //            swinging the carrier by freq * index Hz, decaying over the note
  //   vibrato  optional { rate, cents, delay }
  //
  // A DRONE: { wave, freq, gain, filter?, wobble?: { rate, depth } } -- wobble
  // swings its loudness by `depth` of gain, `rate` times a second (flicker).

  var SONGS = [
    // 0 -- 1972 arcade. No music: the board had none. The cabinet's mains hum
    // and the tube light over the machine, faint enough to be felt, not heard.
    {
      name: '1972 arcade',
      about: 'No tune at all: the low 60-cycle hum of the cabinet and the thin, flickering buzz of a fluorescent tube overhead.',
      bpm: 0, steps: 0, bars: 0, voices: {}, tracks: {},
      drone: [
        { wave: 'sine', freq: 60, gain: 0.07 },
        { wave: 'sine', freq: 120, gain: 0.035 },
        { wave: 'sawtooth', freq: 120, gain: 0.02,
          filter: { type: 'bandpass', freq: 3100, q: 6 }, wobble: { rate: 7.3, depth: 0.5 } }
      ]
    },

    // 1 -- 1977 Atari 2600. The TIA's two square channels and nothing else,
    // each pitch a little off true, the way the chip's coarse dividers were.
    {
      name: 'Atari 2600',
      about: 'Two slightly sour square waves: a stubborn little A-minor riff over a thumping one-note bass, like a cartridge title screen.',
      bpm: 128, steps: 16, bars: 2,
      voices: {
        lead: { wave: 'square', gain: 0.1, detune: -22, env: { a: 0.002, d: 0.05, s: 0.7, r: 0.02 }, legato: 0.8 },
        bass: { wave: 'square', gain: 0.09, detune: 14, env: { a: 0.002, d: 0.08, s: 0.5, r: 0.02 }, legato: 0.6 }
      },
      tracks: {
        lead: [
          'A4 . . A4 C5 . A4 . G4 . E4 . G4 - . .',
          'A4 . . A4 C5 . D5 . E5 . D5 . C5 - . .'
        ],
        bass: [
          'A2 . A2 . A2 . A2 . G2 . G2 . G2 . G2 .',
          'F2 . F2 . F2 . F2 . E2 . E2 . E2 . E2 .'
        ]
      }
    },

    // 2 -- 1985 NES. Three channels: the narrow pulse for the melody, the
    // triangle for the bass, the noise channel for the hats.
    {
      name: 'NES',
      about: 'A bright three-channel chiptune in C: a narrow-pulse hero melody, a bouncing triangle bass in octaves and ticking noise hats.',
      bpm: 150, steps: 16, bars: 4,
      voices: {
        lead: { wave: 'pulse25', gain: 0.1, env: { a: 0.002, d: 0.06, s: 0.75, r: 0.03 },
                vibrato: { rate: 5.5, cents: 18, delay: 0.14 } },
        bass: { wave: 'triangle', gain: 0.24, env: { a: 0.002, d: 0.02, s: 1, r: 0.01 }, legato: 0.9 },
        hats: { wave: 'noise', gain: 0.07, env: { a: 0.001, d: 0.04, s: 0, r: 0.01 },
                filter: { type: 'highpass', freq: 7000, q: 0.7 } }
      },
      tracks: {
        lead: [
          'E5 . G5 . C6 - - . B5 . G5 . E5 - D5 .',
          'C5 . D5 . E5 . G5 . A5 - G5 . E5 - - .',
          'F5 . A5 . C6 - - . B5 . A5 . G5 - E5 .',
          'D5 . E5 . F5 . D5 . G5 - - - . . . .'
        ],
        bass: [
          'C3 . C4 . C3 . C4 . E3 . E4 . E3 . E4 .',
          'A2 . A3 . A2 . A3 . E3 . E4 . E3 . E4 .',
          'F2 . F3 . F2 . F3 . C3 . C4 . C3 . C4 .',
          'G2 . G3 . G2 . G3 . G2 . G3 . B2 . D3 .'
        ],
        hats: [
          'x . x . X . x . x . x . X . x x',
          'x . x . X . x . x . x . X . x x',
          'x . x . X . x . x . x . X . x x',
          'x . x . X . x . x x X x X x X X'
        ]
      }
    },

    // 3 -- 1989 Genesis. The YM2612: a growling two-operator slap bass, a
    // brassy FM lead, and the punchy kick and snare the console was known for.
    {
      name: 'Genesis',
      about: 'An FM groove in E minor: a growling slap bass, a metallic brassy lead on top, and a punchy kick-and-snare with a busy hi-hat.',
      bpm: 138, steps: 16, bars: 4,
      voices: {
        bass: { wave: 'sine', gain: 0.26, fm: { ratio: 1, index: 3.2 },
                env: { a: 0.002, d: 0.12, s: 0.45, r: 0.04 }, legato: 0.8 },
        lead: { wave: 'sine', gain: 0.12, fm: { ratio: 2, index: 1.6 },
                env: { a: 0.01, d: 0.2, s: 0.6, r: 0.06 }, vibrato: { rate: 6, cents: 14, delay: 0.18 } },
        kick: { wave: 'kick', freq: 170, gain: 0.5, env: { a: 0.001, d: 0.16, s: 0, r: 0.02 } },
        snare: { wave: 'noise', gain: 0.2, env: { a: 0.001, d: 0.11, s: 0, r: 0.02 },
                 filter: { type: 'bandpass', freq: 2200, q: 0.9 } },
        hat: { wave: 'noise', gain: 0.05, env: { a: 0.001, d: 0.03, s: 0, r: 0.01 },
               filter: { type: 'highpass', freq: 8000, q: 0.7 } }
      },
      tracks: {
        bass: [
          'E2 . E2 E3 . E2 . D3 . E2 . E3 E2 . G2 A2',
          'C2 . C2 C3 . C2 . B2 . C2 . C3 D2 . D3 D2',
          'E2 . E2 E3 . E2 . D3 . E2 . E3 E2 . G2 A2',
          'B1 . B1 B2 . B1 . A2 . B1 . B2 D2 . F#2 A2'
        ],
        lead: [
          'B4 - . E5 - . G5 . F#5 - E5 . D5 . E5 -',
          'G5 - - . E5 . C5 . D5 - - . B4 . . .',
          'B4 - . E5 - . G5 . A5 - B5 . A5 . G5 -',
          'F#5 - - - . . D#5 . F#5 . B5 - - - . .'
        ],
        kick: [
          'X . . . . . . x x . . . . . . .',
          'X . . . . . . x x . . . . . x .',
          'X . . . . . . x x . . . . . . .',
          'X . . . . . . x x . . . . x x x'
        ],
        snare: [
          '. . . . X . . . . . . . X . . .',
          '. . . . X . . . . . . . X . . x',
          '. . . . X . . . . . . . X . . .',
          '. . . . X . . . . . . . X x X X'
        ],
        hat: [
          'x x X x x x X x x x X x x x X x',
          'x x X x x x X x x x X x x x X x',
          'x x X x x x X x x x X x x x X x',
          'x x X x x x X x x x X x . . . .'
        ]
      }
    },

    // 4 -- 1991 Super Nintendo. The S-SMP's sampled instruments and its echo
    // DSP: a detuned string pad, a soft flute-like lead with vibrato, a round
    // bass, gentle drums, all of it in a hall.
    {
      name: 'Super Nintendo',
      about: 'A warm, unhurried D-major tune: a lush detuned string pad, a breathy vibrato lead singing over it, a round bass and soft drums, all in a big reverberant hall.',
      bpm: 96, steps: 16, bars: 4,
      voices: {
        pad: { wave: 'sawtooth', gain: 0.035, unison: [-9, 8, 0],
               env: { a: 0.35, d: 0.4, s: 0.8, r: 0.6 }, legato: 0.98,
               filter: { type: 'lowpass', freq: 1500, q: 0.8 } },
        lead: { wave: 'triangle', gain: 0.17, unison: [6],
                env: { a: 0.04, d: 0.2, s: 0.7, r: 0.25 }, legato: 0.92,
                filter: { type: 'lowpass', freq: 2600, q: 1 },
                vibrato: { rate: 5, cents: 22, delay: 0.2 } },
        bass: { wave: 'triangle', gain: 0.24,
                env: { a: 0.01, d: 0.3, s: 0.6, r: 0.1 }, legato: 0.9,
                filter: { type: 'lowpass', freq: 600, q: 0.7 } },
        kick: { wave: 'kick', freq: 120, gain: 0.3, env: { a: 0.002, d: 0.22, s: 0, r: 0.03 } },
        snare: { wave: 'noise', gain: 0.08, env: { a: 0.002, d: 0.16, s: 0, r: 0.05 },
                 filter: { type: 'bandpass', freq: 1600, q: 0.7 } }
      },
      effects: { reverb: { seconds: 2.4, decay: 2.6, mix: 0.45 } },
      tracks: {
        pad: [
          'D4+F#4+A4 - - - - - - - - - - - - - - -',
          'B3+D4+F#4 - - - - - - - - - - - - - - -',
          'G3+B3+D4 - - - - - - - - - - - - - - -',
          'A3+C#4+E4 - - - - - - - - - - - - - - -'
        ],
        lead: [
          'A5 - - F#5 . . E5 . D5 - - - E5 . F#5 .',
          'F#5 - - D5 . . B4 . D5 - - - . . . .',
          'G5 - - F#5 . . E5 . D5 - - B4 . D5 - .',
          'E5 - - - - - . . C#5 - E5 - A5 - - -'
        ],
        bass: [
          'D2 - - - . . D3 . D2 - - - A2 . . .',
          'B1 - - - . . B2 . B1 - - - F#2 . . .',
          'G1 - - - . . G2 . G1 - - - D2 . . .',
          'A1 - - - . . A2 . A1 - - - E2 . C#2 .'
        ],
        kick: [
          'X . . . . . . . x . x . . . . .',
          'X . . . . . . . x . x . . . . .',
          'X . . . . . . . x . x . . . . .',
          'X . . . . . . . x . x . . . x .'
        ],
        snare: [
          '. . . . x . . . . . . . x . . .',
          '. . . . x . . . . . . . x . . .',
          '. . . . x . . . . . . . x . . .',
          '. . . . x . . . . . . . x . x x'
        ]
      }
    },

    // 5 to 10 -- the 3D table, PlayStation to Xbox 360. Empty slots: the next
    // card fills each one with a row in the format above. Until then an empty
    // slot plays nothing (the effects still sound).
    null, // 5 PlayStation
    null, // 6 Nintendo 64
    null, // 7 Dreamcast
    null, // 8 PlayStation 2
    null, // 9 Xbox
    null  // 10 Xbox 360
  ];

  // ------------------------------------------------------------ the numbers
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

  /** 'C#4' -> Hz (A4 = 440). NaN for anything that is not a note. */
  function noteFreq(name) {
    var m = /^([A-G])([#b]?)(-?\d)$/.exec(String(name));
    if (!m) return NaN;
    var semi = NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    var midi = (Number(m[3]) + 1) * 12 + semi;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function dbToGain(db) { return Math.pow(10, db / 20); }

  /**
   * One bar string -> an array of `steps` events: null (rest or hold) or
   * { freqs: [Hz...] (empty for a bare hit), len: steps held, accent }.
   */
  function parseBar(bar, steps) {
    var tokens = String(bar).trim().split(/\s+/);
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t === '.' || t === '-') { out.push(null); continue; }
      var len = 1;
      while (i + len < tokens.length && tokens[i + len] === '-') len += 1;
      var ev = { freqs: [], len: len, accent: t === 'X' };
      if (t !== 'x' && t !== 'X') {
        var parts = t.split('+');
        for (var p = 0; p < parts.length; p++) ev.freqs.push(noteFreq(parts[p]));
      }
      out.push(ev);
    }
    return out;
  }

  /**
   * The table's own check, the one the suite runs: every problem in a song
   * row, as sentences. Empty means the row plays.
   */
  function songProblems(song) {
    var bad = [];
    if (song === null) return bad;
    if (!song || typeof song !== 'object') return ['not a song'];
    var tracks = song.tracks || {};
    var names = Object.keys(tracks);
    if (names.length && !(song.bpm > 0)) bad.push('a song with tracks needs a bpm');
    for (var n = 0; n < names.length; n++) {
      var name = names[n];
      var v = song.voices && song.voices[name];
      if (!v) { bad.push(name + ': no voice'); continue; }
      var bars = tracks[name];
      if (!Array.isArray(bars) || bars.length !== song.bars) {
        bad.push(name + ': ' + (bars && bars.length) + ' bars, the song has ' + song.bars);
        continue;
      }
      for (var b = 0; b < bars.length; b++) {
        var tokens = String(bars[b]).trim().split(/\s+/);
        if (tokens.length !== song.steps) {
          bad.push(name + ' bar ' + (b + 1) + ': ' + tokens.length + ' steps, the song has ' + song.steps);
        }
        var evs = parseBar(bars[b], song.steps);
        for (var e = 0; e < evs.length; e++) {
          if (!evs[e]) continue;
          for (var f = 0; f < evs[e].freqs.length; f++) {
            if (!(evs[e].freqs[f] > 0)) bad.push(name + ' bar ' + (b + 1) + ' step ' + (e + 1) + ': not a note');
          }
          if (!evs[e].freqs.length && !(v.freq > 0) && v.wave !== 'noise') {
            bad.push(name + ' bar ' + (b + 1) + ' step ' + (e + 1) + ': a hit on a voice with no freq');
          }
        }
      }
    }
    return bad;
  }

  /** The song an era plays, or null for silence (an empty slot, or off the table). */
  function songFor(era) {
    var n = Math.floor(Number(era));
    if (!(n >= 0)) n = 0;
    if (n >= SONGS.length) n = SONGS.length - 1;
    return SONGS[n] || null;
  }

  /** Seconds one step lasts at this song's tempo, sped up by a rally of `rally` hits. */
  function stepSeconds(song, rally) {
    var speed = 1 + Math.min(RALLY_MAX, Math.max(0, rally || 0) * RALLY_STEP);
    return (60 / (song.bpm * speed)) * 4 / song.steps;
  }

  /** ?music=off (or =0, =no) keeps the soundtrack silent. */
  function offFromQuery(search) {
    var m = /[?&]music=([^&#]*)/.exec(String(search || ''));
    return !!m && /^(off|0|no|false)$/i.test(decodeURIComponent(m[1]));
  }

  // ------------------------------------------------------------- the player
  /**
   * opts.AudioContext overrides the browser's constructor (a test hands in a
   * recorder; null = no audio here). opts.off keeps it silent for good.
   */
  function createMusic(opts) {
    opts = opts || {};
    var AC = ('AudioContext' in opts)
      ? opts.AudioContext
      : (root.AudioContext || root.webkitAudioContext || null);

    var ctx = null, master = null, duck = null, noiseBuf = null;
    var pulseWaves = {};
    var current = null;         // the playing track: { era, song, bus, step, nextTime, drones, fx }
    var fading = [];            // tracks fading out over the ring
    var lastTime = null;        // the game time whose events were last read

    var music = {
      off: !!opts.off,
      unlocked: false,
      available: false,
      muted: false,
      era: null,                // the era whose loop is playing
      scheduled: 0,             // notes booked on the audio clock
      crossfades: 0,
      ducks: 0,
      errors: 0,
      unlock: unlock,
      update: update,
      toggleMute: toggleMute,
      setMuted: setMuted,
      tempo: function () { return current && current.song ? 60 / stepSeconds(current.song, current.rally) / (current.song.steps / 4) : 0; },
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
     * The whole of the per-frame work, called with the real game: follow the
     * era, read the step's events for a hit to duck under, book the next
     * LOOKAHEAD seconds of notes. Plays nothing on the title screen.
     */
    function update(game) {
      if (!ctx || !music.available || !game || game.phase === 'title') return 0;
      try {
        var era = Math.max(0, Math.floor(game.era || 0));
        if (!current || current.era !== era) switchTo(era);
        if (game.time !== lastTime) {
          lastTime = game.time;
          var evs = game.events || [];
          for (var i = 0; i < evs.length; i++) if (evs[i] && evs[i].type === 'paddle') { duckNow(); break; }
        }
        if (current) current.rally = game.rally || 0;
        retireFaded();
        return current ? book(current) : 0;
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

    /** The era changed: fade the old loop out and the new one in, over the ring. */
    function switchTo(era) {
      var t = ctx.currentTime;
      var first = !current;
      if (current) {
        current.bus.gain.cancelScheduledValues(t);
        current.bus.gain.setValueAtTime(current.bus.gain.value, t);
        current.bus.gain.linearRampToValueAtTime(0.0001, t + FADE_S);
        current.until = t + FADE_S + 0.1;
        fading.push(current);
        music.crossfades += 1;
      }
      var song = songFor(era);
      var bus = ctx.createGain();
      bus.gain.setValueAtTime(first ? 1 : 0.0001, t);
      if (!first) bus.gain.linearRampToValueAtTime(1, t + FADE_S);
      bus.connect(duck);
      current = { era: era, song: song, bus: bus, step: 0, nextTime: t + 0.05, drones: [], rally: 0, fxIn: bus };
      music.era = era;
      if (song && song.effects) current.fxIn = effectsChain(song.effects, bus);
      if (song && song.drone) startDrones(current);
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

    /** Book every step that starts inside the lookahead window. */
    function book(track) {
      var song = track.song;
      if (!song || !(song.bpm > 0) || !song.steps || !song.bars) return 0;
      var horizon = ctx.currentTime + LOOKAHEAD;
      // A tab that slept past its window restarts the loop at now, not in a burst.
      if (track.nextTime < ctx.currentTime - 0.25) track.nextTime = ctx.currentTime + 0.02;
      var booked = 0;
      while (track.nextTime < horizon && booked < 64) {
        var dt = stepSeconds(song, track.rally);
        var total = song.steps * song.bars;
        var s = track.step % total;
        var bar = Math.floor(s / song.steps);
        var inBar = s % song.steps;
        var names = Object.keys(song.tracks);
        for (var n = 0; n < names.length; n++) {
          var parsed = parsedTrack(song, names[n]);
          var ev = parsed[bar] && parsed[bar][inBar];
          if (ev) {
            note(song.voices[names[n]], ev, track.nextTime, dt, track.fxIn);
            booked += 1;
          }
        }
        track.nextTime += dt;
        track.step = (track.step + 1) % total;
      }
      music.scheduled += booked;
      return booked;
    }

    function parsedTrack(song, name) {
      if (!song._parsed) song._parsed = {};
      if (!song._parsed[name]) {
        song._parsed[name] = song.tracks[name].map(function (b) { return parseBar(b, song.steps); });
      }
      return song._parsed[name];
    }

    /** One note (or chord, or hit) of one voice, at audio time t. */
    function note(v, ev, t, stepDur, out) {
      var accent = ev.accent ? 1.35 : 1;
      var held = ev.len * stepDur * (v.legato || 0.85) * (ev.accent && !ev.freqs.length ? 2 : 1);
      var env = v.env || { a: 0.005, d: 0.05, s: 0.7, r: 0.05 };
      var peak = v.gain * accent;
      var freqs = ev.freqs.length ? ev.freqs : [v.freq || 1000];
      var oct = Math.pow(2, v.octave || 0);
      for (var i = 0; i < freqs.length; i++) {
        var f = freqs[i] * oct;
        var g = ctx.createGain();
        shape(g.gain, t, held, peak / Math.sqrt(freqs.length), env);
        var head = g;
        if (v.filter) {
          var flt = ctx.createBiquadFilter();
          flt.type = v.filter.type;
          flt.frequency.value = v.filter.freq;
          flt.Q.value = v.filter.q || 0.7;
          flt.connect(g);
          head = flt;
        }
        g.connect(out);
        var end = t + held + env.r + 0.02;
        if (v.wave === 'noise') { noise(head, t, end); continue; }
        var layers = [0].concat(v.unison || []);
        for (var u = 0; u < layers.length; u++) {
          osc(v, f, layers[u], head, t, held, end, layers.length);
        }
      }
    }

    function shape(param, t, held, peak, env) {
      var a = Math.max(0.001, env.a);
      var sus = Math.max(0.0001, peak * env.s);
      param.setValueAtTime(0.0001, t);
      param.linearRampToValueAtTime(peak, t + a);
      if (env.s > 0) {
        param.linearRampToValueAtTime(sus, t + a + Math.max(0.001, env.d));
        param.setValueAtTime(sus, t + Math.max(held, a + env.d));
        param.exponentialRampToValueAtTime(0.0001, t + Math.max(held, a + env.d) + Math.max(0.005, env.r));
      } else {
        param.exponentialRampToValueAtTime(0.0001, t + a + Math.max(0.005, env.d));
      }
    }

    function osc(v, f, cents, into, t, held, end, layers) {
      var o = ctx.createOscillator();
      var wave = v.wave === 'kick' ? 'sine' : v.wave;
      if (wave === 'pulse25' || wave === 'pulse12') o.setPeriodicWave(pulse(wave === 'pulse25' ? 0.25 : 0.125));
      else o.type = wave;
      o.detune.value = (v.detune || 0) + cents;
      if (v.wave === 'kick') {
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f / 4), t + 0.12);
      } else {
        o.frequency.setValueAtTime(f, t);
      }
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

    /** A narrow pulse as a periodic wave: the NES pulse channel's duty cycles. */
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
      src.start(t, Math.random() * 0.5);
      src.stop(end);
    }

    /** Reverb (a generated impulse through a convolver) and echo, into the bus. */
    function effectsChain(fx, bus) {
      var input = ctx.createGain();
      input.connect(bus);   // the dry path
      if (fx.reverb) {
        var conv = ctx.createConvolver();
        var sr = ctx.sampleRate, len = Math.floor(sr * fx.reverb.seconds);
        var ir = ctx.createBuffer(2, len, sr);
        var seed = 7;
        for (var ch = 0; ch < 2; ch++) {
          var d = ir.getChannelData(ch);
          for (var i = 0; i < len; i++) {
            seed = (seed * 16807) % 2147483647;
            d[i] = (seed / 1073741823.5 - 1) * Math.pow(1 - i / len, fx.reverb.decay);
          }
        }
        conv.buffer = ir;
        var wet = ctx.createGain();
        wet.gain.value = fx.reverb.mix;
        input.connect(conv);
        conv.connect(wet);
        wet.connect(bus);
      }
      if (fx.echo) {
        var delay = ctx.createDelay(1.0);
        delay.delayTime.value = fx.echo.time;
        var fb = ctx.createGain();
        fb.gain.value = fx.echo.feedback;
        var ew = ctx.createGain();
        ew.gain.value = fx.echo.mix;
        input.connect(delay);
        delay.connect(fb);
        fb.connect(delay);
        delay.connect(ew);
        ew.connect(bus);
      }
      return input;
    }

    function startDrones(track) {
      var t = ctx.currentTime;
      var list = track.song.drone;
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

  // -------------------------------------------------------- in the page
  /**
   * The page's wiring, so src/main.js needs no music code: the same click, key
   * or tap that starts the game (and unlocks src/sound.js) unlocks this; M
   * mutes; a timer and every animation frame book the next notes -- the timer
   * only BOOKS, on the audio clock, so a late tick never makes a late note.
   */
  function attachToPage(win) {
    var music = createMusic({ off: offFromQuery(win.location && win.location.search) });
    win.__pongMusic = music;
    function game() { return win.__pong || null; }
    function tick() { music.update(game()); }
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
    SONGS: SONGS,
    MUSIC_DB: MUSIC_DB,
    FADE_S: FADE_S,
    LOOKAHEAD: LOOKAHEAD,
    noteFreq: noteFreq,
    parseBar: parseBar,
    songProblems: songProblems,
    songFor: songFor,
    stepSeconds: stepSeconds,
    offFromQuery: offFromQuery,
    createMusic: createMusic,
    attachToPage: attachToPage
  };
});
