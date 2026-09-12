/*
 * item 1298 -- what era 10's HD pass did to the picture, measured on the page.
 *
 * One frozen rally frame of the Xbox 360, drawn by the real page in headless
 * Chrome with the GPU off (so this is the slowest, software-drawn case), then
 * read back out of the native 960 x 720 picture:
 *
 *   brightest   the brightest pixel in the whole frame, and whether it is on
 *               the ball (R1: the ball's core survives the post chain)
 *   edges       each bat's outer edge, in pixels of transition (R4: no bat is
 *               softened by the far strip's depth of field). 10% to 90% of the
 *               step across a 13-pixel window, so 1 is a hard edge.
 *   soft        mean neighbour-to-neighbour change across the far scenery
 *               against the same over the near table: the far ruin is soft
 *               when its number is well under the near one.
 *   frameMs     mean, p95 and max frame over a second of ordinary play, on the
 *               page's own clock, before the frame is frozen.
 *
 * It writes the native frame beside itself as <label>.png. Run it against this
 * worktree and against the main checkout for the before-and-after pair:
 *
 *   node docs/measure/item1298/hdcheck.mjs --label after  --port 9351
 *   node docs/measure/item1298/hdcheck.mjs --label before --port 9353 \
 *        --root "G:/Claude Stuff/super-ultra-pong-64"
 *
 * Every launch is a fresh Chrome profile through tools/chrome.mjs, deleted when
 * Chrome exits, and a port somebody else holds is refused before anything starts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, refusePortTaken, pickOwnPage } from '../../../tools/chrome.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OWN_ROOT = path.join(HERE, '..', '..', '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const LABEL = arg('label', 'after');
const PORT = Number(arg('port', '9351'));
const ROOT = arg('root', OWN_ROOT);
const OUT = arg('out', HERE);
const CHROME = arg('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The frozen frame: one rally, the far bat up in the depth-of-field strip so
// R4 has something to answer for, the near bat down, the ball mid-flight.
const SEED = `(() => {
  const g = window.__pong;
  if (!g) return 'no game';
  window.Pong.step = function () {};
  g.phase = 'playing';
  g.serveDelay = 0;
  g.time = 12.5;
  g.era = 10;
  g.eraChangedAt = -1;
  g.score.left = 3; g.score.right = 2;
  g.ball.x = 430; g.ball.y = 250; g.ball.vx = 520; g.ball.vy = -190;
  g.left.y = 400; g.right.y = 8;
  return 'frozen';
})()`;

const MEASURE = `(() => {
  const g = window.__pong, D = window.PongDisplay, T = window.PongTable3D, R = window.PongRender;
  const c = D.canvas();
  const W = c.width, H = c.height, k = W / 800;
  const px = c.getContext('2d').getImageData(0, 0, W, H).data;
  const lum = (x, y) => {
    const i = ((y | 0) * W + (x | 0)) * 4;
    return 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  };
  const cam = T.camera(R.eraLook(10).camera);
  const ball = T.ballScreen(cam, g);
  const bx = ball.x * k, by = ball.y * k, br = ball.r * k;
  let best = { l: -1, x: 0, y: 0 }, ballMax = -1, outMax = { l: -1, x: 0, y: 0 }, brighter = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = lum(x, y);
    if (l > best.l) best = { l, x, y };
    if (Math.hypot(x - bx, y - by) <= br + 1) { if (l > ballMax) ballMax = l; }
    else if (l > outMax.l) outMax = { l, x, y };
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (Math.hypot(x - bx, y - by) > br + 1 && lum(x, y) > ballMax) brighter++;
  }
  const d = Math.hypot(best.x - bx, best.y - by);

  // Each bat's outer vertical edge, in the picture's own pixels.
  // The edge's width is the run of pixels around the strongest step whose own
  // step is still a quarter of it: 1 is a hard edge, a blurred one spreads.
  const edgeAt = (sx, sy) => {
    const xs = [];
    for (let i = -7; i <= 7; i++) xs.push(lum(Math.round(sx) + i, Math.round(sy)));
    const d = [];
    for (let i = 1; i < xs.length; i++) d.push(Math.abs(xs[i] - xs[i - 1]));
    const peak = Math.max(...d), at = d.indexOf(peak);
    if (peak < 6) return { width: null, peak, span: Math.max(...xs) - Math.min(...xs) };
    let width = 1;
    for (let i = at - 1; i >= 0 && d[i] >= peak * 0.25; i--) width++;
    for (let i = at + 1; i < d.length && d[i] >= peak * 0.25; i++) width++;
    return { width, peak, span: Math.max(...xs) - Math.min(...xs) };
  };
  const edges = {};
  for (const side of ['left', 'right']) {
    const p = g[side];
    const x = side === 'left' ? p.x : p.x + p.w;
    const s = T.project(cam, x, p.y + p.h / 2, 12);
    edges[side] = Object.assign({ at: [Math.round(s.x * k), Math.round(s.y * k)] }, edgeAt(s.x * k, s.y * k));
  }

  // How much detail survives in a band: the mean step between neighbours.
  const band = (y0, y1) => {
    let sum = 0, n = 0;
    for (let y = Math.round(y0); y < Math.round(y1); y += 2)
      for (let x = 60; x < W - 60; x++) { sum += Math.abs(lum(x, y) - lum(x - 1, y)); n++; }
    return n ? sum / n : 0;
  };
  const farEdge = T.project(cam, 400, 0, 0).y * k;
  const soft = { ruin: band(farEdge - 60, farEdge - 6), near: band(H * 0.62, H * 0.72) };
  return { W, H, best, ballMax, outMax, brighterThanBall: brighter,
           ball: { x: bx, y: by, r: br }, onBall: d <= br + 2, dist: d, edges, soft,
           png: c.toDataURL('image/png') };
})()`;

const FRAMES = `(() => new Promise((done) => {
  const t = [];
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    t.push(now - last);
    last = now;
    if (t.length < 70) requestAnimationFrame(tick); else {
      const s = t.slice(10).sort((a, b) => a - b);
      done({ frames: s.length, mean: s.reduce((a, b) => a + b, 0) / s.length,
             p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1] });
    }
  };
  requestAnimationFrame(tick);
}))()`;

class Session {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiting = new Map(); ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    const w = this.waiting.get(m.id);
    if (w) { this.waiting.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); }
  }); }
  send(method, params) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.waiting.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text);
    return r.result.value;
  }
}

async function targetUrl(asked) {
  for (let i = 0; i < 80; i++) {
    let list = null;
    try { list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json()); } catch { /* coming up */ }
    const { own, foreign } = pickOwnPage(list, asked);
    if (own) return own.webSocketDebuggerUrl;
    if (foreign) throw new Error(`item1298: port ${PORT} is serving ${foreign.url}, not this checkout's page -- pick another --port`);
    await sleep(250);
  }
  throw new Error('Chrome never opened a debuggable page');
}

