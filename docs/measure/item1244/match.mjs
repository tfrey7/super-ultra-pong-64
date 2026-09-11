/*
 * Item 1244: one whole eleven-point match, heard end to end -- offline.
 *
 * In headless Chrome it hands the real player (window.PongMusic.createMusic)
 * an OfflineAudioContext behind a clock this script moves, and drives it the
 * way the page does (an update every 50 ms) through a scripted match:
 *
 *   eras 0 to 10   six seconds on each rung, one point per rung (score e after
 *                  e points), the rally climbing from 0 to 12 hits inside each
 *                  rung; the tenth point lands on the 360, which is match point
 *   announce       phase 'over' on the 360 (3.2 s)
 *   rewind         the real PongMatch.timeline walking the era down, a rung
 *                  every half second, 360 to the arcade
 *   thanks         era 0, still 'over' (6 s)
 *   title          back to INSERT COIN, the music let go of (3 s)
 *
 * No paddle events are sent, so the music is never ducked: the peaks here are
 * the loudest the soundtrack can be, not a real rally's. The render has four
 * channels: 0-1 the limiter's output (what the page sends), 2-3 the master
 * bus going INTO the limiter, so both are measured, not guessed.
 *
 * It also records every source node the player starts and stops, and the song
 * position each note was booked at, to answer: does every era change keep the
 * bar and beat (no step skipped or repeated, no gap in the step grid), where
 * in the beat does each cross-fade start and end, and are any of the old era's
 * drones still running once its fade has been retired.
 *
 *   node docs/measure/item1244/match.mjs [--port 9491]
 *
 * Writes match.json and match.txt beside itself.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg('port', 9491));
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?title=off&music=off';

class Session extends CdpConnection {
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
    return r.result.value;
  }
}

const RENDER = `(async () => {
  const M = window.PongMusic, PM = window.PongMatch;
  const SR = 22050, SEG = 6, TICK = 0.05, ANN = 3.2, STEP = 0.5, THANKS = 6, TAIL = 3;
  const TOTAL = 11 * SEG + ANN + 10 * STEP + THANKS + TAIL;
  const off = new OfflineAudioContext(4, Math.ceil(SR * (TOTAL + 1)), SR);
  let now = 0;
  const proxy = new Proxy(off, { get(t, p) {
    if (p === 'currentTime') return now;
    if (p === 'state') return 'running';
    const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; } });

  // every source the player starts and stops, with the song position it was booked at
  const sources = [];
  let music = null, pre = null;
  const S = AudioScheduledSourceNode.prototype;
  const start0 = S.start, stop0 = S.stop, connect0 = AudioNode.prototype.connect;
  S.start = function (when, ...a) {
    this.__rec = { t0: when || 0, t1: null, stopAt: null, pos: music ? music.position() : null,
                   era: music ? music.era : null, kind: this.constructor.name };
    sources.push(this.__rec);
    return start0.call(this, when, ...a);
  };
  S.stop = function (when, ...a) {
    if (this.__rec) { this.__rec.t1 = when === undefined ? now : when; this.__rec.stopAt = now; }
    return stop0.call(this, when, ...a);
  };
  AudioNode.prototype.connect = function (to, ...a) {
    if (to instanceof DynamicsCompressorNode) pre = this;
    return connect0.call(this, to, ...a);
  };
  try {
    music = M.createMusic({ AudioContext: function () { return proxy; } });
    music.unlock();
    // the master bus INTO the limiter, onto channels 2-3
    const split = off.createChannelSplitter(2), merge = off.createChannelMerger(4);
    connect0.call(pre, split);
    connect0.call(split, merge, 0, 2); connect0.call(split, merge, 1, 3);
    connect0.call(merge, off.destination);

    const game = { phase: 'playing', era: 0, rally: 0, score: { left: 0, right: 0 },
                   rules: { matchPoints: 11 }, events: [], time: 0 };
    const switches = [], checks = [], marks = [];
    let lastEra = null, openAtSwitch = 0;
    const open = () => sources.filter((r) => r.stopAt === null).length;
    function tick() {
      now += TICK; game.time += TICK;
      const before = sources.length;
      music.update(game);
      if (music.era !== lastEra) {
        // the drones this switch started: sources opened in this tick with no stop
        const mine = sources.slice(before).filter((r) => r.stopAt === null).length;
        switches.push({ t: now, from: lastEra, to: music.era, bar: music.lastSwitch && music.lastSwitch.bar,
                        step: music.lastSwitch && music.lastSwitch.step, drones: mine, phase: game.phase });
        lastEra = music.era;
      }
    }
    // the eleven rungs
    for (let e = 0; e <= 10; e++) {
      const t0 = now;
      game.era = e; game.score.left = Math.ceil(e / 2); game.score.right = Math.floor(e / 2);
      marks.push({ what: 'era ' + e, t: now });
      while (now < t0 + SEG - 1e-9) {
        game.rally = Math.min(12, Math.floor((now - t0) / 0.45));
        tick();
        if (Math.abs(now - (t0 + 1.7)) < TICK / 2) checks.push({ t: now, era: e, open: open(), released: music.released, crossfades: music.crossfades });
      }
      marks.push({ what: 'era ' + e + ' end', t: now, intensity: music.intensityNow, rally: game.rally });
    }
    // the eleventh point: the finale on the real timeline
    game.phase = 'over'; game.overAt = game.time; game.winner = 'left';
    const tOver = now;
    marks.push({ what: 'over', t: now });
    while (now < tOver + ANN + 10 * STEP + THANKS - 1e-9) {
      const f = PM.timeline(game.time - game.overAt, 10);
      game.era = f.era;
      tick();
    }
    const openThanks = open();
    game.phase = 'title';
    marks.push({ what: 'title', t: now });
    const tTitle = now;
    while (now < tTitle + TAIL - 1e-9) tick();
    checks.push({ t: now, era: 'title', open: open(), released: music.released, crossfades: music.crossfades });

    const buf = await off.startRendering();
    // loudness in a window: RMS (dBFS) and peak of the output (0-1) and of the input to the limiter (2-3)
    function win(a, b) {
      const i0 = Math.max(0, Math.floor(a * SR)), i1 = Math.min(buf.length, Math.floor(b * SR));
      const out = [buf.getChannelData(0), buf.getChannelData(1)], inn = [buf.getChannelData(2), buf.getChannelData(3)];
      let s = 0, pk = 0, pin = 0, over = 0, bent = 0, n = 0;
      for (let c = 0; c < 2; c++) for (let i = i0; i < i1; i++) {
        const y = out[c][i], ay = Math.abs(y), ax = Math.abs(inn[c][i]);
        s += y * y; n++; if (ay > pk) pk = ay; if (ax > pin) pin = ax;
        if (ay >= 0.889) over++; if (ay > 0.6) bent++;
      }
      const r3 = (v) => Math.round(v * 1000) / 1000;
      return { from: r3(a), to: r3(b), rmsDb: n ? Math.round(10 * Math.log10(s / n + 1e-20) * 10) / 10 : null,
               peak: r3(pk), peakIn: r3(pin), overCeiling: over, bentPastKnee: bent };
    }
    const windows = [];
    for (let e = 0; e <= 10; e++) {
      const t0 = e * SEG + 0.05;
      windows.push({ what: 'era ' + e + ' early (rally 3-6)', era: e, ...win(t0 + 1.6, t0 + 3.0) });
      windows.push({ what: 'era ' + e + ' late (rally 10-12)', era: e, ...win(t0 + 4.5, t0 + SEG) });
    }
    windows.push({ what: 'announce (360, intensity 1)', era: 10, ...win(tOver, tOver + ANN) });
    for (let k = 0; k < 10; k++) {
      const a = tOver + ANN + k * STEP;
      windows.push({ what: 'rewind rung ' + (10 - k) + ' to ' + (9 - k), era: 9 - k, ...win(a, a + STEP) });
    }
    windows.push({ what: 'thanks (era 0, intensity 1)', era: 0, ...win(tOver + ANN + 10 * STEP + 1.6, tOver + ANN + 10 * STEP + THANKS) });
    windows.push({ what: 'title tail (after the fade is let go)', era: null, ...win(tTitle + 1.7, tTitle + TAIL) });
    windows.push({ what: 'whole match', era: null, ...win(0, TOTAL) });

    // the step grid: the earliest onset booked at each song position, in booking order
    const steps = [];
    for (const r of sources) {
      if (r.pos === null || r.stopAt === null || r.t1 === r.t0) continue;
      const p = r.pos.bar * 16 + r.pos.step;
      const last = steps[steps.length - 1];
      if (last && last.p === p && Math.abs(r.t0 - last.t) < 0.2) { if (r.t0 < last.t) last.t = r.t0; }
      else steps.push({ p, t: r.t0 });
    }
    // position() reads the step AFTER the one being booked once book() moves on;
    // what matters is the run of positions and the spacing between them
    let skips = 0, repeats = 0;
    for (let i = 1; i < steps.length; i++) {
      const d = (steps[i].p - steps[i - 1].p + 128) % 128;
      if (d === 0) repeats++; else if (d !== 1) skips++;
    }
    for (const sw of switches) {
      if (sw.from === null) continue;
      // step onsets around the switch and the beats (every 4th step) either side of its start and its end
      const around = (T) => {
        let i = steps.findIndex((s) => s.t > T); if (i < 1) return null;
        const dt = steps[i].t - steps[i - 1].t;
        let b0 = i - 1; while (b0 > 0 && steps[b0].p % 4 !== 0) b0--;
        let b1 = i; while (b1 < steps.length - 1 && steps[b1].p % 4 !== 0) b1++;
        const beat = steps[b1].t - steps[b0].t;
        return { stepMs: Math.round(dt * 1000), beatPhase: Math.round((T - steps[b0].t) / beat * 100) / 100,
                 msFromBeat: Math.round(Math.min(T - steps[b0].t, steps[b1].t - T) * 1000) };
      };
      sw.start = around(sw.t); sw.end = around(sw.t + M.FADE_S);
      // the spacing of the step grid across the switch: largest departure from the steps before it
      const i = steps.findIndex((s) => s.t > sw.t);
      if (i > 3 && i + 3 < steps.length) {
        const ref = steps[i - 2].t - steps[i - 3].t;
        let worst = 0;
        for (let j = i - 1; j <= i + 2; j++) worst = Math.max(worst, Math.abs((steps[j].t - steps[j - 1].t) - ref));
        sw.gridJumpMs = Math.round(worst * 10000) / 10;
      }
    }
    return { total: TOTAL, sampleRate: SR, errors: music.errors, crossfades: music.crossfades, released: music.released,
             notesBooked: music.scheduled, sourcesStarted: sources.length, openAfterThanks: openThanks,
             stepRun: { steps: steps.length, skips, repeats }, marks, switches, checks, windows };
  } finally {
    S.start = start0; S.stop = stop0; AudioNode.prototype.connect = connect0;
  }
})()`;

const flags = ['--headless=new', '--mute-audio', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=' + PORT, '--no-first-run', '--no-default-browser-check', 'about:blank'];
const chrome = await launchChrome(CHROME, flags, { name: 'item1244' }).catch(refusePortTaken);
let ws, res;
try {
  let wsUrl = null;
  for (let t = 0; t < 60 && !wsUrl; t++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const p = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
      if (p) wsUrl = p.webSocketDebuggerUrl;
    } catch { /* coming up */ }
    if (!wsUrl) await sleep(250);
  }
  ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const s = new Session(ws);
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  await s.send('Page.navigate', { url: page });
  for (let t = 0; t < 100; t++) {
    if (await s.eval('!!(window.PongMusic && window.PongMatch && window.PongMusic.ARRANGEMENTS[10])').catch(() => false)) break;
    await sleep(100);
  }
  const t0 = Date.now();
  res = await s.eval(RENDER);
  res.renderSeconds = Math.round((Date.now() - t0) / 100) / 10;
} finally {
  try { ws && ws.close(); } catch { /* gone */ }
  await chrome.close();
}
const lines = [];
lines.push(`match: ${res.total} s rendered in ${res.renderSeconds} s wall; ${res.notesBooked} notes booked, ${res.sourcesStarted} sources started, ` +
  `${res.crossfades} cross-fades, ${res.released} arrangements let go of, errors ${res.errors}`);
