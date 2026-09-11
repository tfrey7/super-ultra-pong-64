/*
 * Item 1164's measurement: the FIRST era-change ring on a freshly opened page.
 *
 * Every leg launches headless Chrome on a brand-new profile directory (so no
 * shader, code or disk cache survives from an earlier run), opens index.html
 * ?era=3 off disk, starts the game, times one second of ordinary play, forces a
 * point that moves the machine to era 4, and times the ring with the page's own
 * rAF clock -- the same timing tools/playtest.mjs uses. Two legs per run: the
 * ring with era 4's flourish on, and the plain ring (the flourish removed from
 * the look before the point). Long frame = over 3x the median frame across the
 * ring.
 *
 *   node docs/shots/item-1164/firstring.mjs --label before [--runs 3] [--port 9361]
 *
 * Writes firstring-<label>.json beside this file.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const LABEL = arg('--label', 'run');
const RUNS = Number(arg('--runs', 3));
let port = Number(arg('--port', 9361));
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const TMP = process.env.TEMP || 'G:/claude-tmp';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function leg(plain) {
  const PORT = port++;
  const profile = path.join(TMP, `item-1164-chrome-${PORT}-${Date.now()}`);   // never reused: always cold
  mkdirSync(profile, { recursive: true });
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--mute-audio', '--no-first-run', '--window-size=1000,760', 'about:blank'], { stdio: 'ignore' });
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
    const errors = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
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

    await send('Runtime.enable');
    const url = pathToFileURL(path.join(ROOT, 'index.html')).href + '?era=3';
    await send('Page.navigate', { url });
    await sleep(900);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
    await sleep(1500);

    const timing = (ms) => evalJs(`new Promise((done) => { const stamps = [], ring = [], raws = []; const t0 = performance.now();
      function tick(now) { const m = window.PongRender.eraChangeMoment(window.__pong);
        stamps.push(now); ring.push(!!(m && m.wiping)); raws.push(m ? m.raw : null);
        if (now - t0 < ${ms}) requestAnimationFrame(tick); else done({ stamps, ring, raws }); }
      requestAnimationFrame(tick); })`);
    const stats = (d) => {
      const s = [...d].sort((a, b) => a - b);
      const mean = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
      return { frames: s.length, meanMs: +mean.toFixed(2), medianMs: +(s[Math.floor(s.length / 2)] || 0).toFixed(2),
        p95Ms: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(2), maxMs: +(s[s.length - 1] || 0).toFixed(2) };
    };
    const deltas = (stamps) => { const d = []; for (let k = 1; k < stamps.length; k++) d.push(stamps[k] - stamps[k - 1]); return d; };

    const baseline = stats(deltas((await timing(1000)).stamps));
    if (plain) await evalJs('(() => { delete window.PongRender.eraLook(4).flourish; return 1; })()');
    await evalJs(`(() => { const g = window.__pong; g.era = 3; g.startEra = 0;
      g.serveDelay = 0; g.ball.x = -8; g.ball.y = 150; g.ball.vx = -600; g.ball.vy = 0; return g.era; })()`);
    const run = await timing(1700);
    // Every frame interval that touches the ring: the one INTO its first frame counts.
    const ring = [];
    for (let k = 1; k < run.stamps.length; k++) {
      if (run.ring[k] || run.ring[k - 1]) ring.push({ ms: run.stamps[k] - run.stamps[k - 1], rawBefore: run.raws[k - 1], rawAfter: run.raws[k] });
    }
    const ringStats = stats(ring.map((f) => f.ms));
    const longFrames = ring.filter((f) => f.ms > 3 * ringStats.medianMs)
      .map((f) => ({ ms: +f.ms.toFixed(1), rawBefore: f.rawBefore, rawAfter: f.rawAfter }));
    const era = await evalJs('window.__pong.era');
    return { leg: plain ? 'plain ring' : 'era 4 flourish on', port: PORT, baseline, ring: ringStats, longFrames, eraAfter: era, errors };
  } finally {
    try { ws && ws.close(); } catch { /* gone */ }
    chrome.kill();
    await sleep(400);
  }
}

const results = [];
for (let r = 0; r < RUNS; r++) {
  for (const plain of [false, true]) {
    const res = await leg(plain);
    results.push({ run: r + 1, ...res });
    console.log(`run ${r + 1} ${res.leg.padEnd(18)} ring ${res.ring.frames} frames, median ${res.ring.medianMs} ms, ` +
      `mean ${res.ring.meanMs} ms, max ${res.ring.maxMs} ms, long frames: ` +
      (res.longFrames.length ? res.longFrames.map((f) => `${f.ms} ms at raw ${f.rawAfter === null ? '-' : f.rawAfter.toFixed(3)}`).join(', ') : 'none') +
      (res.errors.length ? `  ERRORS: ${res.errors.join(' | ')}` : ''));
  }
}
const out = { label: LABEL, root: ROOT, chrome: CHROME, when: new Date().toISOString(), results };
writeFileSync(path.join(HERE, `firstring-${LABEL}.json`), JSON.stringify(out, null, 1) + '\n');
console.log('wrote', path.join(HERE, `firstring-${LABEL}.json`));
