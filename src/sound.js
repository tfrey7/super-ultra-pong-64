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
  // and the 3D eras' additions (docs/ERAS.md section 3), all optional:
  //   wave: 'noise'  white noise from one shared 2-second looped buffer made at
  //            unlock; freq is ignored
  //   attack   seconds to peak (default 0.004)
  //   filter   { type, freq, q, to }: a BiquadFilter on the note; q defaults to
  //            0.7, `to` glides the cutoff exponentially over the note
  //   unison   { voices, spread }: that many copies detuned evenly from -spread
  //            to +spread cents, each at gain / voices
  //   lfo      { freq, depth }: tremolo on the note's gain, depth 0..1
  //   shape    0..1: WaveShaper drive, curve tanh(k x) with k = 1 + 20 * shape
  // A voice's `effects` are per era: echo { time, feedback, mix }, reverb
  // { seconds, decay, mix }, bus { type, freq, q } (one filter every note of the
  // era passes through) and shape (a WaveShaper on that bus).
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

  // Eras 0 to 4 have no effects object of their own: their echo is the whole of it.
  var ECHO_EFFECTS = ECHOES.map(function (e) { return e ? { echo: e } : {}; });

  /**
   * Everything an era runs its notes through, as the voice's `effects` object:
   * { echo, reverb, bus, shape }, each optional. Never null; {} for none.
   */
  function effectsFor(era) {
    var n = clampEra(era);
    if (n < ECHO_EFFECTS.length) return ECHO_EFFECTS[n];
    var v = lookVoice(n);
    if (v) return v.effects || {};
    return ECHO_EFFECTS[ECHO_EFFECTS.length - 1];
  }

  /** The WaveShaper curve for a drive of `shape` (0..1): tanh(k x), k = 1 + 20 * shape. */
  var SHAPE_POINTS = 1024;
  var curves = {};
  function shapeCurve(shape) {
    var k = 1 + 20 * shape;
    if (curves[k]) return curves[k];
    var c = typeof Float32Array === 'function' ? new Float32Array(SHAPE_POINTS) : new Array(SHAPE_POINTS);
    for (var i = 0; i < SHAPE_POINTS; i++) {
      var x = (i / (SHAPE_POINTS - 1)) * 2 - 1;
      c[i] = Math.tanh(k * x);
    }
    curves[k] = c;
    return c;
  }

  /** The copies a unison note plays: { cents } for each, -spread to +spread. */
  function unisonCents(u) {
    var n = u && u.voices > 1 ? Math.floor(u.voices) : 1;
    var spread = u && u.spread ? u.spread : 0;
    var out = [];
    for (var i = 0; i < n; i++) out.push(n > 1 ? -spread + (2 * spread * i) / (n - 1) : 0);
    return out;
  }

  /**
   * White noise in -1..1 from a fixed seed, so the buffers are the same every
   * session and a test can read them. A one-time fill of an audio buffer.
   */
  function fillNoise(data, seed, envelope) {
    var s = seed >>> 0;
    var n = data.length;
    for (var i = 0; i < n; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      var w = (s / 4294967296) * 2 - 1;
      data[i] = envelope ? w * envelope(i, n) : w;
    }
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
    var noise = null;     // the shared 2-second white-noise buffer, made at unlock
    var noiseAt = 0;      // where in it the next noise note starts, so clicks differ
    var buses = {};       // era -> { dry, sends }: its effects, built on first use
    var sounded = null;   // the era of the last event this player sounded
    var player = {
      unlocked: false,    // has the player touched the page yet?
      available: false,   // did an audio context actually open?
      played: 0,          // events turned into sound
      errors: 0,          // anything the audio API threw, swallowed
      skipped: 0,         // notes or effects this audio context has no node for
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
      if (player.available) makeNoise();
      return player.available;
    }

    /** The one noise buffer every noise note loops: 2 seconds, made once. */
    function makeNoise() {
      if (typeof ctx.createBuffer !== 'function') return;
      try {
        var rate = ctx.sampleRate || 44100;
        noise = ctx.createBuffer(1, Math.round(2 * rate), rate);
        fillNoise(noise.getChannelData(0), 0x5eed);
      } catch (e) {
        noise = null;
        player.errors += 1;
      }
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
      if (!voices.length) return false;
      try {
        var fx = effectsFor(ev.era);
        var bus = busFor(clampEra(ev.era), fx);
        var t0 = ctx.currentTime + 0.005;
        for (var i = 0; i < voices.length; i++) voice(voices[i], t0, bus);
        player.played += 1;
        if (type === 'boot') player.boots += 1;
        sounded = clampEra(ev.era);
        player.last = {
          era: clampEra(ev.era),
          type: type,
          waves: voices.map(function (v) { return v.fm ? 'fm' : v.wave; }),
          echo: !!fx.echo,
          reverb: !!fx.reverb,
          bus: !!(fx.bus || fx.shape)
        };
        return true;
      } catch (e) {
        player.errors += 1;
        return false;
      }
    }

    /**
     * One note: its sources (an oscillator, a unison's detuned copies, or the
     * looped noise), then its drive, its filter, its envelope and its tremolo,
     * into the era's bus. A note with none of the 3D fields makes exactly the
     * nodes and calls it always made (tools/sound-eras0-4.json pins that).
     */
    function voice(v, t0, bus) {
      var t = t0 + (v.at || 0);
      var end = t + v.dur;
      var sources = [];
      var ratios = [];
      if (v.wave === 'noise') {
        if (!noise) { player.skipped += 1; return; }
        var src = ctx.createBufferSource();
        src.buffer = noise;
        src.loop = true;
        sources.push(src);
      } else {
        var cents = v.unison ? unisonCents(v.unison) : [0];
        for (var c = 0; c < cents.length; c++) {
          var r = cents[c] ? Math.pow(2, cents[c] / 1200) : 1;
          var osc = ctx.createOscillator();
          osc.type = v.wave;
          osc.frequency.setValueAtTime(r === 1 ? v.freq : v.freq * r, t);
          if (v.slideTo) osc.frequency.exponentialRampToValueAtTime(r === 1 ? v.slideTo : v.slideTo * r, end);
          sources.push(osc);
          ratios.push(r);
        }
      }

      // The stages between the sources and the envelope, in signal order.
      var stages = [];
      if (v.shape > 0) {
        if (typeof ctx.createWaveShaper === 'function') {
          var ws = ctx.createWaveShaper();
          ws.curve = shapeCurve(v.shape);
          stages.push(ws);
        } else player.skipped += 1;
      }
      if (v.filter) {
        if (typeof ctx.createBiquadFilter === 'function') stages.push(filterNode(v.filter, t, end));
        else player.skipped += 1;
      }

      var env = ctx.createGain();
      var attack = v.attack > 0 ? Math.min(v.attack, v.dur * 0.9) : 0.004;
      var peak = sources.length > 1 ? v.gain / sources.length : v.gain;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(peak, t + attack);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
      var first = stages.length ? stages[0] : env;
      for (var s = 0; s < sources.length; s++) sources[s].connect(first);
      for (var k = 0; k < stages.length; k++) stages[k].connect(k + 1 < stages.length ? stages[k + 1] : env);

      var out = env;
      var lfo = null;
      if (v.lfo && v.lfo.freq > 0) {
        // Tremolo: the note's gain swings between 1 - depth and 1.
        var depthOf = Math.max(0, Math.min(1, v.lfo.depth || 0));
        var trem = ctx.createGain();
        trem.gain.value = 1 - depthOf / 2;
        lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(v.lfo.freq, t);
        var swing = ctx.createGain();
        swing.gain.value = depthOf / 2;
        lfo.connect(swing);
        swing.connect(trem.gain);
        env.connect(trem);
        out = trem;
      }
      out.connect(bus.dry);
      for (var e = 0; e < bus.sends.length; e++) out.connect(bus.sends[e]);

      if (v.fm && v.wave !== 'noise') {
        // Two-operator FM: a sine swinging the carrier's pitch, its depth
        // decaying with the note so the attack is bright and the tail pure.
        var mod = ctx.createOscillator();
        mod.type = 'sine';
        mod.frequency.setValueAtTime(v.freq * v.fm.ratio, t);
        var depth = ctx.createGain();
        depth.gain.setValueAtTime(v.freq * v.fm.index, t);
        depth.gain.exponentialRampToValueAtTime(1, end);
        mod.connect(depth);
        for (var m = 0; m < sources.length; m++) depth.connect(sources[m].frequency);
        mod.start(t);
        mod.stop(end + 0.02);
      }
      if (lfo) {
        lfo.start(t);
        lfo.stop(end + 0.02);
      }
      for (var q = 0; q < sources.length; q++) {
        if (v.wave === 'noise') {
          sources[q].start(t, noiseAt);
          noiseAt = (noiseAt + 0.618034) % 2;   // the next click starts elsewhere in the loop
        } else sources[q].start(t);
        sources[q].stop(end + 0.02);
      }
    }

    /** A BiquadFilter from a { type, freq, q, to } spec, its cutoff gliding to `to`. */
    function filterNode(spec, t, end) {
      var f = ctx.createBiquadFilter();
      f.type = spec.type || 'lowpass';
      f.frequency.setValueAtTime(spec.freq, t);
      f.Q.setValueAtTime(typeof spec.q === 'number' ? spec.q : 0.7, t);
      if (spec.to > 0) f.frequency.exponentialRampToValueAtTime(spec.to, end);
      return f;
    }

    /**
     * An era's effects, built the first time one of its notes plays and kept
     * for that era alone: every era gets its own echo and its own reverb.
     *   dry    where a note goes: the era's bus (drive, then filter) or master
     *   sends  where a note also goes when there is no bus: the echo and the
     *          reverb. With a bus, the bus's end feeds them instead, so a tail
     *          is muffled with the note it came from.
     */
    function busFor(era, fx) {
      if (buses[era]) return buses[era];
      var bus = { dry: master, sends: [] };
      var head = null;
      var tail = null;
      function chain(node) {
        if (tail) tail.connect(node); else head = node;
        tail = node;
      }
      if (fx.shape > 0) {
        if (typeof ctx.createWaveShaper === 'function') {
          var ws = ctx.createWaveShaper();
          ws.curve = shapeCurve(fx.shape);
          chain(ws);
        } else player.skipped += 1;
      }
      if (fx.bus) {
        if (typeof ctx.createBiquadFilter === 'function') {
          var f = ctx.createBiquadFilter();
          f.type = fx.bus.type || 'lowpass';
          f.frequency.value = fx.bus.freq;
          f.Q.value = typeof fx.bus.q === 'number' ? fx.bus.q : 0.7;
          chain(f);
        } else player.skipped += 1;
      }
      if (tail) {
        tail.connect(master);
        bus.dry = head;
      }
      var sends = [];
      if (fx.echo) sends.push(echoNet(fx.echo));
      if (fx.reverb) {
        var rev = reverbNet(fx.reverb);
        if (rev) sends.push(rev); else player.skipped += 1;
      }
      if (tail) for (var i = 0; i < sends.length; i++) tail.connect(sends[i]);
      else bus.sends = sends;
      buses[era] = bus;
      return bus;
    }

    /** A slapback echo: a delay feeding back through a gain, and a wet level. */
    function echoNet(spec) {
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
      return delay;
    }

    /**
     * A room: a ConvolverNode on a stereo impulse of noise times
     * (1 - i / n) ** decay, `seconds` long, and a wet level. Null when this
     * context cannot make one.
     */
    function reverbNet(spec) {
      if (typeof ctx.createConvolver !== 'function' || typeof ctx.createBuffer !== 'function') return null;
      var rate = ctx.sampleRate || 44100;
      var n = Math.max(1, Math.round((spec.seconds || 1) * rate));
      var decay = typeof spec.decay === 'number' ? spec.decay : 2;
      var impulse = ctx.createBuffer(2, n, rate);
      for (var ch = 0; ch < 2; ch++) {
        fillNoise(impulse.getChannelData(ch), 0x7e7b + ch, function (i, len) {
          return Math.pow(1 - i / len, decay);
        });
      }
      var conv = ctx.createConvolver();
      conv.buffer = impulse;
      var wet = ctx.createGain();
      wet.gain.value = typeof spec.mix === 'number' ? spec.mix : 0.25;
      conv.connect(wet);
      wet.connect(master);
      return conv;
    }

    return player;
  }

  return {
    TOP_ERA: TOP_ERA,
    VOICES: VOICES,
    voicesFor: voicesFor,
    echoFor: echoFor,
    effectsFor: effectsFor,
    shapeCurve: shapeCurve,
    unisonCents: unisonCents,
    createPlayer: createPlayer
  };
});
