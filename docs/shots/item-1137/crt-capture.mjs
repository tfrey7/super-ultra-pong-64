/*
 * Item 1137: the era 0 -> 1 change, in the real page, in headless Chrome.
 *
 *   node docs/shots/item-1137/crt-capture.mjs [--port 9347] [--root <checkout>] [--tag name] [--live-only]
 *
 * Two passes over index.html opened off disk:
 *   1. live: start the game, time ordinary play with the page's own rAF clock,
 *      force a point on era 0 and time the ring (the TV flourish is drawing),
 *      then force a second 0 -> 1 change and time that ring too -- so a cost paid
 *      only the first time (offscreen canvases being made) shows as the
 *      difference -- and read what the sound player scheduled;
 *   2. frozen (skipped by --live-only): reload, start, stop the loop, force the
 *      same point, then step the rules to fixed moments of the change and draw
 *      each frame through the page's own PongRender.drawEraFrame -- a PNG of the
 *      field at each moment.
 * --root measures another checkout (master, for the before) with the same
 * script. Writes <tag>.json (default crt-capture.json) and the PNGs beside
 * this file. Chrome runs muted.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { launchChrome } from '../../../tools/chrome.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argOf = (name) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const ROOT = argOf('root') ? path.resolve(argOf('root')) : path.resolve(HERE, '..', '..', '..');
const PORT = Number(argOf('port') || 9347);
const TAG = argOf('tag') || 'crt-capture';
const LIVE_ONLY = process.argv.includes('--live-only');
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Session {
  constructor(ws) {
    this.ws = ws; this.next = 1; this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    });
  }
  send(method, params = {}) {
    const id = this.next++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
}

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* still starting */ }
    await sleep(250);
  }
  throw new Error('Chrome never opened a debuggable page');
}

// One point for the computer from era 0, the ball leaving the player's side at y 150.
const FORCE = `(() => { const g = window.__pong;
  g.era = 0; g.startEra = 0; g.colour = false; g.serveDelay = 0; g.left.y = 420;
  g.ball.x = -8; g.ball.y = 150; g.ball.vx = -600; g.ball.vy = 0; return g.era; })()`;

const TIMING = (ms) => `new Promise((done) => {
  const stamps = [], ring = []; const t0 = performance.now();
  function tick(now) {
    const m = window.PongRender.eraChangeMoment(window.__pong);
    stamps.push(now); ring.push(!!(m && m.wiping));
    if (now - t0 < ${ms}) requestAnimationFrame(tick); else done({ stamps, ring });
  }
  requestAnimationFrame(tick);
})`;

const r1 = (v) => Math.round(v * 10) / 10;

/** Frame-time figures over a run of rAF stamps, and where the slowest frame fell. */
function stats(stamps) {
  const d = [];
  for (let i = 1; i < stamps.length; i++) d.push(stamps[i] - stamps[i - 1]);
  const sorted = [...d].sort((a, b) => a - b);
  const mean = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length);
  const worst = sorted[sorted.length - 1] || 0;
  return {
    frames: d.length, meanMs: r1(mean), p95Ms: r1(sorted[Math.floor(d.length * 0.95)] || 0),
    maxMs: r1(worst), worstFrameIndex: d.indexOf(worst), firstDeltasMs: d.slice(0, 5).map(r1)
  };
}

/** Time one forced ring: the frames the ring was on, including the one it started on. */
async function timeRing(s) {
  await s.eval(FORCE);
  const run = await s.eval(TIMING(1600));
  const first = run.ring.indexOf(true);
  const last = run.ring.lastIndexOf(true);
  return first < 0 ? null : stats(run.stamps.slice(Math.max(0, first - 1), last + 1));
}

async function main() {
  const url = pathToFileURL(path.join(ROOT, 'index.html')).href;
  // A fresh profile folder, deleted when Chrome exits (tools/chrome.mjs, item 1169).
  const chrome = launchChrome(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--window-size=1000,750',
    '--no-first-run', '--no-default-browser-check', url
  ], { name: 'crt' });
  const out = { root: ROOT, url, chromePid: chrome.pid };
  let ws;
  try {
    ws = new WebSocket(await wsUrl());
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    const s = new Session(ws);
    await sleep(900);

    // 1. live
    await s.eval('window.__pongStart()');
    await sleep(1400);
    out.ordinaryPlay = stats((await s.eval(TIMING(1000))).stamps);
    out.firstRing = await timeRing(s);
    await sleep(600);
    out.secondRing = await timeRing(s);
    await sleep(300);
    out.after = await s.eval(`(() => { const p = window.__pongSound; return {
      era: window.__pong.era, played: p.played, errors: p.errors, last: p.last, boots: p.boots,
      audio: p.audioState(), bootVoices: window.PongSound.voicesFor(1, 'boot').length }; })()`);

    // 2. frozen frames at fixed moments
    if (!LIVE_ONLY) {
      await s.send('Page.reload', { ignoreCache: true });
      await sleep(1000);
      await s.eval('(() => { window.__pongStart(); window.requestAnimationFrame = () => 0; return 1; })()');
      await sleep(120);
      await s.eval('(() => { const g = window.__pong; for (let i = 0; i < 70; i++) Pong.step(g, 1/60, { pointerY: 300 }); return g.serveDelay; })()');
      await s.eval(FORCE);
      out.frozenChange = await s.eval(`(() => { const g = window.__pong; let n = 0;
        while (g.era === 0 && n < 20) { Pong.step(g, 1/60, { pointerY: 440 }); n++; }
        return { era: g.era, at: g.eraChangedAt, time: g.time }; })()`);
      const rect = await s.eval(`(() => { const b = document.getElementById('field').getBoundingClientRect();
        return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`);
      out.frames = [];
      for (const target of [0.1, 0.55, 0.8, 1.05]) {
        const m = await s.eval(`(() => { const g = window.__pong;
          while (g.time - g.eraChangedAt < ${target}) Pong.step(g, 1/60, { pointerY: 440 });
          const ctx = document.getElementById('field').getContext('2d');
          PongRender.drawEraFrame(ctx, g);
          const m = PongRender.eraChangeMoment(g);
          return m ? { t: +m.t.toFixed(3), p: +m.p.toFixed(3), radius: Math.round(m.radius), cardUp: m.cardUp } : null; })()`);
        const shot = await s.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } });
        const name = `era0to1-t${target.toFixed(2)}-p${m ? m.p.toFixed(2) : 'none'}.png`;
        writeFileSync(path.join(HERE, name), Buffer.from(shot.data, 'base64'));
        out.frames.push({ file: name, ...m });
      }
    }
  } finally {
    try { ws && ws.close(); } catch { /* gone */ }
    await chrome.close();
  }
  writeFileSync(path.join(HERE, TAG + '.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out, null, 1));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
