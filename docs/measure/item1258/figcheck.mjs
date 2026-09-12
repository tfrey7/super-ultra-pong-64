/*
 * item 1258 -- era 10's two Blender-built soldiers, seen and timed on the page.
 *
 * Copied from docs/measure/item1298/hdcheck.mjs and cut down to what this card
 * has to answer: are the figures really standing at the Xbox 360's table, and
 * does the era still hold its frame time with them there.
 *
 * One frozen rally frame of the Xbox 360, drawn by the real page in headless
 * Chrome with the GPU off (the slowest, software-drawn case), read back out of
 * the native 960 x 720 picture and written beside this file as <label>.png:
 *
 *   figures   each side's figure file: its name and whether the 3D layer has
 *             it ready, and whether the last draw stood the glTF figures
 *   frameMs   mean, p95 and max frame over a second of ordinary play, on the
 *             page's own clock, before the frame is frozen
 *   ink       the paddle colours the figures' `ink` material is repainted in
 *
 * Run it against this worktree and against the main checkout for the pair:
 *
 *   node docs/measure/item1258/figcheck.mjs --label after  --port 9361
 *   node docs/measure/item1258/figcheck.mjs --label before --port 9363 \
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
const PORT = Number(arg('port', '9361'));
const ROOT = arg('root', OWN_ROOT);
const OUT = arg('out', HERE);
const CHROME = arg('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The frozen frame: a rally in play, the near bat low and the far bat high, so
// both figures are in frame at their own ends with the ball between them.
const SEED = `(() => {
  const g = window.__pong;
  if (!g) return 'no game';
  window.Pong.step = function () {};
  g.phase = 'playing';
  g.serveDelay = 0;
  g.time = 12.5;
  g.era = 10;
  g.eraChangedAt = -1;
  g.score.left = 4; g.score.right = 3;
  g.ball.x = 430; g.ball.y = 250; g.ball.vx = 520; g.ball.vy = -190;
  g.left.y = 360; g.right.y = 60;
  return 'frozen';
})()`;

const FIGURES = `(() => {
  const C = window.PongCharacters, F = window.PongField3D;
  const out = { webgl: !!(F && F.available && F.available()), sides: {} };
  for (const side of ['left', 'right']) {
    const cfg = C.configFor(10, side);
    const name = cfg.figure || cfg.model;
    out.sides[side] = { name, state: F && F.figureState ? F.figureState(name) : null,
                        sheet: cfg.sheet || null, modelScale: cfg.modelScale, shading: cfg.shading };
  }
  out.stoodGltf = !!(F && F.takeFigures && F.takeFigures());
  out.ink = { left: window.PongRender.paddleInk(window.__pong, 'left'),
              right: window.PongRender.paddleInk(window.__pong, 'right') };
  return out;
})()`;

const SHOT = `(() => {
  const c = window.PongDisplay.canvas();
  return { W: c.width, H: c.height, png: c.toDataURL('image/png') };
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
    if (foreign) throw new Error(`item1258: port ${PORT} is serving ${foreign.url}, not this checkout's page -- pick another --port`);
    await sleep(250);
  }
  throw new Error('Chrome never opened a debuggable page');
}

const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?era=10';
const chrome = await launchChrome(CHROME, [
  '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio',
  '--allow-file-access-from-files', '--window-size=960,720', '--remote-debugging-port=' + PORT,
  '--no-first-run', '--no-default-browser-check', url
], { name: 'item1258' }).catch(refusePortTaken);
console.log(`chrome: pid ${chrome.pid}, port ${PORT}, page ${url}`);

try {
  const ws = new WebSocket(await targetUrl(url));
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const s = new Session(ws);
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  await sleep(2500);                       // the era's own files, then the figures, load as scripts
  const frame = await s.eval(FRAMES);
  console.log(await s.eval(SEED));
  await sleep(900);                        // the figures are posed on the frames after the seed
  const figures = await s.eval(FIGURES);
  const m = await s.eval(SHOT);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, LABEL + '.png'), Buffer.from(m.png.split(',')[1], 'base64'));
  const out = { label: LABEL, root: ROOT, W: m.W, H: m.H, frame, ...figures };
  writeFileSync(path.join(OUT, LABEL + '.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`${LABEL}: WebGL ${figures.webgl ? 'on' : 'OFF'}; frame mean ${frame.mean.toFixed(1)} ms, ` +
              `p95 ${frame.p95.toFixed(1)}, max ${frame.max.toFixed(1)} over ${frame.frames} frames`);
  console.log(JSON.stringify(out, null, 2));
} finally {
  await chrome.close();
  process.exit(0);
}
