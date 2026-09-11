/*
 * Item 1241: is the epic engine live on the real Web Audio API, not only on the
 * test suite's stand-in? One headless Chrome, the real index.html off disk:
 *
 *   calm     the Xbox 360 (?era=10) at the first serve: the intensity the
 *            music reads, and the notes it books over three seconds
 *   peak     the same page at match point (5-5 of eleven) with a long rally:
 *            the intensity, the notes booked, and the tom roll and crash layers
 *   hot      still at match point, the music's master turned up 18 dB so the
 *            mix is forced far past full scale: analysers on the limiter's input
 *            and on its output read the loudest sample each side
 *
 * The analysers are attached from outside: a wrapper installed before the page
 * loads remembers whichever node connects into a DynamicsCompressorNode (the
 * music's master), so src/music.js carries no measuring code.
 *
 *   node docs/measure/item1241/engine-live.mjs [--port 9481]
 *
 * Writes engine-live.json beside itself.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : dflt; };
const PORT = Number(arg('--port', 9481));
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?era=10';

const WRAP = `(() => {
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (to, ...a) {
    if (typeof DynamicsCompressorNode === 'function' && to instanceof DynamicsCompressorNode) window.__preLimit = this;
    return connect.call(this, to, ...a);
  };
})();`;

class Session extends CdpConnection {
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error((d.exception && d.exception.description) || d.text);
    }
    return r.result.value;
  }
}

async function waitFor(s, expr, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await s.eval(expr).catch(() => false)) return true;
    await sleep(40);
  }
  return false;
}

/** `seconds` of play with both paddles on the ball (no point goes in); `setup` runs every tick. */
async function hold(s, seconds, setup) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    await s.eval(`(() => { const g = window.__pong;
      for (const p of [g.left, g.right]) p.y = Math.max(0, Math.min(g.height - p.h, g.ball.y + 6 - p.h / 2));
      ${setup || ''}
      return 0; })()`);
    await sleep(30);
  }
}

const READ = `(() => { const m = window.__pongMusic, g = window.__pong;
  return { era: m.era, intensity: m.intensityNow, scheduled: m.scheduled, errors: m.errors,
           audio: m.audioState(), score: g.score.left + '-' + g.score.right, rally: g.rally,
           compressor: m.limiter && m.limiter.compressor ? m.limiter.compressor.constructor.name : null,
           ceiling: m.limiter && m.limiter.ceiling ? m.limiter.ceiling.constructor.name : null }; })()`;

const flags = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files',
  '--autoplay-policy=no-user-gesture-required', '--window-size=1000,760',
  '--remote-debugging-port=' + PORT, '--no-first-run', '--no-default-browser-check', 'about:blank'];
const chrome = await launchChrome(CHROME, flags, { name: 'engine1241' }).catch(refusePortTaken);
let ws;
const out = { taken: new Date().toISOString(), url };
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
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: WRAP });
  await s.send('Page.navigate', { url });
  await waitFor(s, '!!(window.__pong && window.__pongMusic && document.getElementById("field"))', 10000);
  await sleep(300);
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await waitFor(s, 'window.__pong.phase === "playing" && window.__pongMusic.era === 10', 4000);

  // calm: the first serve
  const c0 = await s.eval(READ);
  await hold(s, 3, 'g.rally = 0;');
  const c1 = await s.eval(READ);
  out.calm = { ...c1, booked3s: c1.scheduled - c0.scheduled };

  // peak: match point, a long rally
  await s.eval('(() => { const g = window.__pong; g.score.left = 5; g.score.right = 5; return 0; })()');
  await hold(s, 0.3, 'g.rally = 12;');
  const p0 = await s.eval(READ);
  await hold(s, 3, 'g.rally = 12;');
  const p1 = await s.eval(READ);
  out.peak = { ...p1, booked3s: p1.scheduled - p0.scheduled };

  // hot: the master up 18 dB, analysers either side of the limiter
  await s.eval(`(() => { const m = window.__pongMusic, pre = window.__preLimit, ctx = pre.context;
    const a = ctx.createAnalyser(), b = ctx.createAnalyser();
    a.fftSize = b.fftSize = 2048;
    pre.connect(a); m.limiter.ceiling.connect(b);
    pre.gain.value = pre.gain.value * 8;
    window.__probe = { a, b, pre: 0, post: 0, over: 0, reads: 0, reduction: 0 };
    return 0; })()`);
  const until = Date.now() + 4000;
  while (Date.now() < until) {
    await s.eval(`(() => { const P = window.__probe, g = window.__pong, m = window.__pongMusic;
      for (const p of [g.left, g.right]) p.y = Math.max(0, Math.min(g.height - p.h, g.ball.y + 6 - p.h / 2));
      g.rally = 12;
      const x = new Float32Array(P.a.fftSize), y = new Float32Array(P.b.fftSize);
      P.a.getFloatTimeDomainData(x); P.b.getFloatTimeDomainData(y);
      let hi = 0, lo = 0;
      for (let i = 0; i < x.length; i++) hi = Math.max(hi, Math.abs(x[i]));
      for (let i = 0; i < y.length; i++) { lo = Math.max(lo, Math.abs(y[i])); if (Math.abs(y[i]) > 0.89) P.over++; }
      P.pre = Math.max(P.pre, hi); P.post = Math.max(P.post, lo); P.reads++;
      P.reduction = Math.min(P.reduction, m.limiter.compressor.reduction);
      return 0; })()`);
    await sleep(40);
  }
  const probe = await s.eval('(() => { const P = window.__probe; return { pre: P.pre, post: P.post, over: P.over, reads: P.reads, reduction: P.reduction }; })()');
  out.hot = { ...(await s.eval(READ)), boostDb: 18, ...probe, ceilingLevel: 0.89 };
} finally {
  try { ws && ws.close(); } catch { /* gone */ }
  await chrome.close();
}
const r3 = (v) => Math.round(v * 1000) / 1000;
console.log(`calm  era ${out.calm.era}, score ${out.calm.score}: intensity ${out.calm.intensity}, ${out.calm.booked3s} notes booked in 3 s, audio ${out.calm.audio}, errors ${out.calm.errors}`);
console.log(`peak  era ${out.peak.era}, score ${out.peak.score} (match point), rally ${out.peak.rally}: intensity ${out.peak.intensity}, ${out.peak.booked3s} notes booked in 3 s, errors ${out.peak.errors}`);
console.log(`hot   master +18 dB: loudest sample into the limiter ${r3(out.hot.pre)}, out of it ${r3(out.hot.post)} (ceiling 0.89),` +
  ` ${out.hot.over} samples over it in ${out.hot.reads} reads, compressor reduction down to ${r3(out.hot.reduction)} dB` +
  ` | ${out.hot.compressor} into ${out.hot.ceiling}`);
const file = path.join(HERE, 'engine-live.json');
writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log('wrote ' + file);
