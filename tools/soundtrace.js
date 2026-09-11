'use strict';
/*
 * The sound player's full schedule for eras 0 to 4, call by call: every node it
 * makes, every property it sets, every AudioParam call with its value and time,
 * every connection, every start and stop. Taken through a recording stand-in for
 * Web Audio, so it needs no browser and no audio device.
 *
 * tools/sound-eras0-4.json holds the schedule as it stood before item 1181 grew
 * the 3D eras' voice grammar (noise, attack, filter, unison, lfo, shape, reverb,
 * bus), and test/sound.test.js compares the live player against it: nothing a
 * player hears on the arcade machine, the Atari, the NES, the Genesis or the
 * Super Nintendo may change. A deliberate change to one of those voices
 * re-records it:
 *
 *   node tools/soundtrace.js          # writes tools/sound-eras0-4.json
 *
 * Lives under tools/ because nothing under test/ may be a helper (node --test
 * runs every .js file there).
 */
const fs = require('node:fs');
const path = require('node:path');

const FIXTURE = path.join(__dirname, 'sound-eras0-4.json');
const TYPES = ['paddle', 'wall', 'score', 'boot'];

/**
 * A recording AudioContext with the whole surface the player may reach for,
 * logging into `log.ops`. Node ids count from 0 in creation order; `mark()`
 * starts a new segment and renumbers from there, so each event's schedule reads
 * the same whatever came before it. A node made before the mark reads as its
 * label ('master', 'destination') or 'old<segment>.<id>'.
 */
function traceContext() {
  const log = { ops: [], next: 0, all: [], segment: 0 };
  const round = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
  const name = (n) => (n && n.__label ? n.__label : (n && n.__id !== undefined ? 'n' + n.__id : String(n)));
  function param(owner, pname) {
    const p = { value: 0 };
    for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime']) {
      p[m] = function (v, t) {
        if (m === 'exponentialRampToValueAtTime' && !(v > 0)) throw new RangeError('exponential ramp to ' + v);
        log.ops.push(['param', name(owner), pname, m, round(v), round(t)]);
      };
    }
    return new Proxy(p, {
      set(o, k, v) { if (k === 'value') log.ops.push(['param', name(owner), pname, 'value', round(v)]); o[k] = v; return true; }
    });
  }
  function node(kind, params, props) {
    const n = { __id: log.next++, kind };
    log.all.push(n);
    log.ops.push(['create', kind, name(n)]);
    n.connect = (to) => { log.ops.push(['connect', name(n), to && to.owner ? name(to.owner) + '.' + to.pname : name(to)]); return to; };
    n.disconnect = () => {};
    for (const pn of params || []) {
      const p = param(n, pn);
      p.owner = n; p.pname = pn;
      n[pn] = p;
    }
    return new Proxy(n, {
      set(o, k, v) {
        if (k !== 'onended' && typeof v !== 'function' && String(k).slice(0, 2) !== '__') log.ops.push(['set', name(o), k, v && v.length > 16 ? 'array(' + v.length + ')' : round(v)]);
        o[k] = v; return true;
      },
      get(o, k) { return o[k]; }
    });
  }
  class TraceContext {
    constructor() {
      this.currentTime = 0;
      this.state = 'running';
      this.sampleRate = 48000;
      this.destination = node('destination');
      this.destination.__label = 'destination';
    }
    createOscillator() {
      const o = node('oscillator', ['frequency', 'detune']);
      o.start = (t) => log.ops.push(['start', name(o), round(t)]);
      o.stop = (t) => log.ops.push(['stop', name(o), round(t)]);
      return o;
    }
    createGain() { return node('gain', ['gain']); }
    createDelay() { return node('delay', ['delayTime']); }
    createBiquadFilter() { return node('biquad', ['frequency', 'Q', 'gain', 'detune']); }
    createWaveShaper() { return node('shaper'); }
    createConvolver() { return node('convolver'); }
    createBufferSource() {
      const s = node('buffersource', ['playbackRate', 'detune']);
      s.start = (t, off) => log.ops.push(['start', name(s), round(t), round(off || 0)]);
      s.stop = (t) => log.ops.push(['stop', name(s), round(t)]);
      return s;
    }
    createBuffer(channels, length, rate) {
      log.ops.push(['buffer', channels, length, rate]);
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate: rate, getChannelData: (c) => data[c] };
    }
  }
  function mark() {
    // A node from an earlier segment (a bus built by the first event and kept)
    // keeps a name that can never collide with this segment's n0, n1, ...
    for (const n of log.all) if (!n.__label) n.__label = 'old' + log.segment + '.' + n.__id;
    log.segment += 1;
    log.ops = [];
    log.next = 0;
  }
  return { TraceContext, log, mark };
}

/** The schedule each event plays on eras 0 to 4: { 'era/type': [ops...] }. */
function traceEras(PongSound, eras) {
  const out = {};
  for (const era of eras || [0, 1, 2, 3, 4]) {
    const { TraceContext, log, mark } = traceContext();
    const player = PongSound.createPlayer({ AudioContext: TraceContext });
    player.unlock();
    // What unlock made keeps a name: the master gain is the one gain it makes.
    for (const n of log.all) if (n.kind === 'gain') n.__label = 'master';
    for (const type of TYPES) {
      if (!PongSound.voicesFor(era, type).length) continue;
      mark();
      // A bare 'boot' event is not something the game sends; a point that rose is.
      const ev = type === 'boot' ? { type: 'score', era, time: 1 } : { type, era };
      const state = type === 'boot' ? { era, eraChangedAt: 1, events: [ev] } : null;
      if (state) player.handle(state); else player.play(ev);
      out[era + '/' + type] = log.ops.slice();
    }
  }
  return out;
}

module.exports = { traceContext, traceEras, FIXTURE };

if (require.main === module) {
  const PongSound = require('../src/sound.js');
  const trace = traceEras(PongSound);
  fs.writeFileSync(FIXTURE, JSON.stringify(trace, null, 0).replace(/\],\["/g, '],\n["') + '\n');
  const n = Object.values(trace).reduce((a, ops) => a + ops.length, 0);
  console.log('wrote ' + FIXTURE + ': ' + Object.keys(trace).length + ' events, ' + n + ' calls');
}
