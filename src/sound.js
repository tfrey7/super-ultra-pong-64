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
 * An era's arrival sound is data too: a voice's `boot` list, which the player
 * sounds in place of `score` for the point that brings that era in (the boot
 * sting, docs/ERAS.md section 3). An arrival flourish draws and never plays a
 * note, so a second render of the ring can never sound it again.
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

  // The top rung follows the rules' ladder, so registering an era extends it.
  var RULES_API = root.Pong ||
    (typeof module === 'object' && typeof require === 'function' ? require('./game.js') : null);
  var TOP_ERA = RULES_API && RULES_API.ERAS ? RULES_API.ERAS.length - 1 : 4;

  // -------------------------------------------------------------- the design
  // A voice is one oscillator with a short envelope:
  //   wave     'square' | 'triangle' | 'sine' | 'sawtooth'
  //   freq     Hz;  slideTo  optional Hz the pitch glides to over the note
  //   at       seconds after the event the voice starts (for arpeggios)
  //   dur      seconds the note lasts;  gain  peak loudness, 0..1
  //   fm       optional { ratio, index }: a sine modulator at freq * ratio,
  //            swinging the carrier by freq * index Hz and decaying with it
  // The Atari's and the NES's point notes, each shared by its era's `score` and
  // the front of its `boot` sting: the point that brings the era in is still heard.
  var ATARI_POINT = [{ wave: 'square', freq: 147, slideTo: 110, dur: 0.36, gain: 0.2 }];
  var NES_POINT = [
    { wave: 'square', freq: 523, at: 0.00, dur: 0.08, gain: 0.12 },
    { wave: 'square', freq: 659, at: 0.08, dur: 0.08, gain: 0.12 },
    { wave: 'square', freq: 784, at: 0.16, dur: 0.08, gain: 0.12 },
    { wave: 'square', freq: 1047, at: 0.24, dur: 0.16, gain: 0.12 },
    { wave: 'triangle', freq: 262, at: 0.00, dur: 0.40, gain: 0.3 }
  ];

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
      score:  ATARI_POINT,
      // The boot sting (item 1137's TV warble, moved here by item 1162): the
      // point that turns the machine to colour still buzzes, and under it the
      // set comes on (the flourish in src/eras/era1-atari2600.js) -- a square
      // hum sliding up an octave with a slow wobble, like a set not yet on its
      // channel, then two coarse TIA steps as the picture locks. A third of the
      // loudness of a paddle hit, and over by 0.86 s, inside the pause.
      boot: ATARI_POINT.concat([
        { wave: 'square', freq: 110, slideTo: 220, at: 0.00, dur: 0.46, gain: 0.07,
          fm: { ratio: 0.06, index: 0.09 } },
        { wave: 'square', freq: 294, at: 0.40, dur: 0.10, gain: 0.07 },
        { wave: 'square', freq: 440, slideTo: 392, at: 0.52, dur: 0.34, gain: 0.06,
          fm: { ratio: 0.016, index: 0.025 } }
      ])
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
      score: NES_POINT,
      // The boot sting (item 1138's power-on chime, moved here by item 1162):
      // the point's arpeggio, then B5 and E6 on the pulse channel over an E on
      // the triangle -- a bright little NES "on" while the tiles turn over (the
      // flourish in src/eras/era2-nes.js). It starts at 0.45 s, after the
      // arpeggio (0.40 s), and is over by 0.85 s, well inside the pause.
      boot: NES_POINT.concat([
        { wave: 'square', freq: 988, at: 0.45, dur: 0.07, gain: 0.12 },
        { wave: 'square', freq: 1319, at: 0.52, dur: 0.30, gain: 0.12 },
        { wave: 'triangle', freq: 330, at: 0.45, dur: 0.40, gain: 0.3 }
      ])
    },
    // 3 -- 1989 Genesis: two-operator FM, the bright metallic YM2612 bell.
    {
      paddle: [{ wave: 'sine', freq: 880, dur: 0.12, gain: 0.28, fm: { ratio: 3.5, index: 2.2 } }],
      wall:   [{ wave: 'sine', freq: 587, dur: 0.08, gain: 0.24, fm: { ratio: 2, index: 1.6 } }],
      // A point's note is the era it moves the machine up TO, so this row plays
      // exactly once a session: as the Genesis arrives and the NES picture
      // shatters (the flourish in src/eras/era3-genesis.js). It is a sting --
      // a growling FM slap bass dropping an octave, a metallic hit on top, and
      // the bright bell stab riding in over them.
      score: [
        { wave: 'sine', freq: 82, slideTo: 41, dur: 0.70, gain: 0.46, fm: { ratio: 2, index: 5 } },
        { wave: 'sine', freq: 165, slideTo: 82, dur: 0.34, gain: 0.26, fm: { ratio: 3, index: 3.5 } },
        { wave: 'sine', freq: 220, dur: 0.10, gain: 0.2, fm: { ratio: 7.1, index: 9 } },
        { wave: 'sine', freq: 659, at: 0.08, dur: 0.18, gain: 0.2, fm: { ratio: 3.5, index: 2.5 } },
        { wave: 'sine', freq: 988, at: 0.18, dur: 0.40, gain: 0.2, fm: { ratio: 3.5, index: 2.5 } }
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
        // The orchestral hit (item 1140), the sound of the point that brings
        // the Super Nintendo in: a brass stab on a C major chord, strings an
        // octave over it, a timpani falling under it and a glockenspiel
        // sparkle on top -- all of it through the echo.
        { wave: 'sawtooth', freq: 262, at: 0.00, dur: 0.45, gain: 0.07 },
        { wave: 'sawtooth', freq: 330, at: 0.00, dur: 0.45, gain: 0.07 },
        { wave: 'sawtooth', freq: 392, at: 0.00, dur: 0.45, gain: 0.07 },
        { wave: 'triangle', freq: 523, at: 0.00, dur: 0.70, gain: 0.12 },
        { wave: 'triangle', freq: 784, at: 0.02, dur: 0.66, gain: 0.12 },
        { wave: 'sine', freq: 98, slideTo: 62, at: 0.00, dur: 0.55, gain: 0.32 },
        { wave: 'sawtooth', freq: 65, at: 0.00, dur: 0.40, gain: 0.06 },
        { wave: 'sine', freq: 1568, at: 0.08, dur: 0.35, gain: 0.08 }
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

  /**
   * The sound hook (docs/ERAS.md section 3): a rung with no VOICES row keeps
   * its voice on its look, as `voice`. Null when the look has none yet.
   */
  function lookVoice(n) {
    var R = root.PongRender;
    var look = R && typeof R.eraLook === 'function' ? R.eraLook(n) : null;
    return (look && look.voice) || null;
  }

  /**
   * The voices one event plays on one era: an array, empty for anything
   * unknown. Eras 0 to 4 are their VOICES rows; above that, the look's voice,
   * and a rung whose look has no voice yet plays the highest built row.
   */
  function voicesFor(era, type) {
    var n = clampEra(era);
    var set = VOICES[n] || lookVoice(n) || VOICES[VOICES.length - 1];
    return (set && set[type]) || [];
  }

  /** The echo an era runs its notes through, or null for none. */
  function echoFor(era) {
    var n = clampEra(era);
    if (n < ECHOES.length) return ECHOES[n] || null;
    var v = lookVoice(n);
    if (v) return (v.effects && v.effects.echo) || null;
    return ECHOES[ECHOES.length - 1] || null;
  }

  // -------------------------------------------------------------- the player
  var MAX_PER_FRAME = 4;   // a pathological frame never schedules a pile of notes

  /**
   * The smash (item 1208): the era's own paddle notes, made heavier -- each one
   * held twice as long and struck harder, with the same wave an octave below
   * under it, falling in pitch. Built from the voice it is handed, so every
   * era's smash is in that era's voice and a new era gets one for nothing.
   */
  function smashOf(voices) {
    var out = [];
    for (var i = 0; i < voices.length; i++) {
      var v = voices[i];
      var hard = {};
      for (var k in v) hard[k] = v[k];
      hard.dur = v.dur * 2;
      hard.gain = Math.min(0.45, v.gain * 1.5);
      out.push(hard);
      if (v.wave === 'noise') continue;
      var low = {};
      for (var j in v) low[j] = v[j];
      low.freq = v.freq / 2;
      low.slideTo = v.freq / 4;
      low.dur = v.dur * 3;
      low.gain = Math.min(0.4, v.gain * 1.2);
      out.push(low);
    }
    return out;
  }

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
    var sounded = null;   // the era of the last event this player sounded
    var player = {
      unlocked: false,    // has the player touched the page yet?
      available: false,   // did an audio context actually open?
      played: 0,          // events turned into sound
      errors: 0,          // anything the audio API threw, swallowed
      boots: 0,           // boot stings played: one per change into an era that has one
      last: null,         // { era, type, waves } of the latest event played ('boot' for a sting)
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
        if (play(state.events[i], state)) n += 1;
      }
      return n;
    }

    /**
     * Did this point move the machine up? Handed the game, the rules say so
     * exactly: they stamp eraChangedAt with the moment of the point that moved
     * it, so a new match, or a page opened high up the ladder, can never fool
     * it. A bare event falls back to docs/ERAS.md's wording: an era higher than
     * the last one this player sounded.
     */
    function eraRose(ev, state) {
      var era = clampEra(ev.era);
      if (state && typeof state.eraChangedAt === 'number' && typeof ev.time === 'number') {
        return state.eraChangedAt === ev.time && clampEra(state.era) === era;
      }
      return sounded !== null && era > sounded;
    }

    /**
     * One event -> its era's voices, scheduled now. True if it was sounded.
     * The boot sting: a point that moved the machine up plays the arriving
     * era's `boot` list in place of `score`, when that voice has one.
     */
    function play(ev, state) {
      if (!ev || !ctx || !player.available) return false;
      var type = ev.type;
      if (type === 'score' && eraRose(ev, state) && voicesFor(ev.era, 'boot').length) type = 'boot';
      var voices = voicesFor(ev.era, type);
      if (type === 'paddle' && ev.smash) voices = smashOf(voices);   // item 1208
      if (!voices.length) return false;
      try {
        var echo = echoFor(ev.era);
        var out = echo ? echoBus(echo) : null;
        var t0 = ctx.currentTime + 0.005;
        for (var i = 0; i < voices.length; i++) voice(voices[i], t0, out);
        player.played += 1;
        if (type === 'boot') player.boots += 1;
        sounded = clampEra(ev.era);
        player.last = {
          era: clampEra(ev.era),
          type: type,
          waves: voices.map(function (v) { return v.fm ? 'fm' : v.wave; }),
          echo: !!echo,
          smash: !!(type === 'paddle' && ev.smash)
        };
        return true;
      } catch (e) {
        player.errors += 1;
        return false;
      }
    }

    function voice(v, t0, echoBusIn) {
      // Noise notes are part of the 3D eras' voice grammar and not built yet:
      // skipped rather than handed to an oscillator that would refuse them.
      if (v.wave === 'noise') return;
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
    smashOf: smashOf,
    createPlayer: createPlayer
  };
});
