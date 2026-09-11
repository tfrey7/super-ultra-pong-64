// Item 1155's proof: the real page, in Chrome, going from era 8 (PlayStation 2)
// to era 9 (Xbox) -- the green sphere. Node 22+, no dependencies (built-in WebSocket).
//
//   node docs/shots/item-1155/sphere-capture.mjs [--port 9345]
//
// Opens index.html?era=8 off disk, starts the game, then forces a point out of
// the player's side twice (each time from era 8, so each ring brings in era 9):
//   1. the ring's frame timing off the page's own rAF clock, against one second
//      of ordinary play just before it, with the mouse swept up and down the
//      whole time -- the paddle must follow the hand through the ring;
//   2. frames caught at about 0.45 (the sphere and its tendrils mid-field) and
//      0.9 (the light snapping out, the green pulse, the gamertags in) of the
//      eased wipe, and one once the ring has gone (still inside the serve pause);
//   3. what the page's own sound player took the point for (the Xbox's boot).
// Writes the PNGs and sphere-capture.json beside this file.
import { writeFileSync, existsSync } from 'node:fs';
import { launchChrome } from '../../../tools/chrome.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const PORT = Number(arg('port', 9345));
const CHROME = arg('chrome', ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const url = pathToFileURL(path.join(ROOT, 'index.html')).href + '?era=8';

// A fresh profile folder, deleted when Chrome exits (tools/chrome.mjs, item 1169).
const chrome = launchChrome(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  '--mute-audio', '--autoplay-policy=no-user-gesture-required',
  '--no-first-run', '--no-default-browser-check', '--window-size=1000,760', url
], { name: 'sphere' });
console.log(`chrome pid ${chrome.pid}`);

let ws;
try {
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch { /* still starting */ }
    if (!wsUrl) await sleep(150);
  }
  if (!wsUrl) throw new Error('chrome never offered a page');
  ws = new WebSocket(wsUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
  let next = 1;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    const p = pending.get(m.id);
    if (p) { pending.delete(m.id); m.error ? p.bad(new Error(JSON.stringify(m.error))) : p.ok(m.result); }
  };
  const send = (method, params = {}) => new Promise((ok, bad) => {
    const id = next++; pending.set(id, { ok, bad }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(HERE, name + '.png');
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  };

  for (let i = 0; i < 60; i++) {
    if (await evaluate('!!(window.__pong && window.__pongStart && window.PongRender && window.PongRender.drawEraFrame)')) break;
    await sleep(100);
  }
  await evaluate(`window.__errs = []; addEventListener('error', (e) => window.__errs.push(String(e.message))); 0`);
  // The canvas's place on the page, so a mouse position maps to a field y.
  const box = await evaluate(`(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const toClientY = (fy) => box.y + fy * box.h / 600;
  const midX = box.x + box.w * 0.25;
  const mouseTo = (y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: midX, y: toClientY(y), button: 'none' });
  const at = { x: midX, y: toClientY(300), button: 'left', clickCount: 1 };
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at });   // a real click starts it and unlocks sound
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at });
  await sleep(400);

  const forceFromPs2 = (y) => evaluate(`(() => { const g = window.__pong;
    g.era = 8; g.startEra = 0;
    g.serveDelay = 0; g.ball.x = -8; g.ball.y = ${y}; g.ball.vx = -600; g.ball.vy = 0;
    return g.era; })()`);
  const timing = (ms) => evaluate(`new Promise((done) => {
    const stamps = [], ring = [], ys = []; const t0 = performance.now();
    function tick(now) {
      const g = window.__pong; const m = window.PongRender.eraChangeMoment(g);
      stamps.push(now); ys.push(g.left.y); ring.push(!!(m && m.wiping && m.from === 8 && m.era === 9));
      if (now - t0 < ${ms}) requestAnimationFrame(tick); else done({ stamps, ring, ys });
    }
    requestAnimationFrame(tick);
  })`);
  const stats = (stamps) => {
    const d = [];
    for (let i = 1; i < stamps.length; i++) d.push(stamps[i] - stamps[i - 1]);
    d.sort((a, b) => a - b);
    const mean = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length);
    return { frames: d.length, mean: +mean.toFixed(2), p95: +(d[Math.floor(d.length * 0.95)] || 0).toFixed(2),
             max: +(d[d.length - 1] || 0).toFixed(2) };
  };

  // 1. Frame rate over the sphere, against ordinary play, the hand sweeping throughout.
  await mouseTo(540);
  const baseline = stats((await timing(1000)).stamps);
  await forceFromPs2(150);
  await sleep(20);
  const running = timing(1450);
  for (let i = 0; i < 26; i++) { await mouseTo(i % 2 ? 500 : 110); await sleep(50); }
  const run = await running;
  const during = stats(run.stamps.filter((_, i) => run.ring[i]));
  const ringYs = run.ys.filter((_, i) => run.ring[i]);
  const travel = ringYs.length ? +(Math.max(...ringYs) - Math.min(...ringYs)).toFixed(1) : 0;
  const eraAfter = await evaluate('window.__pong.era');
  const sound = await evaluate(`(() => { const s = window.__pongSound; return s ? { last: s.last ? { type: s.last.type, era: s.last.era } : null, boots: s.boots } : null; })()`);
  const fullRate = during.frames >= 40 && during.mean <= Math.max(baseline.mean * 1.25, 18.5);

  // 2. The pictures, from a second forced point.
  await sleep(900);
  await mouseTo(430);
  await forceFromPs2(360);
  const moment = 'window.PongRender.eraChangeMoment(window.__pong)';
  const waitFor = async (test) => {
    for (let i = 0; i < 400; i++) {
      const m = await evaluate(`(() => { const m = ${moment}; const g = window.__pong;
        return m ? { p: +m.p.toFixed(3), wiping: m.wiping, from: m.from, era: m.era, serveDelay: +g.serveDelay.toFixed(3) } : null; })()`);
      if (m && test(m)) return m;
      await sleep(4);
    }
    return null;
  };
  const shots = [];
  const mid = await waitFor((m) => m.wiping && m.p >= 0.45);
  shots.push({ file: await shot('sphere-mid'), asked: mid });
  const late = await waitFor((m) => m.wiping && m.p >= 0.9);
  shots.push({ file: await shot('sphere-late'), asked: late });
  const after = await waitFor((m) => !m.wiping);
  shots.push({ file: await shot('sphere-after'), asked: after });

  const errors = await evaluate('window.__errs');
  const result = {
    url, chrome: CHROME, when: new Date().toISOString(),
    change: { from: 8, to: eraAfter }, baseline, during, fullRate,
    paddleTravelDuringRing: travel, sound,
    shots: shots.map((s) => ({ file: path.relative(ROOT, s.file).replace(/\\/g, '/'), at: s.asked })),
    pageErrors: errors
  };
  writeFileSync(path.join(HERE, 'sphere-capture.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (!fullRate || errors.length || eraAfter !== 9 || travel < 150) process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch { /* gone */ }
  await chrome.close();
}
