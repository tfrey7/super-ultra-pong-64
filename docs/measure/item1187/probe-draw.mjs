#!/usr/bin/env node
/*
 * docs/measure/item1187/probe-draw.mjs -- draw every 3D era onto an offscreen
 * canvas in the real page and read it back, the way the ladder walk's "new
 * era draws afterwards" check does, printing any exception with its stack.
 *
 *   node docs/measure/item1187/probe-draw.mjs [--port 9351]
 *
 * Item 1187 used it to find the page error the ladder walk reported only as
 * "Uncaught". Also times each era's draw with the textures on (median of 30).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PORT = Number((process.argv.find((a, i) => process.argv[i - 1] === '--port')) || 9351);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?era=5';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = await launchChrome(CHROME, ['--headless=new', '--disable-gpu', '--window-size=1000,760',
  '--remote-debugging-port=' + PORT, '--no-first-run', '--no-default-browser-check', url], { name: 'probe1187' }).catch(refusePortTaken);
try {
  let wsUrl = null;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    if (!wsUrl) await sleep(100);
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const s = new CdpConnection(ws);
  await s.send('Runtime.enable');
  await sleep(1500);
  const r = await s.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `(() => {
    window.__pongStart();
    const g = window.__pong, R = window.PongRender, out = [];
    for (let era = 5; era <= 10; era++) {
      const c = document.createElement('canvas'); c.width = 800; c.height = 600;
      const st = Object.assign({}, g, { era: era, serveDelay: 0 });
      try {
        R.draw(c.getContext('2d'), st);
        c.getContext('2d').getImageData(0, 0, 800, 600);
        const t = [];
        for (let i = 0; i < 30; i++) { const t0 = performance.now(); R.draw(c.getContext('2d'), st); t.push(performance.now() - t0); }
        t.sort((a, b) => a - b);
        out.push('era ' + era + ': ok, draw median ' + t[15].toFixed(2) + ' ms');
      } catch (e) { out.push('era ' + era + ': ' + e.name + ': ' + e.message + ' | ' + String(e.stack).split('\\n').slice(0, 4).join(' / ')); }
    }
    return out; })()` });
  console.log(r.exceptionDetails ? JSON.stringify(r.exceptionDetails) : r.result.value.join('\n'));
  ws.close();
} finally {
  await chrome.close();
}
