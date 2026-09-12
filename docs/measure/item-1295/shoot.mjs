/*
 * Item 1295: era 8 (the PlayStation 2) with its field mirrored in the slab.
 * One script, run on two trees, so "before" and "after" are the same frame:
 *
 *   node docs/measure/item-1295/shoot.mjs --label before --root "G:/Claude Stuff/super-ultra-pong-64" [--port 9495]
 *   node docs/measure/item-1295/shoot.mjs --label after [--port 9495]
 *
 * In the playtest's headless Chrome (GPU off, WebGL on SwiftShader) it opens
 * index.html?era=8, times about 1.5 s of live play on the page's own frame
 * clock, then stops the rules, poses one rally frame (fixed paddles, ball and
 * clock, so the camera drift and the interlace parity are the same on both
 * trees), and writes:
 *   docs/shots/item-1295/<label>.png   the canvas as the page shows it
 *   <label>.json beside this script    the frame time, the reflection probes
 *                                      under each bat, and the letterbox check
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const ROOT = path.resolve(arg('root', path.resolve(HERE, '..', '..', '..')));
const PORT = Number(arg('port', 9495));
const LABEL = arg('label', 'now');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?era=8&title=off&music=off';
const SHOTS = path.resolve(HERE, '..', '..', 'shots', 'item-1295');

class Session extends CdpConnection {
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
    return r.result.value;
  }
}

// Live play: frame gaps on the page's rAF clock.
const TIMING = `new Promise((res) => {
  const gaps = []; let last = 0;
  function f(ts) { if (last) gaps.push(ts - last); last = ts; if (gaps.length < 90) requestAnimationFrame(f); else res(gaps); }
  requestAnimationFrame(f);
}).then((g) => { g.sort((a, b) => a - b); const mean = g.reduce((a, b) => a + b, 0) / g.length;
  return { frames: g.length, meanMs: +mean.toFixed(1), p95Ms: +g[Math.floor(g.length * 0.95)].toFixed(1), era: window.__pong.era }; })`;

// Stop the rules and pose one rally frame.
const POSE = `(() => {
  const g = window.__pong, noop = function () {};
  if (window.PongFeel) window.PongFeel.step = noop;
  window.Pong.step = noop;
  g.phase = 'playing'; g.era = 8; g.time = 12; g.eraChangedAt = -100; g.serveDelay = 0; g.rally = 5;
  g.left.y = 190; g.right.y = 330; g.left.vy = 0; g.right.vy = 0;
  g.ball.x = 470; g.ball.y = 300; g.ball.vx = 300; g.ball.vy = 60;
  return { gl: !!(window.PongField3D && window.PongField3D.available()), why: window.PongField3D ? window.PongField3D.why() : 'no layer' };
})()`;

// Read the native picture. A mirrored blade hangs straight down from its
// original, so on screen it lies just BELOW the bat's foot -- but how far below
// depends on where up the table the bat stands, so a single probe point misses
// one of the two. Instead walk down the screen from each foot, a native row at
// a time, and keep the row that is most the bat's own colour against the plain
// slab the same distance below, 90 units further along x. Also: the letterbox
// against the table's and the paddles' projected extents.
const PROBE = `(() => {
  const g = window.__pong, R = window.PongRender, T = R.table3d, L = R.eraLook(8);
  const cam = T.camera(L.drift(g.time));
  const nat = window.PongDisplay && window.PongDisplay.canvas ? window.PongDisplay.canvas() : document.querySelector('canvas');
  const x = nat.getContext('2d');
  const sx = nat.width / 800, sy = nat.height / 600;
  function px(p) { const d = x.getImageData(Math.round(p.x * sx), Math.round(p.y * sy), 1, 1).data; return [d[0], d[1], d[2]]; }
  const out = { native: [nat.width, nat.height], gl: (window.PongField3D.internals() || {}).renderer ?
    [window.PongField3D.internals().renderer.domElement.width, window.PongField3D.internals().renderer.domElement.height] : null };
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  out.bats = ['left', 'right'].map((side) => {
    // The NEAR edge of the bat's footprint: the blade's standing face covers
    // everything up-screen of it, and the mirrored copy hangs down-screen of it.
    const r = g[side], cx = r.x + r.w / 2, near = r.y + r.h;
    const foot = T.project(cam, cx, near, 0);
    const plainX = side === 'left' ? cx + 90 : cx - 90;
    const plainFoot = T.project(cam, plainX, near, 0);
    const ink = R.paddleInk(g, side), want = hexRgb(ink);
    // Which of the bat's three channels its ink leans on, against the slate slab.
    const lean = want.indexOf(Math.max(...want));
    const rows = [];
    for (let d = 1; d <= 16; d++) {
      const u = px({ x: foot.x, y: foot.y + d / sy });
      const p = px({ x: plainFoot.x, y: plainFoot.y + d / sy });
      // How much more of the bat's own leading colour is here than on plain slab.
      rows.push({ d, u, p, tint: +(u[lean] - p[lean] - (u[(lean + 1) % 3] - p[(lean + 1) % 3])).toFixed(1) });
    }
    const best = rows.reduce((a, b) => (b.tint > a.tint ? b : a));
    return { side, ink, leanChannel: 'rgb'[lean], foot: [+foot.x.toFixed(1), +foot.y.toFixed(1)],
      bestRowsBelowFoot: best.d, underRgb: best.u, plainRgb: best.p, tint: best.tint,
      visible: best.tint >= 3, rows };
  });
  const ys = [];
  [[0, 0, 0], [800, 0, 0], [0, 600, 0], [800, 600, 0], [0, 600, -14], [800, 600, -14]].forEach((p) => ys.push(T.project(cam, p[0], p[1], p[2]).y));
  ['left', 'right'].forEach((s) => { const r = g[s]; ys.push(T.project(cam, r.x, r.y, 22).y, T.project(cam, r.x, r.y + r.h, 0).y); });
  out.letterbox = { bar: L.fx.BAR, playTop: +Math.min(...ys).toFixed(1), playBottom: +Math.max(...ys).toFixed(1) };
  out.letterbox.hidesNone = out.letterbox.playTop >= out.letterbox.bar && out.letterbox.playBottom <= 600 - out.letterbox.bar;
  const r = document.querySelector('canvas').getBoundingClientRect();
  out.rect = { x: r.x, y: r.y, w: r.width, h: r.height };
  return out;
})()`;

const flags = ['--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio',
  '--allow-file-access-from-files', '--window-size=1000,760', '--remote-debugging-port=' + PORT,
  '--no-first-run', '--no-default-browser-check', 'about:blank'];
const chrome = await launchChrome(CHROME, flags, { name: 'item1295' }).catch(refusePortTaken);
let ws, result;
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
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const s = new Session(ws);
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  await s.send('Page.navigate', { url: page });
  for (let t = 0; t < 100; t++) {
    if (await s.eval('!!(window.__pong && window.__pong.phase === "playing")').catch(() => false)) break;
    await sleep(100);
  }
  await sleep(1500);                      // the name card and the first serve
  const timing = await s.eval(TIMING);
  const posed = await s.eval(POSE);
  await sleep(600);
  const probe = await s.eval(PROBE);
  const shot = await s.send('Page.captureScreenshot', { format: 'png',
    clip: { x: probe.rect.x, y: probe.rect.y, width: probe.rect.w, height: probe.rect.h, scale: 1 } });
  mkdirSync(SHOTS, { recursive: true });
  const png = path.join(SHOTS, LABEL + '.png');
  writeFileSync(png, Buffer.from(shot.data, 'base64'));
  result = { taken: new Date().toISOString(), label: LABEL, root: ROOT, timing, posed, probe, png };
} finally {
  try { ws && ws.close(); } catch { /* gone */ }
  await chrome.close();
}
const out = path.join(HERE, LABEL + '.json');
writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
const brief = result.probe.bats.map((b) => ({ side: b.side, ink: b.ink, lean: b.leanChannel,
  rowsBelowFoot: b.bestRowsBelowFoot, underRgb: b.underRgb, plainRgb: b.plainRgb, tint: b.tint, visible: b.visible }));
console.log(JSON.stringify({ timing: result.timing, posed: result.posed, bats: brief, letterbox: result.probe.letterbox,
  native: result.probe.native, gl: result.probe.gl }, null, 1));
console.log('wrote ' + out + ' and ' + result.png);
