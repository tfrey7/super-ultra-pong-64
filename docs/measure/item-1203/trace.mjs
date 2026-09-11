/*
 * Item 1203: a Chrome performance trace of the first era-change ring's long
 * frame on a freshly opened page.
 *
 * Each leg launches headless Chrome on a brand-new profile (tools/chrome.mjs, so
 * nothing survives from an earlier run), opens index.html?era=3 off disk,
 * presses Space (which starts the game and unlocks sound), plays one second,
 * forces the point that moves the machine to era 4 -- the same schedule as item
 * 1164's firstring.mjs -- and records a full trace (Tracing.start / end) from
 * just before the point to the end of the ring. The page marks every rAF tick
 * with performance.mark('tick'), so the long frame is found in the trace's own
 * clock, and every thread's work inside it is summed.
 *
 *   node docs/measure/item-1203/trace.mjs --label cold [--runs 3] [--port 9391]
 *        [--no-audio]   take AudioContext away before the page loads
 *        [--control]    same schedule, no point forced
 *
 * Writes, beside this file: <label>.json (every leg's breakdown), and
 * <label>-leg<N>.trace.json.gz -- the trace cut to 150 ms either side of the long
 * frame (or of the ring's first frame when there is none), which opens as-is in
 * DevTools' Performance panel (Load profile).
 */
import { writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { launchChrome } from '../../../tools/chrome.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const LABEL = arg('--label', 'run');
const RUNS = Number(arg('--runs', 3));
const NO_AUDIO = process.argv.includes('--no-audio');
const CONTROL = process.argv.includes('--control');
let port = Number(arg('--port', 9391));
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CATEGORIES = [
  'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
  'toplevel', 'blink', 'blink.user_timing', 'cc', 'gpu', 'viz', 'audio', 'media', 'v8', 'loading',
  'disabled-by-default-gpu.service', 'disabled-by-default-audio', 'disabled-by-default-cc.debug.scheduler.frames',
  'benchmark', 'renderer.scheduler', 'mojom', 'ipc',
  // What the GPU process is drawing and compiling: Skia's ops and ANGLE's work.
  ...(process.argv.includes('--skia') ? ['skia', 'disabled-by-default-skia', 'disabled-by-default-skia.gpu',
    'disabled-by-default-skia.shaders', 'gpu.angle', 'disabled-by-default-gpu.angle'] : [])
];

async function leg(n) {
  const PORT = port++;
  const chrome = launchChrome(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
    '--mute-audio', '--no-first-run', '--window-size=1000,760', 'about:blank'], { name: 'item1203' });
  let ws;
  try {
    let wsUrl = null;
    for (let k = 0; k < 80 && !wsUrl; k++) {
      try {
        const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
        const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) wsUrl = page.webSocketDebuggerUrl;
      } catch { /* coming up */ }
      if (!wsUrl) await sleep(250);
    }
    if (!wsUrl) throw new Error('Chrome never opened a page');
    ws = new WebSocket(wsUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let next = 1;
    const pending = new Map();
    const events = [];
    let traceDone = null;
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Tracing.dataCollected') { for (const e of msg.params.value) events.push(e); return; }
      if (msg.method === 'Tracing.tracingComplete') { traceDone && traceDone(); return; }
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = next++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
    });
    const evalJs = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    if (NO_AUDIO) await send('Page.addScriptToEvaluateOnNewDocument', { source: 'delete window.AudioContext; delete window.webkitAudioContext;' });
    const url = pathToFileURL(path.join(ROOT, 'index.html')).href + '?era=3';
    await send('Page.navigate', { url });
    await sleep(900);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
    await sleep(1500);

    await send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: CATEGORIES } });
    // Mark every rAF tick, the ring's first frame and every sound the player makes.
    await evalJs(`(() => { const s = window.__pongSound;
      if (s && !s.__marked) { const h = s.handle; s.handle = function (st) { const n = h.apply(this, arguments); if (n) performance.mark('sound ' + n); return n; }; s.__marked = 1; }
      window.__ticks = []; let wiping = false;
      (function tick(now) { performance.mark('tick'); const m = window.PongRender.eraChangeMoment(window.__pong);
        const w = !!(m && m.wiping); if (w && !wiping) performance.mark('ring first frame'); wiping = w;
        window.__ticks.push([now, w, m ? m.raw : null]); if (window.__ticks.length < 400) requestAnimationFrame(tick); })(performance.now());
      return 1; })()`);
    await sleep(400);
    if (!CONTROL) {
      await evalJs(`(() => { performance.mark('point forced'); const g = window.__pong; g.era = 3; g.startEra = 0;
        g.serveDelay = 0; g.ball.x = -8; g.ball.y = 150; g.ball.vx = -600; g.ball.vy = 0; return g.era; })()`);
    }
    await sleep(1700);
    const page = await evalJs(`({ era: window.__pong.era, audio: window.__pongSound ? window.__pongSound.audioState() : 'no player',
      boots: window.__pongSound ? window.__pongSound.boots : 0, played: window.__pongSound ? window.__pongSound.played : 0 })`);
    const done = new Promise((r) => { traceDone = r; });
    await send('Tracing.end');
    await done;
    return { n, port: PORT, page, ...analyse(events, n) };
  } finally {
    try { ws && ws.close(); } catch { /* gone */ }
    await chrome.close();
  }
}

