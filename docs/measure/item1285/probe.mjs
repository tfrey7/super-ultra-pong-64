/*
 * Item 1285: which canvas draws does the page make for the FIRST time during
 * the first era change (0 -> 1)? A GPU program is built the first time a draw
 * of a new kind reaches the GPU, so a draw kind first seen mid-ring is a
 * candidate for the ring's long frames; one the warm-ups already made is not.
 *
 *   node docs/measure/item1285/probe.mjs [--port 9601] [--size 1920,1080] [--label x] [--query '&display=off']
 *
 * Wraps every CanvasRenderingContext2D draw in the page (before any page script
 * runs) and keys each call by what decides Skia's program: the canvas it lands
 * on (the page's own, or its size), the method, the path's shape, the paint
 * (colour, colour with alpha, linear/radial gradient, pattern, image), the
 * blend, alpha, the clip depth, the transform's kind and smoothing. It records
 * the first time each key is seen, then climbs one real point from era 0 and
 * prints every key first seen once the change began, with the ring's raw
 * progress at that moment. GPU on, like pace.mjs. Writes probe-<label>.json.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : dflt; };
const PORT = Number(arg('--port', 9601));
const SIZE = arg('--size', '1920,1080');
const LABEL = arg('--label', 'probe-' + SIZE.split(',')[0]);
const QUERY = arg('--query', '');
const RUNGS = Number(arg('--rungs', 1));
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

class Session extends CdpConnection {
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) { const d = r.exceptionDetails; throw new Error((d.exception && d.exception.description) || d.text); }
    return r.result.value;
  }
}
async function waitFor(s, expr, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (await s.eval(expr).catch(() => false)) return true; await sleep(25); }
  return false;
}

// Runs in the page before any of its scripts.
const PROBE = `(() => {
  const P = CanvasRenderingContext2D.prototype;
  const seen = window.__probeSeen = new Map();
  window.__probeMark = { phase: 'load', raw: null, era: null, t: 0 };
  const tag = new WeakMap();
  const lin = P.createLinearGradient, rad = P.createRadialGradient, con = P.createConicGradient, pat = P.createPattern;
  P.createLinearGradient = function () { const g = lin.apply(this, arguments); tag.set(g, 'lin'); return g; };
  P.createRadialGradient = function () { const g = rad.apply(this, arguments); tag.set(g, 'rad'); return g; };
  if (con) P.createConicGradient = function () { const g = con.apply(this, arguments); tag.set(g, 'conic'); return g; };
  const st = new WeakMap();
  function S(c) { let s = st.get(c); if (!s) { s = { clip: 0, stack: [], path: new Set() }; st.set(c, s); } return s; }
  const save = P.save, restore = P.restore, clip = P.clip;
  P.save = function () { const s = S(this); s.stack.push(s.clip); return save.apply(this, arguments); };
  P.restore = function () { const s = S(this); if (s.stack.length) s.clip = s.stack.pop(); return restore.apply(this, arguments); };
  P.clip = function () { const s = S(this); s.clip++; s.clipShape = [...s.path].sort().join('+'); return clip.apply(this, arguments); };
  for (const m of ['arc', 'rect', 'roundRect', 'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'lineTo', 'arcTo']) {
    const f = P[m]; if (!f) continue;
    P[m] = function () { S(this).path.add(m); return f.apply(this, arguments); };
  }
  const bp = P.beginPath;
  P.beginPath = function () { S(this).path = new Set(); return bp.apply(this, arguments); };
  function paint(v) {
    if (typeof v === 'string') return /rgba|hsla|#[0-9a-f]{8}\\b/i.test(v) && !/,\\s*1\\)$/.test(v) ? 'colour-a' : 'colour';
    if (v instanceof CanvasPattern) return 'pattern';
    return tag.get(v) || 'grad';
  }
  function xf(c) {
    const m = c.getTransform();
    if (m.b || m.c) return 'turned';
    if (m.a === 1 && m.d === 1) return (m.e % 1 || m.f % 1) ? 'subpx' : 'id';
    return Math.abs(m.a - m.d) < 1e-6 ? 'scale' : 'scale2';
  }
  function where(c) {
    const cv = c.canvas;
    if (cv && cv.id === 'field') return 'PAGE';
    return cv ? cv.width + 'x' + cv.height : '?';
  }
  function key(c, m, extra) {
    const s = S(c);
    return [where(c), m, extra, c.globalCompositeOperation, c.globalAlpha < 1 ? 'a<1' : 'a1',
      s.clip ? 'clip' + s.clip + ':' + (s.clipShape || '') : 'noclip', xf(c),
      c.filter && c.filter !== 'none' ? 'filter' : '', c.shadowBlur ? 'shadow' : ''].join(' ');
  }
  function note(k) {
    const r = seen.get(k);
    if (r) { r.n++; return; }
    const M = window.__probeMark;
    seen.set(k, { n: 1, phase: M.phase, raw: M.raw, era: M.era, t: +(performance.now() / 1000).toFixed(3) });
  }
  const wrapFill = (m, pathy) => { const f = P[m]; P[m] = function () {
    const pth = pathy ? '[' + [...S(this).path].sort().join('+') + ']' : '';
    const style = m.startsWith('stroke') ? paint(this.strokeStyle) + ' w' + (this.lineWidth > 2 ? '>2' : '<=2') : paint(this.fillStyle);
    note(key(this, m, pth + ' ' + style + (arguments[0] === 'evenodd' ? ' evenodd' : '')));
    return f.apply(this, arguments); }; };
  wrapFill('fill', true); wrapFill('stroke', true); wrapFill('fillRect', false); wrapFill('strokeRect', false);
  wrapFill('fillText', false); wrapFill('strokeText', false);
  const di = P.drawImage;
  P.drawImage = function (img) {
    const src = img instanceof HTMLCanvasElement ? (img.id === 'field' ? 'PAGE' : 'canvas') : (img && img.constructor && img.constructor.name) || '?';
    note(key(this, 'drawImage', src + (arguments.length > 3 ? ' scaled' : '') + ' smooth' + (this.imageSmoothingEnabled ? (this.imageSmoothingQuality || '') : 'off')));
    return di.apply(this, arguments);
  };
})();`;

const flags = ['--headless=new', '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files',
  '--autoplay-policy=no-user-gesture-required', '--window-size=' + SIZE, '--remote-debugging-port=' + PORT,
  '--no-first-run', '--no-default-browser-check', 'about:blank'];
const chrome = await launchChrome(CHROME, flags, { name: 'probe1285' }).catch(refusePortTaken);
let ws; const out = { taken: new Date().toISOString(), label: LABEL, size: SIZE, query: QUERY, rungs: [] };
try {
  let wsUrl = null;
  for (let t = 0; t < 60 && !wsUrl; t++) {
    try { const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (page) wsUrl = page.webSocketDebuggerUrl; } catch { /* up soon */ }
    if (!wsUrl) await sleep(250);
  }
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const s = new Session(ws);
  await s.send('Page.enable'); await s.send('Runtime.enable');
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
  const [w, h] = SIZE.split(',').map(Number);
  await s.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await s.send('Page.navigate', { url: base + (QUERY ? '?' + QUERY.replace(/^&/, '') : '') });
  await waitFor(s, '!!(window.__pong && window.PongFeel && document.getElementById("field"))', 10000);
  await sleep(900);
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await waitFor(s, 'window.__pong.phase === "playing" && window.__pong.serveDelay <= 0', 8000);
  await sleep(1500);
  for (let rung = 0; rung < RUNGS; rung++) {
    // One point, placed the way pace.mjs places it, and the change marked frame by frame.
    const r = await s.eval(`new Promise((done) => {
      const g = window.__pong, R = window.PongRender, M = window.__probeMark, rr = g.right;
      M.phase = 'play'; M.era = g.era;
      g.ball.x = rr.x + rr.w + 2; g.ball.y = g.height * 0.3; g.ball.vx = 600; g.ball.vy = 0;
      let t0 = null;
      function tick(now) {
        const m = R.eraChangeMoment ? R.eraChangeMoment(g) : null;
        if (g.era === ${rung + 1} && t0 === null) t0 = now;
        if (t0 !== null) { M.phase = m ? (m.wiping ? 'ring' : 'card') : 'after'; M.raw = m && m.p != null ? +m.p.toFixed(2) : null; M.era = g.era; M.t = +((now - t0) / 1000).toFixed(2); }
        if (t0 !== null && g.serveDelay <= 0) { M.phase = 'play'; return done({ s: +((now - t0) / 1000).toFixed(2) }); }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    })`);
    const rows = await s.eval(`[...window.__probeSeen.entries()].map(([k, v]) => ({ key: k, ...v }))`);
    const fresh = rows.filter((x) => (x.phase === 'ring' || x.phase === 'card') && x.era === rung + 1).sort((a, b) => a.t - b.t);
    out.rungs.push({ rung: rung + 1, pause: r.s, fresh });
    console.log(`\nchange ${rung} -> ${rung + 1}: ${fresh.length} draw kinds first seen during it (of ${rows.length} seen so far)`);
    for (const x of fresh) console.log(`  ${x.phase} raw ${x.raw}  x${String(x.n).padStart(4)}  ${x.key}`);
    await sleep(800);
  }
  out.all = await s.eval(`[...window.__probeSeen.entries()].map(([k, v]) => ({ key: k, ...v }))`);
} finally {
  try { ws && ws.close(); } catch { /* gone */ }
  await chrome.close();
}
const file = path.join(HERE, `probe-${LABEL}.json`);
writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log('wrote ' + file);
