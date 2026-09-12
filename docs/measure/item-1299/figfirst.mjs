/*
 * Item 1299: what does the FIRST frame that draws a Blender glTF figure cost?
 *
 * Item 1274 measured one second of ordinary play per era and found the Xbox
 * (era 9) slower with the figures on, with one 333 ms frame in it, and
 * suspected a first-draw shader build without proving it. This records a COLD
 * page instead -- every frame from before the page loads until a second or two
 * of play -- so the long frame is caught with what the page was doing in it:
 *
 *   st    the figure file's load state that frame ('-' none asked yet,
 *         'loading', 'ready')
 *   kids  how many objects the 3D scene holds (a figure adds its body and its
 *         contact shadow, so this jumps by 4 the frame both sides are built)
 *
 * and it reads PongField3D.figureTimings() at the end: what unpacking the
 * file cost, what building the two posed copies cost, what the warm-up cost.
 *
 *   node docs/measure/item-1299/figfirst.mjs [--port 9491] [--eras 9]
 *                                            [--runs 3] [--label before]
 *                                            [--query "&figures=off"]
 *
 * The playtest's own headless Chrome (--disable-gpu, WebGL in software through
 * --enable-unsafe-swiftshader). Writes figfirst-<label>.json beside itself.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const argv = process.argv;
const str = (name, d) => { const i = argv.indexOf(name); return i !== -1 ? argv[i + 1] : d; };
const num = (name, d) => { const i = argv.indexOf(name); return i !== -1 ? Number(argv[i + 1]) : d; };
const PORT = num('--port', 9491);
const RUNS = num('--runs', 3);
const LABEL = str('--label', 'run');
const QUERY = str('--query', '');
const ERAS = str('--eras', '9').split(',').map(Number);
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

class Session extends CdpConnection {
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
}

// Runs at document start, before any of the page's own scripts: one rAF
// recorder that notes each frame's length beside what the figures were doing.
const RECORDER = `(function () {
  window.__rec = { rows: [] };
  var last = null;
  function tick(now) {
    var st = '-', kids = -1;
    try {
      var F = window.PongField3D, C = window.PongCharacters;
      if (F && C && typeof C.configFor === 'function') {
        var era = Math.floor((window.__pong && window.__pong.era) || 0);
        var cfg = C.configFor(era, 'left');
        var n = cfg && (cfg.figure || cfg.model);
        var s = n ? F.figureState(n) : null;
        st = s ? s.state : '-';
        var io = typeof F.internals === 'function' ? F.internals() : null;
        kids = io ? io.scene.children.length : -1;
      }
    } catch (e) { /* the page is still coming up */ }
    // How long the page thread stays busy this frame: this callback is the
    // first rAF the page registers, so it runs before the game's, and a
    // timeout posted here runs after the whole frame's work is done.
    var row = null;
    if (last !== null) {
      row = { t: +now.toFixed(1), d: +(now - last).toFixed(1), st: st, kids: kids, busy: 0 };
      window.__rec.rows.push(row);
    }
    var began = performance.now();
    if (row) setTimeout(function () { row.busy = +(performance.now() - began).toFixed(1); }, 0);
    last = now;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})()`;

async function one(s, era) {
  await s.send('Page.navigate', { url: `${base}?era=${era}${QUERY}` });
  for (let t = 0; t < 120; t++) {
    if (await s.eval('!!(window.__pong && document.getElementById("field"))').catch(() => false)) break;
    await sleep(50);
  }
  await sleep(800);
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  // Both paddles chase the ball so the rally runs and the move clips play.
  for (let t = 0; t < 60; t++) {
    await s.eval(`(() => { const g = window.__pong; if (!g || !g.ball) return 0;
      for (const p of [g.left, g.right]) p.y = Math.max(0, Math.min(g.height - p.h, g.ball.y + 6 - p.h / 2));
      return 0; })()`).catch(() => 0);
    await sleep(50);
  }
  const rows = await s.eval('window.__rec.rows');
  const info = await s.eval(`(() => { const F = window.PongField3D, C = window.PongCharacters;
    const cfg = C.configFor(${era}, 'left'); const name = cfg.figure || cfg.model;
    return { name: name, gl: F.available(), file: F.figureState(name),
      timings: typeof F.figureTimings === 'function' ? F.figureTimings() : null }; })()`);
  // The first frame the scene held the figures, and the longest frame at or after it.
  const baseKids = rows.length ? Math.min(...rows.filter((r) => r.kids >= 0).map((r) => r.kids)) : 0;
  const firstFig = rows.findIndex((r) => r.kids > baseKids);
  const after = firstFig === -1 ? [] : rows.slice(firstFig);
  const longest = (list) => list.reduce((a, b) => (b.d > a.d ? b : a), { d: 0, t: 0, st: '-', kids: -1 });
  const over = (list, ms) => list.filter((r) => r.d > ms).map((r) => ({ t: r.t, d: r.d, busy: r.busy, st: r.st, kids: r.kids }));
  return { era, ...info, frames: rows.length, baseKids,
    firstFigureFrame: firstFig === -1 ? null : rows[firstFig],
    longestOverall: longest(rows), longestAfterFigures: longest(after),
    over50: over(rows, 50), rows };
}

const flags = ['--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio',
  '--allow-file-access-from-files', '--window-size=1000,760', '--remote-debugging-port=' + PORT, '--no-first-run',
  '--no-default-browser-check', 'about:blank'];
const chrome = await launchChrome(CHROME, flags, { name: 'item1299' }).catch(refusePortTaken);
const runs = [];
let ws;
try {
  let wsUrl = null;
  for (let t = 0; t < 60 && !wsUrl; t++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch { /* coming up */ }
    if (!wsUrl) await sleep(250);
  }
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const s = new Session(ws);
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
  for (let r = 0; r < RUNS; r++) {
    for (const era of ERAS) {
      const row = await one(s, era);
      runs.push({ run: r, ...row });
      const f = row.firstFigureFrame, T = row.timings || {};
      console.log(`run ${r} era ${era} ${row.name}: first figure frame ` +
        (f ? `${f.d} ms (page busy ${f.busy} ms) at ${f.t} ms` : 'never') +
        `, longest after ${row.longestAfterFigures.d} ms, longest overall ${row.longestOverall.d} ms` +
        `, over 50 ms: ${row.over50.length}` +
        ` | unpack ${T.parseMs} ms, build ${T.buildMs} ms, compile ${T.compileMs} ms, warm ${T.warmMs} ms`);
    }
  }
} finally {
  try { ws && ws.close(); } catch { /* gone */ }
  await chrome.close();
}
const out = path.join(HERE, `figfirst-${LABEL}.json`);
writeFileSync(out, JSON.stringify({ taken: new Date().toISOString(), label: LABEL, query: QUERY, runs }, null, 1) + '\n');
console.log('wrote ' + out);