/** Find the longest rAF gap in trace time and sum every thread's work inside it. */
function analyse(events, n) {
  const pname = new Map(), tname = new Map();
  for (const e of events) {
    if (e.ph !== 'M') continue;
    if (e.name === 'process_name') pname.set(e.pid, e.args.name);
    if (e.name === 'thread_name') tname.set(`${e.pid}:${e.tid}`, e.args.name);
  }
  const marks = (name) => events.filter((e) => e.name === name && (e.cat || '').includes('blink.user_timing')).map((e) => e.ts).sort((a, b) => a - b);
  const ticks = [...new Set(marks('tick'))];
  const ringAt = marks('ring first frame')[0] ?? null;
  const pointAt = marks('point forced')[0] ?? null;
  const sounds = events.filter((e) => /^sound /.test(e.name) && (e.cat || '').includes('blink.user_timing')).map((e) => e.ts);
  const gaps = [];
  for (let k = 1; k < ticks.length; k++) gaps.push({ from: ticks[k - 1], to: ticks[k], ms: (ticks[k] - ticks[k - 1]) / 1000 });
  const sorted = gaps.map((g) => g.ms).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const worst = gaps.reduce((a, g) => (g.ms > (a ? a.ms : -1) ? g : a), null);
  const long = gaps.filter((g) => g.ms > 3 * median);
  const win = worst && worst.ms > 3 * median ? worst : (ringAt ? { from: ringAt - 16000, to: ringAt, ms: 16 } : worst);

  // Every complete event overlapping the window, per thread: the top-level ones
  // (no parent on the same thread inside the window) add up to the thread's busy time.
  const byThread = new Map();
  const complete = events.filter((e) => e.ph === 'X' && typeof e.dur === 'number' && e.ts < win.to && e.ts + e.dur > win.from);
  complete.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  for (const e of complete) {
    const key = `${e.pid}:${e.tid}`;
    if (!byThread.has(key)) byThread.set(key, { thread: `${pname.get(e.pid) || e.pid} / ${tname.get(key) || e.tid}`, busyMs: 0, stack: [], top: [], names: new Map() });
    const t = byThread.get(key);
    const s = Math.max(e.ts, win.from), f = Math.min(e.ts + e.dur, win.to);
    while (t.stack.length && t.stack[t.stack.length - 1] <= e.ts) t.stack.pop();
    if (!t.stack.length) { t.busyMs += (f - s) / 1000; t.top.push({ name: e.name, ms: +((f - s) / 1000).toFixed(2), atMs: +((e.ts - win.from) / 1000).toFixed(1) }); }
    t.stack.push(e.ts + e.dur);
    t.names.set(e.name, (t.names.get(e.name) || 0) + (f - s) / 1000);
  }
  const threads = [...byThread.values()].map((t) => ({
    thread: t.thread, busyMs: +t.busyMs.toFixed(2),
    topLevel: t.top.sort((a, b) => b.ms - a.ms).slice(0, 6),
    heaviestNames: [...t.names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, ms]) => ({ name, ms: +ms.toFixed(2) }))
  })).filter((t) => t.busyMs >= 0.5).sort((a, b) => b.busyMs - a.busyMs);

  // Instant and async events in the window, by name (audio device starts, decodes, etc.).
  const other = new Map();
  for (const e of events) {
    if (e.ph === 'X' || e.ph === 'M' || e.ts < win.from || e.ts > win.to) continue;
    const k = `${e.ph} ${e.cat} ${e.name}`;
    other.set(k, (other.get(k) || 0) + 1);
  }

  // The trace, cut to 400 ms either side of the window, for DevTools.
  const lo = win.from - 150000, hi = win.to + 150000;
  const cut = events.filter((e) => e.ph === 'M' || (e.ts >= lo && e.ts <= hi) || (e.ph === 'X' && e.ts < hi && e.ts + (e.dur || 0) > lo));
  const file = `${LABEL}-leg${n}.trace.json.gz`;
  writeFileSync(path.join(HERE, file), gzipSync(JSON.stringify({ traceEvents: cut })));

  const rel = (ts) => (ts === null || ts === undefined ? null : +((ts - win.from) / 1000).toFixed(1));
  return {
    traceFile: file, eventsTotal: events.length, eventsCut: cut.length,
    medianFrameMs: +median.toFixed(2), longFrames: long.map((g) => +g.ms.toFixed(1)),
    window: { ms: +win.ms.toFixed(1), pointAtMs: rel(pointAt), ringFirstFrameAtMs: rel(ringAt), soundsAtMs: sounds.map(rel) },
    threads, otherEvents: [...other.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, c]) => `${c}x ${k}`)
  };
}

const results = [];
for (let r = 0; r < RUNS; r++) {
  const res = await leg(r + 1);
  results.push(res);
  console.log(`leg ${res.n}: long frames ${JSON.stringify(res.longFrames)} (median ${res.medianFrameMs} ms); window ${res.window.ms} ms, ` +
    `point at ${res.window.pointAtMs}, ring at ${res.window.ringFirstFrameAtMs}, sounds at ${JSON.stringify(res.window.soundsAtMs)}; page ${JSON.stringify(res.page)}`);
  for (const t of res.threads.slice(0, 8)) console.log(`   ${t.busyMs.toFixed(1).padStart(6)} ms  ${t.thread}  <- ${t.heaviestNames.slice(0, 5).map((x) => `${x.name} ${x.ms}`).join(', ')}`);
}
const out = { label: LABEL, noAudio: NO_AUDIO, control: CONTROL, root: ROOT, chrome: CHROME, when: new Date().toISOString(), categories: CATEGORIES, results };
writeFileSync(path.join(HERE, `${LABEL}.json`), JSON.stringify(out, null, 1) + '\n');
console.log('wrote', path.join(HERE, `${LABEL}.json`));
