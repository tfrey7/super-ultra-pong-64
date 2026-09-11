/*
 * Item 1243: do the six new arrangements (PlayStation to Xbox 360) play on the
 * real Web Audio API, build with the game, and stay under the limiter's
 * ceiling? One headless Chrome, the real index.html off disk, each era opened
 * with ?era=N (a copy of item 1241's engine-live.mjs, run per era):
 *
 *   calm   the first serve: the intensity the music reads, notes booked in 3 s
 *   peak   match point (5-5 of eleven) and a twelve-hit rally: the same, plus
 *          the loudest sample into the limiter and out of it, at the game's own
 *          level (nothing turned up), and how many samples passed the ceiling
 *   hot    era 10 only, still at the peak, the music's master turned up 18 dB
 *
 *   node docs/measure/item1243/eras-live.mjs [--port 9481]
 *
 * Writes eras-live.json beside itself.
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
const page = (era) => 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?era=' + era;

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

const READ = `(() => { const m = window.__pongMusic, g = window.__pong;
  return { era: m.era, intensity: m.intensityNow, scheduled: m.scheduled, errors: m.errors,
           audio: m.audioState(), score: g.score.left + '-' + g.score.right, rally: g.rally }; })()`;

const PROBE = `(() => { const m = window.__pongMusic, pre = window.__preLimit, ctx = pre.context;
  const a = ctx.createAnalyser(), b = ctx.createAnalyser();
  a.fftSize = b.fftSize = 2048;
  pre.connect(a); m.limiter.ceiling.connect(b);
  window.__probe = { a, b, pre: 0, post: 0, over: 0, reads: 0 };
  return 0; })()`;

/** `seconds` of play, both paddles on the ball; `setup` runs every tick; reads the probe if armed. */
async function hold(s, seconds, setup) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    await s.eval(`(() => { const g = window.__pong, P = window.__probe;
      for (const p of [g.left, g.right]) p.y = Math.max(0, Math.min(g.height - p.h, g.ball.y + 6 - p.h / 2));
      ${setup || ''}
      if (P) {
        const x = new Float32Array(P.a.fftSize), y = new Float32Array(P.b.fftSize);
        P.a.getFloatTimeDomainData(x); P.b.getFloatTimeDomainData(y);
        for (let i = 0; i < x.length; i++) P.pre = Math.max(P.pre, Math.abs(x[i]));
        for (let i = 0; i < y.length; i++) { P.post = Math.max(P.post, Math.abs(y[i])); if (Math.abs(y[i]) > 0.89) P.over++; }
        P.reads++;
      }
      return 0; })()`);
    await sleep(40);
  }
}
const takeProbe = '(() => { const P = window.__probe; const r = { pre: P.pre, post: P.post, over: P.over, reads: P.reads }; P.pre = P.post = P.over = P.reads = 0; return r; })()';

const flags = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files',
  '--autoplay-policy=no-user-gesture-required', '--window-size=1000,760',
  '--remote-debugging-port=' + PORT, '--no-first-run', '--no-default-browser-check', 'about:blank'];
const chrome = await launchChrome(CHROME, flags, { name: 'eras1243' }).catch(refusePortTaken);
let ws;
const out = { taken: new Date().toISOString(), eras: {} };
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
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: WRAP });
  for (const era of [5, 6, 7, 8, 9, 10]) {
    await s.send('Page.navigate', { url: page(era) });
    await sleep(200);
    await waitFor(s, '!!(window.__pong && window.__pongMusic && document.getElementById("field"))', 10000);
    await sleep(300);
    await s.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
    await s.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
    await waitFor(s, `window.__pong.phase === "playing" && window.__pongMusic.era === ${era}`, 4000);
    await s.eval(PROBE);
    const row = {};
    const c0 = await s.eval(READ);
    await hold(s, 3, 'g.rally = 0;');
    const c1 = await s.eval(READ);
    row.calm = { ...c1, booked3s: c1.scheduled - c0.scheduled, ...(await s.eval(takeProbe)) };
    await s.eval('(() => { const g = window.__pong; g.score.left = 5; g.score.right = 5; return 0; })()');
    await hold(s, 0.3, 'g.rally = 12;');
    await s.eval(takeProbe);
    const p0 = await s.eval(READ);
    await hold(s, 3, 'g.rally = 12;');
    const p1 = await s.eval(READ);
    row.peak = { ...p1, booked3s: p1.scheduled - p0.scheduled, ...(await s.eval(takeProbe)) };
    if (era === 10) {
      await s.eval('(() => { const pre = window.__preLimit; pre.gain.value = pre.gain.value * 8; return 0; })()');
      await hold(s, 3, 'g.rally = 12;');
      row.hot = { boostDb: 18, ...(await s.eval(takeProbe)) };
    }
    out.eras[era] = row;
  }
} finally {
  try { ws && ws.close(); } catch { /* gone */ }
  await chrome.close();
}
const r3 = (v) => Math.round(v * 1000) / 1000;
for (const [era, r] of Object.entries(out.eras)) {
  console.log(`era ${era}  calm: intensity ${r.calm.intensity}, ${r.calm.booked3s} notes in 3 s, audio ${r.calm.audio}` +
    ` | peak: intensity ${r.peak.intensity}, ${r.peak.booked3s} notes in 3 s, loudest in ${r3(r.peak.pre)} out ${r3(r.peak.post)},` +
    ` ${r.peak.over} samples over 0.89 in ${r.peak.reads} reads | errors ${r.peak.errors}`);
  if (r.hot) console.log(`era ${era}  hot (+18 dB): loudest in ${r3(r.hot.pre)} out ${r3(r.hot.post)}, ${r.hot.over} samples over 0.89 in ${r.hot.reads} reads`);
}
const file = path.join(HERE, 'eras-live.json');
writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log('wrote ' + file);
