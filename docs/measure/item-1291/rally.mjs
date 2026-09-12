// Item 1291: the PlayStation (era 5) through its own limits inside the 3D layer.
// One rally frame of era 5 through the real 3D layer on the playtest's own
// headless Chrome (software WebGL), the frame time with and without this card,
// and the proof that a bat's edge steps in 2.5-pixel chunks.
//
//   node docs/measure/item-1291/rally.mjs --label before|after [--root <checkout>] [--port 9491]
//
// --root is the checkout whose index.html is opened (default: this one), so
// the same script shoots master's game and this branch's. Writes
// docs/shots/item-1291/<label>-era5-rally.png (the field, as the player sees it)
// and prints three things:
//   frame   the page's own frame clock over three 3-second windows of ordinary
//           play (mean rAF interval) and the 3D layer's own ms per draw
//   slab    what the layer's slab carries: its texture's size, whether the
//           affine chunk is installed, the lighting model's material
//   edge    ?display=off (era 5 straight onto the 800 x 600 page, no screen
//           overlay): every colour change along each row of the left bat's
//           box, and whether each lies on a 2.5-pixel chunk boundary
// Chrome comes from tools/chrome.mjs, so its profile is deleted on exit and a
// taken port is refused.
import path from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchChrome, refusePortTaken, pickOwnPage } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OWN = path.resolve(HERE, '..', '..', '..');
const arg = (n, f) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : f; };
const ROOT = path.resolve(arg('root', OWN));
const OUT = path.join(OWN, 'docs', 'shots', 'item-1291');
const PORT = Number(arg('port', 9491));
const LABEL = arg('label', 'after');
// The first seconds of a fresh page are not the game's speed: SwiftShader compiles
// each material's program the first time it is drawn, and this era's slab carries a
// custom one. WARM seconds of play are thrown away before the first window, and the
// windows' MEDIAN is the number to compare -- one long compile frame moves a mean
// by 4 ms and a median not at all.
const WINDOWS = Number(arg('windows', 3));
const WARM = Number(arg('warm', 0));
const ONLY = arg('only', 'both');          // frames | edge | both
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Session extends CdpConnection {
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text);
    return r.result.value;
  }
}

const page = (q) => 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?era=5' + (q || '');

// The rally frame: the ball two thirds of the way to the computer, heading there,
// each paddle a little off its line, the clock pinned so the camera's wobble is
// the same pose on both runs.
// Era 5 wears era 1's paddle colours (look.like = 1), which the session draws at
// random, so two runs photograph two differently coloured bats. Pinned here, on
// the measurement page only, so the before and after pictures are the same frame
// and the edge check knows exactly which ink it is hunting for.
const PLACE = `(() => {
  const g = window.__pong;
  const look = window.PongRender.eraLook(5);
  look.paddleInk = (s, side) => (side === 'left' ? '#e03a3e' : '#2e6db4');
  g.serveDelay = 0; g.time = 12.5;
  g.ball.x = 520; g.ball.y = 250; g.ball.vx = 260; g.ball.vy = 60;
  g.left.y = 200; g.right.y = 190;
  return g.era;
})()`;

