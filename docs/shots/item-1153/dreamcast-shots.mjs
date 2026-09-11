/*
 * Item 1153's browser proof: the change from era 6 to era 7 in the real page,
 * opened off disk in headless Chrome. It forces the point, times the page's own
 * frames over the ring against ordinary play just before, moves the mouse
 * during the ring and reads the paddle back, and captures the field at each
 * beat of the Dreamcast arrival (the white page and bouncing dot, the ink line
 * and swirl mid-arrival, the comic panel snap). Writes its PNGs and
 * dreamcast-shots.json beside this file.
 *
 *   node docs/shots/item-1153/dreamcast-shots.mjs [--port 9353]
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const i = process.argv.indexOf('--port');
const PORT = i > 0 ? Number(process.argv[i + 1]) : 9353;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A fresh profile folder, deleted when Chrome exits (tools/chrome.mjs, item 1169).
const chrome = await launchChrome(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  '--mute-audio', '--no-first-run', '--window-size=1000,760', 'about:blank'], { name: 'dreamcast' }).catch(refusePortTaken);

let ws;
try {
  let wsUrl = null;
  for (let k = 0; k < 60 && !wsUrl; k++) {
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
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };

  await send('Runtime.enable');
  const url = pathToFileURL(path.join(ROOT, 'index.html')).href + '?era=6';
  await send('Page.navigate', { url });
  await sleep(900);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await sleep(1500);
  const geo = await evalJs(`(() => { const b = document.getElementById('field').getBoundingClientRect();
    return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`);

  const probe = `(() => { const g = window.__pong; const R = window.PongRender; const m = R.eraChangeMoment(g);
    return { era: g.era, raw: m ? m.raw : null, p: m ? m.p : null, wiping: !!(m && m.wiping), cardUp: !!(m && m.cardUp),
      serveDelay: g.serveDelay, paddleY: g.left.y, hook: typeof R.eraLook(7).flourish }; })()`;
  const timing = (ms) => evalJs(`new Promise((done) => { const stamps = [], ring = [], serve = []; const t0 = performance.now();
    function tick(now) { const g = window.__pong; const m = window.PongRender.eraChangeMoment(g);
      stamps.push(now); ring.push(!!(m && m.wiping)); serve.push(g.serveDelay);
      if (now - t0 < ${ms}) requestAnimationFrame(tick); else done({ stamps, ring, serve }); }
    requestAnimationFrame(tick); })`);
  const stats = (stamps) => {
    const d = []; for (let k = 1; k < stamps.length; k++) d.push(stamps[k] - stamps[k - 1]);
    d.sort((a, b) => a - b);
    const mean = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length);
    return { frames: d.length, meanMs: +mean.toFixed(2), p95Ms: +(d[Math.floor(d.length * 0.95)] || 0).toFixed(2), maxMs: +(d[d.length - 1] || 0).toFixed(2) };
  };
  const force = `(() => { const g = window.__pong; g.era = 6; g.startEra = 0; g.phase = 'playing';
    g.serveDelay = 0; g.ball.x = -8; g.ball.y = 170; g.ball.vx = -600; g.ball.vy = 0; return g.era; })()`;
  const mouse = (y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: geo.x + 60, y: geo.y + geo.height * y });

  // 1. Frame timing over one forced ring, and whether the ring ends inside the serve pause.
  const baseline = stats((await timing(1000)).stamps);
  await evalJs(force);
  const run = await timing(1900);
  const ringFrames = stats(run.stamps.filter((_, k) => run.ring[k]));
  let lastRing = -1; run.ring.forEach((w, k) => { if (w) lastRing = k; });
  const serveAtLastRingFrame = lastRing >= 0 ? run.serve[lastRing] : null;
  await sleep(1500);

  // 2. The paddle during the ring: move the mouse to the top and the bottom and read it back.
  await evalJs(`(() => { const g = window.__pong; g.era = 6; g.phase = 'playing'; return 1; })()`);
  await sleep(800);
  await evalJs(force);
  await sleep(250);
  await mouse(0.1);
  await sleep(120);
  const hi = await evalJs(probe);
  await mouse(0.9);
  await sleep(120);
  const lo = await evalJs(probe);
  const paddle = { top: hi, bottom: lo, follows: hi.wiping && lo.wiping && lo.paddleY - hi.paddleY > 200 };
  await sleep(1800);

  // 3. The pictures: a third forced point, captured at chosen raw progress.
  mkdirSync(HERE, { recursive: true });
  await evalJs(`(() => { const g = window.__pong; g.era = 6; g.phase = 'playing'; return 1; })()`);
  await sleep(1200);
  await mouse(0.5);
  await evalJs(force);
  const shots = [];
  for (const [name, target] of [['dreamcast-beat1-page', 0.2], ['dreamcast-beat2-ink', 0.5], ['dreamcast-beat3-panel', 0.68]]) {
    let before = await evalJs(probe);
    for (let k = 0; k < 400 && !(before.raw !== null && before.raw >= target); k++) {
      await sleep(4); before = await evalJs(probe);
    }
    const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...geo, scale: 1 } });
    const file = path.join(HERE, name + '.png');
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    shots.push({ name, file, askedRaw: target, rawBefore: before.raw, pBefore: before.p, serveDelay: before.serveDelay });
  }
  await sleep(900);
  const settled = await evalJs(probe);

  const out = { url, baseline, ringFrames, serveAtLastRingFrame, paddle, shots, settled, errors };
  writeFileSync(path.join(HERE, 'dreamcast-shots.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out, null, 1));
} finally {
  try { ws && ws.close(); } catch { /* gone */ }
  await chrome.close();
}
