// Item 1253: what era 5's two built fighters cost a frame, and the proof that
// it is the glTF figures standing at the table rather than the canvas fallback.
//
//   node docs/measure/item1253/figures.mjs --label with --gpu
//   node docs/measure/item1253/figures.mjs --label without --gpu --q "&characters=off"
//
// A copy of docs/measure/item-1291/rally.mjs (item 1291) with its bat-edge scan
// taken out, a --q knob that appends to the page's query so the same rally can be
// played with the players switched off, and a read of the 3D layer's own figure
// state. It writes docs/shots/item-1253/<label>-era5-rally.png and prints:
//   figures  each figure file's load state, and whether the layer stood them
//   frame    the page's frame clock over three 3-second windows of ordinary play,
//            and the 3D layer's own ms per draw; the MEDIAN of the windows is the
//            number to compare (item 1291: one shader compile moves a mean by 4 ms)
// Chrome comes from tools/chrome.mjs, so its profile is deleted on exit and a
// taken port is refused. --gpu lets Chrome use the real graphics card; without it
// WebGL is rasterised on the CPU, which is the playtest's machine and not anybody's.
import path from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchChrome, refusePortTaken, pickOwnPage } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OWN = path.resolve(HERE, '..', '..', '..');
const arg = (n, f) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : f; };
const ROOT = path.resolve(arg('root', OWN));
const OUT = path.join(OWN, 'docs', 'shots', 'item-1253');
const PORT = Number(arg('port', 9371));
const LABEL = arg('label', 'with');
const QUERY = arg('q', '');
const WINDOWS = Number(arg('windows', 3));
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

// The same rally frame item 1291 used: the ball two thirds of the way to the
// computer, each paddle a little off its line, the clock pinned so the camera's
// wobble is the same pose on every run. The paddle inks are pinned too (era 5
// borrows era 1's, which the session picks at random), so the two fighters wear
// the same colours in every picture.
const PLACE = `(() => {
  const g = window.__pong;
  const look = window.PongRender.eraLook(5);
  look.paddleInk = (s, side) => (side === 'left' ? '#a459d0' : '#40b898');
  g.serveDelay = 0; g.time = 12.5;
  g.ball.x = 520; g.ball.y = 250; g.ball.vx = 260; g.ball.vy = 60;
  g.left.y = 200; g.right.y = 190;
  return g.era;
})()`;

const GPU = process.argv.includes('--gpu');

async function open(url) {
  const chrome = await launchChrome(CHROME, ['--headless=new',
    ...(GPU ? [] : ['--disable-gpu', '--enable-unsafe-swiftshader']),
    '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files', '--window-size=1000,760',
    '--remote-debugging-port=' + PORT, '--no-first-run', '--no-default-browser-check', url],
  { name: 'item1253' }).catch(refusePortTaken);
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

async function frames(s) {
  const out = [];
  for (let w = 0; w < WINDOWS; w++) {
    out.push(await s.eval(`new Promise((done) => {
      const F = window.PongField3D, g = window.__pong;
      const s0 = F.stats(), t = [];
      function tick(now) {
        t.push(now);
        g.right.y = g.ball.y - g.right.h / 2;          // the computer on the ball: no point mid-reading
        if (now - t[0] < 3000) requestAnimationFrame(tick);
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
  console.log(`item 1253 ${LABEL}: ${ROOT}${QUERY ? ' (page ?era=5' + QUERY + ')' : ''}, gpu ${GPU}`);
  const { chrome, ws, s } = await open(page(QUERY));
  try {
    await sleep(3000);                 // the figure files are loaded by a script tag the layer adds
    const era = await s.eval(PLACE);
    await sleep(120);
    const geo = await s.eval(`(() => { const b = document.getElementById('field').getBoundingClientRect();
      return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`);
    const shot = await s.send('Page.captureScreenshot', { format: 'png', clip: { ...geo, scale: 1 } });
    const file = path.join(OUT, `${LABEL}-era5-rally.png`);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    const figures = await s.eval(`(() => {
      const F = window.PongField3D, C = window.PongCharacters;
      const names = ['left', 'right'].map((side) => { const c = C.configFor(5, side); return c.figure || c.model; });
      return { gl: !!(F && F.available()), names: names,
        state: names.map((n) => (F && F.figureState ? F.figureState(n) : null)),
        stood: !!(F && F.stats && F.stats().figures) };
    })()`);
    console.log(`era ${era}; shot -> ${path.relative(OWN, file)}`);
    console.log('figures ' + JSON.stringify(figures));
    const f = await frames(s);
    f.forEach((r, i) => console.log(`frame window ${i + 1}: ${r.n} frames, mean ${r.mean.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms; ` +
      `3D layer ${r.glDraws} draws at ${r.glMs.toFixed(2)} ms each`));
    const mid = (xs) => { const a = xs.slice().sort((p, q) => p - q); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
    console.log(`frame MEDIAN of the ${f.length} windows: ${mid(f.map((r) => r.mean)).toFixed(2)} ms a frame, ` +
      `${mid(f.map((r) => r.glMs)).toFixed(2)} ms a 3D draw`);
  } finally { ws.close(); await chrome.close(); }
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
