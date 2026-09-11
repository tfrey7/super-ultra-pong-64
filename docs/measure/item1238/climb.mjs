/*
 * Item 1238: does the game get slower with every era change? Tim, playing the
 * live game: "each time this thing transitions eras i think it gets slower and
 * slower". Two readings of every era, on the page's own rAF clock -- the same
 * one-second reading tools/playtest.mjs takes on its climb (item 1192):
 *
 *   fresh   index.html?era=N, a new page for every era, started with a key
 *   climb   one page from the title, coin in, then one point per rung -- ten
 *           real era changes in a row, the way a match meets them
 *
 * Beside each reading it takes what could be piling up: the page's own counts
 * from a small wrapper installed before any game script runs (animation-frame
 * callbacks asked for per frame, live intervals, pending timeouts, event
 * listeners, canvases made, audio nodes made and audio sources still playing),
 * and Chrome's own metrics over the same second (JS heap, DOM nodes, listeners,
 * script time per second).
 *
 * Both paddles are held on the ball while the clock runs, so no point goes in.
 *
 *   node docs/measure/item1238/climb.mjs [--port 9471] [--gpu] [--label before]
 *
 * Writes climb-<label>.json beside itself.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, portTakenWhy } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : dflt; };
const PORT = Number(arg('--port', 9471));
const GPU = process.argv.includes('--gpu');
const LABEL = arg('--label', GPU ? 'gpu' : 'harness');
const ONLY = arg('--only', '');          // 'fresh' or 'climb'
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

// Installed before the page's own scripts: counts only, it changes nothing the game does.
const WRAP = `(() => {
  const L = window.__leak = { raf: 0, intervals: 0, timeouts: 0, listeners: 0, canvases: 0,
    audioNodes: 0, sourcesLive: 0, sourcesStarted: 0 };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { L.raf++; return raf(cb); };
  const si = window.setInterval.bind(window), ci = window.clearInterval.bind(window);
  const live = new Set();
  window.setInterval = (f, ms, ...a) => { const id = si(f, ms, ...a); live.add(id); L.intervals = live.size; return id; };
  window.clearInterval = (id) => { live.delete(id); L.intervals = live.size; return ci(id); };
  const st = window.setTimeout.bind(window), ct = window.clearTimeout.bind(window);
  const pend = new Set();
  window.setTimeout = (f, ms, ...a) => { const id = st(() => { pend.delete(id); L.timeouts = pend.size;
    typeof f === 'function' && f(...a); }, ms); pend.add(id); L.timeouts = pend.size; return id; };
  window.clearTimeout = (id) => { pend.delete(id); L.timeouts = pend.size; return ct(id); };
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (t, f, o) {
    if (!(this instanceof AudioNode)) L.listeners++; return add.call(this, t, f, o); };
  EventTarget.prototype.removeEventListener = function (t, f, o) {
    if (!(this instanceof AudioNode)) L.listeners--; return rem.call(this, t, f, o); };
  const ce = Document.prototype.createElement;
  Document.prototype.createElement = function (n, o) { if (String(n).toLowerCase() === 'canvas') L.canvases++;
    return ce.call(this, n, o); };
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    for (const k of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
      if (!/^create/.test(k) || /Buffer$|PeriodicWave/.test(k)) continue;
      const f = BaseAudioContext.prototype[k];
      if (typeof f !== 'function') continue;
      BaseAudioContext.prototype[k] = function (...a) { L.audioNodes++; return f.apply(this, a); };
    }
    const start = AudioScheduledSourceNode.prototype.start;
    AudioScheduledSourceNode.prototype.start = function (...a) {
      L.sourcesStarted++; L.sourcesLive++;
      add.call(this, 'ended', () => { L.sourcesLive--; });
      return start.apply(this, a);
    };
  }
})();`;

class Session extends CdpConnection {
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error((d.exception && d.exception.description) || d.text);
    }
    return r.result.value;
  }
  async metrics() {
    const r = await this.send('Performance.getMetrics');
    const m = {};
    for (const x of r.metrics) m[x.name] = x.value;
    return m;
  }
}

function stats(d) {
  const s = d.slice().sort((a, b) => a - b), total = s.reduce((a, b) => a + b, 0);
  return { frames: s.length, total: +total.toFixed(1), mean: +(total / Math.max(1, s.length)).toFixed(2),
    p95: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(2), max: +(s[s.length - 1] || 0).toFixed(2) };
}

async function waitFor(s, expr, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await s.eval(expr).catch(() => false)) return true;
    await sleep(40);
  }
  return false;
}

/** One second of ordinary play at `era`, with the counts and Chrome's metrics around it. */
async function reading(s, era) {
  const c0 = await s.eval('Object.assign({}, window.__leak)');
  const m0 = await s.metrics();
  let done = false;
  const timing = s.eval(`new Promise((done) => {
    const d = []; let last = null, kept = 0; const t0 = performance.now(); const r0 = window.__leak.raf;
    function tick(now) {
      const g = window.__pong, m = window.PongRender.eraChangeMoment(g);
      const ordinary = g.phase === 'playing' && g.era === ${era} && g.serveDelay <= 0 && !(m && m.wiping);
      if (ordinary && last !== null) { d.push(now - last); kept += now - last; }
      last = ordinary ? now : null;
      if (kept < 1000 && now - t0 < 3000) requestAnimationFrame(tick);
      else done({ d, rafPerFrame: (window.__leak.raf - r0) / Math.max(1, d.length) });
    }
    requestAnimationFrame(tick);
  })`).finally(() => { done = true; });
  while (!done) {
    await s.eval(`(() => { const g = window.__pong;
      for (const p of [g.left, g.right]) p.y = Math.max(0, Math.min(g.height - p.h, g.ball.y + 6 - p.h / 2));
      return 0; })()`);
    await sleep(30);
  }
  const t = await timing;
  const m1 = await s.metrics();
  const c1 = await s.eval('Object.assign({}, window.__leak)');
  const secs = Math.max(0.001, m1.Timestamp - m0.Timestamp);
  const music = await s.eval(`(() => { const m = window.__pongMusic; return m ? { era: m.era, scheduled: m.scheduled,
    crossfades: m.crossfades, errors: m.errors } : null; })()`);
  return {
    era, ...stats(t.d),
    rafPerFrame: +t.rafPerFrame.toFixed(2),
    scriptMsPerSec: +((m1.ScriptDuration - m0.ScriptDuration) * 1000 / secs).toFixed(1),
    taskMsPerSec: +((m1.TaskDuration - m0.TaskDuration) * 1000 / secs).toFixed(1),
    heapMB: +(m1.JSHeapUsedSize / 1048576).toFixed(1),
    nodes: m1.Nodes, jsListeners: m1.JSEventListeners,
    counts: c1, music
  };
}

