#!/usr/bin/env node
/*
 * docs/shots/item-1249/clip-shot.mjs -- the PlayStation 2 era's players kept
 * between its letterbox bars by the rig's own clip (item 1249).
 *
 *   node docs/shots/item-1249/clip-shot.mjs [--port 9361]
 *
 * Opens the real index.html?era=8 in headless Chrome, waits for the two
 * operative sheets to decode, puts both paddles hard against the far rail
 * (the case where a far player's head reaches the top bar), and draws the
 * frame three ways on 800 x 600 canvases: the rig as it ships (clip on), the
 * era's clip taken away, and the players switched off. It counts the pixels
 * inside the two bars that differ from the no-players frame, and saves
 * clip-far-rail.png beside itself: clip on at the left, clip off at the right.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const PORT = Number((process.argv.find((a, i) => process.argv[i - 1] === '--port')) || 9361);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?era=8';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = await launchChrome(CHROME, ['--headless=new', '--disable-gpu', '--window-size=1000,760',
  '--allow-file-access-from-files', '--remote-debugging-port=' + PORT, '--no-first-run',
  '--no-default-browser-check', url], { name: 'item1249' }).catch(refusePortTaken);
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
  const r = await s.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `(async () => {
    const R = window.PongRender, PC = window.PongCharacters, S = window.PongSprites;
    const names = ['era8-sheet-left', 'era8-sheet-right'];
    names.forEach((n) => S.load(n));
    for (let i = 0; i < 100 && !names.every((n) => S.ready(n)); i++) await new Promise((r) => setTimeout(r, 50));
    const g = Object.assign({}, window.__pong, { era: 8, serveDelay: 0, events: [] });
    g.left = Object.assign({}, g.left, { y: 0, vy: 0 });
    g.right = Object.assign({}, g.right, { y: 0, vy: 0 });
    const frame = () => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; R.draw(c.getContext('2d'), g); return c; };
    const on = frame();
    const saved = PC.ERAS[8].clip;
    PC.ERAS[8].clip = null;
    const off = frame();
    PC.ERAS[8].clip = saved;
    PC.enabled = false;
    const none = frame();
    PC.enabled = true;
    const bar = R.eraLook(8).fx.BAR;
    const px = (c) => c.getContext('2d').getImageData(0, 0, 800, 600).data;
    const a = px(on), b = px(off), n = px(none);
    const inBars = (d) => { let k = 0; for (let y = 0; y < 600; y++) { if (y >= bar && y < 600 - bar) continue;
      for (let x = 0; x < 800; x++) { const i = (y * 800 + x) * 4; if (d[i] !== n[i] || d[i + 1] !== n[i + 1] || d[i + 2] !== n[i + 2]) k++; } } return k; };
    const inPicture = (d) => { let k = 0; for (let y = bar; y < 600 - bar; y++) for (let x = 0; x < 800; x++) {
      const i = (y * 800 + x) * 4; if (d[i] !== n[i] || d[i + 1] !== n[i + 1] || d[i + 2] !== n[i + 2]) k++; } return k; };
    const both = document.createElement('canvas'); both.width = 1616; both.height = 600;
    const bc = both.getContext('2d'); bc.fillStyle = '#ff00ff'; bc.fillRect(0, 0, 1616, 600);
    bc.drawImage(on, 0, 0); bc.drawImage(off, 816, 0);
    return { sheetsReady: names.map((n) => S.ready(n)), bar,
             barPixelsFromPlayers: { clipOn: inBars(a), clipOff: inBars(b) },
             picturePixelsFromPlayers: { clipOn: inPicture(a), clipOff: inPicture(b) },
             png: both.toDataURL('image/png') };
  })()` });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  const v = r.result.value;
  const out = path.join(HERE, 'clip-far-rail.png');
  fs.writeFileSync(out, Buffer.from(v.png.split(',')[1], 'base64'));
  delete v.png;
  console.log(JSON.stringify(v, null, 2));
  console.log('saved ' + out);
  ws.close();
} finally {
  await chrome.close();
}