lines.push(`song position: ${res.stepRun.steps} steps booked, ${res.stepRun.skips} skipped, ${res.stepRun.repeats} repeated`);
for (const w of res.windows) {
  lines.push(`${w.what.padEnd(38)} ${String(w.rmsDb).padStart(6)} dBFS RMS  peak out ${String(w.peak).padEnd(5)} in ${String(w.peakIn).padEnd(5)}  ` +
    `samples >= ceiling ${w.overCeiling}, past the knee ${w.bentPastKnee}`);
}
for (const sw of res.switches) {
  lines.push(`switch ${String(sw.from).padStart(4)} -> ${String(sw.to).padEnd(2)} at ${sw.t.toFixed(2)} s (${sw.phase}), bar ${sw.bar} step ${sw.step}, ` +
    `${sw.drones} drones started` + (sw.start ? `; fade starts ${sw.start.msFromBeat} ms from a beat (phase ${sw.start.beatPhase}), ` +
    `ends ${sw.end ? sw.end.msFromBeat : '?'} ms from a beat (phase ${sw.end ? sw.end.beatPhase : '?'}); step grid jump ${sw.gridJumpMs} ms` : ''));
}
for (const c of res.checks) lines.push(`check at ${c.t.toFixed(2)} s (era ${c.era}): ${c.open} sources with no stop yet, ${c.released} let go of / ${c.crossfades} cross-fades`);
lines.push(`open sources at the end of the thanks screen: ${res.openAfterThanks}`);
const text = lines.join('\n');
console.log(text);
writeFileSync(path.join(HERE, 'match.json'), JSON.stringify({ taken: new Date().toISOString(), ...res }, null, 1) + '\n');
writeFileSync(path.join(HERE, 'match.txt'), text + '\n');
console.log('wrote ' + path.join(HERE, 'match.json'));
