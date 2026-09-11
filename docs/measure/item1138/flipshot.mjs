/*
 * Item 1138's browser proof: the era 1 -> 2 change (the NES console swap) in
 * real headless Chrome, opened off disk at index.html?era=1.
 *
 *   node docs/measure/item1138/flipshot.mjs [--port 9472] [--target 0.35]
 *
 * Pass 1 times the page's own requestAnimationFrame clock over one second of
 * ordinary play, then over the ring of a forced point, and reads what the
 * sound player last played. Pass 2 reloads, forces the point again and stops
 * the loop on the first frame whose eased progress reaches --target, so the
 * canvas holds a mid-flip frame; that frame is saved as flip-era1-to-2.png
 * beside flipshot.json. Nothing in src/ knows this exists.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i !== -1 ? process.argv[i + 1] : d; };
const PORT = Number(arg('port', 9472));
const TARGET = Number(arg('target', 0.35));
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
        let next = 1;
        const pending = new Map();
        ws.addEventListener('message', (ev) => {
          const msg = JSON.parse(ev.data);
          const p = pending.get(msg.id);
          if (!p) return;
          pending.delete(msg.id);
          msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
        });
        const send = (method, params = {}) => {
          const id = next++;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
        };
        const evaluate = async (expression) => {
          const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
          if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
          return r.result.value;
        };
        return { ws, send, evaluate };
      }
    } catch { /* chrome still coming up */ }
    await sleep(250);
  }
  throw new Error('Chrome never opened a debuggable page');
}

const FORCE = `(() => { const g = window.__pong;
  g.serveDelay = 0; g.ball.x = -8; g.ball.y = 150; g.ball.vx = -600; g.ball.vy = 0; return g.era; })()`;

const stats = (stamps) => {
  const d = [];
  for (let i = 1; i < stamps.length; i++) d.push(stamps[i] - stamps[i - 1]);
  d.sort((a, b) => a - b);
  const mean = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length);
  return { frames: d.length, meanMs: +mean.toFixed(2), p95Ms: +(d[Math.floor(d.length * 0.95)] || 0).toFixed(2), maxMs: +(d[d.length - 1] || 0).toFixed(2) };
};

async function main() {
  const url = pathToFileURL(path.join(ROOT, 'index.html')).href + '?era=1';
  // A fresh profile folder, deleted when Chrome exits (tools/chrome.mjs, item 1169).
  const chrome = await launchChrome(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--window-size=1000,760', '--remote-debugging-port=' + PORT,
    '--no-first-run', '--no-default-browser-check', url], { name: 'flipshot' }).catch(refusePortTaken);
  let s;
  try {
    s = await connect();
    await s.send('Page.enable');
    await s.send('Runtime.enable');
    await sleep(900);
    await s.evaluate('window.__pongStart()');
    await sleep(400);

    // Pass 1: timing and sound.
    const timing = (ms) => s.evaluate(`new Promise((done) => {
      const stamps = [], ring = [], ps = []; const t0 = performance.now();
      function tick(now) { const m = window.PongRender.eraChangeMoment(window.__pong);
        stamps.push(now); ring.push(!!(m && m.wiping)); ps.push(m ? m.p : null);
        if (now - t0 < ${ms}) requestAnimationFrame(tick); else done({ stamps, ring, ps }); }
      requestAnimationFrame(tick); })`);
    // Keep the ball in play for the baseline: the page's own paddle follows the mouse,
    // so just measure a second of whatever the rally is doing.
    const base = await timing(1000);
    const fromEra = await s.evaluate(FORCE);
    await sleep(30);
    const run = await timing(1500);
    const ringStamps = run.stamps.filter((_, i) => run.ring[i]);
    const toEra = await s.evaluate('window.__pong.era');
    const sound = await s.evaluate(`(() => { const p = window.__pongSound; return p ? {
      audio: p.audioState(), played: p.played, errors: p.errors, last: p.last, boots: p.boots } : null; })()`);

    // Pass 2: a frame held mid-flip.
    await s.send('Page.reload', { ignoreCache: true });
    await sleep(900);
    await s.evaluate('window.__pongStart()');
    await sleep(400);
    const held = await s.evaluate(`new Promise((done) => {
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => {
        const g = window.__pong; const m = window.PongRender.eraChangeMoment(g);
        if (m && m.wiping && m.from === 1 && m.p >= ${TARGET}) {
          done({ era: g.era, from: m.from, p: m.p, radius: m.radius, t: m.t, origin: m.origin });
          return 0;
        }
        return raf(cb);
      };
      ${FORCE};
    })`);
    await sleep(150);
    const rect = await s.evaluate(`(() => { const r = document.getElementById('field').getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
    const shot = await s.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } });
    mkdirSync(HERE, { recursive: true });
    const png = path.join(HERE, 'flip-era1-to-2.png');
    writeFileSync(png, Buffer.from(shot.data, 'base64'));

    const out = {
      page: 'index.html?era=1', chrome: CHROME, when: new Date().toISOString(),
      change: { fromEra, toEra },
      ordinaryPlay: stats(base.stamps),
      duringRing: stats(ringStamps),
      sound,
      heldFrame: { ...held, png: path.basename(png) }
    };
    writeFileSync(path.join(HERE, 'flipshot.json'), JSON.stringify(out, null, 2) + '\n');
    console.log(JSON.stringify(out, null, 2));
  } finally {
    try { s && s.ws.close(); } catch { /* gone */ }
    await chrome.close();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
