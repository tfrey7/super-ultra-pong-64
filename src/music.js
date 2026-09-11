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

  var ERA_FILES = ['era0-arcade', 'era1-atari2600', 'era2-nes', 'era3-genesis', 'era4-snes', 'era5-playstation', 'era6-n64', 'era7-dreamcast', 'era8-ps2', 'era9-xbox', 'era10-xbox360'];
  // ======================================================== ARRANGEMENTS
  // ONE FILE PER ERA since item 1241: src/music/eraN-<name>.js holds that era's
  // voices, kit, chain and arrangement, and registers itself on
  // window.PongMusicEras before this file loads (index.html lists them first).
  // Under node they are required here. An arrangement card edits only its own
  // era's file; the vocabulary is above.
  var ARRANGEMENTS = ERA_FILES.map(function (file, i) {
    if (typeof module === 'object' && module.exports && typeof require === 'function') {
      return require('./music/' + file + '.js');
    }
    var list = root.PongMusicEras || [];
    return list[i] || null;
  });

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
  function arrange(arr, theme, opts) {
    theme = theme || THEME;
    opts = opts || {};
    var S = theme.steps, total = S * theme.bars;
    var out = [];
    for (var s = 0; s < total; s++) out.push([]);
    if (!arr) return out;
    var melody = theme.melody.map(parseBar);
    var chords = theme.chords.map(function (c) { return c.split('+').map(noteMidi); });
    var half = S / 2;
    var stolen = {};   // steps where a stealing drum sounds -> the part it steals
    // The engine's own climax layers ride after the arrangement's parts, from
    // the Atari up (item 1241): only when asked (the player asks), so the
    // arrangement's own score stays exactly what its file says.
    var parts = opts.lift && arr.kit ? arr.parts.concat(liftParts(arr)) : arr.parts;

    function add(step, part, pi, midis, len, at, accent, voice) {
      var sh = 12 * (part.octave || 0);
      var late = arr.swing && (step % 2) ? arr.swing : 0;   // the off-16ths, played late
      out[step % total].push({
        part: pi, voice: voice || part.voice, midis: midis.map(function (m) { return m + sh; }),
        len: len, at: (at || 0) + late, accent: !!accent, from: part.from || 0
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

    parts.forEach(function (part, pi) {
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
          var hits = drumVoices(part, arr);   // a kit piece may be several layers
          pat.forEach(function (e, k) {
            if (!e) return;
            for (var hv = 0; hv < hits.length; hv++) add(b0 + k, part, pi, [], 1, 0, e.accent, hits[hv]);
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
          var p = parts[ev.part];
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
    if (arr.voices > 0) limitVoices(out, parts, arr.voices);
    return out;
  }

  // ================================================ voices, kits and lifts
  // (item 1241) The era's own hardware, read from its file in src/music/.

  /** The voices a drum part plays: its own voice, or its kit piece (one voice or a list of layers). */
  function drumVoices(part, arr) {
    if (part.voice) return [part.voice];
    var piece = part.hit && arr && arr.kit ? arr.kit[part.hit] : null;
    if (!piece) return [];
    return Array.isArray(piece) ? piece : [piece];
  }

  /**
   * The engine's climax on top of any arrangement with a kit: a tom roll into
   * every section from intensity 0.7, and the era's crash on every bar's
   * downbeat from 0.9 (match point). They come last, so a full chip drops them first.
   */
  var LIFT = [
    { play: 'drum', hit: 'tom', from: 0.7, lift: true,
      pattern: '. . . . . . . . . . . . . . . .', fill: '. . . . . . . . x . x . x x X X' },
    { play: 'drum', hit: 'crash', from: 0.9, lift: true,
      pattern: 'X . . . . . . . . . . . . . . .' }
  ];
  function liftParts(arr) {
    return LIFT.filter(function (p) { return arr.kit && arr.kit[p.hit]; });
  }

  /**
   * How many of the chip's voices a part holds on a step: the most notes any
   * of its events covering that step sounds. A pad counts once (a sampled
   * chord: how the sample chips stretched their channels) and so does a kit
   * piece however many layers it has (one sample, one channel).
   */
  function partLoad(ev, part) {
    if (!part || part.rule === 'pad' || part.play === 'drum' || !ev.midis.length) return 1;
    return ev.midis.length;
  }

  /** Per step, the voices sounding: { part index: load }, from events covering it. */
  function loadMap(score, parts) {
    var total = score.length, map = [];
    for (var s = 0; s < total; s++) map.push({});
    for (var s2 = 0; s2 < total; s2++) {
      score[s2].forEach(function (ev) {
        var n = partLoad(ev, parts[ev.part]);
        var span = Math.max(1, Math.ceil(ev.len - 1e-9));
        for (var k = 0; k < span && k < total; k++) {
          var m = map[(s2 + k) % total];
          m[ev.part] = Math.max(m[ev.part] || 0, n);
        }
      });
    }
    return map;
  }

  /** The most voices the score ever sounds at once. */
  function peakVoices(score, arr) {
    var parts = (arr && arr.parts) || [];
    var peak = 0;
    loadMap(score, parts).forEach(function (m) {
      var n = 0;
      for (var p in m) n += m[p];
      if (n > peak) peak = n;
    });
    return peak;
  }

  /**
   * The chip is full: a note that would start past `voices` is dropped, the
   * latest-listed part first -- so the arrangement lists its parts in the
   * order they matter. The existing loops all fit their chips and lose nothing.
   */
  function limitVoices(score, parts, voices) {
    var map = loadMap(score, parts);
    var dropped = 0;
    for (var s = 0; s < score.length; s++) {
      var m = map[s], used = 0, keep = {};
      Object.keys(m).map(Number).sort(function (a, b) { return a - b; }).forEach(function (p) {
        if (used + m[p] <= voices) { used += m[p]; keep[p] = true; }
      });
      score[s] = score[s].filter(function (ev) {
        if (keep[ev.part]) return true;
        dropped += 1;
        return false;
      });
    }
    score.dropped = dropped;
    return dropped;
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
      if (p.play === 'drum' && p.hit && !p.voice) {
        if (!arr.kit || !arr.kit[p.hit]) bad.push(tag + ': the kit has no ' + p.hit);
      } else if (!p.voice || !(p.voice.gain > 0) || !p.voice.wave) bad.push(tag + ': needs a voice with a wave and a gain');
      if (p.from !== undefined && !(p.from >= 0 && p.from <= 1)) bad.push(tag + ': from is an intensity from 0 to 1');
      if (p.play === 'drum' || p.rule === 'rhythm') {
        if (p.pattern === undefined) bad.push(tag + ': needs a pattern');
        [p.pattern, p.fill, p.open].forEach(function (pat) {
          if (pat === undefined) return;
          var n = String(pat).trim().split(/\s+/).length;
          if (n !== theme.steps) bad.push(tag + ': a pattern of ' + n + ' steps, want ' + theme.steps);
        });
      }
      if (p.play === 'drum' && p.voice && p.voice.wave !== 'noise' && !(p.voice.freq > 0)) bad.push(tag + ': a pitched drum needs a freq');
      if (p.play === 'drum' && !p.voice && !p.hit) bad.push(tag + ': a drum needs a voice or a kit hit');
      if (p.voicing && !VOICINGS[p.voicing]) bad.push(tag + ': unknown voicing ' + p.voicing);
      (p.sections || []).forEach(function (s) { if (!theme.sections[s]) bad.push(tag + ': no section ' + s); });
    });
    Object.keys(arr.kit || {}).forEach(function (name) {
      [].concat(arr.kit[name]).forEach(function (v) {
        if (!v || !(v.gain > 0) || !v.wave) bad.push('kit ' + name + ': needs a voice with a wave and a gain');
        else if (v.wave !== 'noise' && !(v.freq > 0)) bad.push('kit ' + name + ': a pitched hit needs a freq');
      });
    });
    if (arr.voices !== undefined) {
      var peak = peakVoices(arrange(Object.assign({}, arr, { voices: 0 }), theme), arr);
      if (peak > arr.voices) bad.push('sounds ' + peak + ' voices at once, the chip has ' + arr.voices);
    }
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
    var intensity = 0;          // 0..1: which `from` layers play (item 1241)

    var music = {
      intensityNow: 0,          // the intensity the last update read off the game
      limiter: null,            // { compressor, ceiling } after the master (item 1241)
      off: !!opts.off,
      unlocked: false,
      available: false,
      muted: false,
      era: null,                // the era whose arrangement is playing
      scheduled: 0,             // notes booked on the audio clock
      crossfades: 0,
      released: 0,              // faded arrangements let go of, every node unplugged (item 1238)
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
        master.connect(limiterChain());
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

    // ----------------------------------------------- the output (item 1241)
    /**
     * The master limiter: a hard, fast compressor and then a soft ceiling that
     * never lets a sample past CEILING, so the climax can stack every layer
     * without the output clipping. A context with no compressor keeps the ceiling.
     */
    function limiterChain() {
      var ceiling = ctx.createWaveShaper();
      ceiling.curve = ceilingCurve();
      ceiling.connect(ctx.destination);
      var comp = null;
      if (typeof ctx.createDynamicsCompressor === 'function') {
        comp = ctx.createDynamicsCompressor();
        comp.threshold.value = LIMIT.threshold;
        comp.knee.value = LIMIT.knee;
        comp.ratio.value = LIMIT.ratio;
        comp.attack.value = LIMIT.attack;
        comp.release.value = LIMIT.release;
        comp.connect(ceiling);
      }
      music.limiter = { compressor: comp, ceiling: ceiling };
      return comp || ceiling;
    }

    /**
     * An era's period production, between its arrangement's effects and its
     * bus: `tone` (a gentle low-pass: the speaker, the cartridge), `tape`
     * (saturation, and a short delay whose time wanders: wow and flutter),
     * `chorus` (a swirling copy under the dry sound) and `hall` (a generated
     * reverb; with `gate` it is the 1980s gated sound, full and then cut).
     * Every node is kept on the track so retiring it can let go of all of them.
     */
    function eraChain(ch, bus, track) {
      var made = track.fx || (track.fx = []);
      function keep(n) { made.push(n); return n; }
      function wander(param, rate, depth) {
        var lfo = keep(ctx.createOscillator());
        lfo.frequency.value = rate;
        var dg = keep(ctx.createGain());
        dg.gain.value = depth;
        lfo.connect(dg);
        dg.connect(param);
        lfo.start(ctx.currentTime);
        track.drones.push(lfo);
      }
      var input = keep(ctx.createGain());
      var node = input;
      if (ch.tone) {
        var lp = keep(ctx.createBiquadFilter());
        lp.type = 'lowpass';
        lp.frequency.value = ch.tone;
        lp.Q.value = 0.5;
        node.connect(lp);
        node = lp;
      }
      if (ch.tape) {
        if (ch.tape.sat) {
          var sat = keep(ctx.createWaveShaper());
          sat.curve = driveCurve(Math.round(ch.tape.sat * 20) / 200);
          node.connect(sat);
          node = sat;
        }
        var tape = keep(ctx.createDelay(0.1));
        tape.delayTime.value = 0.012;
        if (ch.tape.wow) wander(tape.delayTime, 0.55, ch.tape.wow * 0.002);
        if (ch.tape.flutter) wander(tape.delayTime, 7, ch.tape.flutter * 0.0004);
        node.connect(tape);
        node = tape;
      }
      if (ch.chorus) {
        var sum = keep(ctx.createGain());
        node.connect(sum);
        var cd = keep(ctx.createDelay(0.1));
        cd.delayTime.value = 0.018;
        wander(cd.delayTime, ch.chorus.rate, ch.chorus.depth);
        var cw = keep(ctx.createGain());
        cw.gain.value = ch.chorus.mix;
        node.connect(cd);
        cd.connect(cw);
        cw.connect(sum);
        node = sum;
      }
      node.connect(bus);
      if (ch.hall) {
        var conv = keep(ctx.createConvolver());
        conv.buffer = hallImpulse(ch.hall);
        var wet = keep(ctx.createGain());
        wet.gain.value = ch.hall.mix;
        node.connect(conv);
        conv.connect(wet);
        wet.connect(bus);
      }
      return input;
    }

    /** A hall's impulse, built once per spec: decaying noise, or with `gate` level noise cut dead. */
    var halls = [];
    function hallImpulse(spec) {
      for (var i = 0; i < halls.length; i++) if (halls[i].spec === spec) return halls[i].buffer;
      var ir = ctx.createBuffer(2, 1, ctx.sampleRate);
      var sr = ctx.sampleRate, len = Math.max(1, Math.floor(sr * (spec.gate || spec.seconds)));
      ir = ctx.createBuffer(2, len, sr);
      var seed = 11;
      for (var ch = 0; ch < 2; ch++) {
        var d = ir.getChannelData(ch);
        for (var j = 0; j < len; j++) {
          seed = (seed * 16807) % 2147483647;
          var amp = spec.gate ? 1 - 0.25 * j / len : Math.pow(1 - j / len, spec.decay || 2);
          d[j] = (seed / 1073741823.5 - 1) * amp;
        }
      }
      halls.push({ spec: spec, buffer: ir });
      return ir;
    }

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
        intensity = intensityOf(game);
        music.intensityNow = intensity;
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
      current = { era: era, arr: arr, bus: bus, fxIn: bus, drones: [], fx: [], score: null };
      music.era = era;
      if (arr) {
        current.score = scoreOf(arr);
        // effects (the arrangement's) -> chain (the era's period production) -> bus
        var into = arr.chain ? eraChain(arr.chain, bus, current) : bus;
        current.fxIn = into;
        if (arr.effects) current.fxIn = effectsChain(arr.effects, into, current);
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
      if (!arr._score || arr._scoreTheme !== theme) { arr._score = arrange(arr, theme, { lift: true }); arr._scoreTheme = theme; }
      return arr._score;
    }

    /**
     * A faded arrangement is let go of whole (item 1238): its drones stopped,
     * and every node of its effects chain unplugged -- not only the bus. An echo
     * is a delay feeding itself through a gain, and a reverb holds seconds of
     * impulse; left wired to each other after the bus came off, each change up
     * the ladder added one more set the page never let go of.
     */
    function retireFaded() {
      var t = ctx.currentTime;
      for (var i = fading.length - 1; i >= 0; i--) {
        if (t >= fading[i].until) {
          release(fading[i]);
          fading.splice(i, 1);
        }
      }
    }

    function release(track) {
      stopDrones(track);
      var nodes = [track.bus].concat(track.fx || []);
      for (var i = 0; i < nodes.length; i++) {
        try { nodes[i].disconnect(); } catch (e) { /* already gone */ }
      }
      track.fx = [];
      music.released += 1;
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
            if (list[n].from > intensity) continue;   // a layer the build has not reached yet
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
        if (v.bursts) burstShape(g.gain, t, peak, env, v.bursts);
        else shape(g.gain, t, held, peak / Math.sqrt(freqs.length), env);
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

    /** A hand clap: `n` quick spikes 11 ms apart, then the decay (item 1241). */
    function burstShape(param, t, peak, env, n) {
      param.setValueAtTime(0.0001, t);
      for (var b = 0; b < n; b++) {
        var bt = t + b * 0.011;
        param.linearRampToValueAtTime(peak, bt + 0.001);
        param.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.25), bt + 0.01);
      }
      param.exponentialRampToValueAtTime(0.0001, t + n * 0.011 + Math.max(0.005, env.d));
    }

    function osc(v, f, cents, into, t, held, end, layers) {
      var o = ctx.createOscillator();
      var wave = v.wave === 'kick' ? 'sine' : v.wave;
      var duty = { pulse12: 0.125, pulse25: 0.25, pulse50: 0.5 }[wave];
      if (duty) o.setPeriodicWave(pulse(duty));
      else o.type = wave;
      o.detune.value = cents;
      o.frequency.setValueAtTime(f, t);
      // A pitched hit falls: a kick to a quarter in 0.12 s, a kit's tom or timpani as its `drop` says.
      var drop = v.drop || (v.wave === 'kick' ? { ratio: 0.25, time: 0.12 } : null);
      if (drop) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * drop.ratio), t + Math.max(0.005, drop.time));
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
      // Every node made here is kept on the track, so retiring it unplugs them all.
      var made = track ? track.fx : [];
      function keep(n) { made.push(n); return n; }
      var input = keep(ctx.createGain());
      var node = input;
      if (fx.grit) {
        var shaper = keep(ctx.createWaveShaper());
        var n = 1024, curve = new Float32Array(n), k = fx.grit * 20;
        for (var i = 0; i < n; i++) { var x = i * 2 / n - 1; curve[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
        shaper.curve = curve;
        node.connect(shaper);
        node = shaper;
      }
      if (fx.crush) {
        // Fewer amplitude steps: the grainy edge of compressed samples.
        var crusher = keep(ctx.createWaveShaper());
        var cn = 2048, cc = new Float32Array(cn), lv = Math.pow(2, fx.crush) / 2;
        for (var ci = 0; ci < cn; ci++) cc[ci] = Math.round((ci * 2 / cn - 1) * lv) / lv;
        crusher.curve = cc;
        node.connect(crusher);
        node = crusher;
      }
      if (fx.lowpass) {
        var lp = keep(ctx.createBiquadFilter());
        lp.type = 'lowpass';
        lp.frequency.value = fx.lowpass;
        lp.Q.value = 0.5;
        node.connect(lp);
        node = lp;
      }
      if (fx.sweep) {
        // A resonant low-pass whose cutoff rises and falls once every `bars` bars.
        var sw = keep(ctx.createBiquadFilter());
        sw.type = 'lowpass';
        sw.frequency.value = fx.sweep.freq;
        sw.Q.value = fx.sweep.q || 6;
        var lfo = keep(ctx.createOscillator());
        lfo.type = 'sine';
        lfo.frequency.value = 1 / ((fx.sweep.bars || 4) * 4 * 60 / theme.bpm);
        var dep = keep(ctx.createGain());
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
        var delay = keep(ctx.createDelay(1.0));
        delay.delayTime.value = fx.echo.time;
        var fb = keep(ctx.createGain());
        fb.gain.value = fx.echo.feedback;
        var ew = keep(ctx.createGain());
        ew.gain.value = fx.echo.mix;
        node.connect(delay);
        delay.connect(fb);
        fb.connect(delay);
        delay.connect(ew);
        ew.connect(bus);
      }
      if (fx.reverb) {
        var conv = keep(ctx.createConvolver());
        conv.buffer = impulseFor(fx.reverb);
        var wet = keep(ctx.createGain());
        wet.gain.value = fx.reverb.mix;
        node.connect(conv);
        conv.connect(wet);
        wet.connect(bus);
      }
      return input;
    }

    /**
     * A reverb's impulse: seconds of decaying noise, built ONCE per reverb and
     * shared by every change into that arrangement (item 1238). Built on every
     * change it cost the page up to four seconds of stereo noise, computed in
     * the very frame the ring starts.
     */
    var impulses = [];
    function impulseFor(spec) {
      for (var i = 0; i < impulses.length; i++) if (impulses[i].spec === spec) return impulses[i].buffer;
      var sr = ctx.sampleRate, len = Math.floor(sr * spec.seconds);
      var ir = ctx.createBuffer(2, len, sr);
      var seed = 7;
      for (var ch = 0; ch < 2; ch++) {
        var d = ir.getChannelData(ch);
        for (var j = 0; j < len; j++) {
          seed = (seed * 16807) % 2147483647;
          d[j] = (seed / 1073741823.5 - 1) * Math.pow(1 - j / len, spec.decay);
        }
      }
      impulses.push({ spec: spec, buffer: ir });
      return ir;
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
        track.fx.push(o, g);
        var head = o;
        if (d.filter) {
          var flt = ctx.createBiquadFilter();
          track.fx.push(flt);
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
          track.fx.push(lfo, depth);
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
