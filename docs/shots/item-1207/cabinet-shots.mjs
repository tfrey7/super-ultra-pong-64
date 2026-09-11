/*
 * Item 1207's browser proof: the cabinet powering on, the attract screen, and
 * the coin moment, in real headless Chrome with index.html opened off disk.
 *
 *   node docs/shots/item-1207/cabinet-shots.mjs [--port 9481]
 *
 * A script installed before the page loads wraps requestAnimationFrame so the
 * loop can be held on the first frame whose game time passes a mark, which
 * leaves that frame on the canvas to be photographed, and then let go again.
 * Every held frame is saved beside this file, and what the page reported
 * (phase, stage, credits, what the sound player last played) goes to
 * cabinet-shots.json. Then ?title=off and ?era=3 are each loaded to show they
 * open straight into play. Nothing in src/ knows this exists.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { launchChrome } from '../../../tools/chrome.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i !== -1 ? process.argv[i + 1] : d; };
const PORT = Number(arg('port', 9481));
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
        let next = 1;
        const pending = new Map();
        ws.addEventListener('message', (ev) => {
          const msg = JSON.parse(ev.data);
          const p = pending.get(msg.id);
          if (!p) return;
          pending.delete(msg.id);
          msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
        });
        const send = (method, params = {}) => {
          const id = next++;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
        };
        const evaluate = async (expression) => {
          const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
          if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
          return r.result.value;
        };
        return { ws, send, evaluate };
      }
    } catch { /* chrome still coming up */ }
    await sleep(250);
  }
  throw new Error('Chrome never opened a debuggable page');
}

// Installed before any page script runs: the loop's own rAF, holdable.
const HOLD = `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__holdIf = () => window.__pong && window.__pong.time >= 0.2;
  window.__held = null;
  window.requestAnimationFrame = (cb) => {
    if (window.__holdIf && window.__holdIf()) { window.__held = cb; window.__holdIf = null; return 0; }
    return raf(cb);
  };
  window.__letGo = (pred) => { const cb = window.__held; window.__held = null; window.__holdIf = pred || null; if (cb) raf(cb); };
})()`;

const REPORT = `(() => { const g = window.__pong, c = window.__pongCabinet, p = window.__pongSound;
  return { phase: g.phase, time: +g.time.toFixed(3), era: g.era, serveDelay: +g.serveDelay.toFixed(3),
    stage: c ? c.stage(g) : null, credits: c ? c.credits : null,
    promptLit: window.PongRender.promptLit(g),
    sound: p ? { unlocked: p.unlocked, audio: p.audioState(), played: p.played, errors: p.errors, last: p.last } : null }; })()`;

async function main() {
  const base = pathToFileURL(path.join(ROOT, 'index.html')).href;
  const chrome = launchChrome(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--window-size=1000,760', '--remote-debugging-port=' + PORT,
    '--no-first-run', '--no-default-browser-check', 'about:blank'], { name: 'cabinet' });
  let s;
  const out = { chrome: CHROME, when: new Date().toISOString(), frames: [] };
  try {
    s = await connect();
    await s.send('Page.enable');
    await s.send('Runtime.enable');
    await s.send('Page.addScriptToEvaluateOnNewDocument', { source: HOLD });
    await s.send('Page.navigate', { url: base });

    const rect = async () => s.evaluate(`(() => { const r = document.getElementById('field').getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
    const waitHeld = async (label) => {
      for (let i = 0; i < 200; i++) {
        if (await s.evaluate('!!window.__held').catch(() => false)) return;
        await sleep(50);
      }
      throw new Error('the loop never reached the mark for ' + label);
    };
    const shoot = async (name) => {
      await waitHeld(name);
      const shot = await s.send('Page.captureScreenshot', { format: 'png', clip: { ...(await rect()), scale: 1 } });
      const file = path.join(HERE, name + '.png');
      writeFileSync(file, Buffer.from(shot.data, 'base64'));
      const state = await s.evaluate(REPORT);
      out.frames.push({ name, png: path.basename(file), state });
      console.log(name, JSON.stringify(state));
    };

    await shoot('warmup-1-dot');
    await s.evaluate('window.__letGo(() => window.__pong.time >= 0.55)');
    await shoot('warmup-2-line');
    await s.evaluate('window.__letGo(() => window.__pong.time >= 1.0)');
    await shoot('warmup-3-picture');
    await s.evaluate(`window.__letGo(() => window.__pong.time >= 7 && window.PongRender.promptLit(window.__pong))`);
    await shoot('attract');

    // The coin: a real click on the field, while the loop runs.
    await s.evaluate('window.__letGo(null)');
    const r = await rect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    await s.evaluate(`window.__holdIf = () => window.__pong.phase === 'playing' && window.__pong.time >= 0.3`);
    await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 });
    await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 });
    await shoot('coin-1-credit');
    await s.evaluate('window.__letGo(() => window.__pong.time >= 1.3)');
    await shoot('coin-2-ready');
    await s.evaluate('window.__letGo(() => window.__pong.time >= 3.0)');
    await shoot('coin-3-play');

    // The match card's one call: back to the attract screen.
    await s.evaluate('window.__letGo(null)');
    out.backToTitle = await s.evaluate('window.Pong.backToTitle(window.__pong)');
    await s.evaluate(`window.__holdIf = () => true`);
    await shoot('back-to-attract');
    await s.evaluate('window.__letGo(null)');

    // Straight into play.
    for (const q of ['?title=off', '?era=3']) {
      await s.send('Page.navigate', { url: base + q });
      await sleep(1500);
      await s.evaluate('window.__letGo(null)').catch(() => {});
      await sleep(300);
      out[q] = await s.evaluate(REPORT);
      console.log(q, JSON.stringify(out[q]));
    }
    writeFileSync(path.join(HERE, 'cabinet-shots.json'), JSON.stringify(out, null, 2) + '\n');
  } finally {
    try { s && s.ws.close(); } catch { /* gone */ }
    await chrome.close();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
