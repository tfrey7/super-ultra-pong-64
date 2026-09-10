/*
 * Super Ultra Pong 64: Remastered -- the voice.
 *
 * Every paddle hit, wall bounce and point plays a note, and the note belongs to
 * the machine the game is on: a bare square-wave blip on the 1972 arcade board
 * and the Atari 2600, square and triangle chiptune on the NES, a bright FM tone
 * on the Genesis, and full layered notes with a short echo on the Super
 * Nintendo. Everything is synthesised here with the Web Audio API: no audio
 * files, no dependencies.
 *
 * Two halves, kept apart on purpose:
 *   - VOICES / voicesFor / echoFor are plain data -- what each era sounds like
 *     -- so the headless suite can check the design with no audio anywhere.
 *   - createPlayer() turns the game's per-step event list (state.events, which
 *     the rules fill) into scheduled oscillators. It READS the state and never
 *     writes it.
 *
 * Browsers refuse to make sound before the player has touched the page, so the
 * player is silent until unlock() is called from a click or keypress. A page
 * with no AudioContext at all (an old browser, a headless run with no audio
 * device) simply stays silent: nothing here is allowed to throw into the loop.
 *
 * UMD like src/game.js: window.PongSound in the page, require() under node.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PongSound = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var TOP_ERA = 4;

  // -------------------------------------------------------------- the design
  // A voice is one oscillator with a short envelope:
  //   wave     'square' | 'triangle' | 'sine' | 'sawtooth'
  //   freq     Hz;  slideTo  optional Hz the pitch glides to over the note
  //   at       seconds after the event the voice starts (for arpeggios)
  //   dur      seconds the note lasts;  gain  peak loudness, 0..1
  //   fm       optional { ratio, index }: a sine modulator at freq * ratio,
  //            swinging the carrier by freq * index Hz and decaying with it
  var VOICES = [
    // 0 -- 1972 arcade: one square blip, nothing else. High for a paddle, an
    // octave down for a wall, a longer tone for a point.
    {
      paddle: [{ wave: 'square', freq: 490, dur: 0.05, gain: 0.22 }],
      wall:   [{ wave: 'square', freq: 245, dur: 0.04, gain: 0.22 }],
      score:  [{ wave: 'square', freq: 245, dur: 0.30, gain: 0.22 }]
    },
    // 1 -- 1977 Atari 2600: still a single square, but the TIA's coarse,
    // slightly flat pitches and a buzzier, longer point.
    {
      paddle: [{ wave: 'square', freq: 440, dur: 0.06, gain: 0.2 }],
      wall:   [{ wave: 'square', freq: 220, dur: 0.05, gain: 0.2 }],
      score:  [{ wave: 'square', freq: 147, slideTo: 110, dur: 0.36, gain: 0.2 }]
    },
    // 2 -- 1985 NES: pulse lead over the triangle channel's bass, and a point
    // is a little rising arpeggio.
    {
      paddle: [
        { wave: 'square', freq: 784, dur: 0.07, gain: 0.13 },
        { wave: 'triangle', freq: 392, dur: 0.09, gain: 0.3 }
      ],
      wall: [
        { wave: 'triangle', freq: 523, slideTo: 392, dur: 0.06, gain: 0.32 }
      ],
      score: [
        { wave: 'square', freq: 523, at: 0.00, dur: 0.08, gain: 0.12 },
        { wave: 'square', freq: 659, at: 0.08, dur: 0.08, gain: 0.12 },
        { wave: 'square', freq: 784, at: 0.16, dur: 0.08, gain: 0.12 },
        { wave: 'square', freq: 1047, at: 0.24, dur: 0.16, gain: 0.12 },
        { wave: 'triangle', freq: 262, at: 0.00, dur: 0.40, gain: 0.3 }
      ]
    },
    // 3 -- 1989 Genesis: two-operator FM, the bright metallic YM2612 bell.
    {
      paddle: [{ wave: 'sine', freq: 880, dur: 0.12, gain: 0.28, fm: { ratio: 3.5, index: 2.2 } }],
      wall:   [{ wave: 'sine', freq: 587, dur: 0.08, gain: 0.24, fm: { ratio: 2, index: 1.6 } }],
      score: [
        { wave: 'sine', freq: 659, at: 0.00, dur: 0.18, gain: 0.26, fm: { ratio: 3.5, index: 2.5 } },
        { wave: 'sine', freq: 988, at: 0.12, dur: 0.34, gain: 0.26, fm: { ratio: 3.5, index: 2.5 } }
      ]
    },
    // 4 -- 1991 Super Nintendo: a fuller, softer sound -- each note a small
    // chord of layered voices, fed through a short echo (echoFor below).
    {
      paddle: [
        { wave: 'triangle', freq: 523, dur: 0.16, gain: 0.26 },
        { wave: 'sine', freq: 1047, dur: 0.12, gain: 0.12 },
        { wave: 'sawtooth', freq: 262, dur: 0.10, gain: 0.05 }
      ],
      wall: [
        { wave: 'triangle', freq: 392, dur: 0.10, gain: 0.24 },
        { wave: 'sine', freq: 784, dur: 0.08, gain: 0.1 }
      ],
      score: [
        { wave: 'triangle', freq: 523, at: 0.00, dur: 0.50, gain: 0.18 },
        { wave: 'triangle', freq: 659, at: 0.06, dur: 0.46, gain: 0.16 },
        { wave: 'triangle', freq: 784, at: 0.12, dur: 0.42, gain: 0.16 },
        { wave: 'sine', freq: 1047, at: 0.18, dur: 0.40, gain: 0.12 },
        { wave: 'sawtooth', freq: 131, at: 0.00, dur: 0.30, gain: 0.05 }
      ]
    }
  ];

  // Only the Super Nintendo has an echo: a short slapback that repeats a few
  // times and dies away.
  var ECHOES = [null, null, null, null, { time: 0.14, feedback: 0.35, mix: 0.45 }];

  function clampEra(n) {
    n = Math.floor(Number(n));
    if (!(n >= 0)) return 0;
    return n > TOP_ERA ? TOP_ERA : n;
  }

  /** The voices one event plays on one era: an array, empty for anything unknown. */
  function voicesFor(era, type) {
    var set = VOICES[clampEra(era)];
    return (set && set[type]) || [];
  }

  /** The echo an era runs its notes through, or null for none. */
  function echoFor(era) {
    return ECHOES[clampEra(era)] || null;
  }

  // -------------------------------------------------------------- the player
  var MAX_PER_FRAME = 4;   // a pathological frame never schedules a pile of notes

  /**
   * opts.AudioContext overrides the browser's constructor -- a test hands in a
   * recorder; null means "there is no audio here". Left out, the page's own
   * AudioContext (or webkitAudioContext) is used if it has one.
   */
  function createPlayer(opts) {
    opts = opts || {};
    var AC = ('AudioContext' in opts)
      ? opts.AudioContext
      : (root.AudioContext || root.webkitAudioContext || null);

    var ctx = null;
    var master = null;
    var echoIn = null;
    var player = {
      unlocked: false,    // has the player touched the page yet?
      available: false,   // did an audio context actually open?
      played: 0,          // events turned into sound
      errors: 0,          // anything the audio API threw, swallowed
      last: null,         // { era, type, waves } of the latest event played
      unlock: unlock,
      handle: handle,
      play: play,
      audioState: audioState
    };

    /** 'none' before unlock or with no audio; else the context's own state. */
    function audioState() {
      return ctx ? String(ctx.state) : 'none';
    }

    /** Call from inside a click or keypress. Safe to call any number of times. */
    function unlock() {
      if (player.unlocked) {
        resume();
        return player.available;
      }
      player.unlocked = true;
      if (typeof AC !== 'function') return false;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = typeof opts.volume === 'number' ? opts.volume : 0.5;
        master.connect(ctx.destination);
        player.available = true;
        resume();
      } catch (e) {
        ctx = null;
        master = null;
        player.errors += 1;
      }
      return player.available;
    }

    function resume() {
      try {
        if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
          var p = ctx.resume();
          if (p && typeof p.catch === 'function') p.catch(function () { player.errors += 1; });
        }
      } catch (e) {
        player.errors += 1;
      }
    }

    /** Play whatever the last step produced. Reads state.events; writes nothing. */
    function handle(state) {
      if (!state || !state.events || !state.events.length) return 0;
      var n = 0;
      for (var i = 0; i < state.events.length && n < MAX_PER_FRAME; i++) {
        if (play(state.events[i])) n += 1;
      }
      return n;
    }

    /** One event -> its era's voices, scheduled now. True if it was sounded. */
    function play(ev) {
      if (!ev || !ctx || !player.available) return false;
      var voices = voicesFor(ev.era, ev.type);
      if (!voices.length) return false;
      try {
        var echo = echoFor(ev.era);
        var out = echo ? echoBus(echo) : null;
        var t0 = ctx.currentTime + 0.005;
        for (var i = 0; i < voices.length; i++) voice(voices[i], t0, out);
        player.played += 1;
        player.last = {
          era: clampEra(ev.era),
          type: ev.type,
          waves: voices.map(function (v) { return v.fm ? 'fm' : v.wave; }),
          echo: !!echo
        };
        return true;
      } catch (e) {
        player.errors += 1;
        return false;
      }
    }

    function voice(v, t0, echoBusIn) {
      var t = t0 + (v.at || 0);
      var end = t + v.dur;
      var osc = ctx.createOscillator();
      osc.type = v.wave;
      osc.frequency.setValueAtTime(v.freq, t);
      if (v.slideTo) osc.frequency.exponentialRampToValueAtTime(v.slideTo, end);

      var env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(v.gain, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(env);
      env.connect(master);
      if (echoBusIn) env.connect(echoBusIn);

      var mod = null;
      if (v.fm) {
        // Two-operator FM: a sine swinging the carrier's pitch, its depth
        // decaying with the note so the attack is bright and the tail pure.
        mod = ctx.createOscillator();
        mod.type = 'sine';
        mod.frequency.setValueAtTime(v.freq * v.fm.ratio, t);
        var depth = ctx.createGain();
        depth.gain.setValueAtTime(v.freq * v.fm.index, t);
        depth.gain.exponentialRampToValueAtTime(1, end);
        mod.connect(depth);
        depth.connect(osc.frequency);
        mod.start(t);
        mod.stop(end + 0.02);
      }
      osc.start(t);
      osc.stop(end + 0.02);
    }

    /** The echo is built once, on the first note that needs it, and kept. */
    function echoBus(spec) {
      if (echoIn) return echoIn;
      var delay = ctx.createDelay(1.0);
      delay.delayTime.value = spec.time;
      var feedback = ctx.createGain();
      feedback.gain.value = spec.feedback;
      var wet = ctx.createGain();
      wet.gain.value = spec.mix;
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      wet.connect(master);
      echoIn = delay;
      return echoIn;
    }

    return player;
  }

  return {
    TOP_ERA: TOP_ERA,
    VOICES: VOICES,
    voicesFor: voicesFor,
    echoFor: echoFor,
    createPlayer: createPlayer
  };
});
