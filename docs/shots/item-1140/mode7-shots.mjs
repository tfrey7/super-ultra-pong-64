/*
 * Item 1140's browser proof: the change from era 3 to era 4 in the real page,
 * opened off disk in headless Chrome. It forces the point, times the page's
 * own frames over the ring against ordinary play just before, and captures the
 * field mid-tilt, mid-spin (the card turning in) and landed, reading back the
 * ring's raw progress and whether the engine's card was being held back at
 * each capture. Writes its PNGs and mode7-shots.json beside this file.
 *
 *   node docs/shots/item-1140/mode7-shots.mjs [--port 9341]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const i = process.argv.indexOf('--port');
const PORT = i > 0 ? Number(process.argv[i + 1]) : 9341;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const PROFILE = path.join(process.env.TEMP || 'G:/claude-tmp', `item-1140-chrome-${PORT}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--mute-audio', '--no-first-run', '--window-size=1000,760', 'about:blank'], { stdio: 'ignore' });

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
  const url = pathToFileURL(path.join(ROOT, 'index.html')).href + '?era=3';
  await send('Page.navigate', { url });
  await sleep(900);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await sleep(1500);
  const geo = await evalJs(`(() => { const b = document.getElementById('field').getBoundingClientRect();
    return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`);

  const probe = `(() => { const g = window.__pong; const R = window.PongRender; const m = R.eraChangeMoment(g);
    return { era: g.era, raw: m ? m.raw : null, wiping: !!(m && m.wiping), cardUp: !!(m && m.cardUp),
      held: R.eraLook(4).card === R.eraLook(4).arrival.heldCard, box: R.eraCardStyle(4).box }; })()`;
  const timing = (ms) => evalJs(`new Promise((done) => { const stamps = [], ring = [], raws = []; const t0 = performance.now();
    function tick(now) { const m = window.PongRender.eraChangeMoment(window.__pong);
      stamps.push(now); ring.push(!!(m && m.wiping)); raws.push(m ? m.raw : null);
      if (now - t0 < ${ms}) requestAnimationFrame(tick); else done({ stamps, ring, raws }); }
    requestAnimationFrame(tick); })`);
  // Every frame over 3x the median, with the ring's raw progress either side of it.
  const longFrames = (run) => {
    const d = []; for (let k = 1; k < run.stamps.length; k++) d.push(run.stamps[k] - run.stamps[k - 1]);
    const med = [...d].sort((a, b) => a - b)[Math.floor(d.length / 2)] || 0;
    return d.map((ms, k) => ({ ms: +ms.toFixed(1), rawBefore: run.raws[k], rawAfter: run.raws[k + 1] }))
      .filter((f) => f.ms > 3 * med);
  };
  const stats = (stamps) => {
    const d = []; for (let k = 1; k < stamps.length; k++) d.push(stamps[k] - stamps[k - 1]);
    d.sort((a, b) => a - b);
    const mean = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length);
    return { frames: d.length, meanMs: +mean.toFixed(2), p95Ms: +(d[Math.floor(d.length * 0.95)] || 0).toFixed(2), maxMs: +(d[d.length - 1] || 0).toFixed(2) };
  };
  const force = `(() => { const g = window.__pong; g.era = 3; g.startEra = 0;
    g.serveDelay = 0; g.ball.x = -8; g.ball.y = 150; g.ball.vx = -600; g.ball.vy = 0; return g.era; })()`;

  // 1. Frame timing: ordinary play at era 3, then over one forced ring.
  const baseline = stats((await timing(1000)).stamps);
  await evalJs(force);
  const run = await timing(1700);
  const ringFrames = stats(run.stamps.filter((_, k) => run.ring[k]));
  const hitches = longFrames(run);
  const after = await evalJs(probe);
  await sleep(1500);

  // 2. The pictures: a second forced point, captured at chosen raw progress.
  mkdirSync(HERE, { recursive: true });
  await evalJs(`(() => { const g = window.__pong; g.era = 3; g.phase = 'playing'; return 1; })()`);
  await sleep(1200);
  await evalJs(force);
  const shots = [];
  for (const [name, target] of [['mode7-tilt', 0.34], ['mode7-card-spin', 0.74], ['mode7-landed', 0.97]]) {
    let before = await evalJs(probe);
    for (let k = 0; k < 400 && !(before.raw !== null && before.raw >= target); k++) {
      await sleep(4); before = await evalJs(probe);
    }
    const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...geo, scale: 1 } });
    const file = path.join(HERE, name + '.png');
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    shots.push({ name, file, asked: target, rawBefore: before.raw, heldBefore: before.held, cardUp: before.cardUp });
  }
  await sleep(700);
  const settled = await evalJs(probe);

  const out = { url, baseline, ringFrames, hitches, afterRing: after, shots, settled, errors };
  writeFileSync(path.join(HERE, 'mode7-shots.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out, null, 1));
} finally {
  try { ws && ws.close(); } catch { /* gone */ }
  chrome.kill();
}