function line(kind, r) {
  const c = r.counts;
  return `${kind.padEnd(5)} era ${String(r.era).padStart(2)}: mean ${String(r.mean).padStart(6)} ms, p95 ${String(r.p95).padStart(6)}` +
    ` | script ${String(r.scriptMsPerSec).padStart(6)} ms/s, raf/frame ${r.rafPerFrame}, heap ${r.heapMB} MB,` +
    ` listeners ${c.listeners}, intervals ${c.intervals}, timeouts ${c.timeouts}, canvases ${c.canvases},` +
    ` audio nodes ${c.audioNodes}, sources live ${c.sourcesLive}`;
}

async function startGame(s) {
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
}

async function fresh(s) {
  const rows = [];
  for (let era = 0; era <= 10; era++) {
    await s.send('Page.navigate', { url: `${base}?era=${era}` });
    await waitFor(s, '!!(window.__pong && window.__leak && document.getElementById("field"))', 10000);
    await sleep(300);
    await startGame(s);
    await waitFor(s, 'window.__pong.phase === "playing" && window.__pong.serveDelay <= 0', 4000);
    const r = await reading(s, era);
    rows.push(r);
    console.log(line('fresh', r));
  }
  return rows;
}

async function climb(s) {
  const rows = [];
  await s.send('Page.navigate', { url: base });
  await waitFor(s, '!!(window.__pong && window.__leak && document.getElementById("field"))', 10000);
  await sleep(900);
  await startGame(s);
  await waitFor(s, 'window.__pong.phase === "playing"', 3000);
  for (let rung = 0; rung <= 10; rung++) {
    await waitFor(s, `(() => { const g = window.__pong, m = window.PongRender.eraChangeMoment(g);
      return g.era === ${rung} && g.serveDelay <= 0 && !(m && m.wiping); })()`, 6000);
    const r = await reading(s, rung);
    rows.push(r);
    console.log(line('climb', r));
    if (rung === 10) break;
    // One point: the ball put just past the computer's paddle, heading out.
    await s.eval(`(() => { const g = window.__pong, r = g.right;
      g.ball.x = r.x + r.w + 2; g.ball.y = g.height * 0.3; g.ball.vx = 600; g.ball.vy = 0; })()`);
    const moved = await waitFor(s, `window.__pong.era === ${rung + 1}`, 5000);
    if (!moved) { console.log(`climb: no era change from ${rung} within 5 s`); break; }
  }
  return rows;
}

const taken = await portTakenWhy(PORT);
if (taken) { console.log(`port ${PORT} is taken (${taken}); pick another with --port`); process.exit(2); }
const flags = ['--headless=new', '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files',
  '--autoplay-policy=no-user-gesture-required',
  '--window-size=1000,760', '--remote-debugging-port=' + PORT, '--no-first-run',
  '--no-default-browser-check', 'about:blank'];
if (!GPU) flags.unshift('--disable-gpu');
const chrome = launchChrome(CHROME, flags, { name: 'climb1238' });
let ws;
const out = { taken: new Date().toISOString(), label: LABEL, gpu: GPU, fresh: [], climb: [] };
try {
  let wsUrl = null;
  for (let t = 0; t < 60 && !wsUrl; t++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch { /* coming up */ }
    if (!wsUrl) await sleep(250);
  }
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const s = new Session(ws);
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  await s.send('Performance.enable');
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: WRAP });
  if (ONLY !== 'fresh') out.climb = await climb(s);
  if (ONLY !== 'climb') out.fresh = await fresh(s);
} finally {
  try { ws && ws.close(); } catch { /* gone */ }
  await chrome.close();
}
if (out.fresh.length && out.climb.length) {
  console.log('\nera  fresh mean  climb mean  gap');
  for (let e = 0; e < out.climb.length; e++) {
    const f = out.fresh[e], c = out.climb[e];
    if (!f) continue;
    console.log(`${String(e).padStart(3)}  ${String(f.mean).padStart(10)}  ${String(c.mean).padStart(10)}  ${(c.mean - f.mean).toFixed(2)}`);
  }
}
const file = path.join(HERE, `climb-${LABEL}.json`);
writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log('wrote ' + file);
