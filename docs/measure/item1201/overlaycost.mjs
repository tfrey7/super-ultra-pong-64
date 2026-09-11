/*
 * Item 1201: what does each era's screen overlay cost on its own? One second of
 * ordinary play at every era, opened with index.html?era=N, on the page's own
 * rAF clock -- item 1192's eraspeed.mjs reading, copied here -- with the display
 * layer on in every setup and only the overlay switched:
 *
 *   harness      the playtest's own Chrome flags (--disable-gpu), overlay on
 *   harness-off  the same Chrome, the era's row set to overlay 'none'
 *   gpu          Chrome allowed its GPU, overlay on
 *   gpu-off      Chrome allowed its GPU, overlay 'none'
 *
 * The overlay is taken out by setting every PongDisplay.ROWS[n].overlay to
 * 'none' after the page loads, so the native picture and its scale-up are
 * unchanged and the difference is the overlays' own cost.
 *
 * Then item 1155's reading: at eras 0 to 9 one point is forced and the ring's
 * frames are timed against the second of ordinary play just taken, so each
 * era change's ring is measured with its two screens on and off.
 *
 *   node docs/measure/item1201/overlaycost.mjs [--port 9471] [--eras 3,5]
 *        [--setups harness,harness-off] [--tweak "<js run after load>"] [--out name]
 *
 * Writes <name>.json beside itself (overlaycost.json by default). --tweak is how
 * one layer of a screen is A/B'd without editing it: the kinds' tuning objects are
 * live, e.g. --tweak "PongDisplay.CRT.KINDS['crt-composite'].fringe = 0".
 */
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const i = process.argv.indexOf('--port');
const PORT = Number(i !== -1 ? process.argv[i + 1] : 9471);
const opt = (name, dflt) => { const j = process.argv.indexOf('--' + name); return j !== -1 ? process.argv[j + 1] : dflt; };
const ERAS = opt('eras', '0,1,2,3,4,5,6,7,8,9,10').split(',').map(Number);
const SETUPS = opt('setups', 'harness,harness-off,gpu,gpu-off').split(',');
const TWEAK = opt('tweak', '');
const OUT = opt('out', 'overlaycost');
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

function stats(d) {
  const s = d.slice().sort((a, b) => a - b), total = s.reduce((a, b) => a + b, 0);
  return { frames: s.length, total: +total.toFixed(1), mean: +(total / Math.max(1, s.length)).toFixed(2),
    p95: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(2), max: +(s[s.length - 1] || 0).toFixed(2) };
}

async function measure(setup, gpu, overlay) {
  const flags = ['--headless=new', '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files',
    '--window-size=1000,760', '--remote-debugging-port=' + PORT, '--no-first-run',
    '--no-default-browser-check', 'about:blank'];
  if (!gpu) flags.unshift('--disable-gpu');
  const chrome = launchChrome(CHROME, flags, { name: 'overlaycost' });
  const rows = [];
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
    for (const era of ERAS) {
      await s.send('Page.navigate', { url: `${base}?era=${era}` });
      for (let t = 0; t < 100; t++) {
        if (await s.eval('!!(window.__pong && document.getElementById("field"))').catch(() => false)) break;
        await sleep(100);
      }
      await sleep(300);
      if (TWEAK) await s.eval(`(() => { ${TWEAK}; return 0; })()`);
      const kind = await s.eval(`(() => { const r = window.PongDisplay.ROWS[${era}]; const k = r.overlay; ${overlay ? '' : "window.PongDisplay.ROWS.forEach((x) => { x.overlay = 'none'; });"} return k; })()`);
      await s.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
      await s.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
      for (let t = 0; t < 80; t++) {
        if (await s.eval('window.__pong.phase === "playing" && window.__pong.serveDelay <= 0')) break;
        await sleep(50);
      }
      let done = false;
      const timing = s.eval(`new Promise((done) => {
        const d = []; let last = null, kept = 0; const t0 = performance.now();
        function tick(now) {
          const g = window.__pong, m = window.PongRender.eraChangeMoment(g);
          const ordinary = g.phase === 'playing' && g.era === ${era} && g.serveDelay <= 0 && !(m && m.wiping);
          if (ordinary && last !== null) { d.push(now - last); kept += now - last; }
          last = ordinary ? now : null;
          if (kept < 1000 && now - t0 < 3000) requestAnimationFrame(tick); else done(d);
        }
        requestAnimationFrame(tick);
      })`).finally(() => { done = true; });
      while (!done) {
        await s.eval(`(() => { const g = window.__pong;
          for (const p of [g.left, g.right]) p.y = Math.max(0, Math.min(g.height - p.h, g.ball.y + 6 - p.h / 2));
          return 0; })()`);
        await sleep(30);
      }
      const d = await timing;
      const native = await s.eval('(() => { const D = window.PongDisplay; const c = D && D.enabled && D.canvas(); ' +
        'return c ? c.width + "x" + c.height : "page"; })()');
      let ring = null;
      if (era < 10) {
        await s.eval(`(() => { const g = window.__pong; g.startEra = 0; g.serveDelay = 0;
          g.ball.x = -8; g.ball.y = 150; g.ball.vx = -600; g.ball.vy = 0; return g.era; })()`);
        await sleep(30);
        ring = stats(await s.eval(`new Promise((done) => {
          const d = []; let last = null; const t0 = performance.now();
          function tick(now) {
            const m = window.PongRender.eraChangeMoment(window.__pong), w = !!(m && m.wiping);
            if (w && last !== null) d.push(now - last);
            last = w ? now : null;
            if (now - t0 < 1600) requestAnimationFrame(tick); else done(d);
          }
          requestAnimationFrame(tick);
        })`));
      }
      rows.push({ setup, gpu, overlay: overlay ? kind : 'none', era, native, ...stats(d), ring });
      console.log(`${setup.padEnd(12)} era ${String(era).padStart(2)} (${native.padEnd(8)} ${(overlay ? kind : 'none').padEnd(14)}): ` +
        `mean ${rows.at(-1).mean} ms, p95 ${rows.at(-1).p95} ms over ${rows.at(-1).frames} frames` +
        (ring ? `; ring to era ${era + 1}: mean ${ring.mean} ms, p95 ${ring.p95} ms over ${ring.frames} frames` : ''));
    }
  } finally {
    try { ws && ws.close(); } catch { /* gone */ }
    await chrome.close();
  }
  return rows;
}

const all = [];
const SETUP = { harness: [false, true], 'harness-off': [false, false], gpu: [true, true], 'gpu-off': [true, false] };
for (const name of SETUPS) all.push(...await measure(name, ...SETUP[name]));
writeFileSync(path.join(HERE, OUT + '.json'), JSON.stringify({ taken: new Date().toISOString(), tweak: TWEAK, rows: all }, null, 1) + '\n');
console.log('wrote ' + path.join(HERE, OUT + '.json'));