const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?era=10';
const chrome = await launchChrome(CHROME, [
  '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio',
  '--allow-file-access-from-files', '--window-size=960,720', '--remote-debugging-port=' + PORT,
  '--no-first-run', '--no-default-browser-check', url
], { name: 'item1298' }).catch(refusePortTaken);
console.log(`chrome: pid ${chrome.pid}, port ${PORT}, page ${url}`);

try {
  const ws = new WebSocket(await targetUrl(url));
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const s = new Session(ws);
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  await sleep(1500);
  const gl = await s.eval('!!(window.PongField3D && window.PongField3D.available())');
  const frame = await s.eval(FRAMES);
  console.log(`${LABEL}: WebGL ${gl ? 'on' : 'OFF'}; frame mean ${frame.mean.toFixed(1)} ms, p95 ${frame.p95.toFixed(1)}, max ${frame.max.toFixed(1)} over ${frame.frames} frames`);
  console.log(await s.eval(SEED));
  await sleep(400);
  const m = await s.eval(MEASURE);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, LABEL + '.png'), Buffer.from(m.png.split(',')[1], 'base64'));
  delete m.png;
  const out = { label: LABEL, root: ROOT, gl, frame, ...m };
  writeFileSync(path.join(OUT, LABEL + '.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out, null, 2));
} finally {
  await chrome.close();
  // The open DevTools socket keeps node alive; the run is over, so end it.
  process.exit(0);
}