async function open(url) {
  const chrome = await launchChrome(CHROME, ['--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files', '--window-size=1000,760',
    '--remote-debugging-port=' + PORT, '--no-first-run', '--no-default-browser-check', url],
  { name: 'item1291' }).catch(refusePortTaken);
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      target = pickOwnPage(list, url).own;
    } catch { /* coming up */ }
    if (!target) await sleep(250);
  }
  if (!target) { await chrome.close(); throw new Error('no page'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const s = new Session(ws);
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  return { chrome, ws, s };
}

async function frames(s, seconds) {
  const out = [];
  for (let w = 0; w < (seconds ? 1 : WINDOWS); w++) {
    out.push(await s.eval(`new Promise((done) => {
      const F = window.PongField3D, g = window.__pong;
      const s0 = F.stats(), t = [];
      function tick(now) {
        t.push(now);
        g.right.y = g.ball.y - g.right.h / 2;          // the computer on the ball: no point mid-reading
        if (now - t[0] < ${seconds ? seconds * 1000 : 3000}) requestAnimationFrame(tick);
        else {
          const s1 = F.stats(), d = [];
          for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]);
          d.sort((a, b) => a - b);
          done({ n: d.length, mean: d.reduce((a, b) => a + b, 0) / d.length, p95: d[Math.floor(d.length * 0.95)],
            glDraws: s1.frames - s0.frames, glMs: (s1.ms - s0.ms) / Math.max(1, s1.frames - s0.frames) });
        }
      }
      requestAnimationFrame(tick);
    })`));
  }
  return out;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const rel = path.relative(OWN, ROOT) || '.';
  console.log(`item 1291 ${LABEL}: ${rel} (${ROOT})`);

  // 1. the ordinary page: the rally frame and the frame clock
  let chrome, ws, s;
  if (ONLY !== 'edge') {
  ({ chrome, ws, s } = await open(page()));
  try {
    await sleep(2500);
    const era = await s.eval(PLACE);
    await sleep(60);
    const geo = await s.eval(`(() => { const b = document.getElementById('field').getBoundingClientRect();
      return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`);
    const shot = await s.send('Page.captureScreenshot', { format: 'png', clip: { ...geo, scale: 1 } });
    const file = path.join(OUT, `${LABEL}-era5-rally.png`);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    const slab = await s.eval(`(() => {
      const F = window.PongField3D, I = F && F.internals();
      if (!I) return { gl: false, why: F ? F.why() : 'no layer' };
      const m = I.parts.slab.material, map = m.map;
      return { gl: F.available(), material: m.type, flat: !!m.flatShading,
        map: map ? (map.image.width + ' x ' + map.image.height) : null,
        affine: !!(m.userData && m.userData.ps1Affine),
        rail: I.parts.farRail.material.type + (I.parts.farRail.material.vertexColors ? ' + vertex colours' : '') };
    })()`);
    console.log(`era ${era}; shot -> ${path.relative(OWN, file)}`);
    console.log('slab ' + JSON.stringify(slab));
    if (WARM > 0) {
      const w = (await frames(s, WARM))[0];
      console.log(`warm-up thrown away: ${WARM} s, ${w.n} frames, mean ${w.mean.toFixed(2)} ms, p95 ${w.p95.toFixed(2)} ms; ` +
        `3D layer ${w.glDraws} draws at ${w.glMs.toFixed(2)} ms each`);
    }
    const f = await frames(s);
    f.forEach((r, i) => console.log(`frame window ${i + 1}: ${r.n} frames, mean ${r.mean.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms; ` +
      `3D layer ${r.glDraws} draws at ${r.glMs.toFixed(2)} ms each`));
    const mid = (xs) => { const a = xs.slice().sort((p, q) => p - q); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
    const mean = f.reduce((a, r) => a + r.mean, 0) / f.length, gl = f.reduce((a, r) => a + r.glMs, 0) / f.length;
    console.log(`frame mean of the ${f.length} windows: ${mean.toFixed(2)} ms a frame, ${gl.toFixed(2)} ms a 3D draw`);
    console.log(`frame MEDIAN of the ${f.length} windows: ${mid(f.map((r) => r.mean)).toFixed(2)} ms a frame, ` +
      `${mid(f.map((r) => r.glMs)).toFixed(2)} ms a 3D draw`);
  } finally { ws.close(); await chrome.close(); }
  }

  // 2. ?display=off: era 5 straight onto the 800 x 600 page; the left bat's edges
  if (ONLY === 'frames') return;
  ({ chrome, ws, s } = await open(page('&display=off')));
  try {
    await sleep(2500);
    const edge = await s.eval(`(() => {
      const g = window.__pong;
      ${PLACE};
      return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => {
        g.serveDelay = 0;
        const R = window.PongRender, T = R.table3d, look = R.eraLook(5);
        const cam = look.cameraAt(T, g, look.camera), p = g.left;
        const pts = [[p.x, p.y, 0], [p.x + p.w, p.y, 0], [p.x, p.y + p.h, 0], [p.x + p.w, p.y + p.h, 0],
          [p.x, p.y, 22], [p.x + p.w, p.y, 22], [p.x, p.y + p.h, 22], [p.x + p.w, p.y + p.h, 22]].map((q) => T.project(cam, q[0], q[1], q[2]));
        const x0 = Math.floor(Math.min(...pts.map((q) => q.x))) - 6, x1 = Math.ceil(Math.max(...pts.map((q) => q.x))) + 6;
        const y0 = Math.floor(Math.min(...pts.map((q) => q.y))) - 6, y1 = Math.ceil(Math.max(...pts.map((q) => q.y))) + 6;
        const c = document.getElementById('field').getContext('2d');
        const img = c.getImageData(x0, y0, x1 - x0, y1 - y0), w = x1 - x0, d = img.data;
        // A pixel is the bat's when its colour is a shade of the bat's ink: a lit
        // flat colour keeps the ink's channel ratios (the player standing beside
        // it, the table and the rail do not).
        const ink = R.paddleInk(g, 'left');
        const ir = parseInt(ink.slice(1, 3), 16), ig = parseInt(ink.slice(3, 5), 16), ib = parseInt(ink.slice(5, 7), 16);
        const isBat = (i) => d[i] > 40 && Math.abs(d[i + 1] / d[i] - ig / ir) < 0.08 && Math.abs(d[i + 2] / d[i] - ib / ir) < 0.08;
        // Chrome's sharp copy takes page pixel x from buffer pixel floor(x / 2.5),
        // so a buffer pixel's edge lands on x = ceil(2.5 k): 0, 3, 5, 8, 10, 13 ...
        const boundary = new Set(); for (let k = 0; k < 400; k++) boundary.add(Math.ceil(2.5 * k));
        const left = [];                      // [row, the bat's first pixel in it]
        for (let y = 0; y < y1 - y0; y++) {
          for (let x = 0; x < w; x++) if (isBat((y * w + x) * 4)) { left.push([y0 + y, x0 + x]); break; }
        }
        const steps = [];                     // the left edge as runs: [x, first row, rows]
        left.forEach(([y, x]) => { const s = steps[steps.length - 1]; if (s && s[0] === x && s[1] + s[2] === y) s[2]++; else steps.push([x, y, 1]); });
        const onGrid = steps.filter((s) => boundary.has(s[0])).length;
        const inner = steps.slice(1, -1), runsOk = inner.filter((s) => s[2] === 2 || s[2] === 3 || s[2] % 5 === 0 || s[2] % 5 === 2 || s[2] % 5 === 3).length;
        done({ box: [x0, y0, x1, y1], ink, rows: left.length, steps, onGrid, inner: inner.length, runsOk });
      })));
    })()`);
    console.log(`edge: the left bat's box ${JSON.stringify(edge.box)} (ink ${edge.ink}) on the 800 x 600 page, ?display=off`);
    console.log(`edge: the bat's left edge over ${edge.rows} rows, as [x, from row, rows]: ${JSON.stringify(edge.steps)}`);
    console.log(`edge: ${edge.onGrid} of ${edge.steps.length} edge positions sit on a 2.5-pixel chunk boundary (x = 0, 3, 5, 8, 10, 13 ...); ` +
      `${edge.runsOk} of ${edge.inner} inner runs are whole chunks tall (2 or 3 rows, or a multiple of 2.5 rounded)`);
  } finally { ws.close(); await chrome.close(); }
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
