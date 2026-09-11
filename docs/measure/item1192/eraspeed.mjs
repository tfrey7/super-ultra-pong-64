/*
 * Item 1192: where does a 3D era's frame time go? One second of ordinary play at
 * every era, opened with index.html?era=N, on the page's own rAF clock -- the
 * same reading tools/playtest.mjs takes on its climb -- under four setups:
 *
 *   harness   the playtest's own Chrome flags (--disable-gpu), display layer on
 *   nodisplay the same Chrome, with ?display=off (each era drawn straight onto
 *             the page, the way it was before item 1198)
 *   gpu       Chrome allowed its GPU (no --disable-gpu), display layer on
 *   gpu-nodisplay  both
 *
 * Both paddles are held on the ball while the clock runs, so no point goes in.
 *
 *   node docs/measure/item1192/eraspeed.mjs [--port 9406]
 *
 * Writes eraspeed.json beside itself.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const i = process.argv.indexOf('--port');
const PORT = Number(i !== -1 ? process.argv[i + 1] : 9406);
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

async function measure(setup, gpu, display) {
  const flags = ['--headless=new', '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files',
    '--window-size=1000,760', '--remote-debugging-port=' + PORT, '--no-first-run',
    '--no-default-browser-check', 'about:blank'];
  if (!gpu) flags.unshift('--disable-gpu');
  const chrome = launchChrome(CHROME, flags, { name: 'eraspeed' });
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
    for (let era = 0; era <= 10; era++) {
      await s.send('Page.navigate', { url: `${base}?era=${era}${display ? '' : '&display=off'}` });
      for (let t = 0; t < 100; t++) {
        if (await s.eval('!!(window.__pong && document.getElementById("field"))').catch(() => false)) break;
        await sleep(100);
      }
      await sleep(300);
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
      rows.push({ setup, gpu, display, era, native, ...stats(d) });
      console.log(`${setup.padEnd(14)} era ${String(era).padStart(2)} (${native.padEnd(8)}): ` +
        `mean ${rows.at(-1).mean} ms, p95 ${rows.at(-1).p95} ms over ${rows.at(-1).frames} frames`);
    }
  } finally {
    try { ws && ws.close(); } catch { /* gone */ }
    await chrome.close();
  }
  return rows;
}

const all = [];
all.push(...await measure('harness', false, true));
all.push(...await measure('nodisplay', false, false));
all.push(...await measure('gpu', true, true));
all.push(...await measure('gpu-nodisplay', true, false));
writeFileSync(path.join(HERE, 'eraspeed.json'), JSON.stringify({ taken: new Date().toISOString(), rows: all }, null, 1) + '\n');
console.log('wrote ' + path.join(HERE, 'eraspeed.json'));
