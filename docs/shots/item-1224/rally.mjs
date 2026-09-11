#!/usr/bin/env node
/*
 * docs/shots/item-1224/rally.mjs -- a real rally at era 1 (the 1977 Atari 2600),
 * filmed in headless Chrome off disk, for item 1224.
 *
 *   node docs/shots/item-1224/rally.mjs [--port 9461]
 *
 * Opens index.html?era=1, clicks to start, and plays the left paddle with the
 * mouse, following the ball, so the rules make real hits and the players swing.
 * Saves rally-era1-atari2600.png (the whole page, TV and all) the first time
 * the left player is caught swinging, then one more a second later, and times
 * two seconds of play on the page's own frame clock (mean, p95, max).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const PORT = Number((process.argv.find((a, i) => process.argv[i - 1] === '--port')) || 9461);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?era=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = await launchChrome(CHROME, ['--headless=new', '--disable-gpu', '--mute-audio',
  '--allow-file-access-from-files', '--window-size=1000,760',
  '--remote-debugging-port=' + PORT, '--no-first-run', '--no-default-browser-check', url], { name: 'rally1224' }).catch(refusePortTaken);
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
  await s.send('Page.enable');
  await sleep(1500);
  const evalv = async (expression) => {
    const r = await s.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const box = await evalv(`(() => { const c = document.querySelector('canvas'); const b = c.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
  const mouse = (x, y, type = 'mouseMoved') => s.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  await mouse(box.x + box.w / 2, box.y + box.h / 2, 'mousePressed');
  await mouse(box.x + box.w / 2, box.y + box.h / 2, 'mouseReleased');
  // Time two seconds of play on the page's own clock, while we follow the ball.
  await evalv(`(() => { window.__t1224 = []; let last = performance.now();
    const tick = (now) => { window.__t1224.push(now - last); last = now; if (window.__t1224.length < 400) requestAnimationFrame(tick); };
    requestAnimationFrame(tick); return true; })()`);
  const shots = [];
  let swungAt = 0;
  for (let i = 0; i < 400 && shots.length < 2; i++) {
    const st = await evalv(`(() => { const g = window.__pong; const C = window.PongCharacters;
      const mem = C.memoryOf(g); const cfg = C.configFor(g.era);
      return { era: g.era, by: g.ball.y + g.ball.size / 2, h: g.height, rally: g.rally,
               beat: C.beatOf(mem.left, g.time, g.left.vy || 0, cfg).beat, time: g.time }; })()`);
    await mouse(box.x + box.w * 0.1, box.y + box.h * (st.by / st.h));
    if (st.era !== 1) break;
    if (!swungAt && st.beat === 'swing' && st.rally >= 2) {
      swungAt = st.time;
      shots.push(await snap('rally-era1-atari2600.png'));
    } else if (swungAt && st.time - swungAt > 1.0 && shots.length === 1) {
      shots.push(await snap('rally-era1-atari2600-later.png'));
    }
    await sleep(25);
  }
  const t = (await evalv('window.__t1224')).slice(10).sort((a, b) => a - b);
  const mean = t.reduce((a, b) => a + b, 0) / t.length;
  const line = `era 1 frame time over ${t.length} frames: mean ${mean.toFixed(1)} ms, p95 ${t[Math.floor(t.length * 0.95)].toFixed(1)} ms, max ${t[t.length - 1].toFixed(1)} ms`;
  console.log(line);
  console.log('shots: ' + (shots.join(', ') || 'none -- no swing caught'));
  fs.writeFileSync(path.join(HERE, 'rally-frametime.txt'), line + '\n');
  ws.close();

  async function snap(name) {
    const shot = await s.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(HERE, name);
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    return name;
  }
} finally {
  await chrome.close();
}
